import { Trim } from "../../common/decorators/trim.decorator";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  IsUUID,
} from "class-validator";

export class OpenTicketDto {
  // Abre a partir de um atendimento (copia os serviços) OU avulsa com cliente opcional.
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Trim()
  note?: string;
}

export class AddTicketItemDto {
  @IsIn(["SERVICE", "PRODUCT", "CUSTOM"])
  kind!: "SERVICE" | "PRODUCT" | "CUSTOM";

  @ValidateIf((o) => o.kind === "SERVICE")
  @IsUUID()
  serviceId?: string;

  @ValidateIf((o) => o.kind === "PRODUCT")
  @IsUUID()
  productId?: string;

  @ValidateIf((o) => o.kind === "CUSTOM")
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Trim()
  description?: string;

  // Obrigatório para CUSTOM; override opcional para SERVICE/PRODUCT (senão usa o catálogo do
  // momento). @ValidateIf tinha só o caso CUSTOM — pra SERVICE/PRODUCT o campo passava direto
  // sem NENHUMA validação (nem tipo, nem sinal), porque os decorators abaixo são pulados
  // quando ValidateIf retorna false. Agora valida sempre que o campo vier preenchido, não só
  // no caso CUSTOM — fecha a porta pra um preço negativo/absurdo entrar via override.
  @ValidateIf((o) => o.kind === "CUSTOM" || o.unitPriceCents !== undefined)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unitPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @IsOptional()
  @IsUUID()
  professionalId?: string;
}

export class SetTicketDiscountDto {
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  discountCents!: number;
}

// Vincula (UUID) ou desvincula (null) o cliente da comanda. `clientId` é OBRIGATÓRIO no corpo: ausente
// não vira "desvincular" em silêncio (ValidateIf só pula a checagem de UUID quando é null de verdade).
export class SetTicketClientDto {
  @ValidateIf((o: SetTicketClientDto) => o.clientId !== null)
  @IsUUID()
  clientId!: string | null;
}

export class AddPaymentDto {
  @IsIn(["CASH", "DEBIT", "CREDIT", "PIX", "OTHER"])
  method!: "CASH" | "DEBIT" | "CREDIT" | "PIX" | "OTHER";

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;
}

// Edita um item JÁ lançado na comanda aberta: só quantidade e profissional. Preço, tipo e serviço nunca mudam por aqui (preço de
// catálogo vem sempre do servidor; para trocar o serviço, remove e adiciona de novo). `professionalId`: UUID troca, null deixa o item
// sem profissional, ausente não mexe. Pelo menos um dos dois (o service confere: o DTO sozinho não é a última linha).
export class UpdateTicketItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @ValidateIf((o: UpdateTicketItemDto) => o.professionalId !== undefined && o.professionalId !== null)
  @IsUUID()
  professionalId?: string | null;
}

// Observação da comanda. `note` é OBRIGATÓRIO no corpo: texto troca, null limpa; ausente não vira "limpar" em silêncio.
export class SetTicketNoteDto {
  @ValidateIf((o: SetTicketNoteDto) => o.note !== null)
  @IsString()
  @MaxLength(1000)
  @Trim()
  note!: string | null;
}

// Motivo de uma operação que mexe em dinheiro já lançado (estornar pagamento, reabrir comanda fechada). Fica no histórico.
export class TicketReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Trim()
  reason!: string;
}
