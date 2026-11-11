import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma, Role } from "@marquo/database";
import {
  ACCESS_AREA_KEYS,
  ACCESS_LEVELS,
  normalizePermissions,
  type AccessMe,
  type AccessPermissions,
  type AccessProfileSummary,
  type AccessUserSummary,
} from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { RefreshTokenService } from "../auth/refresh-token.service";
import type { AuthenticatedUser } from "../auth/types/auth-user";
import {
  CreateAccessProfileDto,
  CreateAccessUserDto,
  UpdateAccessProfileDto,
  UpdateAccessUserDto,
} from "./dto/access.dto";

const BCRYPT_ROUNDS = 12;
const MAX_PROFILES_PER_TENANT = 30;

// Valida o mapa de permissões que o cliente mandou: só áreas conhecidas e só níveis conhecidos. Área ausente vira NONE (quem não foi
// marcado não tem acesso). Recusa o que não conhece em vez de ignorar: assim "plano" ou "EDITAR" não passam em silêncio.
export function parsePermissionsInput(input: unknown): AccessPermissions {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BadRequestException("Permissões inválidas.");
  }
  for (const [area, level] of Object.entries(input)) {
    if (!(ACCESS_AREA_KEYS as readonly string[]).includes(area)) {
      throw new BadRequestException(`Área desconhecida: ${area.slice(0, 40)}.`);
    }
    if (typeof level !== "string" || !(ACCESS_LEVELS as readonly string[]).includes(level)) {
      throw new BadRequestException(`Nível de acesso inválido para ${area}.`);
    }
  }
  return normalizePermissions(input);
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  professional: { select: { id: true } },
  accessProfile: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toUserSummary(row: UserRow): AccessUserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    profile: row.accessProfile,
  };
}

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  // O acesso de quem está logado (o painel monta o menu e esconde o que ele não pode). Vem do mesmo perfil que o servidor aplica.
  me(user: AuthenticatedUser): AccessMe {
    return {
      role: user.role,
      isOwner: user.role === Role.OWNER,
      profileName: user.profileName ?? null,
      permissions: user.permissions ?? normalizePermissions({}),
    };
  }

  // ───────── Perfis ─────────

  async listProfiles(tenantId: string): Promise<AccessProfileSummary[]> {
    const rows = await this.prisma.accessProfile.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: normalizePermissions(row.permissions),
      usersCount: row._count.users,
    }));
  }

  async createProfile(tenantId: string, dto: CreateAccessProfileDto): Promise<AccessProfileSummary> {
    const permissions = parsePermissionsInput(dto.permissions);
    if ((await this.prisma.accessProfile.count({ where: { tenantId } })) >= MAX_PROFILES_PER_TENANT) {
      throw new ConflictException(`Limite de ${MAX_PROFILES_PER_TENANT} perfis atingido.`);
    }
    await this.assertNameFree(tenantId, dto.name);
    const created = await this.prisma.accessProfile.create({
      data: { tenantId, name: dto.name, description: dto.description || null, permissions: permissions as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    return this.profileSummary(tenantId, created.id);
  }

  async updateProfile(tenantId: string, id: string, dto: UpdateAccessProfileDto): Promise<AccessProfileSummary> {
    const data: Prisma.AccessProfileUpdateManyMutationInput = {};
    if (dto.name !== undefined) {
      await this.assertNameFree(tenantId, dto.name, id);
      data.name = dto.name;
    }
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.permissions !== undefined) data.permissions = parsePermissionsInput(dto.permissions) as unknown as Prisma.InputJsonValue;

    // tenantId no WHERE da ESCRITA: perfil de outro negócio é o mesmo 404 de um inexistente.
    const result = await this.prisma.accessProfile.updateMany({ where: { id, tenantId }, data });
    if (result.count === 0) throw new NotFoundException("Perfil não encontrado.");
    return this.profileSummary(tenantId, id);
  }

  async deleteProfile(tenantId: string, id: string): Promise<{ ok: true }> {
    const profile = await this.prisma.accessProfile.findFirst({
      where: { id, tenantId },
      select: { id: true, _count: { select: { users: true } } },
    });
    if (!profile) throw new NotFoundException("Perfil não encontrado.");
    if (profile._count.users > 0) {
      throw new ConflictException(
        `${profile._count.users} ${profile._count.users === 1 ? "pessoa usa" : "pessoas usam"} este perfil. Troque o perfil delas antes de excluir.`,
      );
    }
    await this.prisma.accessProfile.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  }

  private async profileSummary(tenantId: string, id: string): Promise<AccessProfileSummary> {
    const profile = (await this.listProfiles(tenantId)).find((p) => p.id === id);
    if (!profile) throw new NotFoundException("Perfil não encontrado.");
    return profile;
  }

  private async assertNameFree(tenantId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.accessProfile.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException("Já existe um perfil com esse nome.");
  }

  // ───────── Pessoas ─────────

  async listUsers(tenantId: string): Promise<AccessUserSummary[]> {
    const rows = await this.prisma.user.findMany({
      where: { tenantId },
      select: USER_SELECT,
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return rows.map(toUserSummary);
  }

  // Cria alguém da equipe SEM agenda própria (recepção, caixa...). O papel é sempre "equipe" (nunca dono), o e-mail já nasce confirmado
  // (quem cria é o dono, que define a senha inicial) e o perfil precisa ser DESTE negócio.
  async createUser(tenantId: string, dto: CreateAccessUserDto): Promise<AccessUserSummary> {
    const profile = await this.prisma.accessProfile.findFirst({ where: { id: dto.profileId, tenantId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Perfil não encontrado.");

    if (await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } })) {
      throw new ConflictException("Já existe uma conta com este e-mail.");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: Role.RECEPTIONIST,
        accessProfileId: profile.id,
        emailVerifiedAt: new Date(),
      },
      select: USER_SELECT,
    });
    return toUserSummary(user);
  }

  async updateUser(tenantId: string, id: string, dto: UpdateAccessUserDto): Promise<AccessUserSummary> {
    const target = await this.findTarget(tenantId, id);

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.profileId !== undefined) {
      const profile = await this.prisma.accessProfile.findFirst({ where: { id: dto.profileId, tenantId }, select: { id: true } });
      if (!profile) throw new NotFoundException("Perfil não encontrado.");
      data.accessProfileId = profile.id;
    }
    if (dto.isActive !== undefined && dto.isActive !== target.isActive) {
      // Profissional tem regras próprias (agenda futura, limite do plano): ativar/desativar é em Profissionais, não aqui.
      if (target.professional) {
        throw new BadRequestException("Para ativar ou desativar um profissional, use a tela Profissionais.");
      }
      data.isActive = dto.isActive;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException("Nada para alterar.");

    // tenantId no WHERE da escrita (a leitura acima também filtra, mas a escrita não depende dela).
    const result = await this.prisma.user.updateMany({ where: { id, tenantId, role: { not: Role.OWNER } }, data });
    if (result.count === 0) throw new NotFoundException("Pessoa não encontrada.");
    return toUserSummary((await this.findTarget(tenantId, id)) as UserRow);
  }

  // O dono define uma senha nova para alguém da equipe. Derruba as sessões antigas (passwordChangedAt + refresh tokens revogados) e
  // zera o bloqueio por tentativas, como em toda redefinição de senha do projeto.
  async resetPassword(tenantId: string, id: string, password: string): Promise<{ ok: true }> {
    await this.findTarget(tenantId, id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await this.prisma.user.updateMany({
      where: { id, tenantId, role: { not: Role.OWNER } },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    if (result.count === 0) throw new NotFoundException("Pessoa não encontrada.");
    await this.refreshTokens.revokeAllForUser(id);
    return { ok: true };
  }

  // A pessoa precisa ser DESTE negócio (tenantId no WHERE, mesmo 404 de inexistente) e NUNCA o dono: o dono é sempre total e não se
  // altera por aqui (nem perfil, nem desativação, nem senha: a senha do dono segue o fluxo próprio).
  private async findTarget(tenantId: string, id: string): Promise<UserRow> {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId }, select: USER_SELECT });
    if (!target) throw new NotFoundException("Pessoa não encontrada.");
    if (target.role === Role.OWNER) throw new ForbiddenException("O dono tem acesso total e não pode ser alterado por aqui.");
    return target;
  }
}
