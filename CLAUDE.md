# Marquo

> Antes chamado TotalAgenda. Identificadores legados mantidos de propósito (renomear quebra dados/integrações):
> banco/usuário/volume do Postgres (`totalagenda_*` no `docker-compose.yml`) e a página `/suporte-totalagenda` do
> Admin. (Os identificadores do Stripe saíram junto com o Stripe.)

SaaS multi-tenant de agendamento e gestão para salões, barbearias e prestadores de
serviço por horário. Cada negócio (tenant) tem página pública própria em `/[slug]` +
painel de gestão em `/dashboard`. Concorrente direto do Trinks — ver
[docs/roadmap.md](docs/roadmap.md) para o plano de paridade de funcionalidade.

## Stack

| Camada    | Tecnologia |
|-----------|------------|
| Monorepo  | pnpm workspaces + Turborepo (`turbo.json`) |
| Backend   | NestJS 10 (`apps/backend`), Express, Passport JWT, class-validator, Luxon |
| Frontend  | Next.js 16 (App Router, Turbopack) + React 19 (`apps/frontend`), Tailwind v4, NextAuth v5 beta, Zod |
| DB        | PostgreSQL 16 + Prisma 5 (`packages/database`) |
| Tipos     | `@marquo/shared-types` (contrato compartilhado front/back) |

> `apps/frontend/AGENTS.md`: esta versão do Next tem breaking changes — consultar
> `node_modules/next/dist/docs/` antes de escrever código de frontend.

## Rodando local

```bash
docker compose up -d                    # Postgres em localhost:5432
pnpm install
pnpm --filter @marquo/database db:migrate
pnpm --filter @marquo/database db:seed
pnpm dev                                # backend :3001, frontend :3000
```

Os três planos (Essencial/Profissional/Premium) existem em qualquer banco: a migration `seed_plans` os cria (valores
antigos, de propósito) e o **`PlanCatalogService` os regrava a cada boot** a partir do catálogo (ver Billing). Sem
eles o dono em trial não consegue adicionar profissional (o Essencial é o teto do trial) e `/dashboard/plano`
fica vazio.
(placeholder `price_<tier>_pending` até haver env).

`.env` obrigatório em `apps/backend/` e `packages/database/` (ver `DATABASE_URL`,
`JWT_SECRET` e, em produção, `CLIENT_IP_SECRET` e `INTERNAL_API_SECRET`, em `apps/backend/src/config/env.validation.ts`).
**Nunca commitar `.env*`** — regra absoluta do repo.

## Arquitetura

### Multi-tenancy
Isolamento por `tenantId` em toda entidade. O `tenantId` do usuário autenticado vem do
JWT (`AuthenticatedUser`), nunca do body/query. Queries de escrita/leitura de recurso de
tenant sempre filtram por `tenantId` na cláusula `WHERE` — não "buscar e comparar dono
depois" (evita janela de IDOR).

### Autenticação — dois domínios distintos
- **Staff** (`User`, roles `OWNER` / `PROFESSIONAL` / `RECEPTIONIST`): login e-mail+senha,
  JWT via `AuthModule`. Guards globais: `JwtAuthGuard` → `RolesGuard` → `TenantBillingGuard`
  (`app.module.ts`). `@Public()` libera rota; `@Roles()` restringe. Login em `/entrar`.
- **Cliente final** (`Consumer`, identidade **global** — um telefone = uma conta em todos os
  salões): entra com **telefone ou e-mail** + senha (bcrypt 12, lockout progressivo e hash dummy
  contra timing, mesma política do staff via `common/utils/lockout.util.ts`), JWT próprio via
  `ConsumerAuthModule` / `ConsumerJwtAuthGuard` (não passa pelos guards globais de staff). No
  frontend, um único cookie httpOnly `ta_consumer` (`path: /`, `lib/consumer-session.ts`).
  - **Uma tela de login pros dois** (`/entrar`, `app/entrar/actions.ts`): identificador com `@`
    tenta staff primeiro (NextAuth) e depois cliente; telefone só tenta cliente (dono entra só
    por e-mail). Toda falha devolve a mesma mensagem. São duas sessões independentes — o
    formulário é compartilhado, as identidades não. Toda página tem o mesmo bloco de conta
    (`components/account/AccountNav.tsx`, alimentado por `lib/nav-session.ts`): "Compromissos" +
    perfil pro cliente, "Minha loja" pro dono, "Entrar" deslogado. Páginas sem barra própria usam
    `SiteHeader`; a home e o salão usam o `AccountNav` dentro das suas barras.
  - O `Client` por tenant continua sendo o registro de CRM do salão (ficha, notas, tags,
    anamnese) ligado ao `Consumer` por `ConsumerTenantLink`. Agendar e entrar na lista de espera
    **exigem login** e derivam o `Client` via `ConsumerAuthService.ensureLink` — nome/telefone
    nunca vêm do body. Posse de um atendimento = relação `client.consumerLink.consumerId` no
    `WHERE` (nunca buscar por id e comparar depois).
  - **Cadastro reivindica conta antiga** (`POST /public/consumer/register`): telefone que já
    tinha `Consumer` sem senha ou só `Client` em algum salão vira a conta, e o backfill liga os
    `Client` de todos os salões (exceção deliberada à regra de filtrar por `tenantId`, sem
    sobrescrever `Client.name`). `Consumer.email` é único (login por e-mail), sem verificação de
    posse ainda — o telefone segue sendo a chave de identidade.
  - **Trade-offs conscientes (UX vs. segurança):** o cadastro revela se telefone/e-mail já têm
    conta (409) — aceito ali, não no login (sempre o mesmo 401). Sem OTP (v1), possuir o telefone
    basta pra reivindicar uma conta antiga; OTP/e-mail nesse passo é o próximo endurecimento
    antes de abrir amplamente.

### Conta da plataforma (painel de gestão da empresa)
Terceira identidade, separada de staff e cliente final. **Não existe no banco**: é definida no `.env` do backend
(`PLATFORM_ADMIN_EMAIL` + `PLATFORM_ADMIN_PASSWORD_HASH`, hash bcrypt gerado por `pnpm --filter backend platform:hash`;
nunca a senha em claro; validação no `env.validation.ts` recusa texto puro e config pela metade). Sem as variáveis o
painel fica desligado e o login responde 401 a tudo.
- **Backend** (`src/platform-admin`, rotas `/platform/*`): `@Public()` só para pular o pipeline de staff; a autenticação
  real é o `PlatformAdminGuard`. O token é assinado com chave **derivada** do `JWT_SECRET` (`platformSigningKey`), então um
  token de staff/cliente nunca verifica ali e vice-versa; confere `type`, e-mail do `.env` e `pv` (prefixo do sha256 do
  hash: trocar a senha derruba as sessões). Sessão de 2 h, sem refresh. Lockout progressivo **em memória** (um processo) +
  throttle de 10/min no login; só o e-mail da conta é rastreado.
