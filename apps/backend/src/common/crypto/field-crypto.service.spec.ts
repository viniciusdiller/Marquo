import { ConfigService } from "@nestjs/config";
import { FieldCryptoService } from "./field-crypto.service";

const KEY = "ab".repeat(32);
const make = (key?: string) => new FieldCryptoService({ get: () => key } as unknown as ConfigService);

describe("FieldCryptoService", () => {
  it("cifra e decifra, e o texto cifrado não contém o original", () => {
    const crypto = make(KEY);
    const encrypted = crypto.encrypt("52998224725", "tenant-1");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain("52998224725");
    expect(crypto.decrypt(encrypted, "tenant-1")).toBe("52998224725");
  });

  it("o mesmo valor gera textos diferentes (IV aleatório)", () => {
    const crypto = make(KEY);
    expect(crypto.encrypt("52998224725", "t")).not.toEqual(crypto.encrypt("52998224725", "t"));
  });

  // Segurança: o valor cifrado de um negócio copiado para outro não pode entregar o documento.
  it("falha (null) ao ler com outro contexto, valor adulterado, outra chave ou formato desconhecido", () => {
    const crypto = make(KEY);
    const encrypted = crypto.encrypt("52998224725", "tenant-1");
    expect(crypto.decrypt(encrypted, "tenant-2")).toBeNull();
    const parts = encrypted.split(":");
    parts[3] = Buffer.from("outra-coisa").toString("base64url");
    expect(crypto.decrypt(parts.join(":"), "tenant-1")).toBeNull();
    expect(make("cd".repeat(32)).decrypt(encrypted, "tenant-1")).toBeNull();
    expect(crypto.decrypt("v9:a:b:c", "tenant-1")).toBeNull();
    expect(crypto.decrypt("lixo", "tenant-1")).toBeNull();
  });

  it("sem chave válida fica desligado, não cifra e não decifra", () => {
    for (const key of [undefined, "", "curta", "z".repeat(64)]) {
      const crypto = make(key);
      expect(crypto.enabled).toBe(false);
      expect(() => crypto.encrypt("x", "t")).toThrow();
      expect(crypto.decrypt("v1:a:b:c", "t")).toBeNull();
    }
  });
});
