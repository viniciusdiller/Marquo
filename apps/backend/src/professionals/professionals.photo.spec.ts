import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitService } from "../billing/plan-limit.service";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { ProfessionalsController } from "./professionals.controller";
import { ProfessionalsService } from "./professionals.service";

// Sem tocar no disco nem no sharp: o que interessa aqui é a regra (posse, formato, onde o arquivo vai, o que é apagado).
const mkdirMock = jest.fn().mockResolvedValue(undefined);
const unlinkMock = jest.fn().mockResolvedValue(undefined);
jest.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
}));
const convertMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../common/utils/image.util", () => ({
  convertToWebp: (...args: unknown[]) => convertMock(...args),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROF = "22222222-2222-4222-8222-222222222222";
const OLD = `/uploads/tenants/${TENANT}/professionals/${PROF}-abc123.webp`;

const file = (over: Partial<Express.Multer.File> = {}) =>
  ({ buffer: Buffer.from("x"), mimetype: "image/png", size: 1000, ...over }) as Express.Multer.File;

function build(photoUrl: string | null = null, found = true) {
  const prisma = {
    professional: {
      findFirst: jest.fn().mockResolvedValue(found ? { id: PROF, photoUrl } : null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  return { service: new ProfessionalsService(prisma, {} as PlanLimitService), prisma };
}

beforeEach(() => {
  mkdirMock.mockClear();
  unlinkMock.mockClear();
  convertMock.mockClear();
});

describe("ProfessionalsService.updatePhoto", () => {
  it("grava a foto reprocessada (quadrada, WebP) na pasta do negócio e guarda o caminho", async () => {
    const { service, prisma } = build();
    const { photoUrl } = await service.updatePhoto(TENANT, PROF, file());

    expect(photoUrl).toMatch(new RegExp(`^/uploads/tenants/${TENANT}/professionals/${PROF}-[a-z0-9]+\\.webp$`));
    expect(convertMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ maxDimension: 512, crop: "square", outPath: expect.stringContaining(`/tenants/${TENANT}/professionals/`) }),
    );
    expect(prisma.professional.updateMany).toHaveBeenCalledWith({ where: { id: PROF, tenantId: TENANT }, data: { photoUrl } });
  });

  it("apaga a foto ANTERIOR (a nova tem URL nova, sem cache velho)", async () => {
    const { service } = build(OLD);
    await service.updatePhoto(TENANT, PROF, file());
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(String(unlinkMock.mock.calls[0][0])).toMatch(new RegExp(`${PROF}-abc123\\.webp$`));
  });

  // IDOR: profissional de outro negócio é 404 igual a inexistente, e nada é escrito.
  it("busca com tenantId no WHERE; de outro negócio ou inexistente: 404 sem gravar nada", async () => {
    const { service, prisma } = build(null, false);
    await expect(service.updatePhoto(TENANT, PROF, file())).rejects.toThrow(NotFoundException);
    expect(prisma.professional.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROF, tenantId: TENANT } }),
    );
    expect(convertMock).not.toHaveBeenCalled();
    expect(prisma.professional.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["sem arquivo", undefined],
    ["SVG (vetor de XSS/SSRF)", file({ mimetype: "image/svg+xml" })],
    ["GIF", file({ mimetype: "image/gif" })],
    ["acima de 5MB", file({ size: 6 * 1024 * 1024 })],
  ])("recusa %s", async (_label, upload) => {
    const { service, prisma } = build();
    await expect(service.updatePhoto(TENANT, PROF, upload)).rejects.toThrow(BadRequestException);
    expect(prisma.professional.updateMany).not.toHaveBeenCalled();
  });

  it("imagem que o sharp rejeita (bytes inválidos) não deixa foto gravada nem arquivo antigo apagado", async () => {
    const { service, prisma } = build(OLD);
    convertMock.mockRejectedValueOnce(new BadRequestException("Não foi possível processar a imagem enviada."));
    await expect(service.updatePhoto(TENANT, PROF, file())).rejects.toThrow(/processar/);
    expect(prisma.professional.updateMany).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();
  });
});

describe("ProfessionalsService.removePhoto", () => {
  it("limpa o caminho e apaga o arquivo", async () => {
    const { service, prisma } = build(OLD);
    await service.removePhoto(TENANT, PROF);
    expect(prisma.professional.updateMany).toHaveBeenCalledWith({ where: { id: PROF, tenantId: TENANT }, data: { photoUrl: null } });
    expect(unlinkMock).toHaveBeenCalledTimes(1);
  });

  // Defesa: o caminho vem do banco; se vier algo fora da pasta de fotos deste negócio, o arquivo NÃO é apagado.
  it.each([
    ["caminho de outro negócio", `/uploads/tenants/99999999-9999-4999-8999-999999999999/professionals/${PROF}-x.webp`],
    ["tentativa de sair da pasta", `/uploads/tenants/${TENANT}/professionals/../logo.webp`],
    ["URL externa", "https://evil.example/x.webp"],
  ])("não apaga arquivo com %s", async (_label, photoUrl) => {
    const { service } = build(photoUrl);
    await service.removePhoto(TENANT, PROF);
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("de outro negócio: 404", async () => {
    const { service } = build(null, false);
    await expect(service.removePhoto(TENANT, PROF)).rejects.toThrow(NotFoundException);
  });
});

describe("ProfessionalsController: quem pode trocar a foto", () => {
  const service = {
    updatePhoto: jest.fn().mockResolvedValue({ photoUrl: "x" }),
    removePhoto: jest.fn().mockResolvedValue({ photoUrl: null }),
  } as unknown as ProfessionalsService;
  const controller = new ProfessionalsController(service);
  const user = (role: Role, professionalId?: string): AuthenticatedUser => ({ userId: "u", tenantId: TENANT, role, professionalId });

  it("o dono troca a foto de qualquer profissional do negócio", () => {
    controller.uploadPhoto(user(Role.OWNER), PROF, file());
    expect(service.updatePhoto).toHaveBeenCalledWith(TENANT, PROF, expect.anything());
  });

  it("o profissional troca só a PRÓPRIA foto", () => {
    expect(() => controller.uploadPhoto(user(Role.PROFESSIONAL, PROF), PROF, file())).not.toThrow();
    expect(() => controller.uploadPhoto(user(Role.PROFESSIONAL, "outro"), PROF, file())).toThrow(ForbiddenException);
    expect(() => controller.removePhoto(user(Role.PROFESSIONAL, "outro"), PROF)).toThrow(ForbiddenException);
  });

  it("recepção não troca foto (a rota só aceita dono e profissional)", () => {
    const roles = Reflect.getMetadata("roles", ProfessionalsController.prototype.uploadPhoto);
    expect(roles).toEqual([Role.OWNER, Role.PROFESSIONAL]);
  });
});