- **Frontend**: mesmo formulário de `/entrar` (ordem: staff → plataforma → cliente; mesma mensagem de erro), cookie
  `ta_platform` (httpOnly, `sameSite: strict`, sem renovação em `proxy.ts`) e telas em `/plataforma` (slug reservado,
  `noindex`). `lib/platform-session.ts` é o cliente; toda decisão é do backend.
- **Ações** (todas gravam `AdminAuditLog` na MESMA transação, com `actor` = e-mail da conta e `detail`, sem dado pessoal):
  criar negócio (Tenant + dono sem senha conhecida: o dono recebe um link de "definir senha", uso único, 24 h, só o hash
  no banco), suspender / reativar (`Tenant.suspendedAt`: vence qualquer estado de cobrança, tira do marketplace),
  estender trial (só sem assinatura, teto de 180 dias à frente, otimista por `trialEndsAt`), **plano de cortesia**
  (`PUT/DELETE /platform/tenants/:id/courtesy`: cria/atualiza `Subscription` com `courtesy`, com ou sem data de fim;
  recusa se houver assinatura PAGA e se o plano tiver menos vagas que a equipe ativa), telefone do dono
  (`PUT .../owner-phone`; o número NÃO vai para a auditoria), link de redefinição de senha (reaproveita
  `InternalService`) e cupons (`/platform/coupons`). Leitura: métricas, negócios (com telefone e WhatsApp do dono),
  assinaturas, usuários e auditoria, sempre com `select` explícito (nada de hash/token).
- **Telefone do dono** (`User.phone`, normalizado sem DDI): obrigatório no cadastro público e no "Novo negócio" do
  painel; contas antigas ficam sem número até alguém informar (aparece "Sem telefone" na lista). É contato comercial
  (ex.: falar com quem cancela), nunca identidade de login. Link do WhatsApp: `lib/whatsapp.ts`.
- **Não faz**: personificar um usuário (entrar "como" o dono), nem editar dado de dentro do negócio.
- **Risco aceito**: sem 2FA nesta versão (uma senha vazada abre todos os negócios). Próximo endurecimento recomendado:
  TOTP e restrição de IP no proxy para `/platform/` e `/plataforma`, como já se faz com `/internal/`.

### Billing
**Provedor: Mercado Pago** (`src/billing/payments`). O Stripe foi removido. Duas formas de pagar, escolhidas pelo dono em
`/dashboard/plano`: **cartão recorrente** (assinatura `preapproval`; o provedor cobra todo mês) e **Pix mensal** (cada mês
é UM pagamento; sem novo Pix o acesso termina em `currentPeriodEnd` e o salão "cai"). Sem `MERCADOPAGO_ACCESS_TOKEN` as
rotas de cobrança respondem 503 e a tela só informa ("fale com a equipe"); a cortesia e a extensão do teste continuam
sendo feitas pelo painel da plataforma. **Nunca testado contra o Mercado Pago real** (sem conta de teste neste ambiente):
só contra um servidor falso e testes unitários (ver Riscos).

- **Preço e limite de cada plano: UMA definição só** — `PLAN_CATALOG` em `packages/shared-types/src/index.ts`
  (dinheiro em centavos; `maxProfessionals: null` = ilimitado). `PlanCatalogService` regrava a tabela `Plan` a cada
  boot; `GET /plans` e o app leem a tabela; o seed lê o catálogo; o site institucional lê `GET /plans` (CORS por
  `SITE_URL`) e mantém uma cópia estática só como fallback. Preços atuais: Essencial R$ 49,90 (até 2), Profissional
  R$ 99,90 (até 5), Premium R$ 189,90 (ilimitado). Reajuste com cliente real exige migração deliberada das
  assinaturas (grandfathering): a assinatura do cartão guarda o valor no provedor.
- **Estado de cobrança** (`computeBillingStatus`, um só lugar): `SUSPENDED` (suspensão manual, vence tudo) >
  `EXPIRED` (cortesia vencida) > `PERIOD_ENDED` (Pix cujo mês acabou) > `CANCELED` (cancelada e o período pago
  acabou) > `UNPAID` (`PAST_DUE` há mais de 3 dias do fim do período) > status da `Subscription` >
  `TRIALING`/`TRIAL_EXPIRED` (sem assinatura, pelo `trialEndsAt`). `TenantBillingGuard` bloqueia o que não é
  `TRIALING`/`ACTIVE`/`PAST_DUE`, com `code: BILLING_BLOCKED` e uma mensagem por estado (`billingBlockMessage`).
  `Subscription.courtesy = true` é acesso concedido pela plataforma, sem cobrança. Nada depende de uma tarefa
  agendada para bloquear: o vencimento é decidido na leitura.
- **Cadastro e trial:** `POST /public/signup` cria `Tenant` + `User` OWNER numa transação, com
  `trialEndsAt = agora + TRIAL_DAYS` (14 dias), **sem cartão e sem `Subscription`**. O body traz negócio, nome,
  e-mail, **telefone** (obrigatório, normalizado) e senha, mais o **cupom** opcional: papel, tenant, trial e plano são
  definidos pelo servidor. Slugs reservados ganham sufixo, porque `/[slug]` divide o namespace com as rotas do app.
- **Rotas do OWNER** (`@SkipBillingCheck`, 10/min; funcionam bloqueado, que é quando precisa pagar), todas só com
  `tier` e `couponCode?` (**nenhum DTO tem campo de valor**): `POST /billing/quote` (prévia, não reserva nada),
  `POST /billing/checkout/card` (devolve o link do checkout do provedor), `POST /billing/checkout/pix` (devolve QR e
  copia-e-cola), `GET /billing/attempts/:id` (relê o provedor e aplica; é o que a tela consulta a cada 4 s),
  `POST /billing/sync`, `POST /billing/change-plan` e `POST /billing/cancel`. Mais `GET /plans` (público) e
  `GET /billing/status` (qualquer papel).
- **Troca de plano** (`PaymentsService.changePlan`, só assinatura paga ACTIVE e sem cancelamento agendado): vale NA HORA
  para o limite de profissionais; o valor novo é cobrado a partir da próxima cobrança (cartão: atualiza o valor da
  recorrência no provedor ANTES de gravar, e só depois da 1ª cobrança) ou do próximo Pix. **Recusa (409) se a equipe
  ATIVA não couber no plano novo** (`PlanLimitService.assertCanDowngrade`): nada é desativado em silêncio, o dono
  desativa o excedente e tenta de novo. A releitura do cartão nunca regrava o plano da `Subscription` com o da
  tentativa original (isso desfaria a troca). Quem está em cortesia não troca por aqui (é a plataforma). Sem
  proporcional: não há cobrança nem crédito da diferença no mês corrente.
