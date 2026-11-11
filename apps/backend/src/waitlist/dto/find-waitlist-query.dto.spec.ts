import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { FindWaitlistQueryDto } from "./find-waitlist-query.dto";

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(FindWaitlistQueryDto, plain);
  return validate(dto);
}

describe("FindWaitlistQueryDto", () => {
  // Regressão: GET /waitlist?status=... lia @Query("status") direto, sem DTO — um valor
  // fora do enum WaitlistStatus não era rejeitado com 400, ia parar cru no `where` do
  // Prisma e estourava PrismaClientValidationError, que o PrismaExceptionFilter (só
  // trata PrismaClientKnownRequestError/UnknownRequestError) não captura — virava 500
  // genérico em vez de uma validação limpa.
  it("rejeita status fora do enum WaitlistStatus", async () => {
    const errors = await validateDto({ status: "GARBAGE_INVALID_ENUM" });
    expect(errors.some((e) => e.property === "status")).toBe(true);
  });

  it("aceita ausência de status (lista tudo)", async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it("aceita valor válido do enum", async () => {
    const errors = await validateDto({ status: "PENDING" });
    expect(errors).toHaveLength(0);
  });

  it("aceita CLOSED (a aba 'Encerrados': resolvidos e cancelados)", async () => {
    expect(await validateDto({ status: "CLOSED" })).toHaveLength(0);
    for (const status of ["CONTACTED", "RESOLVED", "CANCELED"]) expect(await validateDto({ status })).toHaveLength(0);
  });

  it("recusa minúsculas e texto solto", async () => {
    for (const status of ["pending", "closed", "ALL", "PENDING; DROP"]) {
      expect((await validateDto({ status })).some((e) => e.property === "status")).toBe(true);
    }
  });
});
