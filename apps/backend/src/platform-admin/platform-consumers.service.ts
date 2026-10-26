import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { normalizePhone } from "../common/utils/phone.util";

export const AUDIT_CONSUMER_DELETED = "CONSUMER_DELETED";

export interface ConsumerListQuery extends PaginationQueryDto {
  search?: string;
}

// Contas de cliente final (identidade GLOBAL: um telefone = uma conta em todos os salões). A plataforma lista e exclui.
// Mesma regra da exclusão feita pelo próprio cliente (ConsumerAuthService.deleteAccount): somem a conta, as sessões, o
// vínculo com cada salão e as avaliações (onDelete: Cascade); o `Client` de cada salão (ficha, histórico de atendimentos)
// PERMANECE, porque é registro do negócio. A auditoria é gravada antes, na MESMA transação, e nunca leva dado pessoal.
@Injectable()
export class PlatformConsumersService {
  private readonly logger = new Logger(PlatformConsumersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ConsumerListQuery) {
    const pagination = resolvePagination(query);
    const search = query.search?.trim();
    const where: Prisma.ConsumerWhereInput = {};
    if (search) {
      const digits = search.replace(/\D/g, "");
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search.toLowerCase() } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.consumer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          _count: { select: { tenantLinks: true, reviews: true } },
        },
      }),
      this.prisma.consumer.count({ where }),
    ]);

    return toPage(
      items.map(({ _count, ...consumer }) => ({
        ...consumer,
        salons: _count.tenantLinks,
        reviews: _count.reviews,
      })),
      total,
      pagination,
    );
  }

  async remove(consumerId: string, input: { confirmPhone: string; reason: string }, actor: string) {
    const reason = input.reason?.trim() ?? "";
    // O DTO já barra; repete porque o service é chamado direto em testes e outros pontos.
    if (reason.length < 10 || reason.length > 300) {
      throw new BadRequestException("Informe o motivo da exclusão (de 10 a 300 caracteres).");
    }

    const consumer = await this.prisma.consumer.findUnique({
      where: { id: consumerId },
      select: { id: true, phone: true, _count: { select: { tenantLinks: true } } },
    });
    // Mesmo 404 de conta inexistente.
    if (!consumer) throw new NotFoundException("Cliente não encontrado.");
    // Confirmação digitada: o telefone da conta (quem apertou sem olhar não exclui).
    if (normalizePhone(input.confirmPhone) !== consumer.phone) {
      throw new BadRequestException("A confirmação não confere com o telefone da conta.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminAuditLog.create({
        data: {
          action: AUDIT_CONSUMER_DELETED,
          actor,
          detail: `consumer=${consumer.id}; salões vinculados=${consumer._count.tenantLinks}; motivo: ${reason}`,
        },
      });
      await tx.consumer.delete({ where: { id: consumer.id } });
    });

    this.logger.log(`Conta de cliente ${consumer.id} excluída por ${actor}.`);
    return { deleted: true };
  }
}