- **`BillingAttempt`** = uma tentativa de pagamento; o `id` dela é o `external_reference` enviado ao provedor, e é por
  ele que o pagamento volta ao negócio (nunca por algo do corpo de um webhook). Valores (lista, desconto, cobrado) são
  SEMPRE calculados no servidor (`priceWithCoupon`: desconto nunca leva a cobrança abaixo de R$ 5,00). O pagamento só
  é aplicado se a referência, o id do provedor E o valor pago conferirem com a tentativa. Aplicar o mesmo pagamento
  duas vezes soma UM mês (a tentativa só sai de `PENDING` uma vez, sob advisory lock por negócio).
- **Sincronização: o provedor é a fonte da verdade, nunca o navegador nem o corpo do webhook.** Três caminhos, todos
  RELENDO a API do Mercado Pago com o nosso token: `POST /webhooks/mercadopago` (público; se vier `x-signature` e
  houver `MERCADOPAGO_WEBHOOK_SECRET`, é conferido por HMAC e uma assinatura inválida é recusada; sem o cabeçalho
  segue pela releitura; id desconhecido = 200, falha do provedor = 503), a consulta da tentativa pela tela, e uma
  tarefa horária que expira tentativas vencidas. Notificação forjada não credita nada.
- **Pix:** cada pagamento aprovado soma 1 mês a partir do fim do período atual (quem paga antes não perde dias) ou de
  agora. Só dá para gerar o próximo Pix a ≤ 10 dias do vencimento (evita pagar vários meses sem querer). Trocar de
  cartão para Pix cancela a recorrência antiga no provedor.
- **Cartão:** o desconto de cupom vale só na PRIMEIRA cobrança: a assinatura nasce com o valor com desconto e, depois
  que a primeira cobrança sai (`summarized.charged_quantity ≥ 1`), é atualizada para o preço cheio (nunca antes, para
  a 1ª não sair cheia). Se essa atualização falhar fica no log (nível error) e a próxima sincronização tenta de novo.
  Cancelar encerra a recorrência no provedor e mantém o acesso até o fim do período pago.
- **Tela `/dashboard/plano`:** estado, cards (`planActionFor` decide o botão, testado), diálogo de assinatura (forma
  de pagamento, cupom com prévia do valor, QR do Pix com confirmação automática) e cancelamento. Só o OWNER vê ações.
  O `BillingGate` leva o dono bloqueado a ela. `DELETE /professionals/:id` só exclui quem não tem histórico.
- **Cupons** (`src/coupons`, aba "Cupons" do painel): `Coupon` (código maiúsculo único, tipo `TRIAL_DAYS` | `PERCENT` |
  `FIXED_CENTS`, valor com faixa por tipo, limite de usos, janela de validade, ativo) e `CouponRedemption` (uma por
  negócio+cupom, com `appliedAt` quando o desconto é de fato abatido). O resgate é ATÔMICO (`reserve`: `UPDATE`
  condicional que só incrementa se ainda estiver ativo, na janela e com uso sobrando), então dois no último uso não
  passam os dois, e toda recusa devolve a mesma mensagem. `TRIAL_DAYS` vale só no cadastro (soma dias ao teste);
  `PERCENT`/`FIXED_CENTS` abatem a PRIMEIRA cobrança: o do cadastro entra sozinho no checkout, ou o dono digita um
  código lá (reserva um uso novo, devolvido se a tentativa falhar/expirar). Tipo, valor e código não mudam depois de
  criado; só ativar/desativar, descrição, teto de usos (nunca abaixo do já resgatado) e fim da validade.
- **O Admin-TotalSoftware não provisiona mais tenants do Marquo:** o webhook `/webhooks/totalsoftware`,
  o `WebhookSecretGuard`, as variáveis `TOTALAGENDA_*` e `Tenant.externalCustomerId` foram removidos. O
  Admin só fala com este backend pela API interna de suporte (`src/internal`, HMAC — ver abaixo). A
  cobrança do TotalPousada continua no Admin (outro produto, outra conta).
- **API interna de suporte** (`GET /internal/tenants`, `POST /internal/tenants/:id/password-reset-link`):
  só o Admin chama. `InternalAuthGuard` exige `x-internal-timestamp` + `x-internal-signature` (HMAC-SHA256
  de `internal.v1
{ts}
{METHOD}
{originalUrl}
{sha256(body)}` com `INTERNAL_API_SECRET`, 32+ chars),
  janela de 5 min, replay recusado (cache em memória, um processo), falha fechada sem segredo e resposta
  uniforme 403 para qualquer falha. O link de redefinição mira o OWNER ativo, vale 24 h, persiste só o
  hash e grava `AdminAuditLog` (ator = e-mail do admin, sem o token) na mesma transação. Trocar a senha
  derruba as sessões antigas (`passwordChangedAt` vs `iat`, inclusive refresh) e zera o lockout. Em
  produção o nginx deve restringir `/internal/` ao IP do Admin (defesa em profundidade, além do HMAC).
- **E-mail de `User`** é sempre minúsculo (`NormalizeEmail` no login, no cadastro e no CRUD de
  profissional): o e-mail é chave de login e único no Postgres (case-sensitive), então sem isso
  "Foo@x.com" e "foo@x.com" seriam contas distintas e a checagem de duplicidade se contornaria.

### Agendamento
- `Appointment` é o agregado (um "atendimento"/comanda), com `AppointmentItem[]`
  (serviços e, futuramente, produtos). Snapshot de preço/duração no item no momento da
  marcação — auditoria, não re-lê catálogo depois.
- Anti-overlap: constraint `EXCLUDE` (GiST) na migration SQL **+** checagem defensiva em
  `assertNoConflict` dentro de `$transaction` com `pg_advisory_xact_lock` por profissional.
- Timezone: America/Sao_Paulo assumido; datas trafegam ISO-8601, cálculo com Luxon.
- Gerenciar (cancelar/remarcar) um agendamento exige login do cliente: `/minha-conta` (aba
  Agenda) → `PATCH public/consumer/bookings/:id/cancel|reschedule`, com a posse no `WHERE`. Não
  existe mais link público por token (`manageToken` foi removido — migration
  `remove_appointment_manage_token`): capability não autenticada num link circulável era
  superfície de IDOR/vazamento (nome e telefone) sem ganho, já que agendar também exige login.

