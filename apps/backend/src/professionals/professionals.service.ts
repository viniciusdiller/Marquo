import { mkdir, unlink } from "fs/promises";
import { join } from "path";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitService } from "../billing/plan-limit.service";
import { hasOverlappingIntervals } from "../common/utils/interval.util";
import { SLOT_BLOCKING_STATUSES } from "../appointments/appointments.service";
import { CreateProfessionalDto } from "./dto/create-professional.dto";
import { UpdateProfessionalDto } from "./dto/update-professional.dto";
import { SetWorkingHoursDto } from "./dto/set-working-hours.dto";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "../common/constants/uploads";
import { convertToWebp } from "../common/utils/image.util";

const BCRYPT_ROUNDS = 12;
const PHOTO_SIZE = 512;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async create(tenantId: string, dto: CreateProfessionalDto) {
    await this.planLimitService.assertCanAddProfessional(tenantId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException("Já existe uma conta com este e-mail.");
    }

    const passwordHash = await bcrypt.hash(dto.initialPassword, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: Role.PROFESSIONAL,
          // Criado por um dono autenticado (que define a senha inicial): não passa pela confirmação do cadastro público.
          emailVerifiedAt: new Date(),
        },
      });

      return tx.professional.create({
        data: { tenantId, userId: user.id, bio: dto.bio },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    });
  }

  // includeEmail=false pra PROFESSIONAL: GET /professionals/:id já bloqueia um profissional
  // de ver o registro de outro colega, mas essa listagem não tinha a mesma restrição e
  // vazava o e-mail de todo mundo pra qualquer profissional autenticado.
  findAllByTenant(tenantId: string, { includeEmail = true }: { includeEmail?: boolean } = {}) {
    return this.prisma.professional.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, name: true, email: includeEmail } },
        workingHours: true,
      },
    });
  }

  async findOneOrThrow(tenantId: string, professionalId: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, tenantId },
      include: { user: { select: { id: true, name: true, email: true } }, workingHours: true },
    });

    if (!professional) {
      throw new NotFoundException("Profissional não encontrado.");
    }

    return professional;
  }

  async update(tenantId: string, professionalId: string, dto: UpdateProfessionalDto) {
    const professional = await this.findOneOrThrow(tenantId, professionalId);

    if (dto.isActive === true && !professional.isActive) {
      await this.planLimitService.assertCanAddProfessional(tenantId);
    }

    // Desativar sem checar agenda futura deixava o agendamento "órfão": some da coluna do
    // profissional no calendário (getCalendar filtra professionals por isActive) mas
    // continua ocupando o horário (appointments não é filtrado do mesmo jeito) — o dono
    // precisa resolver a agenda antes de desativar, não descobrir depois que sumiu.
    if (dto.isActive === false && professional.isActive) {
      const futureBlockingCount = await this.prisma.appointment.count({
        where: {
          professionalId: professional.id,
          status: { in: SLOT_BLOCKING_STATUSES },
          startAt: { gt: new Date() },
        },
      });
      if (futureBlockingCount > 0) {
        throw new ConflictException(
          `Não é possível desativar: há ${futureBlockingCount} agendamento(s) futuro(s) para este profissional. Cancele ou remarque antes de desativar.`,
        );
      }
    }

    if (dto.email && dto.email !== professional.user.email) {
      const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingUser && existingUser.id !== professional.userId) {
        throw new ConflictException("Já existe uma conta com este e-mail.");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.email !== undefined) {
        await tx.user.update({
          where: { id: professional.userId },
          data: { name: dto.name, email: dto.email },
        });
      }
      return tx.professional.update({
        where: { id: professional.id },
        data: { bio: dto.bio, isActive: dto.isActive },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    });
  }

  // Exclusão DEFINITIVA, só de quem não tem histórico. O schema protege o histórico de propósito
  // (Appointment e CommissionEntry usam onDelete: Restrict, e o User não some se abriu comanda/caixa
  // ou criou lançamento): apagar em cascata quebraria relatórios e o caixa. Quem tem histórico é
  // desativado (PATCH isActive=false), que preserva tudo.
  async remove(tenantId: string, professionalId: string) {
    const professional = await this.findOneOrThrow(tenantId, professionalId);
    const userId = professional.userId;

    // O dono também pode ser um profissional: apagar o User dele apagaria a conta de acesso.
    // O papel precisa ser lido aqui: findOneOrThrow só seleciona id/nome/e-mail do usuário, então
    // checar `professional.user.role` daria sempre undefined e a proteção nunca dispararia.
    const owner = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, role: Role.OWNER },
      select: { id: true },
    });
    if (owner) {
      throw new ConflictException("O dono da conta não pode ser excluído.");
    }

    const [appointments, commissions, tickets, cashRegisters, financialEntries] = await Promise.all([
      this.prisma.appointment.count({ where: { professionalId: professional.id } }),
      this.prisma.commissionEntry.count({ where: { professionalId: professional.id } }),
      this.prisma.ticket.count({ where: { openedByUserId: userId } }),
      this.prisma.cashRegister.count({ where: { openedByUserId: userId } }),
      this.prisma.financialEntry.count({ where: { createdByUserId: userId } }),
    ]);
    if (appointments + commissions + tickets + cashRegisters + financialEntries > 0) {
      throw new ConflictException(
        "Este profissional tem histórico (agendamentos, comissões, comandas ou lançamentos) e não pode ser excluído. Desative-o para preservar o histórico.",
      );
    }

    // Apaga o User: o Professional, horários, bloqueios e vínculos de serviço saem em cascata.
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async setWorkingHours(tenantId: string, professionalId: string, dto: SetWorkingHoursDto) {
    const professional = await this.findOneOrThrow(tenantId, professionalId);

    for (const interval of dto.intervals) {
      if (interval.startMinute >= interval.endMinute) {
        throw new BadRequestException(
          "O horário de início deve ser anterior ao horário de término.",
        );
      }
    }

    const byWeekday = new Map<string, typeof dto.intervals>();
    for (const interval of dto.intervals) {
      const list = byWeekday.get(interval.weekday) ?? [];
      list.push(interval);
      byWeekday.set(interval.weekday, list);
    }
    for (const [weekday, intervals] of byWeekday) {
      if (hasOverlappingIntervals(intervals)) {
        throw new BadRequestException(`Horários sobrepostos para ${weekday}.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({ where: { professionalId: professional.id } });
      if (dto.intervals.length === 0) {
        return [];
      }
      await tx.workingHours.createMany({
        data: dto.intervals.map((interval) => ({
          professionalId: professional.id,
          weekday: interval.weekday,
          startMinute: interval.startMinute,
          endMinute: interval.endMinute,
        })),
      });
      return tx.workingHours.findMany({ where: { professionalId: professional.id } });
    });
  }

  // ─────────────────────────────────────────────
  // Foto do profissional
  // ─────────────────────────────────────────────

  private photoDir(tenantId: string) {
    return join(UPLOADS_DIR, "tenants", tenantId, "professionals");
  }

  // Remove o arquivo ANTERIOR a partir do caminho gravado no banco, mas só se ele estiver dentro da pasta de fotos
  // deste negócio (o valor vem do banco, não do cliente; a checagem evita apagar fora dela se um dia vier sujo).
  private async deletePhotoFile(tenantId: string, photoUrl: string | null) {
    if (!photoUrl) return;
    const prefix = `${UPLOADS_URL_PREFIX}/tenants/${tenantId}/professionals/`;
    if (!photoUrl.startsWith(prefix)) return;
    const name = photoUrl.slice(prefix.length);
    if (!/^[0-9a-f-]{36}-[a-z0-9]+\.webp$/i.test(name)) return;
    await unlink(join(this.photoDir(tenantId), name)).catch(() => {});
  }

  async updatePhoto(tenantId: string, professionalId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Nenhum arquivo enviado.");
    if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException("Formato de imagem não suportado. Use JPEG, PNG ou WEBP.");
    }
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("Imagem muito grande (máximo 5MB).");

    // Posse no WHERE (nunca buscar por id e comparar o dono depois).
    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, tenantId },
      select: { id: true, photoUrl: true },
    });
    if (!professional) throw new NotFoundException("Profissional não encontrado.");

    await mkdir(this.photoDir(tenantId), { recursive: true });
    // Nome com versão: a foto nova tem URL nova (nada de cache velho no navegador/CDN) e o arquivo anterior é apagado.
    const filename = `${professional.id}-${Date.now().toString(36)}.webp`;
    await convertToWebp(file.buffer, {
      maxDimension: PHOTO_SIZE,
      quality: 82,
      outPath: join(this.photoDir(tenantId), filename),
      crop: "square",
    });

    const photoUrl = `${UPLOADS_URL_PREFIX}/tenants/${tenantId}/professionals/${filename}`;
    // updateMany com tenantId: a escrita também é escopada ao negócio.
    await this.prisma.professional.updateMany({ where: { id: professional.id, tenantId }, data: { photoUrl } });
    await this.deletePhotoFile(tenantId, professional.photoUrl);
    return { photoUrl };
  }

  async removePhoto(tenantId: string, professionalId: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, tenantId },
      select: { id: true, photoUrl: true },
    });
    if (!professional) throw new NotFoundException("Profissional não encontrado.");

    await this.prisma.professional.updateMany({ where: { id: professional.id, tenantId }, data: { photoUrl: null } });
    await this.deletePhotoFile(tenantId, professional.photoUrl);
    return { photoUrl: null };
  }

  async findPublicTeamByTenantSlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }

    const professionals = await this.prisma.professional.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return professionals.map((p) => ({ id: p.id, name: p.user.name, bio: p.bio, photoUrl: p.photoUrl }));
  }

  async findPublicByTenantSlugAndService(slug: string, serviceId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }

    const professionalServices = await this.prisma.professionalService.findMany({
      where: {
        serviceId,
        isActive: true,
        service: { tenantId: tenant.id, isActive: true },
        professional: { tenantId: tenant.id, isActive: true },
      },
      include: { professional: { include: { user: { select: { name: true } } } } },
    });

    return professionalServices.map((ps) => ({
      id: ps.professional.id,
      name: ps.professional.user.name,
      bio: ps.professional.bio,
      photoUrl: ps.professional.photoUrl,
    }));
  }
}
