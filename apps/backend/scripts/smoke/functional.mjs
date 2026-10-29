// Fluxos de negócio ponta a ponta, com os MESMOS formatos que o frontend envia (telefone/CPF mascarados,
// dinheiro em centavos vindo de moneyToCents, Instagram normalizado). Ver lib.mjs para como rodar.
import { randomUUID } from "node:crypto";
import { LEGAL_VERSION, call, createChecker } from "./lib.mjs";

const { check, finish } = createChecker();
const stamp = Date.now();
const email = `dono${stamp}@e2e.com`;
const password = "senha-forte-123";

console.log("== cadastro e login");
let r = await call("POST", "/public/signup", { businessName: "  Salão E2E  ", ownerName: "Dona E2E", email: email.toUpperCase(), password, phone: "11987654321", acceptedTermsVersion: LEGAL_VERSION });
check("signup 201", r.status === 201, r);
const slug = r.json?.slug;
r = await call("POST", "/auth/login", { email, password });
check("login (e-mail normalizado)", r.status === 200, r);
const T = r.json?.accessToken;
check("token emitido", !!T);

console.log("== serviços / profissionais / produtos");
r = await call("POST", "/services", { name: "  Corte  ", description: "  Corte simples ", durationMinutes: 30, priceCents: 4590 }, T);
check("cria serviço (nome aparado)", r.status === 201 && r.json?.name === "Corte", r);
const serviceId = r.json?.id;
r = await call("POST", "/services", { name: "X", durationMinutes: 30, priceCents: 100 }, T);
check("serviço com nome curto → 400 em pt-BR", r.status === 400 && /Nome deve ter no mínimo 2/.test(JSON.stringify(r.json)), r);
r = await call("POST", "/services", { name: "Ok", durationMinutes: 2000, priceCents: 100 }, T);
check("duração > 1440 → 400", r.status === 400, r);
r = await call("POST", "/professionals", { name: "Pro Um", email: `pro${stamp}@e2e.com`, initialPassword: "a".repeat(73) }, T);
check("senha inicial > 72 → 400", r.status === 400, r);
r = await call("POST", "/professionals", { name: "Pro Um", email: `PRO${stamp}@E2E.com`, initialPassword: "senha-pro-123" }, T);
check("cria profissional (planos vêm da migration; e-mail minúsculo)", r.status === 201, r);
const professionalId = r.json?.id;
r = await call("POST", "/products", { name: "Shampoo", priceCents: 3500, costCents: 1500, initialStock: 10 }, T);
check("cria produto", r.status === 201, r);

console.log("== controle de acesso por papel (RBAC)");
// Contra o backend REAL (guard incluído, não um mock de teste unitário) — prova que o
// RolesGuard + as duas checagens de dono adicionadas nesta rodada bloqueiam de verdade.
r = await call("POST", "/auth/login", { email: `pro${stamp}@e2e.com`, password: "senha-pro-123" });
check("profissional loga normalmente", r.status === 200, r);
const PT = r.json?.accessToken;
r = await call("GET", "/professionals", undefined, PT);
check(
  "profissional NÃO vê e-mail de ninguém na listagem (nem o próprio)",
  r.status === 200 && r.json.every((p) => p.user.email === undefined),
  r,
);
r = await call("GET", `/professionals/${randomUUID()}/services`, undefined, PT);
check("profissional pedindo serviços de OUTRO profissional → 403", r.status === 403, r);
r = await call("GET", `/professionals/${professionalId}/services`, undefined, PT);
check("profissional pedindo os PRÓPRIOS serviços → não é 403", r.status !== 403, r);
r = await call("POST", "/services", { name: "Hack", durationMinutes: 30, priceCents: 100 }, PT);
check("profissional criando serviço → 403 (OWNER-only)", r.status === 403, r);
r = await call("POST", "/professionals", { name: "X", email: `x${stamp}@e2e.com`, initialPassword: "senha-x-12345" }, PT);
check("profissional criando outro profissional → 403 (OWNER-only)", r.status === 403, r);
r = await call("PATCH", "/tenants/me", { description: "hackeado" }, PT);
check("profissional editando perfil do tenant → 403 (OWNER-only)", r.status === 403, r);
r = await call("POST", "/commissions/rules", { professionalId, base: "ALL", kind: "FIXED", value: 100 }, PT);
check("profissional criando regra de comissão → 403 (OWNER-only)", r.status === 403, r);