### E-mail transacional (Resend)
- `src/email`: `EmailService` (cliente HTTP mínimo do Resend, sem SDK, host fixo, timeout de 8 s, **nunca lança**) e
  `AppointmentNotifierService`. Variáveis `RESEND_API_KEY` + `EMAIL_FROM` (vêm juntas; o remetente precisa ser de um
  domínio verificado no Resend). Sem elas o envio fica desligado: nada sai, nada quebra (mesmo padrão do Mercado Pago).
- **Disparo depois do commit, fire-and-forget** (`AppointmentsService`): falha de e-mail nunca desfaz nem atrasa um
  agendamento. Avisa-se o OUTRO lado: agendamento público → equipe (dono ativo + profissional ativo) recebe o aviso e o
  cliente a confirmação; cliente cancela/remarca → só a equipe; recepção marca/cancela/remarca → só o cliente.
- **Destinatário nunca vem do request**: relido do banco com `tenantId` no WHERE. Cliente = e-mail da conta
  (`Consumer.email`) com prioridade sobre `Client.email` (ficha). Conteúdo é template fixo com todo texto de usuário
  escapado (`escapeHtml`); não há como mandar texto livre. Nunca se loga endereço, assunto nem corpo.
- Ainda não feito: lembrete antes do horário, recuperação de senha por e-mail, OTP do cliente por e-mail.

### Comissões e repasses
- **Sem "fechar período".** `GET /commissions/earnings` (`CommissionsService.earnings`) calcula na hora, por
  profissional: **bruto** (Σ preço × qtd dos itens dele), **descontos**, **líquido** (bruto − descontos), **repasse**
  do período (Σ `CommissionEntry`), **sobra da casa** (líquido − repasse) e **saldo a repassar**. Todo profissional
  ativo aparece, mesmo com zero. Base temporal única: `Ticket.closedAt` (comandas fechadas). Tela:
  `/dashboard/comissoes` (período na URL: `?periodo=` ou `?de=&ate=`, padrão mês corrente em America/Sao_Paulo).
- **Decisão (negócio): a comissão é calculada sobre o BRUTO**, antes do desconto da comanda (`computeForTicket`).
  O desconto sai do lado do estabelecimento; a receita no Financeiro entra líquida. O desconto é um valor único
  por comanda (`Ticket.discountCents`), então a coluna "Descontos" é um RATEIO de exibição proporcional aos itens
  (`discount-allocation.util.ts`, maior resto, soma exata): não altera comissão nem receita.
- **Repasse = pagamento do saldo, não fechamento.** `CommissionPayout` + despesa `PAID` (`source=COMMISSION`) criados
  juntos em `POST /finance/commissions/payouts` (OWNER). **Saldo é sempre derivado**: Σ `CommissionEntry` do
  histórico − Σ `CommissionPayout`. O servidor recalcula o saldo DENTRO da transação, com
  `pg_advisory_xact_lock` por profissional, e recusa valor acima dele (o DTO só valida tipo/faixa). O antigo
  `POST /finance/commissions/close` foi removido: não era idempotente (duas chamadas duplicavam a despesa) e nada
  marcava a comissão como fechada.
- **Escopo:** `earnings` e `report` não têm `@Roles`; o service força o próprio `professionalId` para PROFESSIONAL e
  devolve vazio se o token vier sem vínculo (antes, sem vínculo, o filtro sumia e a equipe inteira ficava visível).
- Itens da comanda sem profissional não entram no faturamento por profissional.
- **Regras de comissão (editar/excluir):** `PATCH`/`DELETE /commissions/rules/:id` (OWNER, `ParseUUIDPipe`). A escrita
  leva `tenantId` no WHERE (`updateMany`/`deleteMany`), não só a leitura; regra de outro tenant = mesmo 404 de
  inexistente. PATCH sem `isActive` MANTÉM o estado (antes reativava em silêncio). Uma só regra ATIVA por
  (profissional, base, alvo): duplicata = 409, porque duas empatam em `pickRule` e o repasse dependeria da ordem do
  banco (as regras também são lidas em ordem fixa `createdAt, id`). A comissão calculada **nunca passa do valor
  vendido** (`min(valor, base)`): um "R$ fixo" digitado errado gerava repasse maior que a venda. Teto de 100 regras
  por profissional. Mudar/excluir regra vale só para comandas FUTURAS: `CommissionEntry` guarda o valor e não
  referencia a regra. **Sem trilha de auditoria** das alterações de regra (só o dono mexe); aceito por ora.
- **Repasse — data e idempotência:** o dia do pagamento assume HOJE em America/Sao_Paulo (`paidAt` = instante real);
  pode ser corrigido para dia passado, nunca futuro nem com mais de 366 dias (validado no service, não só no
  DTO). `requestKey` (UUID gerado a cada abertura do diálogo, único por tenant) faz o reenvio da MESMA requisição
  devolver o repasse existente em vez de pagar duas vezes; mesma chave com outro valor/profissional = 409. A busca
  da chave acontece DEPOIS do lock por profissional. `POST /finance/commissions/payouts` tem `@Throttle` de 20/min.

### Comanda: cliente e registro de datas
- **Cliente da comanda:** `PATCH /tickets/:id/client` (OWNER/RECEPTIONIST) vincula, troca ou remove (`clientId: null`) o
  cliente de uma comanda ABERTA. O cliente é validado no mesmo tenant (`findFirst({ id, tenantId })`), a escrita leva
  `tenantId` no WHERE e roda sob o lock da comanda. `clientId` é obrigatório no corpo: ausente é 400, nunca
  "desvincular" em silêncio. Comanda vinda de agendamento mantém o cliente do agendamento (409); fechada ou cancelada
  não aceita troca (o registro do atendimento não muda depois). Na abertura (`POST /tickets`) o cliente é opcional.
- **Registro de datas:** a comanda expõe `openedAt`, `closedAt`, `canceledAt`, `createdAt` de cada item e de cada
  pagamento. O frontend formata sempre em America/Sao_Paulo (`lib/datetime.ts`), nunca no fuso do navegador, para
  não divergir entre servidor e cliente.
- A ficha do cliente (`GET /clients/:id`) traz `tickets`: as 50 comandas mais recentes (sem as canceladas), com
  itens, total (itens − desconto, calculado no servidor) e datas.

### Uploads
Arquivos de tenant (logo, galeria) em `apps/backend/uploads/` (gitignored), servidos por
`ServeStaticModule`. Nome de arquivo fixo por tenant + cache-bust por `updatedAt` na URL.

## Segurança (não-negociável)

