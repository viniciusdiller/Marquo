import "reflect-metadata";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@marquo/database";
import { FULL_ACCESS, normalizePermissions, type AccessPermissions } from "@marquo/shared-types";
import { AreaGuard, requiredLevel } from "./area.guard";
import { Area, AREA_KEY } from "./area.decorator";

// Ponto central de segurança dos perfis: o AreaGuard decide a cada requisição, com o perfil lido do banco.

@Area("caixa")
class CaixaController {
  list() {}
  @Area("caixa", "VIEW")
  openAsRead() {}
  @Area("financeiro_avancado")
  advanced() {}
  @Area("profissionais", "EDIT", { selfParam: "id" })
  photo() {}
  @Area(["clientes", "comandas"], "VIEW")
  search() {}
}
class SemAreaController {
  open() {}
}

function ctx(controller: new () => object, handler: string, user: unknown, method = "GET", params: Record<string, string> = {}): ExecutionContext {
  const proto = controller.prototype as Record<string, () => void>;
  return {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user, method, params }) }),
  } as unknown as ExecutionContext;
}

const guard = new AreaGuard(new Reflector());
const staff = (permissions: Partial<AccessPermissions>, extra: object = {}) => ({
  userId: "u",
  tenantId: "t",
  role: Role.RECEPTIONIST,
  permissions: normalizePermissions(permissions),
  ...extra,
});