console.log("== clientes (máscaras chegam formatadas)");
r = await call("POST", "/clients", { name: "Ana Cliente", phone: "(11) 91234-5678", cpf: "529.982.247-25", email: "ana@e2e.com", birthDate: "1990-05-20", tags: ["vip", " retorno ", ""] }, T);
check("cria cliente com telefone/CPF formatados", r.status === 201, r);
check("telefone só com dígitos", r.json?.phone === "11912345678", r.json?.phone);
check("CPF só com dígitos", r.json?.cpf === "52998224725", r.json?.cpf);
check("tags aparadas e sem vazias", JSON.stringify(r.json?.tags) === JSON.stringify(["vip", "retorno"]), r.json?.tags);
const clientId = r.json?.id;
r = await call("POST", "/clients", { name: "Dup", phone: "+55 11 91234-5678" }, T);
check("mesmo telefone com +55 → 409 (normalização converge)", r.status === 409, r);
for (const [label, body] of [
  ["telefone impossível", { name: "Zé", phone: "(11) 11111-1111" }],
  ["CPF inválido", { name: "Zé", phone: "(21) 98765-4321", cpf: "111.111.111-11" }],
  ["nascimento futuro", { name: "Zé", phone: "(21) 98765-4321", birthDate: "2999-01-01" }],
  ["nome só com espaços", { name: "     ", phone: "(21) 98765-4321" }],
  ["tags demais", { name: "Zé", phone: "(21) 98765-4321", tags: Array.from({ length: 21 }, (_, i) => "t" + i) }],
]) {
  r = await call("POST", "/clients", body, T);
  check(`cliente ${label} → 400`, r.status === 400, r);
}
r = await call("PATCH", `/clients/${clientId}`, { cpf: null, email: null, birthDate: null, notes: null }, T);
check("PATCH limpa campos com null", r.status === 200 && r.json?.cpf === null && r.json?.email === null, r);
r = await call("GET", `/clients?search=${encodeURIComponent("(11) 9123")}`, undefined, T);
check("busca por telefone formatado", r.status === 200 && r.json.length === 1, r);

console.log("== caixa e financeiro");
r = await call("POST", "/cash-register/open", { openingFloatCents: 0 }, T);
check("abre caixa", r.status === 201, r);
r = await call("POST", "/cash-register/movements", { kind: "DEPOSIT", amountCents: 12345, note: "  troco " }, T);
check("suprimento R$ 123,45", r.status === 201, r);
r = await call("POST", "/cash-register/movements", { kind: "DEPOSIT", amountCents: 0 }, T);
check("movimento de R$ 0 → 400", r.status === 400, r);
r = await call("POST", "/cash-register/movements", { kind: "WITHDRAWAL", amountCents: 9_999_999 }, T);
check("sangria maior que o saldo em caixa → 400", r.status === 400, r);
r = await call("POST", "/cash-register/close", { closingCountedCents: 12345 }, T);
check("fecha caixa sem diferença", r.status === 201 && r.json?.differenceCents === 0, r);
r = await call("POST", "/cash-register/open", { openingFloatCents: 0 }, T);
check("reabre caixa pra testar fechamento com diferença", r.status === 201, r);
r = await call("POST", "/cash-register/close", { closingCountedCents: 500 }, T);
check("fecha com diferença (contado > esperado)", r.status === 201 && r.json?.differenceCents === 500, r);
r = await call("POST", "/finance/entries", { direction: "EXPENSE", description: "  Luz  ", amountCents: 25000, dueDate: "2030-01-10" }, T);
check("lança despesa", r.status === 201 && r.json?.description === "Luz", r);
r = await call("GET", "/finance/entries?direction=EXPENSE&status=PENDING", undefined, T);
check("lista despesas pendentes (query como DTO)", r.status === 200 && r.json.length === 1, r);
r = await call("GET", "/finance/entries?direction=XX", undefined, T);
check("filtro inválido → 400", r.status === 400 && /inválido/.test(JSON.stringify(r.json)), r);
check("fluxo de caixa", (await call("GET", "/finance/cash-flow?from=2030-01-01&to=2030-12-31&basis=due", undefined, T)).status === 200);
check("DRE", (await call("GET", "/finance/dre?from=2030-01-01&to=2030-12-31", undefined, T)).status === 200);

