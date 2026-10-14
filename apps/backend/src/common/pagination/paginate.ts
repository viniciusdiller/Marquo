import type { Paginated } from "@marquo/shared-types";
import { DEFAULT_PAGE_SIZE, PaginationQueryDto } from "./pagination-query.dto";

export function resolvePagination(query: PaginationQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// Monta a resposta padrão { items, total, page, pageSize, pageCount }. pageCount mínimo 1 pra o
// cliente nunca ter que tratar "0 páginas" como caso especial de navegação.
export function toPage<T>(
  items: T[],
  total: number,
  pagination: { page: number; pageSize: number },
): Paginated<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}
