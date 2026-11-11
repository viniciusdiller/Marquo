import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Role } from "@marquo/database";
import { FULL_ACCESS, normalizePermissions } from "@marquo/shared-types";
import { AccessService, parsePermissionsInput } from "./access.service";
import { PrismaService } from "../prisma/prisma.service";
import { RefreshTokenService } from "../auth/refresh-token.service";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: "Rita",
    email: "rita@x.com",
    role: Role.RECEPTIONIST,
    isActive: true,
    professional: null,
    accessProfile: { id: PROFILE_ID, name: "Caixa" },
    ...over,
  };
}

function build() {
  const prisma = {
    accessProfile: {
      findMany: jest.fn().mockResolvedValue([
        { id: PROFILE_ID, name: "Caixa", description: null, permissions: { caixa: "EDIT" }, _count: { users: 2 } },
      ]),
      findFirst: jest.fn().mockResolvedValue({ id: PROFILE_ID }),
      count: jest.fn().mockResolvedValue(2),
      create: jest.fn().mockResolvedValue({ id: PROFILE_ID }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([userRow()]),
      findFirst: jest.fn().mockResolvedValue(userRow()),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => userRow({ name: data.name, email: data.email, role: data.role })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const refreshTokens = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
  const service = new AccessService(prisma as unknown as PrismaService, refreshTokens as unknown as RefreshTokenService);
  return { service, prisma, refreshTokens };
}

describe("parsePermissionsInput (recusa o que não conhece, nunca ignora)", () => {
  it("aceita áreas e níveis conhecidos; o que faltar vira NONE", () => {
    const result = parsePermissionsInput({ caixa: "EDIT", agenda: "VIEW" });
    expect(result.caixa).toBe("EDIT");
    expect(result.agenda).toBe("VIEW");
    expect(result.financeiro).toBe("NONE");
  });

  it("recusa área desconhecida, inclusive as do dono (plano, configurações, perfis de acesso)", () => {
    for (const area of ["plano", "configuracoes", "perfis_acesso", "billing", "__proto__x"]) {
      expect(() => parsePermissionsInput({ [area]: "EDIT" })).toThrow(BadRequestException);
    }
  });

  it("recusa nível inválido (em minúsculas, texto solto, número, vazio)", () => {
    for (const level of ["edit", "ADMIN", "TUDO", 1, null, true, ""]) {
      expect(() => parsePermissionsInput({ caixa: level })).toThrow(BadRequestException);
    }
  });

  it("recusa o que nem é objeto", () => {
    for (const input of [null, undefined, "EDIT", ["caixa"], 3]) expect(() => parsePermissionsInput(input)).toThrow(BadRequestException);
  });
});

describe("AccessService.me", () => {
  it("devolve o acesso de quem está logado", () => {
    const { service } = build();
    expect(service.me({ userId: "u", tenantId: "t", role: Role.OWNER, permissions: FULL_ACCESS, profileName: null })).toMatchObject({ role: "OWNER", isOwner: true });
    const staff = service.me({ userId: "u", tenantId: "t", role: Role.RECEPTIONIST, permissions: normalizePermissions({ caixa: "VIEW" }), profileName: "Caixa" });
    expect(staff).toMatchObject({ isOwner: false, profileName: "Caixa" });
    expect(staff.permissions.caixa).toBe("VIEW");
  });

  it("sem permissões carregadas vale 'sem acesso a nada' (nunca total)", () => {
    const { service } = build();
    const me = service.me({ userId: "u", tenantId: "t", role: Role.RECEPTIONIST });
    expect(Object.values(me.permissions).every((level) => level === "NONE")).toBe(true);
  });
});

describe("AccessService: perfis", () => {
  it("lista só os perfis do negócio (tenantId no WHERE), com o total de pessoas e permissões normalizadas", async () => {
    const { service, prisma } = build();
    const [profile] = await service.listProfiles("t-1");
    expect(prisma.accessProfile.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1" });
    expect(profile).toMatchObject({ name: "Caixa", usersCount: 2 });
    expect(profile.permissions.caixa).toBe("EDIT");
    expect(profile.permissions.financeiro).toBe("NONE");
  });

  it("cria o perfil já normalizado, no negócio do token", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.findFirst.mockResolvedValueOnce(null); // nome livre
    await service.createProfile("t-1", { name: "Caixa", description: "Só caixa", permissions: { caixa: "EDIT" } });
    const data = prisma.accessProfile.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: "t-1", name: "Caixa", description: "Só caixa" });
    expect(data.permissions.caixa).toBe("EDIT");
    expect(data.permissions.financeiro).toBe("NONE");
  });

  it("nome repetido no mesmo negócio (sem diferenciar maiúsculas) dá 409", async () => {
    const { service, prisma } = build();
    await expect(service.createProfile("t-1", { name: "caixa", permissions: {} })).rejects.toThrow(ConflictException);
    expect(prisma.accessProfile.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1", name: { equals: "caixa", mode: "insensitive" } });
    expect(prisma.accessProfile.create).not.toHaveBeenCalled();
  });

  it("permissão inválida é recusada ANTES de qualquer escrita", async () => {
    const { service, prisma } = build();
    await expect(service.createProfile("t-1", { name: "Novo", permissions: { plano: "EDIT" } })).rejects.toThrow(BadRequestException);
    expect(prisma.accessProfile.create).not.toHaveBeenCalled();
  });

  it("recusa passar do teto de perfis por negócio", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.count.mockResolvedValue(30);
    await expect(service.createProfile("t-1", { name: "Mais um", permissions: {} })).rejects.toThrow(ConflictException);
  });

  it("editar leva tenantId no WHERE da escrita; perfil de outro negócio é 404 e nada é alterado", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.findFirst.mockResolvedValue(null);
    await service.updateProfile("t-1", PROFILE_ID, { permissions: { caixa: "VIEW" } });
    expect(prisma.accessProfile.updateMany.mock.calls[0][0].where).toEqual({ id: PROFILE_ID, tenantId: "t-1" });

    prisma.accessProfile.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateProfile("t-1", "de-outro", { name: "X Y" })).rejects.toThrow(NotFoundException);
  });

  it("renomear para um nome que outro perfil já usa dá 409 (o próprio perfil não conta)", async () => {
    const { service, prisma } = build();
    await expect(service.updateProfile("t-1", PROFILE_ID, { name: "Recepção" })).rejects.toThrow(ConflictException);
    expect(prisma.accessProfile.findFirst.mock.calls[0][0].where).toMatchObject({ id: { not: PROFILE_ID } });
    expect(prisma.accessProfile.updateMany).not.toHaveBeenCalled();
  });

  it("descrição em branco limpa o campo", async () => {
    const { service, prisma } = build();
    await service.updateProfile("t-1", PROFILE_ID, { description: "" });
    expect(prisma.accessProfile.updateMany.mock.calls[0][0].data).toEqual({ description: null });
  });

  it("excluir perfil em uso é recusado (409) e nada é apagado", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, _count: { users: 3 } });
    await expect(service.deleteProfile("t-1", PROFILE_ID)).rejects.toThrow(/3 pessoas usam/);
    expect(prisma.accessProfile.deleteMany).not.toHaveBeenCalled();
  });

  it("exclui perfil sem ninguém, com tenantId no WHERE; de outro negócio é 404", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.findFirst.mockResolvedValue({ id: PROFILE_ID, _count: { users: 0 } });
    await service.deleteProfile("t-1", PROFILE_ID);
    expect(prisma.accessProfile.deleteMany).toHaveBeenCalledWith({ where: { id: PROFILE_ID, tenantId: "t-1" } });

    prisma.accessProfile.findFirst.mockResolvedValue(null);
    await expect(service.deleteProfile("t-1", "de-outro")).rejects.toThrow(NotFoundException);
  });
});