console.log("== comissão (alvo validado no tenant)");
r = await call("POST", "/commissions/rules", { professionalId, base: "SERVICE", targetId: serviceId, kind: "PERCENT", value: 30 }, T);
check("regra com serviço do próprio tenant", r.status === 201, r);
r = await call("POST", "/commissions/rules", { professionalId, base: "SERVICE", targetId: "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f", kind: "PERCENT", value: 30 }, T);
check("serviço inexistente/de outro tenant → 404", r.status === 404, r);
r = await call("POST", "/commissions/rules", { professionalId, base: "ALL", kind: "FIXED", value: 1250 }, T);
check("regra fixa R$ 12,50", r.status === 201, r);
r = await call("POST", "/commissions/rules", { professionalId, base: "ALL", kind: "PERCENT", value: 101 }, T);
check("percentual > 100 → 400", r.status === 400, r);

console.log("== comanda");
r = await call("POST", "/tickets", { clientId }, T);
check("abre comanda", r.status === 201, r);
const ticketId = r.json?.id;
r = await call("POST", `/tickets/${ticketId}/items`, { kind: "SERVICE", serviceId, professionalId }, T);
check("item de serviço (preço do catálogo)", r.status === 201 && r.json?.subtotalCents === 4590, r.json?.subtotalCents ?? r);
r = await call("POST", `/tickets/${ticketId}/items`, { kind: "SERVICE", serviceId, unitPriceCents: 1 }, T);
check("preço do cliente em item de catálogo → 400", r.status === 400, r);
check("desconto R$ 5,00", (await call("PATCH", `/tickets/${ticketId}/discount`, { discountCents: 500 }, T)).status === 200);
check("desconto > subtotal → 400", (await call("PATCH", `/tickets/${ticketId}/discount`, { discountCents: 99999999 }, T)).status === 400);
r = await call("POST", `/tickets/${ticketId}/payments`, { method: "PIX", amountCents: 4090 }, T);
check("pagamento", r.status === 201, r);
r = await call("POST", `/tickets/${ticketId}/close`, {}, T);
check("fecha comanda", r.status === 201 && r.json?.status === "CLOSED", r);