Segurança é o requisito nº 1 — validação e tratamento de erro em boundary (API/DB/auth)
nunca são cortados por simplicidade. Ao escrever ou revisar código, varrer ativamente por:

### IDOR / BOLA (Broken Object Level Authorization)
- **Toda** query de recurso de tenant filtra por `tenantId` (do JWT) na cláusula `WHERE` —
  `findFirst({ where: { id, tenantId } })`, nunca `findUnique({ where: { id } })` seguido de
  comparação de dono em JS (isso abre janela de IDOR e vaza existência do recurso).
- Recurso de cliente logado: filtrar por `clientId` na query (`where: { id, tenantId, clientId }`).
- `PROFESSIONAL` só acessa a própria agenda: o service injeta `professionalId` no `WHERE`
  quando `role === PROFESSIONAL` (ver `AppointmentsService.findOwnedByStaff`).
- Nunca aceitar `tenantId` / `professionalId` "de dono" vindo do body/query como fonte de
  autorização — só como filtro adicional, sempre cruzado com o JWT.
- Nenhum recurso é acessível por "capability" sem login: o cliente só enxerga/altera o que é
  dele via relação no `WHERE` (`client.consumerLink.consumerId`), 404 igual pra "não existe".

### Confiança no cliente (frontend nunca é fonte de verdade)
Todo valor que o cliente HTTP envia e que afeta dinheiro, papel/permissão ou estado de
negócio crítico deve ser **derivado ou limitado no backend**, nunca aceito como está só
porque passou na validação de tipo do DTO. Validar tipo/faixa não é o mesmo que validar
que o valor é *confiável para aquele contexto* — um `class-validator` que só checa
"é um inteiro entre 0 e 100_000_000" não impede que esse inteiro seja o preço errado.

- **Preço de item de catálogo nunca vem do cliente.** Caso real que motivou esta regra:
  `AddTicketItemDto.unitPriceCents` aceitava um valor opcional que, quando presente,
  *sobrescrevia* o preço do catálogo pra itens `SERVICE`/`PRODUCT`
  (`tickets.service.ts`, `addItem`) — um RECEPTIONIST podia abrir uma comanda de um
  serviço de R$150 e enviar `unitPriceCents: 1`, corrompendo o total da comanda, o
  valor exigido pra fechar, a comissão calculada (`CommissionsService.computeForTicket`)
  e a receita lançada no financeiro (`FinanceService.recordTicketIncome`) — sem log de
  auditoria (não existe módulo de audit log no projeto). Corrigido: o campo só existe
  pra `CUSTOM` (item avulso, sem catálogo pra derivar preço); pra `SERVICE`/`PRODUCT` o
  service rejeita o campo explicitamente antes de qualquer outra coisa.
- **Padrão correto já existente no código** — dois exemplos a seguir:
  - `AppointmentItem.priceCentsSnapshot` é sempre copiado do catálogo no momento da
    marcação, nunca aceito do body — nem `CreateAppointmentDto` nem
    `CreateStaffAppointmentDto` têm campo de preço.
  - `SetTicketDiscountDto.discountCents` é um valor que o cliente *pode* legitimamente
    definir (decisão do staff, não preço de catálogo) — mas `TicketsService.setDiscount`
    limita contra um valor derivado do servidor (`discountCents <= subtotal`) antes de
    persistir. Quando o valor do cliente é legítimo, ele ainda precisa de um
    bound-check contra algo que o servidor calculou, não contra nada.
- Regra prática ao revisar/escrever um DTO ou service: pra todo campo que chega do
  cliente e participa de total/comissão/papel/status, perguntar "o backend pode
  derivar isso sozinho, ou já tem um limite calculado no servidor pra checar contra?"
  — se a resposta é não pras duas, o campo não devia existir nesse formato.
- Validação de DTO não é a última linha de defesa: os testes de `*.service.ts`
  instanciam o service direto, sem passar pelo `ValidationPipe` (ver
  `tickets.service.spec.ts`) — se a regra só existe no decorator do DTO, um novo
  caller (ou um teste) que pule o DTO reabre o buraco. Derivar do banco no service é o
  que realmente fecha a brecha, a validação do DTO é só a primeira camada.

### Injeção SQL / NoSQL
- Acesso a dados **só** via Prisma Client (parametrizado). `$queryRaw` / `$executeRaw`
  apenas com template tag (`$executeRaw\`... ${x}\``), nunca `$queryRawUnsafe` com
  concatenação de input. O único raw hoje é `pg_advisory_xact_lock(hashtext(${id}))` —
  interpolação por parâmetro, não string.
- `ValidationPipe` global com `whitelist: true` + `forbidNonWhitelisted: true`: campo não
  declarado no DTO → 400. Todo input de fronteira passa por DTO com class-validator —
  **isso inclui `@Query()`, não só `@Body()`**. `@Query("campo") x: string` solto (sem
  DTO) não passa pelo `ValidationPipe` de jeito nenhum; um valor inválido vai cru pro
  Prisma e vira 500 (`PrismaClientValidationError` não é capturado por
  `PrismaExceptionFilter`) em vez de 400. Caso real: `GET /waitlist?status=...` —
  corrigido com `FindWaitlistQueryDto` (`@Query() query: FindWaitlistQueryDto`), mesmo
  padrão de `GetAvailabilityQueryDto`/`SearchMarketplaceQueryDto`.

### Validação na borda e máscaras (frontend nunca é a validação)
- **Máscara é conforto, o backend revalida tudo.** `lib/masks.ts` (telefone, CPF, dinheiro) e
  `<MaskedInput>`/`<MoneyInput>` só formatam o que o usuário vê. Telefone/CPF viajam formatados ou como
  dígitos e o backend normaliza; **dinheiro** viaja como texto BRL ("1.234,56") e a Server Action converte
  com `moneyToCents` (estrito: valor mal formado dá `null` → erro ao usuário, **nunca** `0` em silêncio — o
  `Number("1.234,56".replace(",", "."))` antigo abria o caixa com fundo R$ 0,00). Novo campo monetário =
  `MaskedInput mask="money"` + `moneyToCents`; nunca `type="number"` + `Math.round(x * 100)`.
- **Backend** (`common/validators/br-validators.ts`, `common/decorators/trim.decorator.ts`,
  `common/utils/{phone,cpf}.util.ts`): `@IsBrazilianPhone()` (DDD 11–99, celular começa com 9),
  `@IsCpf()` (dígitos verificadores), `@IsBirthDate()` (1900 até hoje), `@Trim()` ANTES da validação (nome só
  com espaços passava em `@MinLength`). Todo id vindo do cliente é `@IsUUID()` (nunca `@IsString()` solto);
  listas têm teto de tamanho e de cada item (`tags`, `options`, `categorySlugs`); senha no máximo 72 (bcrypt
  ignora o resto). O service repete a regra que protege dinheiro/identidade (o DTO não é a última linha).