describe("AreaGuard", () => {
  it("rota sem @Area não é limitada por perfil", () => {
    expect(guard.canActivate(ctx(SemAreaController, "open", staff({})))).toBe(true);
  });

  it("o DONO sempre passa, em qualquer área e qualquer método", () => {
    const owner = { userId: "u", tenantId: "t", role: Role.OWNER, permissions: FULL_ACCESS };
    expect(guard.canActivate(ctx(CaixaController, "list", owner, "POST"))).toBe(true);
    expect(guard.canActivate(ctx(CaixaController, "advanced", owner, "DELETE"))).toBe(true);
    // mesmo sem permissions carregadas (o papel basta para o dono)
    expect(guard.canActivate(ctx(CaixaController, "list", { userId: "u", tenantId: "t", role: Role.OWNER }, "POST"))).toBe(true);
  });

  describe("níveis (o método HTTP decide quando a rota não fixa)", () => {
    it("GET pede VIEW: 'só ver' e 'editar' passam, 'sem acesso' não", () => {
      expect(guard.canActivate(ctx(CaixaController, "list", staff({ caixa: "VIEW" }), "GET"))).toBe(true);
      expect(guard.canActivate(ctx(CaixaController, "list", staff({ caixa: "EDIT" }), "GET"))).toBe(true);
      expect(() => guard.canActivate(ctx(CaixaController, "list", staff({ caixa: "NONE" }), "GET"))).toThrow(ForbiddenException);
    });

    it("POST/PATCH/PUT/DELETE pedem EDIT: 'só ver' é barrado com mensagem de só leitura", () => {
      for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
        expect(guard.canActivate(ctx(CaixaController, "list", staff({ caixa: "EDIT" }), method))).toBe(true);
        expect(() => guard.canActivate(ctx(CaixaController, "list", staff({ caixa: "VIEW" }), method))).toThrow(/só permite visualizar/);
      }
    });

    it("nível fixado na rota vale sobre o método (POST que só exige VER)", () => {
      expect(guard.canActivate(ctx(CaixaController, "openAsRead", staff({ caixa: "VIEW" }), "POST"))).toBe(true);
      expect(() => guard.canActivate(ctx(CaixaController, "openAsRead", staff({ caixa: "NONE" }), "POST"))).toThrow(ForbiddenException);
    });

    it("requiredLevel: leitura pede VIEW, escrita pede EDIT, e o nível explícito vence", () => {
      expect(requiredLevel({ area: "caixa" }, "get")).toBe("VIEW");
      expect(requiredLevel({ area: "caixa" }, "HEAD")).toBe("VIEW");
      expect(requiredLevel({ area: "caixa" }, "POST")).toBe("EDIT");
      expect(requiredLevel({ area: "caixa", level: "VIEW" }, "POST")).toBe("VIEW");
    });
  });

  it("a área do MÉTODO sobrepõe a da classe (financeiro_avancado dentro de um controller de caixa)", () => {
    expect(() => guard.canActivate(ctx(CaixaController, "advanced", staff({ caixa: "EDIT" }), "GET"))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(CaixaController, "advanced", staff({ financeiro_avancado: "VIEW" }), "GET"))).toBe(true);
  });

  it("uma área NÃO dá acesso a outra (caixa EDIT não abre o financeiro avançado)", () => {
    expect(() => guard.canActivate(ctx(CaixaController, "advanced", staff({ caixa: "EDIT", financeiro: "EDIT" }), "POST"))).toThrow();
  });

  describe("lista de áreas (basta qualquer uma)", () => {
    it("passa com uma delas e nega sem nenhuma", () => {
      expect(guard.canActivate(ctx(CaixaController, "search", staff({ comandas: "VIEW" })))).toBe(true);
      expect(guard.canActivate(ctx(CaixaController, "search", staff({ clientes: "EDIT" })))).toBe(true);
      expect(() => guard.canActivate(ctx(CaixaController, "search", staff({ agenda: "EDIT", caixa: "EDIT" })))).toThrow(ForbiddenException);
    });
  });

  describe("autoatendimento do profissional (selfParam)", () => {
    it("o profissional mexe no PRÓPRIO registro mesmo sem permissão na área", () => {
      const pro = staff({}, { role: Role.PROFESSIONAL, professionalId: "prof-1" });
      expect(guard.canActivate(ctx(CaixaController, "photo", pro, "POST", { id: "prof-1" }))).toBe(true);
    });

    it("mas NÃO no de outro colega", () => {
      const pro = staff({}, { role: Role.PROFESSIONAL, professionalId: "prof-1" });
      expect(() => guard.canActivate(ctx(CaixaController, "photo", pro, "POST", { id: "prof-2" }))).toThrow(ForbiddenException);
    });

    it("com 'editar' em Profissionais, mexe no de qualquer um", () => {
      const pro = staff({ profissionais: "EDIT" }, { role: Role.PROFESSIONAL, professionalId: "prof-1" });
      expect(guard.canActivate(ctx(CaixaController, "photo", pro, "POST", { id: "prof-2" }))).toBe(true);
    });

    it("quem não é profissional (sem professionalId) nunca entra pelo autoatendimento", () => {
      expect(() => guard.canActivate(ctx(CaixaController, "photo", staff({}), "POST", { id: "undefined" }))).toThrow(ForbiddenException);
    });
  });

  describe("fecha por padrão", () => {
    it("usuário sem permissions (ex.: montado à mão) é tratado como SEM acesso", () => {
      expect(() => guard.canActivate(ctx(CaixaController, "list", { userId: "u", tenantId: "t", role: Role.RECEPTIONIST }))).toThrow(ForbiddenException);
    });

    it("rota com área e SEM usuário autenticado é negada (nunca liberada)", () => {
      expect(() => guard.canActivate(ctx(CaixaController, "list", undefined))).toThrow(ForbiddenException);
    });

    it("mensagem de acesso negado não vaza o nome interno da área nem o perfil", () => {
      try {
        guard.canActivate(ctx(CaixaController, "list", staff({})));
      } catch (error) {
        expect((error as Error).message).toBe("Seu perfil não tem acesso a esta área.");
      }
    });
  });

  it("o decorator grava a exigência no metadado esperado", () => {
    expect(Reflect.getMetadata(AREA_KEY, CaixaController)).toEqual({ area: "caixa", level: undefined, selfParam: undefined });
  });
});