console.log("== faturamento por profissional e repasse (sem fechar período)");
// Comanda acima: serviço R$ 45,90 (30% = 1.377 de comissão: o alvo exato vence a regra fixa), desconto R$ 5,00.
const periodFrom = new Date(Date.now() - 3600e3).toISOString();
const periodTo = new Date(Date.now() + 3600e3).toISOString();
const earningsUrl = `/commissions/earnings?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`;
r = await call("GET", earningsUrl, undefined, T);
let row = r.json?.professionals?.find((p) => p.professionalId === professionalId);
check(
  "earnings: bruto 4590, desconto 500, líquido 4090, repasse 1377, sobra 2713, saldo 1377",
  r.status === 200 && row?.grossCents === 4590 && row?.discountCents === 500 && row?.netCents === 4090 &&
    row?.commissionCents === 1377 && row?.houseCents === 2713 && row?.payableBalanceCents === 1377 && row?.ticketCount === 1,
  r.json,
);
check("earnings: totais fecham com a linha", r.json?.totals?.grossCents === 4590 && r.json?.totals?.netCents === 4090, r.json?.totals);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 1378 }, T);
check("repasse acima do saldo → 400", r.status === 400 && /saldo/.test(JSON.stringify(r.json)), r);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 0 }, T);
check("repasse zero → 400", r.status === 400, r);
r = await call("POST", "/finance/commissions/payouts", { professionalId: randomUUID(), amountCents: 100 }, T);
check("repasse p/ profissional inexistente → 404", r.status === 404, r);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 377, note: "  Pix  " }, T);
check("repasse parcial de R$ 3,77 → 201 e saldo restante 1000", r.status === 201 && r.json?.balanceAfterCents === 1000, r);
r = await call("GET", earningsUrl, undefined, T);
row = r.json?.professionals?.find((p) => p.professionalId === professionalId);
check("saldo cai para 1000; repasse do período segue 1377 (pagar não muda o que foi gerado)", row?.payableBalanceCents === 1000 && row?.commissionCents === 1377, row);
r = await call("GET", "/finance/entries?direction=EXPENSE&status=PAID", undefined, T);
check(
  "o repasse virou despesa PAGA de comissão no Financeiro",
  r.status === 200 && r.json.some((e) => e.source === "COMMISSION" && e.amountCents === 377 && /Repasse Pro Um/.test(e.description)),
  r.json,
);
r = await call("GET", `/finance/commissions/payouts?professionalId=${professionalId}`, undefined, T);
check("histórico de repasses paginado", r.status === 200 && r.json?.total === 1 && r.json?.items?.[0]?.amountCents === 377, r.json);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100 }, PT);
check("profissional registrando repasse → 403 (OWNER-only)", r.status === 403, r);
r = await call("GET", `${earningsUrl}&professionalId=${randomUUID()}`, undefined, PT);
check(
  "profissional vê só o próprio faturamento (ignora o professionalId da query)",
  r.status === 200 && r.json?.professionals?.length === 1 && r.json.professionals[0].professionalId === professionalId,
  r.json,
);
r = await call("POST", "/finance/commissions/close", { from: periodFrom, to: periodTo, dueDate: "2030-01-10" }, T);
check("o antigo 'fechar comissões do período' não existe mais → 404", r.status === 404, r);
r = await call("GET", "/commissions/earnings?from=1970-01-01T00:00:00Z&to=2100-01-01T00:00:00Z", undefined, T);
check("intervalo acima de 366 dias → 400", r.status === 400, r);
r = await call("GET", "/commissions/earnings", undefined, T);
check("earnings sem from/to → 400", r.status === 400, r);

console.log("== regras de comissão: editar, excluir, duplicata e isolamento");
r = await call("GET", "/commissions/rules", undefined, T);
const allRule = r.json?.find((x) => x.base === "ALL");
const svcRule = r.json?.find((x) => x.base === "SERVICE");
check("lista as regras do tenant", r.status === 200 && !!allRule && !!svcRule, r.json);
r = await call("POST", "/commissions/rules", { professionalId, base: "ALL", kind: "PERCENT", value: 10 }, T);
check("regra ALL ativa duplicada → 409", r.status === 409, r);
r = await call("PATCH", `/commissions/rules/${allRule.id}`, { professionalId, base: "ALL", kind: "FIXED", value: 1500 }, T);
check("edita a regra (valor fixo R$ 15,00) mantendo-a ativa", r.status === 200 && r.json?.value === 1500 && r.json?.isActive === true, r);
r = await call("PATCH", `/commissions/rules/${allRule.id}`, { professionalId, base: "ALL", kind: "FIXED", value: 1500, isActive: false }, T);
check("desativa a regra", r.status === 200 && r.json?.isActive === false, r);
r = await call("PATCH", `/commissions/rules/${allRule.id}`, { professionalId, base: "ALL", kind: "FIXED", value: 1600 }, T);
check("editar SEM isActive mantém a regra desativada (não reativa em silêncio)", r.status === 200 && r.json?.isActive === false, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "SERVICE", targetId: serviceId, kind: "PERCENT", value: 101 }, T);
check("edição com percentual > 100 → 400", r.status === 400, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "SERVICE", kind: "PERCENT", value: 25 }, T);
check("regra 'qualquer serviço' (sem alvo) pode ser salva", r.status === 200 && r.json?.base === "SERVICE" && r.json?.targetId === null && r.json?.value === 25, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "SERVICE", targetId: serviceId, kind: "PERCENT", value: 30 }, T);
check("e volta a ter alvo específico", r.status === 200 && r.json?.targetId === serviceId, r);
r = await call("PATCH", `/commissions/rules/nao-e-uuid`, { professionalId, base: "ALL", kind: "PERCENT", value: 10 }, T);
check("id que não é UUID → 400", r.status === 400, r);
r = await call("PATCH", `/commissions/rules/${randomUUID()}`, { professionalId, base: "ALL", kind: "PERCENT", value: 10 }, T);
check("regra inexistente → 404", r.status === 404, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "SERVICE", targetId: serviceId, kind: "PERCENT", value: 30, campoExtra: 1 }, T);
check("campo fora do DTO → 400 (forbidNonWhitelisted)", r.status === 400, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId: randomUUID(), base: "SERVICE", targetId: serviceId, kind: "PERCENT", value: 30 }, T);
check("mover a regra p/ profissional inexistente/de outro tenant → 404", r.status === 404, r);
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "ALL", kind: "PERCENT", value: 10 }, PT);
check("profissional editando regra → 403", r.status === 403, r);
r = await call("DELETE", `/commissions/rules/${svcRule.id}`, undefined, PT);
check("profissional excluindo regra → 403", r.status === 403, r);

