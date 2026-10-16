# Roadmap — paridade de funcionalidade com o Trinks

Objetivo: Marquo como alternativa ao Trinks — agenda + gestão white-label para o
estabelecimento **e** marketplace central de descoberta para o consumidor final.
**Sem integração de pagamento nesta fase** (PDV registra formas de pagamento e valores,
mas não processa transação; PSP fica para depois).

Cada milestone é entregável sozinho: schema + migração + backend + frontend + testes
unitários + seed atualizado, build (`turbo run build`) e `turbo run test` verdes.

## Progresso

- **M0 — concluída.** `Appointment`/`AppointmentItem`, migração com backfill, `RECEPTIONIST`,
  transições de status, criação por staff, `/appointments/*`.
- **M1 — concluída.** `GET /appointments/calendar` + tela `/dashboard/agenda` (grade dia
  por profissional, criar por slot, painel lateral com status/remarcar/cancelar, filtro).
  _Deferido:_ arrastar/redimensionar direto na grade (hoje remarca pelo painel) e visão
  semana — não bloqueiam o uso.
- **M2 — concluída.** `Client` rico + CRUD + timeline; `IntakeForm`/`IntakeResponse` +
  telas `/dashboard/clientes` e `/dashboard/fichas`.
  _Deferido:_ pacotes/assinaturas de serviço (`ServicePackage`/`ClientPackage`) e o
  relatório de aniversariantes/sem-retorno — movidos para um "M2.1" ou para a M3.
- **M3 — concluída.** `Product`/`StockMovement` (saldo derivado), `Ticket`/`TicketItem`
  (serviço/produto/avulso), `Payment` (só registro, sem PSP), `CommissionRule`/`CommissionEntry`,
  `CashRegister`/`CashMovement`. Fechar comanda gera baixa de estoque + comissão na mesma
  transação. Telas `/dashboard/comandas`, `/produtos`, `/caixa`, `/comissoes`.
  _Deferido:_ devolução/estorno de pagamento, transferência de item entre comandas,
  relatório de margem por produto, exportação CSV. A auditoria de UX de 2026-09
  (dashboard do dono) revisou a lógica de prioridade de `CommissionRule` (regra mais
  específica vence, sem empilhar) e decidiu só explicar melhor na tela, não
  reestruturar — mesma decisão pro DRE/CMV do Financeiro (M4) e pro form-builder
  genérico de Fichas (M2): são features reais, só mal explicadas, não candidatas a
  remoção nesta leva.
- **M4 — concluída.** `FinancialCategory` (árvore, padrões auto) + `FinancialEntry` (regime
  de caixa, previsto×realizado). Fechar comanda → receita `PAID` automática. Comissão: faturamento
  bruto/líquido, repasse e saldo por profissional são calculados na hora
  (`GET /commissions/earnings`); "Registrar repasse" gera a despesa `PAID` (`CommissionPayout`).
  O antigo "fechar comissões do período" saiu (2026-10): não era idempotente. Relatórios: fluxo de caixa por
  categoria, DRE simples (receita − CMV via `Product.costCents` − despesas), a pagar/receber
  com aging, overview do mês. Sem PSP/conta bancária/conciliação — tudo pela gestão. Tela
  `/dashboard/financeiro`.
  _Deferido:_ conciliação bancária, múltiplas contas, centro de custo, projeção de fluxo,
  nota fiscal, exportação contábil (SPED).
- **M5 — concluída.** `Consumer` (identidade global, login próprio, v1 sem OTP) +
  `ConsumerTenantLink`; `ServiceCategory`/`TenantCategory`; `Review` 1:1 com atendimento
  concluído + moderação (ocultar/denunciar). Busca pública por cidade/categoria/texto com
  ordenação por distância (bounding box) ou nota; perfil público `/descobrir/[slug]` com
  SSR + JSON-LD; portal `/descobrir/avaliar` para o consumidor avaliar; `/dashboard/marketplace`
  (opt-in, geo, categorias, moderação); `sitemap.ts`.
  _Deferido:_ OTP no login do consumidor (obrigatório antes do go-live real), agendamento
  ponta-a-ponta pelo portal com identidade `Consumer` (hoje o botão leva ao wizard público
  do tenant), app nativo, resposta pública do dono à avaliação, denúncia pelo consumidor.

## Transversal — ainda pendente
Infra de notificação (WhatsApp/SMS/e-mail com fila e templates), pass de identidade visual
própria, refino de RBAC, exportação CSV de relatórios. E o `backend#lint` quebrado por
config ESLint 9 desatualizada (pré-existente na `main`).

