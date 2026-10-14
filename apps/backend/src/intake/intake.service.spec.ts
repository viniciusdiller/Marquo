import { BadRequestException, NotFoundException } from "@nestjs/common";
import { IntakeService } from "./intake.service";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@marquo/database";

const FIELDS = [
  { key: "alergia", label: "Alergias", type: "textarea", required: true },
  { key: "gestante", label: "Gestante", type: "boolean" },
  { key: "tom", label: "Tom preferido", type: "select", options: ["claro", "escuro"] },
];

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    intakeForm: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "f-1", tenantId: "t-1", fields: FIELDS }),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "f-1", ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: "f-1", ...data })),
    },
    client: { findFirst: jest.fn().mockResolvedValue({ id: "c-1" }) },
    appointment: { findFirst: jest.fn().mockResolvedValue({ id: "a-1" }) },
    intakeResponse: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "r-1", ...data })),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("IntakeService (M2)", () => {
  it("createForm recusa chaves duplicadas", async () => {
    const service = new IntakeService(buildPrisma());
    await expect(
      service.createForm("t-1", {
        name: "Ficha",
        fields: [
          { key: "x", label: "A", type: "text" },
          { key: "x", label: "B", type: "text" },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("createForm recusa select sem opções", async () => {
    const service = new IntakeService(buildPrisma());
    await expect(
      service.createForm("t-1", {
        name: "Ficha",
        fields: [{ key: "t", label: "Tom", type: "select" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("submitResponse exige campo required", async () => {
    const service = new IntakeService(buildPrisma());
    await expect(
      service.submitResponse("t-1", { formId: "f-1", clientId: "c-1", answers: { gestante: true } }),
    ).rejects.toThrow(BadRequestException);
  });

  it("submitResponse coage boolean e valida select, ignorando chave estranha", async () => {
    const prisma = buildPrisma();
    const service = new IntakeService(prisma);

    await service.submitResponse("t-1", {
      formId: "f-1",
      clientId: "c-1",
      answers: { alergia: "nenhuma", gestante: "true", tom: "claro", lixo: "x" },
    });

    const data = (prisma.intakeResponse.create as jest.Mock).mock.calls[0][0].data;
    expect(data.answers).toEqual({ alergia: "nenhuma", gestante: true, tom: "claro" });
  });

  it("submitResponse recusa select com valor fora das opções", async () => {
    const service = new IntakeService(buildPrisma());
    await expect(
      service.submitResponse("t-1", {
        formId: "f-1",
        clientId: "c-1",
        answers: { alergia: "ok", tom: "roxo" },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("submitResponse recusa form de outro tenant", async () => {
    const prisma = buildPrisma({
      intakeForm: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new IntakeService(prisma);
    await expect(
      service.submitResponse("t-1", { formId: "f-9", clientId: "c-1", answers: {} }),
    ).rejects.toThrow(NotFoundException);
  });

  // Regressão (IDOR horizontal): PROFESSIONAL podia registrar ficha pra QUALQUER cliente do
  // tenant. Agora só pra cliente que ele atende, provado por atendimento próprio no WHERE.
  describe("escopo do PROFESSIONAL", () => {
    const professional = { role: Role.PROFESSIONAL, professionalId: "prof-1" };
    const dto = { formId: "f-1", clientId: "c-1", answers: { alergia: "nenhuma" } };

    it("exige o atendimento (sem ele não dá pra provar que atende o cliente)", async () => {
      const prisma = buildPrisma();
      const service = new IntakeService(prisma);
      await expect(service.submitResponse("t-1", dto, professional)).rejects.toThrow(BadRequestException);
      expect(prisma.intakeResponse.create).not.toHaveBeenCalled();
    });

    it("filtra o atendimento pelo próprio professionalId no WHERE", async () => {
      const prisma = buildPrisma();
      const service = new IntakeService(prisma);
      await service.submitResponse("t-1", { ...dto, appointmentId: "a-1" }, professional);
      expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "a-1", tenantId: "t-1", clientId: "c-1", professionalId: "prof-1" }),
        }),
      );
    });

    it("atendimento de outro profissional é recusado", async () => {
      const prisma = buildPrisma({ appointment: { findFirst: jest.fn().mockResolvedValue(null) } });
      const service = new IntakeService(prisma);
      await expect(
        service.submitResponse("t-1", { ...dto, appointmentId: "a-de-outro" }, professional),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.intakeResponse.create).not.toHaveBeenCalled();
    });

    it("OWNER/RECEPTIONIST seguem sem exigir atendimento", async () => {
      const prisma = buildPrisma();
      const service = new IntakeService(prisma);
      await service.submitResponse("t-1", dto, { role: Role.RECEPTIONIST });
      expect(prisma.intakeResponse.create).toHaveBeenCalled();
    });
  });
});
