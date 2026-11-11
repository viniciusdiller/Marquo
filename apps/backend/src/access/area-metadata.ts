import "reflect-metadata";
import { AREA_KEY, type AreaRequirement } from "./area.decorator";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

// Só para testes de controller: devolve a exigência de área EFETIVA de uma rota, do jeito que o AreaGuard resolve (a do método vence a
// da classe) e o papel exigido pelo RolesGuard (idem). Assim cada spec afirma "esta rota pede tal área e nível" sem repetir a lógica.
type Ctor = { prototype: object };

export function areaOf(controller: Ctor, handler: string): AreaRequirement | undefined {
  const method = (controller.prototype as Record<string, unknown>)[handler] as object;
  return (Reflect.getMetadata(AREA_KEY, method) ?? Reflect.getMetadata(AREA_KEY, controller)) as AreaRequirement | undefined;
}

export function rolesOf(controller: Ctor, handler: string): string[] | undefined {
  const method = (controller.prototype as Record<string, unknown>)[handler] as object;
  return (Reflect.getMetadata(ROLES_KEY, method) ?? Reflect.getMetadata(ROLES_KEY, controller)) as string[] | undefined;
}