- Mensagens de erro saem em português: `validationExceptionFactory` (ValidationPipe) e
  `PtBrHttpExceptionFilter` traduzem só o texto padrão em inglês; mensagem de domínio passa intacta. Bytes NUL
  no corpo/query viram 400 (`RejectNullBytesInterceptor`), não erro de driver do Postgres.
- **Caminho de chamada ao backend não é controlável pelo cliente:** `assertSafeApiPath` (`lib/api-path.ts`) roda
  em `authedFetch`, `api.ts`, `marketplace-api.ts` e `consumer-session.ts`; `id`/`slug` interpolados vêm da URL
  ou de argumento de Server Action e `..`/`%2f` mudariam o endpoint alvo com o token do usuário. `?next=` do
  login passa por `isSafeRedirectPath` (`lib/safe-path.ts`): o navegador remove tab/CR/LF, então `/\t/evil.com`
  virava `//evil.com`.
- Perfil público: WhatsApp só `55` + DDD + número; Instagram só `https://instagram.com/<usuário>` (o form aceita
  "@salao"/link e normaliza). Campo de texto em branco **limpa** o valor (grava `null`); `undefined` não altera.

### Concorrência (dinheiro) e uploads
- Mutação de comanda (`TicketsService`) roda em `lockedOpenTicket`: advisory lock por comanda +
  status relido DENTRO da transação. "Checar aberta fora, escrever depois" deixava dois `close`
  concorrentes gerarem receita/comissão/estoque em dobro e dois pagamentos estourarem o total.
- Upload de imagem (`common/utils/image.util.ts`): formato vem dos BYTES (só JPEG/PNG/WEBP — nunca
  o mimetype do multipart), teto de pixels decodificados e reencode pra WebP. O sharp abre SVG
  (referência externa/XML entities), então não se pode confiar no Content-Type.
- FK vinda do body (categoryId, clientId, professionalId...) só entra depois de validada no
  tenant (`findFirst({ id, tenantId })`) — inclusive em PATCH (`updateEntry` já vazou categoria de
  outro tenant por isso). `PROFESSIONAL` só age sobre o que é dele (ficha de anamnese exige
  atendimento próprio).
- Valor salvo que vira `href` em página pública (ex.: `instagramUrl`) só aceita `http(s)://`.

### DoS / abuso
- `ThrottlerModule` global (100 req/min por IP). Rotas públicas sensíveis a spam têm
  `@Throttle` mais estrito (ex.: criação de agendamento público: 10/min).
- Constraint `EXCLUDE` + advisory lock evitam corrida de double-booking sob carga.
- Uploads: limite de tamanho e content-type no Multer; imagens reprocessadas com `sharp`
  (descarta payload malicioso embutido). Sem upload de SVG (XSS via `<script>` em SVG).
- Paginação/limite em toda listagem que possa crescer sem teto (adicionar ao criar
  endpoints de histórico/relatório). Padrão: `@Query() query` estende `PaginationQueryDto`
  (`common/pagination`, `pageSize` com teto de 50), o service usa `resolvePagination` (skip/take
  no banco) e devolve `toPage(...)` = `Paginated<T>` (`shared-types`). No frontend a página vive
  na URL: `parsePageParam` + `<Pagination>` (`components/ui/Pagination.tsx`, por links, com
  `paramName` pra várias listagens na mesma tela) — ver `app/minha-conta/page.tsx`.

### Auth / sessão
- **Staff**: `JwtStrategy.validate` relê o usuário no banco a cada request (tenantId/role/
  professionalId vêm do BANCO, não das claims; `isActive=false` → 401). O token só prova quem é —
  desativar/rebaixar vale na hora, não em até 12h. Convite de "definir senha" também recusa
  usuário desativado.
- **Refresh token de staff com ROTAÇÃO** (`auth/refresh-token.service.ts`, tabela `RefreshToken`): cada token
  (JWT com `jti` + `fid`) vale uma vez; `/auth/refresh` o troca por outro da mesma família (uma por login).
  Reapresentar um token JÁ USADO fora da janela de tolerância (60 s) = cópia: a família inteira é revogada
  (dono e ladrão caem; o dono entra de novo). A janela existe porque o Next dispara proxy + layout + página +
  Server Actions ao mesmo tempo com o MESMO cookie: reuso dentro dela emite um token irmão em vez de deslogar.
  `POST /auth/logout` revoga a família (NextAuth `events.signOut`); redefinir a senha revoga todas as do
  usuário; teto absoluto de 90 dias por família (rotacionar não estende a sessão para sempre). Só o `jti`
  fica no banco (o JWT é assinado): vazamento do banco não entrega token utilizável. Refresh no formato antigo
  (sem `jti`) NÃO é aceito: o deploy desloga todo mundo uma vez. No frontend (`lib/auth.ts`) as renovações
  simultâneas com o mesmo refresh token dividem UMA chamada ao backend; só 401 encerra a sessão, 429/5xx/rede
  são transitórios (mantém a sessão e tenta na próxima requisição). O access token (12 h) continua valendo
  até vencer mesmo após revogar a família — o que o derruba na hora é `isActive=false` (relido a cada request).
- **CSP com nonce** (`lib/csp.ts`, montado em `proxy.ts` a cada requisição): `script-src 'self' 'nonce-…'
  'strict-dynamic'` — script injetado sem o nonce não executa. Depende de render dinâmico (o layout raiz lê
  `cookies()`, então toda página é dinâmica; **não** torne uma página estática sem rever o CSP). `style-src`
  mantém `'unsafe-inline'` (atributos `style={{}}`, ex.: `--tenant-accent`, não aceitam nonce). Origem da API em
  `connect-src`/`img-src`; `frame-src` só Google Maps (seção de contato). Ao adicionar script/embed/host
  externo, ajuste `buildCsp` e o teste `csp.test.ts`; sem isso o navegador bloqueia em silêncio (console:
  "Refused to ...").
- **Cliente (Consumer)**: o JWT carrega `pv` (prefixo do sha256 do `passwordHash`) e o
  `ConsumerJwtAuthGuard` confere no banco que a conta existe e que `pv` bate. Trocar a senha ou
  excluir a conta derruba as sessões antigas; a troca devolve sessão nova (a Server Action grava
  no cookie).
