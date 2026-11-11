import { SetMetadata } from "@nestjs/common";
import type { AccessAreaKey, AccessLevel } from "@marquo/shared-types";

export const AREA_KEY = "access-area";

export interface AreaRequirement {
  // Uma área, ou uma lista (basta QUALQUER uma): usado em rotas de apoio que várias telas consomem, como a busca de clientes.
  area: AccessAreaKey | AccessAreaKey[];
  // Nível exigido. Omitido: GET/HEAD/OPTIONS pedem VIEW e qualquer outro método pede EDIT.
  level?: AccessLevel;
  // Nome do parâmetro de rota com o id do PROFISSIONAL (ex.: "id"). Se o usuário logado for esse profissional, passa mesmo sem a
  // permissão da área: cada profissional cuida da PRÓPRIA foto e dos PRÓPRIOS horários, qualquer que seja o perfil dele.
  selfParam?: string;
}

// Marca uma rota (ou o controller inteiro) como pertencente a uma área do painel. O dono sempre passa; os demais precisam do nível
// exigido no perfil. A rota de um método sobrepõe a do controller. Rota sem @Area não é limitada por perfil (continua valendo o
// que já valia: @Roles, @Public e o escopo de cada service).
export const Area = (area: AccessAreaKey | AccessAreaKey[], level?: AccessLevel, options: { selfParam?: string } = {}) =>
  SetMetadata(AREA_KEY, { area, level, selfParam: options.selfParam } satisfies AreaRequirement);