// Outro negócio (tenant B) tenta mexer na regra do tenant A: tem que parecer que ela não existe.
const emailB = `donob${stamp}@e2e.com`;
r = await call("POST", "/public/signup", { businessName: "Salão B", ownerName: "Dono B", email: emailB, password, phone: "11987654321", acceptedTermsVersion: LEGAL_VERSION });
check("cria o tenant B", r.status === 201, r);
r = await call("POST", "/auth/login", { email: emailB, password });
const TB = r.json?.accessToken;
r = await call("PATCH", `/commissions/rules/${svcRule.id}`, { professionalId, base: "ALL", kind: "PERCENT", value: 99 }, TB);
check("tenant B editando regra do A → 404 (mesmo de inexistente)", r.status === 404, r);
r = await call("DELETE", `/commissions/rules/${svcRule.id}`, undefined, TB);
check("tenant B excluindo regra do A → 404", r.status === 404, r);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100 }, TB);
check("tenant B pagando repasse de profissional do A → 404", r.status === 404, r);
r = await call("GET", "/commissions/rules", undefined, TB);
check("tenant B não vê regras do A", r.status === 200 && r.json.length === 0, r.json);

r = await call("DELETE", `/commissions/rules/${svcRule.id}`, undefined, T);
check("dono exclui a regra", r.status === 200 && r.json?.deleted === true, r);
r = await call("DELETE", `/commissions/rules/${svcRule.id}`, undefined, T);
check("excluir de novo → 404", r.status === 404, r);

console.log("== repasse: data automática, faixa de data e idempotência");
const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // dia civil em São Paulo (UTC-3)
const dayOf = (offsetDays) => new Date(Date.now() - 3 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100 }, T);
check("sem data, assume HOJE (São Paulo)", r.status === 201 && r.json?.paidOn === today, r.json);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100, paidOn: dayOf(-1) }, T);
check("aceita corrigir para ontem", r.status === 201 && r.json?.paidOn === dayOf(-1), r.json);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100, paidOn: dayOf(1) }, T);
check("data futura → 400", r.status === 400 && /futura/.test(JSON.stringify(r.json)), r);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100, paidOn: dayOf(-400) }, T);
check("data com mais de 366 dias → 400", r.status === 400, r);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 100, paidOn: "06/10/2026" }, T);
check("data em formato inválido → 400", r.status === 400, r);
const reqKey = randomUUID();
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 200, requestKey: reqKey }, T);
check("repasse com requestKey → 201", r.status === 201 && r.json?.replayed === false, r.json);
const firstId = r.json?.id;
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 200, requestKey: reqKey }, T);
check("MESMA requestKey reenviada devolve o mesmo repasse (replayed), sem pagar de novo", r.status === 201 && r.json?.id === firstId && r.json?.replayed === true, r.json);
r = await call("POST", "/finance/commissions/payouts", { professionalId, amountCents: 300, requestKey: reqKey }, T);
check("mesma requestKey com OUTRO valor → 409", r.status === 409, r);
r = await call("GET", `/finance/commissions/payouts?professionalId=${professionalId}`, undefined, T);
check("só UM repasse de R$ 2,00 foi gravado (idempotência)", r.json?.items?.filter((p) => p.amountCents === 200).length === 1, r.json?.items);

