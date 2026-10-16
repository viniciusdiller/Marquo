import { createHmac } from "crypto";
import { verifyMercadoPagoSignature } from "./mercadopago-signature";

const SECRET = "segredo-de-teste-1234567890";

function sign(manifest: string, secret = SECRET) {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("verifyMercadoPagoSignature", () => {
  const ts = "1704908010";
  const requestId = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";

  it("aceita a assinatura calculada com o manifesto id;request-id;ts", () => {
    const v1 = sign(`id:123456;request-id:${requestId};ts:${ts};`);
    expect(
      verifyMercadoPagoSignature({ signatureHeader: `ts=${ts},v1=${v1}`, requestId, dataId: "123456", secret: SECRET }),
    ).toBe("valid");
  });

  it("data.id alfanumérico entra em minúsculas no manifesto", () => {
    const v1 = sign(`id:abc123def;request-id:${requestId};ts:${ts};`);
    expect(
      verifyMercadoPagoSignature({ signatureHeader: `ts=${ts},v1=${v1}`, requestId, dataId: "ABC123DEF", secret: SECRET }),
    ).toBe("valid");
  });

  it("partes ausentes saem do manifesto", () => {
    const v1 = sign(`id:999;ts:${ts};`);
    expect(
      verifyMercadoPagoSignature({ signatureHeader: `ts=${ts},v1=${v1}`, requestId: undefined, dataId: "999", secret: SECRET }),
    ).toBe("valid");
  });

  it("recusa segredo errado, id adulterado e v1 mal formado", () => {
    const v1 = sign(`id:123456;request-id:${requestId};ts:${ts};`);
    const header = `ts=${ts},v1=${v1}`;
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId, dataId: "123456", secret: "outro-segredo" })).toBe("invalid");
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId, dataId: "654321", secret: SECRET })).toBe("invalid");
    expect(verifyMercadoPagoSignature({ signatureHeader: `ts=${ts},v1=zzzz`, requestId, dataId: "123456", secret: SECRET })).toBe("invalid");
    expect(verifyMercadoPagoSignature({ signatureHeader: `v1=${v1}`, requestId, dataId: "123456", secret: SECRET })).toBe("invalid");
    expect(verifyMercadoPagoSignature({ signatureHeader: "lixo", requestId, dataId: "123456", secret: SECRET })).toBe("invalid");
  });

  it("sem cabeçalho: 'absent' (não é 'valid')", () => {
    expect(verifyMercadoPagoSignature({ signatureHeader: undefined, requestId, dataId: "1", secret: SECRET })).toBe("absent");
    expect(verifyMercadoPagoSignature({ signatureHeader: "  ", requestId, dataId: "1", secret: SECRET })).toBe("absent");
  });
});
