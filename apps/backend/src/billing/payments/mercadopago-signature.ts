import { createHmac, timingSafeEqual } from "crypto";

export interface SignatureInput {
  // Cabeçalho `x-signature`: "ts=1704908010,v1=618c85..."
  signatureHeader: string | undefined;
  // Cabeçalho `x-request-id`.
  requestId: string | undefined;
  // `data.id` da query string da notificação.
  dataId: string | undefined;
  secret: string;
}

export type SignatureResult = "valid" | "invalid" | "absent";

// Verificação da assinatura das notificações do Mercado Pago:
//   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"   (partes ausentes saem do manifest)
//   v1       = HMAC-SHA256(secret, manifest) em hexadecimal
// O `data.id` alfanumérico vai em minúsculas (regra da documentação). Comparação em tempo constante.
//
// "absent" = a notificação veio sem x-signature: assinaturas de ASSINATURA (preapproval) podem não trazê-la. Isso
// não abre brecha: o corpo da notificação nunca é confiado, só serve de aviso para RELER o estado na API do
// provedor com o nosso token.
export function verifyMercadoPagoSignature(input: SignatureInput): SignatureResult {
  const header = input.signatureHeader?.trim();
  if (!header) return "absent";

  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2).map((v) => v?.trim());
    if (key && value) parts.set(key, value);
  }
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return "invalid";

  const segments: string[] = [];
  if (input.dataId) segments.push(`id:${/^[A-Za-z0-9]+$/.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId}`);
  if (input.requestId) segments.push(`request-id:${input.requestId}`);
  segments.push(`ts:${ts}`);
  const manifest = `${segments.join(";")};`;

  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  const received = Buffer.from(v1, "hex");
  if (received.length !== expected.length) return "invalid";
  return timingSafeEqual(received, expected) ? "valid" : "invalid";
}