describe("AccessService: pessoas", () => {
  const dto = { name: "Rita", email: "rita@x.com", password: "senha-forte-1", profileId: PROFILE_ID };

  it("lista só as pessoas do negócio, sem nenhum dado de senha ou token", async () => {
    const { service, prisma } = build();
    const users = await service.listUsers("t-1");
    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "t-1" });
    expect(Object.keys(call.select)).not.toEqual(expect.arrayContaining(["passwordHash"]));
    expect(JSON.stringify(call.select)).not.toMatch(/passwordHash|Token|lockedUntil|failedLogin/);
    expect(users[0]).toEqual({ id: USER_ID, name: "Rita", email: "rita@x.com", role: "RECEPTIONIST", isActive: true, profile: { id: PROFILE_ID, name: "Caixa" } });
  });

  it("cria a pessoa como EQUIPE (nunca dono), com e-mail já confirmado, senha em bcrypt e perfil do negócio", async () => {
    const { service, prisma } = build();
    await service.createUser("t-1", dto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: "t-1", email: "rita@x.com", name: "Rita", role: "RECEPTIONIST", accessProfileId: PROFILE_ID });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(data.passwordHash).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, data.passwordHash)).toBe(true);
    expect(prisma.accessProfile.findFirst.mock.calls[0][0].where).toEqual({ id: PROFILE_ID, tenantId: "t-1" });
  });

  it("perfil de outro negócio: 404 e a pessoa não é criada", async () => {
    const { service, prisma } = build();
    prisma.accessProfile.findFirst.mockResolvedValue(null);
    await expect(service.createUser("t-1", dto)).rejects.toThrow(NotFoundException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("e-mail que já tem conta (em qualquer negócio) dá 409", async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: "outro" });
    await expect(service.createUser("t-1", dto)).rejects.toThrow(/Já existe uma conta/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  describe("updateUser", () => {
    it("troca o perfil validando que é do negócio e escreve com tenantId e 'não dono' no WHERE", async () => {
      const { service, prisma } = build();
      await service.updateUser("t-1", USER_ID, { profileId: PROFILE_ID });
      expect(prisma.accessProfile.findFirst.mock.calls[0][0].where).toEqual({ id: PROFILE_ID, tenantId: "t-1" });
      const call = prisma.user.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: USER_ID, tenantId: "t-1", role: { not: "OWNER" } });
      expect(call.data).toEqual({ accessProfileId: PROFILE_ID });
    });

    it("perfil de outro negócio: 404 e nada muda", async () => {
      const { service, prisma } = build();
      prisma.accessProfile.findFirst.mockResolvedValue(null);
      await expect(service.updateUser("t-1", USER_ID, { profileId: "de-outro" })).rejects.toThrow(NotFoundException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    // Segurança: o dono é sempre total e não se altera por aqui.
    it("o DONO não pode ser alterado (nem perfil, nem desativação, nem nome)", async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue(userRow({ role: Role.OWNER, accessProfile: null }));
      for (const dto of [{ profileId: PROFILE_ID }, { isActive: false }, { name: "Outro nome" }]) {
        await expect(service.updateUser("t-1", USER_ID, dto)).rejects.toThrow(ForbiddenException);
      }
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("pessoa de outro negócio é 404 (busca com tenantId)", async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.updateUser("t-1", "de-outro", { name: "Fulano" })).rejects.toThrow(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outro", tenantId: "t-1" });
    });

    it("desativa e reativa quem é da equipe (a sessão cai na hora: o JWT confere isActive a cada requisição)", async () => {
      const { service, prisma } = build();
      await service.updateUser("t-1", USER_ID, { isActive: false });
      expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ isActive: false });
    });

    // Profissional tem regras próprias (agenda futura, limite do plano): não se contorna por aqui.
    it("NÃO ativa/desativa um profissional por aqui (use Profissionais), mas pode trocar o perfil dele", async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue(userRow({ role: Role.PROFESSIONAL, professional: { id: "prof-1" } }));
      await expect(service.updateUser("t-1", USER_ID, { isActive: false })).rejects.toThrow(/tela Profissionais/);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      await service.updateUser("t-1", USER_ID, { profileId: PROFILE_ID });
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it("pedido sem nenhuma mudança é recusado", async () => {
      const { service } = build();
      await expect(service.updateUser("t-1", USER_ID, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("resetPassword", () => {
    it("grava a senha em bcrypt, derruba as sessões antigas e zera o bloqueio", async () => {
      const { service, prisma, refreshTokens } = build();
      await service.resetPassword("t-1", USER_ID, "nova-senha-123");
      const call = prisma.user.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: USER_ID, tenantId: "t-1", role: { not: "OWNER" } });
      expect(await bcrypt.compare("nova-senha-123", call.data.passwordHash)).toBe(true);
      expect(call.data.passwordChangedAt).toBeInstanceOf(Date);
      expect(call.data).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
    });

    it("não redefine a senha do DONO nem de pessoa de outro negócio, e não revoga sessão de ninguém", async () => {
      const { service, prisma, refreshTokens } = build();
      prisma.user.findFirst.mockResolvedValue(userRow({ role: Role.OWNER }));
      await expect(service.resetPassword("t-1", USER_ID, "nova-senha-123")).rejects.toThrow(ForbiddenException);
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword("t-1", "de-outro", "nova-senha-123")).rejects.toThrow(NotFoundException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
