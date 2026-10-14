# Marquo

> Antes chamado TotalAgenda. Identificadores legados mantidos de propósito (renomear quebra dados/integrações):
> `metadata.product="totalagenda"` do Stripe, `idempotencyKey` `totalagenda-customer-*`, banco/usuário/volume do
> Postgres (`totalagenda_*` no `docker-compose.yml`) e a página `/suporte-totalagenda` do Admin.

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
fica vazio. O Price real do Stripe vem de `STRIPE_PRICE_*`; a coluna `stripePriceId` só guarda o id
(placeholder `price_<tier>_pending` até haver env).

`.env` obrigatório em `apps/backend/` e `packages/database/` (ver `DATABASE_URL`,
`JWT_SECRET` e, em produção, as do Stripe e `CLIENT_IP_SECRET`, em `apps/backend/src/config/env.validation.ts`).
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

### Billing
**Em migração** (plano em `docs/roadmap.md`): o Marquo passa a cadastrar, dar trial e cobrar
sozinho (Stripe direto), e o Admin-TotalSoftware vira só back-office.

- **Preço e limite de cada plano: UMA definição só** — `PLAN_CATALOG` em `packages/shared-types/src/index.ts`
  (dinheiro em centavos; `maxProfessionals: null` = ilimitado). Antes o valor estava em 4 lugares (migration, seed,
  Stripe e site) e o cliente podia ver um valor e pagar outro. Agora: (1) `PlanCatalogService` regrava a tabela
  `Plan` a cada boot; `GET /plans` e o app leem a tabela; o seed lê o catálogo; (2) o site institucional lê
  `GET /plans` (CORS por `SITE_URL`) e mantém uma cópia estática só como fallback; (3) **antes de cobrar**, checkout
  e troca de plano chamam `StripeService.assertPriceMatchesCatalog`: o Price do Stripe precisa ter o mesmo valor,
  BRL, recorrência mensal e estar ativo, senão 503 sem tocar no Stripe (no boot só avisa no log).
  **Para mudar um preço:** edite o catálogo → **crie um Price NOVO no Stripe** (o valor de um Price é imutável)
  → aponte `STRIPE_PRICE_<TIER>` para ele → deploy → atualize a cópia de fallback do site. Quem já assina segue no
  Price antigo (não migra sozinho): com clientes reais, reajuste com Price novo + migração deliberada das
  assinaturas (grandfathering), nunca só trocando o env. Preços atuais: Essencial R$ 49,90 (até 2), Profissional
  R$ 99,90 (até 5), Premium R$ 189,90 (ilimitado).

- **Cadastro e trial (já em vigor):** `POST /public/signup` (`src/signup`, frontend em `/cadastro`)
  cria `Tenant` + `User` OWNER numa transação, com `trialEndsAt = agora + TRIAL_DAYS` (14 dias,
  `billing/trial.constants.ts`), **sem cartão e sem `Subscription`**. O status vem de
  `computeBillingStatus` (`TRIALING` até o fim do trial, depois `TRIAL_EXPIRED` e o
  `TenantBillingGuard` bloqueia). O body só traz negócio, nome, e-mail e senha: papel, tenant, trial
  e plano são definidos pelo servidor. Slugs reservados (`common/constants/reserved-slugs.ts`)
  ganham sufixo, porque `/[slug]` divide o namespace com as rotas do app.
- **Cobrança direto no Stripe (backend e tela em vigor):** `src/billing` e
  `src/webhooks/stripe-webhook.*`. Rotas do **OWNER**, que funcionam mesmo com o acesso bloqueado
  (`@SkipBillingCheck`: quem está bloqueado precisa delas para pagar) e têm limite de 10/min:
  `POST /billing/checkout` (só `tier`; o Price vem de `STRIPE_PRICE_*`, o tenant do JWT e o retorno de
  `FRONTEND_URL`; recusa com assinatura viva para não cobrar em dobro), `POST /billing/portal`,
  `GET /billing/change-plan/preview` e `POST /billing/change-plan` (troca na hora, com crédito
  proporcional; se o plano novo tem menos vagas o dono escolhe quem desativar e o servidor exige
  EXATAMENTE o excesso, só profissionais ativos do tenant e sem agenda futura; desativações e Stripe
  vão numa transação com lock por tenant, Stripe por último, então uma falha dele não desativa
  ninguém). `DELETE /professionals/:id` só exclui quem não tem histórico (o schema protege o histórico
  com `Restrict`); os demais são desativados. **Nenhum DTO de cobrança tem campo de valor.**
- **Tela `/dashboard/plano`** (`app/dashboard/plano`): resumo do estado, cards de plano (preços de `GET /plans`),
  "Assinar" (Server Action -> checkout do Stripe), "Gerenciar pagamento" (portal) e o diálogo de troca de
  plano, com o aviso explícito de que vale agora e a escolha obrigatória dos profissionais a desativar. As
  regras de qual botão cada card mostra e das mensagens do banner vivem em `lib/billing.ts` (testadas). Com
  o acesso bloqueado (teste vencido, cancelada, não paga) o `BillingGate` leva o dono direto a essa tela em
  vez de páginas vazias; ele avalia num carregamento completo (o layout do Next é reaproveitado em
  navegação client-side), e o backend continua sendo quem barra. Só o OWNER vê botões de ação.
- **`POST /webhooks/stripe`:** assinatura conferida sobre o corpo CRU (`rawBody` no `main.ts`), pública
  e fora do throttle. Cada evento só sinaliza "algo mudou": a assinatura é RELIDA na API do Stripe e
  gravada, então eventos repetidos, fora de ordem ou atrasados convergem. O plano vem do Price, nunca
  do nome. `metadata.product=totalagenda` + `metadata.tenantId` isolam do TotalPousada na mesma conta do
  Stripe (o webhook do Admin, por sua vez, ignora tudo sem `clienteId`: **nunca** ponha `clienteId` na
  metadata do Marquo). `StripeEvent` é gravado só depois de processar, para o Stripe reentregar uma
  falha. Em dev sem `STRIPE_*` as rotas respondem 503; em produção o boot exige todas as variáveis.
- **O Admin-TotalSoftware não provisiona mais tenants do Marquo:** o webhook `/webhooks/totalsoftware`,
  o `WebhookSecretGuard`, as variáveis `TOTALAGENDA_*` e `Tenant.externalCustomerId` foram removidos. O
  Admin só fala com este backend pela API interna de suporte (`src/internal`, HMAC — ver abaixo). A
  cobrança do TotalPousada continua no Admin e na mesma conta do Stripe.
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
- Único webhook de entrada: `POST /webhooks/stripe`, autenticado pela assinatura do Stripe sobre o corpo
  cru (sem segredo configurado → 503, nunca aceita sem verificar).
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
- **Sem smoke e2e contra Stripe real** (checkout, portal, troca de plano) — depende de uma
  conta Stripe de teste configurada, que não existe neste ambiente. Mitigação parcial:
  `StripeService` e as regras de troca de plano têm cobertura unit (Prisma mockado); falta o
  caminho ponta-a-ponta contra o Stripe de verdade. Rodar manualmente antes de mexer em
  `src/billing`/`src/webhooks/stripe-webhook.*`.

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
