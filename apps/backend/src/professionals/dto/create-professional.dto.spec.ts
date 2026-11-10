import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProfessionalDto } from "./create-professional.dto";

const UUID = "11111111-1111-4111-8111-111111111111";
const base = { name: "Alex", email: "alex@example.com", initialPassword: "senha-forte-123" };

async function errorsFor(extra: Record<string, unknown>) {
  const dto = plainToInstance(CreateProfessionalDto, { ...base, ...extra });
  return (await validate(dto)).map((e) => e.property);
}

describe("CreateProfessionalDto.serviceIds", () => {
  it("é opcional", async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it("aceita uma lista de UUIDs (inclusive vazia)", async () => {
    expect(await errorsFor({ serviceIds: [UUID] })).toEqual([]);
    expect(await errorsFor({ serviceIds: [] })).toEqual([]);
  });

  it("recusa valor que não é lista", async () => {
    expect(await errorsFor({ serviceIds: UUID })).toContain("serviceIds");
  });

  it("recusa item que não é UUID (nada de texto solto indo para o banco)", async () => {
    expect(await errorsFor({ serviceIds: ["abc"] })).toContain("serviceIds");
    expect(await errorsFor({ serviceIds: [UUID, "' OR 1=1 --"] })).toContain("serviceIds");
  });

  it("recusa ids repetidos e lista acima do teto de 100", async () => {
    expect(await errorsFor({ serviceIds: [UUID, UUID] })).toContain("serviceIds");
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await errorsFor({ serviceIds: many })).toContain("serviceIds");
  });
});