- `JWT_SECRET` exige 32+ caracteres (boot falha se menor). `helmet` ativo (CORP `cross-origin`
  porque `/uploads` é carregado do frontend em outra origem). Atrás de proxy, definir
  `TRUST_PROXY_HOPS` (nº de proxies confiáveis, nunca `true`) — senão o throttle por IP limita
  todos os clientes juntos.
- **IP do visitante no throttle (frontend → backend):** chamadas server-side do Next (login
  NextAuth, refresh, definir-senha, cliente final, `authedFetch`, `proxy.ts`) chegam ao backend com
  o IP do servidor Next. Por isso o frontend anexa o IP do visitante em `x-client-ip` +
  `x-client-ip-ts` + `x-client-ip-sig` (HMAC-SHA256 com `CLIENT_IP_SECRET`, janela de 60s;
  `lib/client-ip.ts`, `lib/backend-fetch.ts`) e o `ClientIpThrottlerGuard` só confia nele se a
  assinatura for válida; senão usa `req.ip`. Quem chama o backend direto (navegador) segue por
  `req.ip`. Sem `CLIENT_IP_SECRET` o cabeçalho é ignorado; o segredo é obrigatório em produção.
  Operação (mesma VPS, nginx/Caddy na frente dos dois): o proxy **sobrescreve** `X-Forwarded-For`
  (`proxy_set_header X-Forwarded-For $remote_addr;`), `TRUST_PROXY_HOPS=1` no backend,
  `TRUSTED_PROXY_HOPS=1` no frontend, mesmo `CLIENT_IP_SECRET` nos dois `.env`, e as portas 3000 e
  3001 só acessíveis pelo proxy (quem alcançasse o Next direto forjaria `X-Forwarded-For`).
- Senhas com bcrypt (rounds 12). Nunca logar senha, token, hash ou `Authorization`.
- JWT: validar assinatura + expiração (`passport-jwt`); `JWT_SECRET` obrigatório no
  `env.validation` (fail closed). Não confiar em claim sem revalidar o recurso no banco.
- Único webhook de entrada: `POST /webhooks/mercadopago` (ver Billing): o corpo é só um aviso e o estado é sempre
  relido na API do provedor; assinatura conferida quando presente e há segredo.
- Token de "definir senha": só o **hash** é persistido, com expiração; consumido uma vez.

### Exposição de dados sensíveis
- Mensagem de erro ao usuário é genérica em pt-BR; stack trace e detalhe de Prisma nunca
  vazam (`PrismaExceptionFilter` normaliza). Recurso inexistente e recurso de outro tenant
  retornam o **mesmo** 404 (não confirmar existência).
- `select` explícito ao devolver `User` / `Client` — nunca serializar `passwordHash`,
  `passwordSetTokenHash`, tokens.
- **Nunca** commitar `.env*` / segredos (regra absoluta — ver
  `Vscode/CLAUDE.md`). `.env.example` versionado sem valores reais.

### SSRF / deserialização / dependências
- Sem fetch de URL controlada por usuário no servidor (se surgir — ex.: importar imagem
  por URL — validar host contra allowlist, bloquear IP privado/metadata).
- Sem `eval` / deserialização de payload arbitrário. JSON via parser padrão.
- `pnpm audit` no CI; dependência com CVE conhecido bloqueia merge.
  - Correções de CVE transitiva vão em `pnpm.overrides` (package.json raiz), sempre dentro da
    mesma major. `bcrypt` está na v6 (binário pré-compilado, sem a cadeia `node-pre-gyp`/`tar`).
  - Exceção consciente: `GHSA-36xv-jgw5-4q75` (`@nestjs/core`, injeção em `SseStream`) está em
    `pnpm.auditConfig.ignoreGhsas` porque só a v11 corrige (major: Express 5) e o app **não usa**
    `@Sse()`. Rever ao migrar pro Nest 11 ou se algum endpoint SSE for criado.

### Riscos conhecidos (aceitos por ora)
- **Repasses antigos:** lançamentos `COMMISSION` gerados pelo extinto "fechar comissões do período" não têm
  `CommissionPayout`. O saldo novo não os conhece e mostra todo o histórico como "a repassar". Aceito enquanto não
  há tenant real (cadastro público ainda fechado); com dado real, fazer backfill antes de usar o saldo.
- Access token de staff (12 h) não é revogável antes de vencer (só `isActive=false` o derruba na hora); o
  refresh token é rotativo e revogável (ver Auth / sessão). Reduzir `JWT_EXPIRES_IN` encurta a janela.
- Lockout por conta permite travar a conta alheia (DoS) — mitigado por throttle por IP.
- Abrir caixa não é atômico (dois `open` simultâneos podem criar dois caixas abertos); estoque
  pode ficar negativo (regra de negócio, não checada).
- Cadastro do cliente revela se telefone/e-mail já têm conta (decisão de UX); sem OTP.
- **Cadastro de dono (`/public/signup`) sem verificação de e-mail** (não há provedor de e-mail
  transacional na v1): revela 409 para e-mail já cadastrado e permite ocupar o e-mail de terceiros
  (`User.email` é único global). Decisão consciente de UX vs. segurança; mitigação = throttle de
  5/hora por IP (em memória, um processo). `User.emailVerifiedAt` existe e não é exigido: a
  verificação entra na área do cliente quando houver e-mail (v2).
- **Sem recuperação de senha por e-mail** para o dono: o reset é manual. O suporte gera o link em
  `/suporte-totalagenda` no Admin (API interna com HMAC, auditado) e entrega ao dono por outro canal,
  depois de confirmar a identidade — quem controla o canal de entrega controla a conta, então isso é
  processo humano, não só código. Some quando houver e-mail transacional (v2).
- Renderização server-side de páginas públicas (`publicApi.*` em Server Components, `no-store`) ainda
  chega ao backend com o IP do servidor Next e divide o limite global de 100/min por IP. Não recebe o
  IP assinado de propósito (fetches com `revalidate` são compartilhados entre visitantes). Só vira
  problema com tráfego público alto; a saída é cache/`revalidate` nessas chamadas ou um
  `skipThrottle` para o IP assinado do servidor Next.
- **Termos de Uso e Política de Privacidade estão em RASCUNHO** (`/termos`, `/privacidade`, conteúdo em
  `apps/frontend/src/lib/legal-content.ts`, lacunas marcadas `[PREENCHER|DECIDIR|REVISAR]`). O cadastro
  exige o aceite da versão vigente (`LEGAL_DOCS_VERSION` em `shared-types`, conferida no servidor) e
  grava `User.termsAcceptedAt`/`termsVersion` (sem IP). **Não abrir o cadastro ao público** antes de
  preencher as lacunas, passar por advogado, marcar `LEGAL_DRAFT = false` (`lib/legal.ts`; o teste
  `legal.test.ts` falha se ainda houver lacuna) e atualizar `LEGAL_DOCS_VERSION` junto com o texto.