console.log("== comanda: vincular cliente e registro de datas");
r = await call("POST", "/tickets", {}, T);
check("abre comanda avulsa (sem cliente)", r.status === 201 && r.json?.client === null, r);
const linkTicketId = r.json?.id;
check("a resposta traz a data de abertura e canceledAt nulo", !!r.json?.openedAt && r.json?.canceledAt === null, r.json);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId }, T);
check("vincula o cliente à comanda aberta", r.status === 200 && r.json?.client?.id === clientId, r);
r = await call("POST", `/tickets/${linkTicketId}/items`, { kind: "SERVICE", serviceId, professionalId }, T);
check("item guarda a data em que entrou (createdAt)", r.status === 201 && !!r.json?.items?.[0]?.createdAt, r.json?.items);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, {}, T);
check("clientId ausente → 400 (não vira 'desvincular' em silêncio)", r.status === 400, r);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId: "1 OR 1=1" }, T);
check("clientId que não é UUID → 400", r.status === 400, r);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId: randomUUID() }, T);
check("cliente inexistente → 404", r.status === 404, r);
r = await call("PATCH", "/tickets/nao-e-uuid/client", { clientId }, T);
check("id da comanda que não é UUID → 400", r.status === 400, r);

// Cliente do tenant B não pode ser vinculado a comanda do tenant A, e B não mexe na comanda do A.
r = await call("POST", "/clients", { name: "Cliente do B", phone: "(31) 97777-" + String(stamp).slice(-4) }, TB);
check("cria cliente no tenant B", r.status === 201, r);
const clientOfB = r.json?.id;
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId: clientOfB }, T);
check("vincular cliente de OUTRO tenant → 404 (mesmo de inexistente)", r.status === 404, r);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId }, TB);
check("tenant B mexendo na comanda do A → 404", r.status === 404, r);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId }, PT);
check("profissional vinculando cliente → 403", r.status === 403, r);

r = await call("GET", `/clients/${clientId}`, undefined, T);
check(
  "ficha do cliente lista as comandas dele (a aberta e a fechada), com total e datas",
  r.status === 200 && r.json?.tickets?.some((t) => t.id === linkTicketId && t.closedAt === null) &&
    r.json.tickets.some((t) => t.id === ticketId && t.status === "CLOSED" && t.totalCents === 4090 && !!t.closedAt),
  r.json?.tickets,
);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId: null }, T);
check("desvincula o cliente (null)", r.status === 200 && r.json?.client === null, r);
r = await call("POST", `/tickets/${linkTicketId}/cancel`, {}, T);
check("cancela a comanda de teste e registra canceledAt", r.status === 201 && r.json?.status === "CANCELED" && !!r.json?.canceledAt, r.json);
r = await call("PATCH", `/tickets/${linkTicketId}/client`, { clientId }, T);
check("comanda cancelada não aceita trocar o cliente → 409", r.status === 409, r);
r = await call("PATCH", `/tickets/${ticketId}/client`, { clientId: null }, T);
check("comanda FECHADA não aceita trocar o cliente → 409", r.status === 409, r);

console.log("== lista de espera");
const waitPhone = "(31) 98888-" + String(stamp).slice(-4);
r = await call("POST", "/public/consumer/register", { name: "Carla Espera", phone: waitPhone, email: `carla${stamp}@e2e.com`, password: "senha-carla-123", consent: true });
check("cadastro do consumidor pra lista de espera", r.status === 201, r);
const consumerToken = r.json?.accessToken;
check("token do consumidor emitido no cadastro", !!consumerToken, r);
r = await call("POST", `/public/tenants/${slug}/waitlist`, { serviceId }, consumerToken);
check("entra na lista de espera", r.status === 201, r);
const waitlistId = r.json?.id;
r = await call("GET", "/waitlist?status=PENDING", undefined, T);
check("dono vê a entrada pendente", r.status === 200 && r.json.some((w) => w.id === waitlistId), r);
r = await call("PATCH", `/waitlist/${waitlistId}/status`, { status: "CONTACTED" }, T);
check("marca como contatado (continua na lista)", r.status === 200 && r.json?.status === "CONTACTED", r);
r = await call("PATCH", `/waitlist/${waitlistId}/status`, { status: "RESOLVED" }, T);
check("resolve a entrada", r.status === 200 && r.json?.status === "RESOLVED", r);
r = await call("GET", "/waitlist?status=PENDING", undefined, T);
check("resolvida não aparece mais como pendente", r.status === 200 && !r.json.some((w) => w.id === waitlistId), r);