## Estado inicial (antes da M0)

Já existe: perfil público do tenant, wizard de agendamento público, lista de espera,
CRUD de profissionais/serviços/horários, bloqueios de horário, auth staff + cliente,
espelho de billing. `Booking` = 1 serviço por agendamento.

## M0 — Fundação: agregado `Appointment` + recepção

Refactor que todo o resto depende. Fazer e **revisar antes** de construir M1–M5 em cima.

- `Booking` → `Appointment` (agregado) + `AppointmentItem` (linha: serviço, profissional,
  snapshot de preço/duração, ordem). Um atendimento pode ter N serviços.
- Migração com backfill: cada `Booking` vira 1 `Appointment` + 1 `AppointmentItem`.
- `AppointmentStatus`: `SCHEDULED` → `CONFIRMED` → `IN_SERVICE` → `COMPLETED`;
  `NO_SHOW`, `CANCELED`. Transições validadas no service.
- `Role.RECEPTIONIST`: enxerga agenda de todos os profissionais, cria/edita atendimento,
  não mexe em billing/config.
- Endpoint de criação manual pela recepção (walk-in): cliente opcional / cadastro rápido.
- Anti-overlap continua por `EXCLUDE` + advisory lock, agora no nível do item.
- (`manageToken` foi removido depois: gerenciar agendamento passou a exigir login em /minha-conta.)

## M1 — Agenda Pro

- Endpoints de calendário: intervalo dia/semana, agrupado por profissional, com blocos,
  atendimentos e horários de trabalho num payload só.
- Reagendar = mover/redimensionar (drag/resize no front → PATCH start/professional).
- Tela de agenda no dashboard: grade dia/semana por coluna de profissional, arrastar e
  redimensionar, criar atendimento clicando num slot vazio, painel lateral do atendimento
  (status, itens, cliente, ações).
- Cadastro rápido de cliente inline.
- Filtro por profissional / serviço.

## M2 — Cliente 360

- `Client` rico: e-mail, `birthDate`, CPF opcional, `notes`, `tags[]`, origem.
- Timeline de atendimentos do cliente (histórico + futuros + no-shows).
- Anamnese: `IntakeForm` (schema de campos em JSON por tenant) + `IntakeResponse` por
  cliente/atendimento.
- Pacotes e assinaturas de serviço (`ServicePackage`, `ClientPackage` com saldo de
  sessões) — consumidos ao fechar atendimento.
- Aniversariantes do mês / clientes sem retorno há N dias (base para marketing depois).

## M3 — Comanda + PDV + Estoque + Comissão

- `Product` + `StockMovement` (entrada, saída, ajuste, venda) — saldo derivado.
- `AppointmentItem` passa a aceitar `productId` além de `serviceId`.
- `Ticket` (comanda) por atendimento ou avulsa: itens + descontos + `Payment[]`
  (`PaymentMethod` enum: dinheiro, débito, crédito, pix, outros — só registro).
- `CashRegister` (sessão de caixa): abrir com fundo de troco, sangria/suprimento, fechar
  com conferência; relatório de fechamento.
- `CommissionRule` por profissional (× serviço/produto/categoria, % ou fixo) +
  `CommissionEntry` gerada ao fechar comanda; relatório por profissional/período.
  Desde 2026-10: tela "Comissões e repasses" com bruto, descontos, líquido, repasse, sobra da casa
  e saldo a repassar por profissional, sempre visível (sem fechar período).

## M4 — Financeiro

- `FinancialCategory` (receita/despesa, árvore).
- `FinancialEntry` / lançamentos: receitas vindas de comanda + despesas manuais,
  contas a pagar/receber com vencimento e baixa.
- Fluxo de caixa por período, DRE simples (receita − custo − despesa), previsto × realizado.
- Dashboard financeiro no painel do dono.

## M5 — Marketplace de descoberta

- `Consumer` — identidade **global** (não escopada por tenant), login próprio; `Client`
  por tenant vira um vínculo `ConsumerTenantLink`. LGPD: base própria, consentimento,
  export/delete.
- Estabelecimento: `latitude`/`longitude`, `ServiceCategory[]`, cidade/bairro, faixa de
  preço; opt-in de listagem no marketplace.
- Busca: por cidade/bairro/categoria/serviço + ordenação por distância (bounding box no
  Postgres; PostGIS só se precisar de raio real).
