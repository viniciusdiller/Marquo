import { createHmac, randomInt, timingSafeEqual } from "crypto";

// Código numérico de uso único (2FA do painel da plataforma e confirmação de e-mail no cadastro do cliente).
// `randomInt` é CSPRNG: nada de Math.random para segredo.
export function generateNumericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

// Chave do HMAC dos códigos, derivada do JWT_SECRET com um rótulo próprio: o código nunca fica guardado em claro e
// um dump da memória do processo não devolve códigos válidos sem esta chave.
export function oneTimeCodeSecret(jwtSecret: string): string {
  return createHmac("sha256", jwtSecret).update("marquo.one-time-code.v1").digest("hex");
}

export type CodeCheck = "ok" | "invalid" | "expired" | "locked";

interface Entry {
  hash: string;
  expiresAt: number;
  attempts: number;
  issuedAt: number;
}

export interface OneTimeCodeOptions {
  ttlMs: number;
  maxAttempts: number;
  // Teto de entradas vivas: o mapa não cresce sem limite sob abuso (as mais antigas saem primeiro).
  maxEntries: number;
}

// Armazém EM MEMÓRIA de códigos de uso único, por chave (um desafio de 2FA, um e-mail em cadastro). Um processo só,
// como o lockout de login e o anti-replay da API interna: perder os códigos num reinício só obriga a pedir outro.
// Guarda apenas o HMAC do código, expira, limita tentativas erradas e é de uso único (consume).
export class OneTimeCodeStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly secret: string,
    private readonly options: OneTimeCodeOptions,
  ) {}

  private digest(key: string, code: string): string {
    return createHmac("sha256", this.secret).update(`${key}\n${code}`).digest("hex");
  }

  // Gera e guarda um código novo para a chave (o anterior deixa de valer). Devolve o código em claro, UMA vez.
  issue(key: string, now: number = Date.now()): string {
    this.purge(now);
    const code = generateNumericCode();
    this.entries.delete(key);
    this.entries.set(key, { hash: this.digest(key, code), expiresAt: now + this.options.ttlMs, attempts: 0, issuedAt: now });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    return code;
  }

  // Milissegundos até poder pedir outro código para esta chave (0 = já pode). Freia reenvio em sequência.
  waitMs(key: string, cooldownMs: number, now: number = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.issuedAt + cooldownMs - now);
  }

  // Confere sem gastar o código (quem chama decide quando consumir). Erro soma tentativa; passou do limite, o código
  // é descartado (travado): é preciso pedir outro.
  check(key: string, code: string, now: number = Date.now()): CodeCheck {
    const entry = this.entries.get(key);
    if (!entry) return "expired";
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return "expired";
    }
    if (entry.attempts >= this.options.maxAttempts) {
      this.entries.delete(key);
      return "locked";
    }

    const expected = Buffer.from(entry.hash, "hex");
    const given = Buffer.from(this.digest(key, code), "hex");
    // Mesmo tamanho (sha256): timingSafeEqual não lança.
    if (timingSafeEqual(expected, given)) return "ok";

    entry.attempts += 1;
    if (entry.attempts >= this.options.maxAttempts) {
      this.entries.delete(key);
      return "locked";
    }
    return "invalid";
  }

  consume(key: string): void {
    this.entries.delete(key);
  }

  private purge(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  // Só para teste.
  get size(): number {
    return this.entries.size;
  }
}
