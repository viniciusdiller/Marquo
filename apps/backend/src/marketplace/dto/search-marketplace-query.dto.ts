import { Type } from "class-transformer";
import { IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

// Endpoint público, sem auth — todo campo é opcional (busca vazia = lista tudo, até o teto de
// `take` fixo no service), mas nenhum aceita valor arbitrário: strings têm teto de tamanho e
// os números geográficos têm faixa válida, em vez de `Number(query.lat)` sem checagem alguma
// no controller (NaN/Infinity/fora de -90..90 chegando direto no WHERE do Prisma).
export class SearchMarketplaceQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  radiusKm?: number;

  // Ordenação explícita: "rating" (melhor avaliados primeiro) ou "distance" (mais perto primeiro,
  // exige lat/lng). Omitido: distância quando há lat/lng, senão nota.
  @IsOptional()
  @IsIn(["rating", "distance"])
  sort?: "rating" | "distance";

  // Teto de itens devolvidos (a home pede só os 8 primeiros).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