- Backend não faz requisição HTTP de saída hoje (sem superfície de SSRF): se surgir fetch de
  URL controlada por usuário, validar host contra allowlist e bloquear IP privado/metadata.
- **Integração Mercado Pago sem teste contra o provedor real** (sem conta de teste neste ambiente): validada contra um
  servidor falso e por testes unitários. Antes de abrir o cadastro ao público, rodar manualmente com credenciais TEST-:
  checkout de cartão (confirmar `init_point`, que `back_url`/`notification_url` são aceitos, o formato das
  notificações de assinatura e a atualização de valor da assinatura), Pix (QR, expiração) e o webhook assinado. Pontos
  que dependem do formato real do provedor: `summarized.charged_quantity`, `next_payment_date` e `x-signature` em
  notificações de assinatura. Reembolso/estorno do Pix (`refunded`/`charged_back`) só marca a tentativa como falha: não
  retira o mês já concedido (decisão manual da equipe).

## Convenções

### Backend
- Um módulo Nest por domínio: `<dominio>.module.ts` / `.service.ts` / `.controller.ts` /
  `dto/*.dto.ts`. Múltiplos controllers no mesmo arquivo quando compartilham domínio
  (público vs. admin vs. cliente — ver `waitlist.controller.ts`, que tem
  `PublicWaitlistController` e `WaitlistController` lado a lado).
- DTOs com class-validator; `ValidationPipe` global é `whitelist + forbidNonWhitelisted`.
- Dinheiro sempre em **centavos** (`Int`), nunca float. Sufixo `Cents`.
- Duração sempre em **minutos** (`Int`). Horário do dia como minutos desde meia-noite
  (`startMinute` / `endMinute`).
- Erros de domínio: exceptions do Nest (`NotFoundException`, `ConflictException`, ...) com
  mensagem em português voltada ao usuário final. `PrismaExceptionFilter` traduz erros do
  Prisma.
- Serviços que participam de transação de agendamento aceitam
  `Prisma.TransactionClient | PrismaService` como primeiro parâmetro.

### Frontend
- Server Components por padrão; `"use client"` só quando necessário. Mutações via Server
  Actions (`actions.ts` por rota), não chamada client→backend (exceto wizard público que
  bate em `/public/*`).
- `lib/api.ts` = cliente dos endpoints `/public/*` (sem auth). `lib/api-server.ts`
  (`authedFetch`) = chamadas autenticadas server-side com o JWT da sessão. Nenhum dos
  dois é onde a validação de verdade acontece — o backend valida tudo de novo (ver
  CLAUDE.md > Segurança > Confiança no cliente); estes clients só existem por DX.
- `lib/marketplace-api.ts` (`marketplaceApi`) = cliente dos endpoints
  `/public/marketplace/*`. Reusar sempre esse client em vez de inline `fetch` num
  Server Component — `RegisteredPlaces.tsx` e `app/descobrir/page.tsx` hoje duplicam
  a própria chamada em vez de reusar `marketplaceApi.search`, evitar repetir esse
  padrão em páginas novas.
- **Home e descoberta (cliente final):** `/` é só busca + "Perto de você" (`NearbyPlaces`) + "Mais bem avaliados"
  (`TopRatedPlaces`); o discurso de venda pro dono vive em `/para-donos` (botão "Para donos" da `Nav`, âncoras do
  `Footer ownerPage`). `/para-donos` é slug reservado. `GET /public/marketplace/search` aceita `sort=rating|distance`
  e `limit` (1–50): a nota é suavizada pelo nº de avaliações (`ratingScore`: 1 avaliação 5,0 não passa 4,8 em 40) e o
  `limit` corta DEPOIS de ordenar. A localização do visitante só é pedida num clique (ou se a permissão já existe),
  vai arredondada a ~1 km (`lib/geolocation.ts`) e nunca é gravada. Dono informa lat/lng à mão em
  `/dashboard/marketplace` (não há geocodificação): negócio sem coordenada some da busca por proximidade.
- Cor de destaque: token `--color-accent-*` em `globals.css`; tenant pode sobrescrever com
  `accentColor` (aplicado como CSS var `--tenant-accent` no layout de `/[slug]`).
- Ícones: `@phosphor-icons/react` (usar o import `/dist/ssr` em Server Components).

### Testes
- Backend: `*.spec.ts` ao lado do arquivo, `jest` + `ts-jest`. Services testados com
  Prisma mockado (unit) — ver `tickets.service.spec.ts`, `availability.service.spec.ts`.
- Regra do projeto: validação de segurança, tratamento de erro em boundary e casos
  críticos **têm** teste — não são cortados por "simplicidade".
- **Smoke E2E** (`apps/backend/scripts/smoke/`, fora do jest): `functional.mjs` (fluxos de negócio com os formatos
  que o frontend envia) e `rotation.mjs` (refresh rotativo) contra um backend REAL. Rode num schema descartável
  (`DATABASE_URL` com `?schema=e2e` + `prisma migrate deploy`; nunca no banco de dev em uso), com o backend
  buildado subindo com `TRUST_PROXY_HOPS=1`: `API_URL=http://localhost:3101 node scripts/smoke/functional.mjs`.
  Rode antes de mexer em validação de DTO, auth ou dinheiro.
- **Frontend E2E** (`apps/frontend/e2e/`, Playwright, `pnpm --filter frontend test:e2e`) e
  **componente** (`apps/frontend/src/**/*.test.tsx`, Vitest + React Testing Library,
  `pnpm --filter frontend test:unit`): cobrem hoje os fluxos de maior tráfego/risco do
  dashboard do dono (confirmação de ação destrutiva em Agenda/Comandas/Caixa/Serviços/
  Profissionais, menu mobile), não as 14 categorias inteiras. Ausência de spec numa
  categoria não é lacuna esquecida — é escopo ainda não alcançado; ao mexer numa categoria
  sem cobertura, considerar adicionar o spec junto, não só confiar no `tsc`/build.

### Git
- Branch dedicada por feature/fix (`feat/...`, `fix/...`), nunca commit direto em `main`.
- Commits segmentados por unidade lógica; cada um compila/passa sozinho; mensagem explica
  o "porquê".

## Layout do monorepo

```
apps/
  backend/    NestJS — API REST (:3001)
  frontend/   Next.js — página pública + dashboard (:3000)
packages/
  database/   schema Prisma, migrations, seed, client gerado
  shared-types/  contrato de tipos front/back
docs/
  roadmap.md  plano de paridade com o Trinks (milestones M0–M5)
```
