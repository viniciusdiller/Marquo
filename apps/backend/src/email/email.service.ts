import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const RESEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 8_000;
// Teto defensivo: nenhuma notificação do produto tem tantos destinatários.
const MAX_RECIPIENTS = 5;

export interface EmailAttachment {
  filename: string;
  // Conteúdo em base64 (é o que a API do Resend espera).
  content: string;
  contentType?: string;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

// Cliente mínimo do Resend (sem SDK: uma dependência a menos para auditar). Só fala com UM host fixo
// (api.resend.com), com timeout, e NUNCA lança: e-mail é um aviso, falhar não pode derrubar um agendamento
// que já foi gravado. O resultado (true/false) existe só para teste e log.
//
// Sem RESEND_API_KEY o envio fica desligado (dev/teste): nada sai e nada é logado além de um debug.
// Nunca se loga o endereço do destinatário, o assunto nem o corpo (dado pessoal) — só o status do provedor.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("RESEND_API_KEY") && this.config.get<string>("EMAIL_FROM"));
  }

  async send(message: EmailMessage): Promise<boolean> {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM");
    if (!apiKey || !from) {
      this.logger.debug("E-mail desligado (RESEND_API_KEY/EMAIL_FROM ausentes): envio ignorado.");
      return false;
    }

    const to = [...new Set(message.to.map((address) => address.trim().toLowerCase()))]
      .filter((address) => address.length > 0)
      .slice(0, MAX_RECIPIENTS);
    if (to.length === 0) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          // CR/LF fora do assunto: não há injeção de cabeçalho via JSON, mas o texto vem de nomes digitados por usuários.
          subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
          html: message.html,
          text: message.text,
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  ...(a.contentType ? { content_type: a.contentType } : {}),
                })),
              }
            : {}),
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Resend respondeu ${response.status}; e-mail não enviado.`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Falha ao chamar o Resend: ${(error as Error).name}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
