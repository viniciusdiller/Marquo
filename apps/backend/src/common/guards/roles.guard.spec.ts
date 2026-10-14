import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@marquo/database";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "../decorators/roles.decorator";

// RolesGuard é o mecanismo global que decide TODO endpoint @Roles(...) do backend
// (profissionais, serviços, comissões, financeiro, produtos, fichas, lista de espera,
// avaliações, configurações...). Sem teste próprio, uma regressão aqui passaria batido
// por qualquer módulo que dependa só do decorator + deste guard pra bloquear
// RECEPTIONIST/PROFESSIONAL de ação de dono.
function buildContext(user: { role: Role } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
  } as unknown as ExecutionContext;
}

function buildGuard(metadata: Role[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(metadata) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe("RolesGuard", () => {
  it("sem metadata @Roles no handler/classe → permite (rota sem restrição de papel)", () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(buildContext({ role: Role.PROFESSIONAL }))).toBe(true);
  });

  it("metadata vazia ([]) → permite", () => {
    const guard = buildGuard([]);
    expect(guard.canActivate(buildContext({ role: Role.RECEPTIONIST }))).toBe(true);
  });

  it("role do usuário está na lista exigida → permite", () => {
    const guard = buildGuard([Role.OWNER]);
    expect(guard.canActivate(buildContext({ role: Role.OWNER }))).toBe(true);
  });

  it("role do usuário NÃO está na lista exigida → nega (RECEPTIONIST tentando ação de OWNER)", () => {
    const guard = buildGuard([Role.OWNER]);
    expect(guard.canActivate(buildContext({ role: Role.RECEPTIONIST }))).toBe(false);
  });

  it("role do usuário NÃO está na lista exigida → nega (PROFESSIONAL tentando ação de OWNER)", () => {
    const guard = buildGuard([Role.OWNER]);
    expect(guard.canActivate(buildContext({ role: Role.PROFESSIONAL }))).toBe(false);
  });

  it("sem request.user (guard de auth não rodou ou falhou) → nega, nunca permite por omissão", () => {
    const guard = buildGuard([Role.OWNER]);
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it("lê metadata do handler e da classe via getAllAndOverride (handler tem prioridade)", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.OWNER, Role.RECEPTIONIST]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    guard.canActivate(buildContext({ role: Role.RECEPTIONIST }));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });
});
