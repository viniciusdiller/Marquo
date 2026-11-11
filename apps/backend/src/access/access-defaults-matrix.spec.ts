import "reflect-metadata";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@marquo/database";
import { DEFAULT_PROFILES } from "@marquo/shared-types";
import { AreaGuard } from "./area.guard";
import { rolesOf } from "./area-metadata";
import { AppointmentsController } from "../appointments/appointments.controller";
import { CashRegisterController } from "../cash-register/cash-register.controller";
import { ClientsController } from "../clients/clients.controller";
import { ClubController } from "../club/club.controller";
import { CommissionsController } from "../commissions/commissions.controller";
import { FinanceController } from "../finance/finance.controller";
import { IntakeFormsController, IntakeResponsesController } from "../intake/intake.controller";
import { ProductsController } from "../products/products.controller";
import { ProfessionalsController } from "../professionals/professionals.controller";
import { ProfessionalServicesController, ServicesController } from "../services/services.controller";
import { ReportsController } from "../reports/reports.controller";
import { OwnerReviewsController } from "../reviews/reviews.controller";
import { TenantsController } from "../tenants/tenants.controller";
import { TicketsController } from "../tickets/tickets.controller";
import { TimeBlocksController } from "../time-blocks/time-blocks.controller";
import { WaitlistController } from "../waitlist/waitlist.controller";

// GARANTIA DE NÃO-REGRESSÃO: percorre TODAS as rotas dos controllers migrados para perfis e compara a decisão dos perfis PADRÃO
// (Recepção e Profissional) com o acesso que cada papel tinha antes dos perfis (RolesGuard). Qualquer diferença precisa estar
// declarada em CHANGES, com o motivo: nada muda "sem querer" para quem já usa o sistema.

const HTTP = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD"];
const guard = new AreaGuard(new Reflector());

const permissionsOf = (role: string) => DEFAULT_PROFILES.find((p) => p.role === role)!.permissions;
const USERS = {
  RECEPTIONIST: { userId: "u", tenantId: "t", role: Role.RECEPTIONIST, permissions: permissionsOf("RECEPTIONIST") },
  PROFESSIONAL: { userId: "u", tenantId: "t", role: Role.PROFESSIONAL, professionalId: "prof-own", permissions: permissionsOf("PROFESSIONAL") },
} as const;

type Ctor = { prototype: object; name: string };

function routes(controller: Ctor): Array<{ handler: string; method: string }> {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && typeof proto[name] === "function" && Reflect.getMetadata("path", proto[name] as object) !== undefined)
    .map((handler) => ({ handler, method: HTTP[Reflect.getMetadata("method", proto[handler] as object)] }));
}

// Mesma ordem dos guards globais: RolesGuard (papel fixo, se houver) e depois AreaGuard.
function allowed(controller: Ctor, handler: string, method: string, who: keyof typeof USERS, params: Record<string, string> = {}): boolean {
  const user = USERS[who];
  const roles = rolesOf(controller, handler);
  if (roles && !roles.includes(user.role)) return false;
  const proto = controller.prototype as Record<string, unknown>;
  const context = {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user, method, params }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context);
  } catch {
    return false;
  }
}

// Como era ANTES dos perfis (RolesGuard): { RECEPTIONIST, PROFESSIONAL } por controller ou por rota. `null` = sem restrição de papel.
const LEGACY: Array<{ controller: Ctor; rule: (handler: string) => { REC: boolean; PRO: boolean } }> = [
  { controller: AppointmentsController, rule: () => ({ REC: true, PRO: true }) },
  { controller: TimeBlocksController, rule: () => ({ REC: true, PRO: true }) },
  { controller: TicketsController, rule: (h) => (["reopen", "history"].includes(h) ? { REC: false, PRO: false } : { REC: true, PRO: false }) },
  { controller: CashRegisterController, rule: () => ({ REC: true, PRO: false }) },
  { controller: ClientsController, rule: () => ({ REC: true, PRO: false }) },
  {
    controller: FinanceController,
    rule: (h) => (["createCategory", "updateCategory", "registerPayout", "listPayouts", "dre"].includes(h) ? { REC: false, PRO: false } : { REC: true, PRO: false }),
  },
  { controller: ProductsController, rule: (h) => (["create", "update"].includes(h) ? { REC: false, PRO: false } : { REC: true, PRO: false }) },
  { controller: ReportsController, rule: () => ({ REC: true, PRO: false }) },
  { controller: CommissionsController, rule: (h) => (["report", "earnings"].includes(h) ? { REC: true, PRO: true } : { REC: false, PRO: false }) },
  { controller: ClubController, rule: () => ({ REC: false, PRO: false }) },
  { controller: WaitlistController, rule: () => ({ REC: false, PRO: false }) },
  { controller: ServicesController, rule: (h) => (h === "findAll" ? { REC: true, PRO: true } : { REC: false, PRO: false }) },
  { controller: ProfessionalServicesController, rule: (h) => (h === "list" ? { REC: true, PRO: true } : { REC: false, PRO: false }) },
  { controller: IntakeFormsController, rule: (h) => (h === "list" ? { REC: true, PRO: true } : { REC: false, PRO: false }) },
  { controller: IntakeResponsesController, rule: () => ({ REC: true, PRO: true }) },
  { controller: OwnerReviewsController, rule: () => ({ REC: false, PRO: false }) },
];