console.log("== avaliação e moderação");
r = await call("POST", `/professionals/${professionalId}/services`, { serviceId }, T);
check("vincula profissional ao serviço (exigido pra agendar)", [200, 201].includes(r.status), r);
const bookAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
r = await call("POST", `/public/tenants/${slug}/bookings`, { professionalId, serviceId, startAt: bookAt }, consumerToken);
check("consumidor agenda pelo link público", r.status === 201, r);
const appointmentId = r.json?.id;
r = await call("PATCH", `/appointments/${appointmentId}/status`, { status: "COMPLETED" }, T);
check("dono marca o atendimento como concluído", r.status === 200 && r.json?.status === "COMPLETED", r);
r = await call("POST", "/public/consumer/reviews", { appointmentId, rating: 5, comment: "  Adorei o atendimento!  " }, consumerToken);
check("consumidor avalia o atendimento concluído", r.status === 201, r);
const reviewId = r.json?.id;
r = await call("POST", "/public/consumer/reviews", { appointmentId, rating: 4 }, consumerToken);
check("avaliar o mesmo atendimento de novo → 400", r.status === 400, r);
r = await call("GET", "/reviews", undefined, T);
check("dono vê a avaliação na moderação", r.status === 200 && r.json.some((rv) => rv.id === reviewId), r);
r = await call("PATCH", `/reviews/${reviewId}/report`, { reason: "Teste de denúncia" }, T);
check("denuncia a avaliação", r.status === 200 && r.json?.status === "PENDING_REPORT", r);
r = await call("PATCH", `/reviews/${reviewId}/hide`, {}, T);
check("oculta a avaliação", r.status === 200 && r.json?.status === "HIDDEN", r);

console.log("== perfil público");
r = await call("PATCH", "/tenants/me", { whatsappNumber: "5511912345678", instagramUrl: "https://instagram.com/salaoe2e", description: "Bem-vindo", address: "Rua A, 1" }, T);
check("WhatsApp (DDI) e Instagram normalizado", r.status === 200 && r.json?.whatsappNumber === "5511912345678", r);
for (const [label, body] of [
  ["WhatsApp sem DDI", { whatsappNumber: "11912345678" }],
  ["Instagram de outro domínio", { instagramUrl: "https://evil.com/x" }],
  ["Instagram http", { instagramUrl: "http://instagram.com/x" }],
  ["cor inválida", { accentColor: "vermelho" }],
]) {
  check(`perfil ${label} → 400`, (await call("PATCH", "/tenants/me", body, T)).status === 400);
}
r = await call("PATCH", "/tenants/me", { description: "", whatsappNumber: "", instagramUrl: "" }, T);
check("campos em branco LIMPAM (null)", r.status === 200 && r.json?.description === null && r.json?.whatsappNumber === null && r.json?.instagramUrl === null, r.json);
check("página pública carrega", (await call("GET", `/public/tenants/${slug}`)).status === 200);
check("marketplace com coordenadas", (await call("PATCH", "/tenants/me/marketplace", { city: "  São Paulo ", latitude: -23.5505, longitude: -46.6333, priceRange: 2 }, T)).status === 200);
check("latitude fora da faixa → 400", (await call("PATCH", "/tenants/me/marketplace", { latitude: 95 }, T)).status === 400);