- `Review` (nota + texto) atrelada a `Appointment` concluído; moderação básica
  (denúncia, ocultar); média e contagem no perfil.
- Portal central com nossa marca: `/descobrir`, `/estabelecimento/[slug]`, agendamento
  ponta-a-ponta pelo portal (reusa wizard, identidade = `Consumer`).
- SEO: SSR + sitemap + dados estruturados dos estabelecimentos listados.

## Transversal (fora de milestone, conforme necessário)

- Notificações: infra de envio (WhatsApp/SMS/e-mail) com fila e templates; lembrete de
  atendimento, confirmação, pesquisa pós-atendimento.
- RBAC: refinar permissões por role à medida que telas de gestão crescem.
- Relatórios: exportação CSV, agendados por período.
- Identidade visual: pass de design próprio (não copiar layout do Trinks — só paridade
  de função).

## Billing dentro do Marquo (em andamento)

O Marquo cadastra, dá trial e (em breve) cobra sozinho; o Admin-TotalSoftware vira back-office.
**Mudança de rumo (2026-10-14): o Stripe foi removido e o provedor passa a ser o Mercado Pago.** Decisões:
produtos independentes (sem SSO), trial de 14 dias sem cartão, sem provedor de e-mail na v1, bloqueio total
pós-trial/cancelamento. Enquanto o Mercado Pago não entra, a equipe libera acesso pelo painel da plataforma
(cortesia por plano e data, extensão de teste, cupons de campanha).

- [x] Fase 0 (Admin) — sessão do painel assinada, sem credencial padrão, limite de tentativas no login.
- [x] Fase 1 — `POST /public/signup` + `/cadastro`, trial de 14 dias, e-mail de User em minúsculas,
  slugs reservados, CTAs apontando para `/cadastro`.
- [x] Fase 1b — IP do visitante assinado (HMAC) nas chamadas server-side; throttle por IP mede o visitante.
- [x] Fase 1c — aceite versionado dos Termos e da Privacidade (`LEGAL_DOCS_VERSION`, `User.termsAcceptedAt`/`termsVersion`)
  e páginas `/termos` e `/privacidade` **em rascunho**. Pendente (usuário): preencher as lacunas, revisão
  jurídica, `LEGAL_DRAFT = false` e nova `LEGAL_DOCS_VERSION`.
- [x] ~~Fase 2 — Stripe no backend~~ **Removida** (2026-10-14): Checkout, Portal, webhook, troca de plano, `StripeEvent` e
  colunas de id do Stripe saíram. Ficaram: exclusão de profissional só sem histórico e as mensagens do guard por estado.
- [x] ~~Fase 3 — UI de assinatura/troca de plano~~ `/dashboard/plano` agora só informa (estado, planos, "fale com a equipe").
- [x] **Fase 6 — Mercado Pago** (código e testes prontos; **falta o teste contra o provedor real com credenciais TEST-**):
  cartão recorrente (preapproval) e Pix mensal, cupom abatendo a primeira cobrança, webhook com releitura do estado,
  sincronização pela tela e tarefa horária, cancelamento, "salão cai" no Pix vencido e troca de plano (bloqueia
  downgrade se a equipe ativa não couber). Pendente: troca com cobrança proporcional.
- [x] Painel da plataforma (`/plataforma`): métricas, negócios, assinaturas, usuários, auditoria; criar negócio,
  suspender/reativar, estender teste, plano de cortesia, telefone do dono e cupons.
- [x] Fase 4 (Marquo) — `webhooks/totalsoftware`, `WebhookSecretGuard`, `TOTALAGENDA_*` e `Tenant.externalCustomerId`
  removidos (`/auth/set-password` mantido para a Fase 5). Pendente nos outros repos: tirar o Marquo do
  Admin (checkout, provisionamento, página `/totalagenda`) e apontar o "Assinar" do site para `/cadastro`.
- [x] Fase 5 — API interna com HMAC (`src/internal`) + página `/suporte-totalagenda` no Admin (buscar tenant, gerar link de redefinição), com auditoria e sessões antigas revogadas.

Backlog: verificação de e-mail (`User.emailVerifiedAt` já existe) e recuperação de senha por e-mail
quando houver provedor; OTP; Pix/boleto e NFS-e; downgrade só no fim do período; termos de uso e
política de privacidade; throttle das páginas públicas renderizadas no servidor (IP do servidor Next); módulo de cobrança compartilhado entre produtos.