// Diferenças DE PROPÓSITO em relação a antes. Chave: "Controller.handler" -> { REC, PRO } NOVOS, com o motivo.
const CHANGES: Record<string, { REC?: boolean; PRO?: boolean; why: string }> = {
  "WaitlistController.findAll": { REC: true, why: "Lista de espera passou a ser uma área: a Recepção padrão a vê e administra (antes só o dono)." },
  "WaitlistController.counts": { REC: true, why: "Contagem das abas da lista de espera: mesma área de findAll, então a Recepção padrão também a vê." },
  "WaitlistController.updateStatus": { REC: true, why: "Mesmo motivo de findAll: a Recepção padrão dá andamento na lista de espera." },
  "ProductsController.create": { REC: true, why: "Produtos é uma área só: quem ajustava estoque (Recepção) passa a poder cadastrar produto. Já podia lançar item avulso a qualquer preço." },
  "ProductsController.update": { REC: true, why: "Mesmo motivo de create: produtos é uma área só, e a Recepção já tem permissão de editar o catálogo de estoque." },
  "CommissionsController.report": { REC: false, PRO: false, why: "Era uma rota aberta a todo staff que devolvia os ganhos de TODOS à Recepção; agora exige a área Comissões (a tela já era só do dono)." },
  "CommissionsController.earnings": { REC: false, PRO: false, why: "Mesmo motivo de report: os ganhos de todos só com a área Comissões (a tela já era só do dono)." },
};

describe("Perfis padrão preservam o acesso que cada papel já tinha", () => {
  for (const { controller, rule } of LEGACY) {
    for (const { handler, method } of routes(controller)) {
      const key = `${controller.name}.${handler}`;
      const legacy = rule(handler);
      const expected = { REC: CHANGES[key]?.REC ?? legacy.REC, PRO: CHANGES[key]?.PRO ?? legacy.PRO };

      it(`${key} (${method}): Recepção ${expected.REC ? "pode" : "não pode"}, Profissional ${expected.PRO ? "pode" : "não pode"}`, () => {
        expect({
          REC: allowed(controller, handler, method, "RECEPTIONIST"),
          PRO: allowed(controller, handler, method, "PROFESSIONAL"),
        }).toEqual(expected);
      });
    }
  }

  it("a matriz cobre os 16 controllers migrados e todas as suas rotas (nenhuma ficou de fora)", () => {
    expect(LEGACY).toHaveLength(16);
    const total = LEGACY.reduce((sum, { controller }) => sum + routes(controller).length, 0);
    expect(total).toBe(85);
    // toda rota tem método HTTP reconhecido (se o Nest mudar o formato do metadado, este teste avisa em vez de passar vazio)
    for (const { controller } of LEGACY) for (const r of routes(controller)) expect(r.method).toBeDefined();
  });

  // Foto e horários: o profissional edita os PRÓPRIOS; a Recepção padrão (só "ver" em Profissionais) não edita ninguém.
  describe("foto e horários de profissionais", () => {
    for (const handler of ["uploadPhoto", "removePhoto", "setWorkingHours"]) {
      const method = handler === "setWorkingHours" ? "PUT" : handler === "uploadPhoto" ? "POST" : "DELETE";
      it(`${handler}: o profissional mexe no próprio, não no de outro; a Recepção padrão não mexe em nenhum`, () => {
        expect(allowed(ProfessionalsController, handler, method, "PROFESSIONAL", { id: "prof-own" })).toBe(true);
        expect(allowed(ProfessionalsController, handler, method, "PROFESSIONAL", { id: "prof-outro" })).toBe(false);
        expect(allowed(ProfessionalsController, handler, method, "RECEPTIONIST", { id: "prof-own" })).toBe(false);
      });
    }
  });

  it("cadastrar/editar/excluir profissional e vincular serviço seguem fechados para os dois perfis padrão", () => {
    for (const handler of ["create", "createSelf", "update", "remove"]) {
      const method = handler === "update" ? "PATCH" : handler === "remove" ? "DELETE" : "POST";
      expect(allowed(ProfessionalsController, handler, method, "RECEPTIONIST")).toBe(false);
      expect(allowed(ProfessionalsController, handler, method, "PROFESSIONAL")).toBe(false);
    }
  });

  it("marketplace (localização e busca) segue fechado para os dois", () => {
    expect(allowed(TenantsController, "updateMarketplace", "PATCH", "RECEPTIONIST")).toBe(false);
    expect(allowed(TenantsController, "updateMarketplace", "PATCH", "PROFESSIONAL")).toBe(false);
  });

  it("toda mudança declarada em CHANGES tem motivo (e aponta para uma rota que existe)", () => {
    const all = new Set(LEGACY.flatMap(({ controller }) => routes(controller).map((r) => `${controller.name}.${r.handler}`)));
    for (const [key, change] of Object.entries(CHANGES)) {
      expect(all.has(key)).toBe(true);
      expect(change.why.length).toBeGreaterThan(30);
    }
  });
});
