import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Role } from "@marquo/database";
import { AccessController } from "./access.controller";
import { areaOf, rolesOf } from "./area-metadata";
import { CreateAccessProfileDto, CreateAccessUserDto, ResetAccessUserPasswordDto, UpdateAccessProfileDto, UpdateAccessUserDto } from "./dto/access.dto";

const owner = { userId: "u-1", tenantId: "t-1", role: Role.OWNER };

describe("AccessController: quem pode o quê", () => {
  it("só GET /access/me é de qualquer pessoa da equipe", () => {
    expect(rolesOf(AccessController, "me")).toBeUndefined();
  });

  // Não é delegável: nem existe como área dos perfis. Um perfil nunca consegue se dar mais poder.
  it.each(["listProfiles", "createProfile", "updateProfile", "deleteProfile", "listUsers", "createUser", "updateUser", "resetPassword"])(
    "%s é SÓ do dono e não pertence a nenhuma área de perfil",
    (handler) => {
      expect(rolesOf(AccessController, handler)).toEqual([Role.OWNER]);
      expect(areaOf(AccessController, handler)).toBeUndefined();
    },
  );

  it("usa o tenantId do TOKEN em todas as operações", () => {
    const access = {
      me: jest.fn(), listProfiles: jest.fn(), createProfile: jest.fn(), updateProfile: jest.fn(), deleteProfile: jest.fn(),
      listUsers: jest.fn(), createUser: jest.fn(), updateUser: jest.fn(), resetPassword: jest.fn(),
    };
    const c = new AccessController(access as never);
    const dto = { x: 1 } as never;
    c.listProfiles(owner);
    c.createProfile(owner, dto);
    c.updateProfile(owner, "p", dto);
    c.deleteProfile(owner, "p");
    c.listUsers(owner);
    c.createUser(owner, dto);
    c.updateUser(owner, "u", dto);
    c.resetPassword(owner, "u", { password: "nova-senha-123" });
    expect(access.listProfiles).toHaveBeenCalledWith("t-1");
    expect(access.createProfile).toHaveBeenCalledWith("t-1", dto);
    expect(access.updateProfile).toHaveBeenCalledWith("t-1", "p", dto);
    expect(access.deleteProfile).toHaveBeenCalledWith("t-1", "p");
    expect(access.listUsers).toHaveBeenCalledWith("t-1");
    expect(access.createUser).toHaveBeenCalledWith("t-1", dto);
    expect(access.updateUser).toHaveBeenCalledWith("t-1", "u", dto);
    expect(access.resetPassword).toHaveBeenCalledWith("t-1", "u", "nova-senha-123");
  });
});

const UUID = "11111111-1111-4111-8111-111111111111";
async function bad<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  return (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);
}

describe("DTOs de acesso", () => {
  it("perfil: nome de 2 a 60, descrição até 200, permissões objeto", async () => {
    expect(await bad(CreateAccessProfileDto, { name: "Caixa", permissions: {} })).toEqual([]);
    expect(await bad(CreateAccessProfileDto, { name: "A", permissions: {} })).toContain("name");
    expect(await bad(CreateAccessProfileDto, { name: "   ", permissions: {} })).toContain("name");
    expect(await bad(CreateAccessProfileDto, { name: "x".repeat(61), permissions: {} })).toContain("name");
    expect(await bad(CreateAccessProfileDto, { name: "Caixa", description: "x".repeat(201), permissions: {} })).toContain("description");
    expect(await bad(CreateAccessProfileDto, { name: "Caixa", permissions: "EDIT" })).toContain("permissions");
    expect(await bad(CreateAccessProfileDto, { name: "Caixa" })).toContain("permissions");
  });

  it("perfil: recusa campos que o cliente não define (tenantId, id)", async () => {
    expect(await bad(CreateAccessProfileDto, { name: "Caixa", permissions: {}, tenantId: UUID })).toContain("tenantId");
    expect(await bad(UpdateAccessProfileDto, { id: UUID })).toContain("id");
  });

  it("pessoa: e-mail normalizado, senha de 8 a 72 (sem aparar), perfil UUID", async () => {
    const ok = { name: "Rita", email: "  RITA@X.COM ", password: "senha-forte-1", profileId: UUID };
    expect(await bad(CreateAccessUserDto, ok)).toEqual([]);
    expect(plainToInstance(CreateAccessUserDto, ok).email).toBe("rita@x.com");
    expect(await bad(CreateAccessUserDto, { ...ok, email: "nao-e-email" })).toContain("email");
    expect(await bad(CreateAccessUserDto, { ...ok, password: "curta" })).toContain("password");
    expect(await bad(CreateAccessUserDto, { ...ok, password: "x".repeat(73) })).toContain("password");
    expect(await bad(CreateAccessUserDto, { ...ok, profileId: "abc" })).toContain("profileId");
  });

  // Segurança: papel, negócio e e-mail confirmado são definidos pelo servidor.
  it("pessoa: recusa role, tenantId, isActive e emailVerifiedAt no cadastro", async () => {
    const ok = { name: "Rita", email: "rita@x.com", password: "senha-forte-1", profileId: UUID };
    for (const field of ["role", "tenantId", "isActive", "emailVerifiedAt", "accessProfileId"]) {
      expect(await bad(CreateAccessUserDto, { ...ok, [field]: "OWNER" })).toContain(field);
    }
  });

  it("alterar pessoa: só nome, perfil e ativo; nunca papel nem e-mail", async () => {
    expect(await bad(UpdateAccessUserDto, { name: "Rita", profileId: UUID, isActive: false })).toEqual([]);
    for (const field of ["role", "email", "tenantId", "passwordHash"]) {
      expect(await bad(UpdateAccessUserDto, { [field]: "x" })).toContain(field);
    }
    expect(await bad(UpdateAccessUserDto, { isActive: "sim" })).toContain("isActive");
  });

  it("senha nova: de 8 a 72", async () => {
    expect(await bad(ResetAccessUserPasswordDto, { password: "nova-senha-123" })).toEqual([]);
    expect(await bad(ResetAccessUserPasswordDto, { password: "curta" })).toContain("password");
    expect(await bad(ResetAccessUserPasswordDto, {})).toContain("password");
  });
});
