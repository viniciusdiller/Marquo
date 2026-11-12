import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";
const IV_BYTES = 12;

// Criptografia de campo para dado pessoal guardado no banco (hoje: CPF/CNPJ do pagador). AES-256-GCM com IV aleatório por
// valor: o resultado é `v1:<iv>:<tag>:<texto>` em base64url. A chave (DATA_ENCRYPTION_KEY, 64 hex = 32 bytes) fica fora do
// banco, então um vazamento só do banco não revela o documento. O `context` (id do negócio) entra como dado autenticado:
// copiar o valor cifrado de um negócio para outro faz a leitura falhar em vez de entregar o documento errado.
// Sem a chave configurada `enabled` é falso e NADA é guardado (quem chama pede o dado de novo): nunca grava em claro.
@Injectable()
export class FieldCryptoService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>("DATA_ENCRYPTION_KEY");
    this.key = raw && /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : null;
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string, context: string): string {
    if (!this.key) throw new Error("DATA_ENCRYPTION_KEY não configurada.");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
  }

  // Devolve null (nunca lança) para valor adulterado, de outro contexto, de outra chave ou em formato desconhecido.
  decrypt(payload: string, context: string): string | null {
    if (!this.key) return null;
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(parts[1], "base64url"));
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
}
