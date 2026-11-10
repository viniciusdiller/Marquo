import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateSelfProfessionalDto } from "./create-self-professional.dto";

const UUID = "11111111-1111-4111-8111-111111111111";

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateSelfProfessionalDto, body);
  return (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);
}

describe("CreateSelfProfessionalDto", () => {
  it("aceita corpo vazio, bio e lista de UUIDs", async () => {
    expect(await check({})).toEqual([]);
    expect(await check({ bio: "Barbeiro", serviceIds: [UUID] })).toEqual([]);
  });

  // Segurança: não há como apontar para a conta de outra pessoa nem trocar e-mail/papel por aqui.
  it("recusa qualquer campo de identidade (userId, e-mail, papel, senha)", async () => {
    for (const field of ["userId", "email", "role", "initialPassword", "tenantId"]) {
      expect(await check({ [field]: "x" })).toContain(field);
    }
  });

  it("recusa serviceIds que não é lista de UUIDs únicos (até 100)", async () => {
    expect(await check({ serviceIds: UUID })).toContain("serviceIds");
    expect(await check({ serviceIds: ["abc"] })).toContain("serviceIds");
    expect(await check({ serviceIds: [UUID, UUID] })).toContain("serviceIds");
  });
});
