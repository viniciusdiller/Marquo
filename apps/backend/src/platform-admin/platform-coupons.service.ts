import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { couponState, couponValueError, isValidCouponCode } from "../coupons/coupon.util";
import { CreateCouponDto, PlatformCouponsQueryDto, UpdateCouponDto } from "./dto/platform-admin.dto";

export const COUPON_AUDIT = {
  CREATED: "COUPON_CREATED",
  UPDATED: "COUPON_UPDATED",
} as const;

const SELECT = {
  id: true,
  code: true,
  kind: true,
  value: true,
  description: true,
  maxRedemptions: true,
  redemptionCount: true,
  validFrom: true,
  validUntil: true,
  isActive: true,
  createdAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PlatformCouponsService {
  private readonly logger = new Logger(PlatformCouponsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformCouponsQueryDto) {
    const pagination = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: SELECT,
      }),
      this.prisma.coupon.count(),
    ]);
    return toPage(
      rows.map((coupon) => ({ ...coupon, state: couponState(coupon) })),
      total,
      pagination,
    );
  }

  async create(dto: CreateCouponDto, actor: string) {
    if (!isValidCouponCode(dto.code)) {
      throw new BadRequestException("Código do cupom: de 3 a 32 caracteres, só letras, números, _ e -.");
    }
    const valueError = couponValueError(dto.kind, dto.value);
    if (valueError) throw new BadRequestException(valueError);

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil.getTime() <= Date.now()) {
      throw new BadRequestException("O fim da validade precisa estar no futuro.");
    }
    if (validFrom && validUntil && validUntil.getTime() <= validFrom.getTime()) {
      throw new BadRequestException("O fim da validade precisa ser depois do início.");
    }

    try {
      const coupon = await this.prisma.$transaction(async (tx) => {
        const created = await tx.coupon.create({
          data: {
            code: dto.code,
            kind: dto.kind,
            value: dto.value,
            description: dto.description || null,
            maxRedemptions: dto.maxRedemptions ?? null,
            validFrom,
            validUntil,
          },
          select: SELECT,
        });
        await tx.adminAuditLog.create({
          data: { action: COUPON_AUDIT.CREATED, actor, detail: `Cupom ${created.code} (${created.kind} ${created.value})` },
        });
        return created;
      });
      this.logger.log(`Cupom ${coupon.code} criado por ${actor}.`);
      return { ...coupon, state: couponState(coupon) };
    } catch (error) {
      // Unicidade decidida pelo banco (sem "checar antes, criar depois").
      if (isUniqueViolation(error)) throw new ConflictException("Já existe um cupom com este código.");
      throw error;
    }
  }

  // Só o que é seguro mudar depois de criado: ativar/desativar, descrição, teto de usos e fim da
  // validade. Tipo, valor e código ficam fixos — quem já resgatou contou com eles.
  async update(id: string, dto: UpdateCouponDto, actor: string) {
    const current = await this.prisma.coupon.findFirst({ where: { id }, select: SELECT });
    if (!current) throw new NotFoundException("Cupom não encontrado.");

    const data: Prisma.CouponUpdateInput = {};
    const changes: string[] = [];

    if (dto.isActive !== undefined && dto.isActive !== current.isActive) {
      data.isActive = dto.isActive;
      changes.push(dto.isActive ? "ativado" : "desativado");
    }
    if (dto.description !== undefined) {
      data.description = dto.description || null;
      changes.push("descrição");
    }
    if (dto.maxRedemptions !== undefined) {
      if (dto.maxRedemptions < current.redemptionCount) {
        throw new BadRequestException(
          `O limite de usos não pode ficar abaixo dos ${current.redemptionCount} já resgatados.`,
        );
      }
      data.maxRedemptions = dto.maxRedemptions;
      changes.push(`limite de usos ${dto.maxRedemptions}`);
    }
    if (dto.validUntil !== undefined) {
      const validUntil = new Date(dto.validUntil);
      if (current.validFrom && validUntil.getTime() <= current.validFrom.getTime()) {
        throw new BadRequestException("O fim da validade precisa ser depois do início.");
      }
      data.validUntil = validUntil;
      changes.push("fim da validade");
    }
    if (changes.length === 0) return { ...current, state: couponState(current) };

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.coupon.update({ where: { id }, data, select: SELECT });
      await tx.adminAuditLog.create({
        data: { action: COUPON_AUDIT.UPDATED, actor, detail: `Cupom ${current.code}: ${changes.join(", ")}` },
      });
      return result;
    });
    return { ...updated, state: couponState(updated) };
  }
}
