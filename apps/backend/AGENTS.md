# Backend — Marquo API (NestJS)

Este arquivo é só detalhe interno do backend. O `CLAUDE.md` da raiz do monorepo é a
fonte de verdade pra arquitetura cross-cutting, segurança e convenções — ler ele
primeiro. Aqui só o que não cabe lá por ser específico de como o `apps/backend` é
organizado por dentro.

## Rodando e testando local

```bash
pnpm --filter backend dev          # nest start --watch, porta 3001
pnpm --filter backend test         # jest, todos os specs
pnpm --filter backend test -- <padrão>   # ex.: -- tickets roda só specs que casam com "tickets"
pnpm --filter backend build        # nest build
```

`.env` obrigatório nesta pasta — lista completa de variáveis e validação fail-closed
em `src/config/env.validation.ts` (variável ausente/inválida derruba o boot, não
silencia).

## Índice de módulos (`src/*`)

Um módulo Nest por domínio de negócio. `common/` (guards, decorators, filters
compartilhados), `config/` (env.validation) e `prisma/` (`PrismaService`) são infra,
não domínio.

| Módulo | Responsabilidade |
|---|---|
| `appointments` | Agregado `Appointment` (agenda pública + staff): criação, reagendamento, cancelamento, transições de status, calendário. |
| `auth` | Login/refresh/definir-senha de staff (`User`), lockout progressivo, JWT. |
| `availability` | Cálculo de horários livres de um profissional pra um serviço (`public/tenants/:slug/professionals/:id/availability`). |
| `billing` | Planos (`GET /plans`), estado de cobrança do negócio (`computeBillingStatus`, `GET /billing/status`) e limites por plano (`PlanLimitService`/`TenantBillingGuard`). Sem provedor de pagamento por enquanto (Stripe removido; Mercado Pago a integrar). |
| `cash-register` | Abertura/fechamento de caixa, conferência de valor físico contra `Payment`/`CashMovement`. |
| `clients` | CRUD de `Client` (ficha 360, intake) pelo staff. |
| `commissions` | Regras de comissão por profissional/serviço, cálculo no fechamento de comanda e `earnings` (bruto/líquido/repasse/saldo por profissional, calculado na hora). |
| `consumer-auth` | Identidade global do cliente final (`Consumer`): login telefone+senha, migração de contas antigas, perfil, troca de senha, `ensureLink` com o `Client` de cada tenant. |
| `finance` | Lançamentos manuais + automáticos (receita de comanda), registro de repasse de comissão (`CommissionPayout` + despesa PAGA), DRE, fluxo de caixa. |
| `intake` | Formulários de ficha de anamnese/cadastro configuráveis pelo tenant e respostas de cliente. |
| `marketplace` | Busca/descoberta pública de estabelecimentos (`public/marketplace`), config de visibilidade do tenant. |
| `products` | Catálogo de produto + estoque (ajuste manual, baixa automática por venda). |
| `professionals` | CRUD de profissional (vínculo com `User`), horário de trabalho, vínculo com serviços; exclusão definitiva só de quem não tem histórico. |
| `reviews` | Avaliação pública de um `Consumer` sobre um atendimento + moderação pelo dono. |
| `services` | Catálogo de serviço (nome/preço/duração), vínculo profissional↔serviço. |
| `signup` | Cadastro público de tenant + dono (`POST /public/signup`): trial de 14 dias, sem cartão, sem `Subscription`. |
| `tenants` | Perfil público do tenant (nome, logo, galeria, slug), config de marketplace. |
| `tickets` | Comanda/PDV: itens, desconto, pagamento, fechamento — ver CLAUDE.md raiz > Segurança > Confiança no cliente pra a regra que rege `AddTicketItemDto`. |
| `time-blocks` | Bloqueio manual de horário (folga/férias) na agenda de um profissional. |
| `waitlist` | Lista de espera pública quando não há horário livre no dia. |
| `internal` | API de suporte do Admin (`/internal/*`), só com HMAC (`InternalAuthGuard`): lista tenants e gera link de redefinição de senha do dono, com `AdminAuditLog`. |
| `coupons` | Regras e resgate atômico de cupons de campanha no cadastro (`CouponsService`); a gestão fica no painel da plataforma. |
| `platform-admin` | Painel da empresa (`/platform/*`): conta definida no `.env`, métricas, negócios, cortesia, suspensão, cupons e auditoria. |

## Guards globais e ordem de execução

`JwtAuthGuard → RolesGuard → TenantBillingGuard`, registrados globalmente em
`app.module.ts`. `@Public()` pula os três; `@Roles(...)` restringe por papel depois do
`JwtAuthGuard` já ter populado `request.user`. `ConsumerJwtAuthGuard`
(`consumer-auth`, usado em agendamento, lista de espera e histórico do cliente final) é
um pipeline próprio, não passa pelos guards globais de staff — cada domínio de
identidade (ver CLAUDE.md raiz > Autenticação) tem seu próprio guard e seu próprio
`AuthenticatedX` type, não misturar.

## Padrões de módulo

- Estrutura por domínio: `<dominio>.module.ts` / `.service.ts` / `.controller.ts` /
  `dto/*.dto.ts` — ver "Convenções > Backend" no CLAUDE.md raiz pro resto (DTOs,
  dinheiro em centavos, `PrismaExceptionFilter`).
- Serviços que participam de fluxo transacional (agendamento, fechamento de comanda)
  aceitam `Prisma.TransactionClient | PrismaService` como primeiro parâmetro — permite
  compor várias chamadas dentro de um `$transaction` sem duplicar lógica (ver
  `tickets.service.ts` `close()` chamando `products.registerSale`,
  `commissions.computeForTicket`, `finance.recordTicketIncome` todos com a mesma `tx`).

## Segurança — reforço operacional

A regra em si (por que, com exemplos) vive no CLAUDE.md raiz, seção "Confiança no
cliente" — aqui só o lembrete de onde olhar ao adicionar um DTO/service novo:

- Ponto de partida pra revisar um DTO que aceita valor de negócio: `AddTicketItemDto`
  (campo que só existe condicionalmente, rejeitado explicitamente no service — não no
  decorator) e `SetTicketDiscountDto` (campo sempre aceito, mas limitado no service
  contra um valor derivado do servidor).
- Testes de `*.service.ts` instanciam o service direto (`new TicketsService(...)`),
  sem passar pelo `ValidationPipe` — uma regra que só existe como decorator no DTO não
  é pega por esses testes. Se a regra é de segurança, ela precisa estar no service (ou
  ter teste equivalente no nível do service), não só no DTO.

## Testes

- `jest` + `ts-jest`, `*.spec.ts` ao lado do arquivo testado.
- Padrão de mock de Prisma: objeto plano com `jest.fn()` por método efetivamente
  usado pelo service testado (não um mock automático do client inteiro) — ver
  `tickets.service.spec.ts`, `availability.service.spec.ts` como referência de forma.
- Toda regra de segurança (bound-check, IDOR, transição de status) ganha teste de
  regressão com comentário explicando o bug original que motivou o teste — ver
  `ticket-dtos.spec.ts` e os testes de `unitPriceCents` em `tickets.service.spec.ts`
  como padrão a seguir.
