import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateClubPlanDto, EnrollClubMemberDto, FindClubMembersQueryDto, UpdateClubPlanDto } from "./club.dto";

const UUID = "11111111-1111-4111-8111-111111111111";
const opts = { whitelist: true, forbidNonWhitelisted: true };

async function errors<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  return (await validate(plainToInstance(cls, body), opts)).map((e) => e.property);
}

const validPlan = { name: "Clube Corte", priceCents: 12000, usesPerMonth: 4, serviceIds: [UUID] };

describe("CreateClubPlanDto", () => {
  it("aceita um pacote válido", async () => {
    expect(await errors(CreateClubPlanDto, validPlan)).toEqual([]);
  });

  it("recusa nome curto/vazio e só com espaços", async () => {
    expect(await errors(CreateClubPlanDto, { ...validPlan, name: "A" })).toContain("name");
    expect(await errors(CreateClubPlanDto, { ...validPlan, name: "   " })).toContain("name");
  });

  it("preço: mínimo R$ 1,00 e teto de R$ 10.000,00; só inteiro", async () => {
    expect(await errors(CreateClubPlanDto, { ...validPlan, priceCents: 99 })).toContain("priceCents");
    expect(await errors(CreateClubPlanDto, { ...validPlan, priceCents: 1_000_001 })).toContain("priceCents");
    expect(await errors(CreateClubPlanDto, { ...validPlan, priceCents: 99.5 })).toContain("priceCents");
    expect(await errors(CreateClubPlanDto, { ...validPlan, priceCents: -5000 })).toContain("priceCents");
  });

  it("usos por mês: de 1 a 60", async () => {
    expect(await errors(CreateClubPlanDto, { ...validPlan, usesPerMonth: 0 })).toContain("usesPerMonth");
    expect(await errors(CreateClubPlanDto, { ...validPlan, usesPerMonth: 61 })).toContain("usesPerMonth");
  });

  it("serviços: 1 a 30, UUIDs únicos", async () => {
    expect(await errors(CreateClubPlanDto, { ...validPlan, serviceIds: [] })).toContain("serviceIds");
    expect(await errors(CreateClubPlanDto, { ...validPlan, serviceIds: ["abc"] })).toContain("serviceIds");
    expect(await errors(CreateClubPlanDto, { ...validPlan, serviceIds: [UUID, UUID] })).toContain("serviceIds");
    const many = Array.from({ length: 31 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await errors(CreateClubPlanDto, { ...validPlan, serviceIds: many })).toContain("serviceIds");
  });

  it("recusa campos que o cliente não pode definir (tenant, estado, datas)", async () => {
    for (const field of ["tenantId", "isActive", "id", "createdAt"]) {
      expect(await errors(CreateClubPlanDto, { ...validPlan, [field]: "x" })).toContain(field);
    }
  });
});

describe("UpdateClubPlanDto", () => {
  it("aceita só nome, descrição, preço e ativo", async () => {
    expect(await errors(UpdateClubPlanDto, { name: "Novo", description: "d", priceCents: 9000, isActive: false })).toEqual([]);
  });

  // Usos e serviços ficam fixos: mexer neles mudaria o combinado de quem já entrou.
  it("recusa mudar usos por mês e serviços", async () => {
    expect(await errors(UpdateClubPlanDto, { usesPerMonth: 10 })).toContain("usesPerMonth");
    expect(await errors(UpdateClubPlanDto, { serviceIds: [UUID] })).toContain("serviceIds");
  });
});

describe("EnrollClubMemberDto e filtro de membros", () => {
  it("exige UUIDs", async () => {
    expect(await errors(EnrollClubMemberDto, { clientId: UUID, planId: UUID })).toEqual([]);
    expect(await errors(EnrollClubMemberDto, { clientId: "1", planId: UUID })).toContain("clientId");
    expect(await errors(EnrollClubMemberDto, { clientId: UUID })).toContain("planId");
  });

  it("filtro de estado só aceita ACTIVE, EXPIRED ou CANCELED; paginação com teto", async () => {
    expect(await errors(FindClubMembersQueryDto, { state: "EXPIRED" })).toEqual([]);
    expect(await errors(FindClubMembersQueryDto, { state: "QUALQUER" })).toContain("state");
    expect(await errors(FindClubMembersQueryDto, { pageSize: "1000" })).toContain("pageSize");
  });
});