console.log("== busca pública do marketplace");
r = await call("PATCH", "/tenants/me/marketplace", { listedInMarketplace: true, categorySlugs: ["barbearia"] }, T);
check("liga a listagem com cidade e categoria já preenchidas", r.status === 200 && r.json?.listedInMarketplace === true, r);
r = await call("GET", `/public/marketplace/search?city=${encodeURIComponent("São Paulo")}`);
check("busca por cidade encontra o tenant listado", r.status === 200 && r.json.some((t) => t.slug === slug), r);
r = await call("GET", "/public/marketplace/search?category=barbearia");
check("busca por categoria encontra o tenant listado", r.status === 200 && r.json.some((t) => t.slug === slug), r);
r = await call("GET", "/public/marketplace/search?lat=999&lng=0");
check("latitude fora da faixa na busca pública → 400", r.status === 400, r);
r = await call("GET", `/public/marketplace/establishments/${slug}`);
// A avaliação foi ocultada na seção anterior — não deve contar na nota pública.
check("perfil público carrega e avaliação oculta não conta na nota", r.status === 200 && r.json?.slug === slug && r.json?.rating?.count === 0, r);
r = await call("GET", "/public/marketplace/establishments/slug-que-nao-existe");
check("estabelecimento inexistente → 404", r.status === 404, r);
check("PATCH marketplace sem token → 401", (await call("PATCH", "/tenants/me/marketplace", { listedInMarketplace: false })).status === 401);

console.log("== fichas (intake)");
r = await call("POST", "/intake/forms", { name: "Anamnese", fields: [{ key: "1o_retorno", label: "Primeiro retorno", type: "text" }, { key: "alergias", label: "Alergias", type: "select", options: ["Sim", "Não"], required: true }] }, T);
check("ficha com chave começando por número", r.status === 201, r);
const formId = r.json?.id;
check("chave __proto__ → 400", (await call("POST", "/intake/forms", { name: "Ruim", fields: [{ key: "__proto__", label: "x", type: "text" }] }, T)).status === 400);
r = await call("POST", "/intake/responses", { formId, clientId, answers: { alergias: "Sim", "1o_retorno": "30 dias" } }, T);
check("resposta de ficha aceita", r.status === 201 && r.json?.answers?.alergias === "Sim", r);
check("chave constructor nas respostas → 400 (antes: 500)", (await call("POST", "/intake/responses", { formId, clientId, answers: { alergias: "Sim", constructor: "x" } }, T)).status === 400);
check("opção fora da lista → 400", (await call("POST", "/intake/responses", { formId, clientId, answers: { alergias: "Talvez" } }, T)).status === 400);

console.log("== fronteira / mensagens");
r = await call("POST", "/appointments", { professionalId: "1 OR 1=1", startAt: "2030-01-01T10:00:00Z", items: [{ serviceId: "x" }] }, T);
check("id não-UUID → 400 em pt-BR", r.status === 400 && !/must be/.test(JSON.stringify(r.json)), r);
r = await call("POST", "/services", { name: "a\u0000b", durationMinutes: 30, priceCents: 100 }, T);
check("byte NUL → 400", r.status === 400 && /inválidos/.test(JSON.stringify(r.json)), r);
r = await call("GET", "/clients");
check("sem token → 401 em pt-BR", r.status === 401 && /Entre novamente/.test(JSON.stringify(r.json)), r);
r = await call("GET", "/rota-que-nao-existe", undefined, T);
check("404 não ecoa a rota", r.status === 404 && !/rota-que-nao-existe/.test(JSON.stringify(r.json)), r);

console.log("== cliente final (consumer)");
const phone = "(21) 98765-" + String(stamp).slice(-4);
r = await call("POST", "/public/consumer/register", { name: "  Bia  ", phone, email: `Bia${stamp}@E2E.com`, password: "senha-bia-123", consent: true });
check("cadastro (telefone mascarado, e-mail com caixa)", r.status === 201, r);
check("login por e-mail minúsculo", [200, 201].includes((await call("POST", "/public/consumer/login", { identifier: `bia${stamp}@e2e.com`, password: "senha-bia-123" })).status));
check("login por telefone formatado", [200, 201].includes((await call("POST", "/public/consumer/login", { identifier: phone, password: "senha-bia-123" })).status));
check("cadastro com telefone lixo → 400", (await call("POST", "/public/consumer/register", { name: "Zé", phone: "00 00000-0000", email: "ze@e2e.com", password: "senha-ze-123", consent: true })).status === 400);

finish();
