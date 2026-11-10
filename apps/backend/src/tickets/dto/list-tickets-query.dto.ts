import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

// Lista de comandas: sem `status` (ou OPEN) são as abertas, como sempre; CLOSED e CANCELED devolvem o histórico PAGINADO, das mais
// recentes para as mais antigas. `status` vem da URL, então só aceita os valores conhecidos (nada de string solta chegando ao Prisma).
export class ListTicketsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["OPEN", "CLOSED", "CANCELED"])
  status?: "OPEN" | "CLOSED" | "CANCELED";
}
