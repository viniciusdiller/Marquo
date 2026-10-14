# Marquo - Regras do Sistema, Segurança e Data-Layers

Este documento consolida as regras de negócio, funcionamento dos data-layers e padrões de segurança inflexíveis do sistema Marquo. Este arquivo funciona como regras base para agentes de IA interagindo com este repositório, garantindo que nenhum padrão seja esquecido durante manutenções ou novas implementações.

## 1. Stack e Camadas (Data-Layers)
- **Monorepo**: Turborepo + pnpm workspaces.
- **Backend (`apps/backend`)**: NestJS 10, Express, Passport JWT, class-validator, Luxon.
- **Frontend (`apps/frontend`)**: Next.js 16 (App Router), React 19, Tailwind v4, NextAuth v5 beta, Zod.
- **Banco de Dados (`packages/database`)**: PostgreSQL 16 + Prisma 5.

### Modelagem Principal (Data-Layers)
- **Tenant**: Entidade raiz (`Tenant`). Absolutamente todos os dados de estabelecimentos são isolados por `tenantId`.
- **Atores e Identidades**:
  - `User` (Staff): Donos (`OWNER`), Recepção (`RECEPTIONIST`) e Profissionais (`PROFESSIONAL`). Login independente.
  - `Client`: Ficha de CRM do cliente local atrelado unicamente a um tenant.
  - `Consumer`: Identidade global (cross-salão) dos clientes (identificador principal é o telefone). O `ConsumerTenantLink` liga consumidores ao respectivo `Client` em cada salão.
- **Agendamento**: `Appointment` é o agregado do atendimento. Pode conter vários serviços via `AppointmentItem`.
- **Caixa, PDV e Estoque (M3)**: 
  - `Ticket` (comanda): Liga-se a `Appointment` opcionalmente. Contém itens (`TicketItem`).
  - `StockMovement`: Estoque é derivado, entradas e saídas explícitas (IN, OUT, ADJUSTMENT, SALE).
  - Pagamentos e Caixas: `Payment` e `CashRegister`.
- **Comissões e Financeiro (M4)**: 
  - Comissões por serviço (`CommissionRule`). Lançamentos de crédito gerados no fechamento (`CommissionEntry`) e repasses efetivamente pagos (`CommissionPayout`).
  - Lançamentos financeiros via `FinancialEntry` vinculados a categorias de caixa (`FinancialCategory`).
- **Marketplace (M5)**: Exposição de estabelecimentos (`TenantCategory`, `ServiceCategory`) e avaliações (`Review`).

## 2. Segurança (NÃO NEGOCIÁVEL)
1. **Proteção Anti-IDOR (Isolamento de Tenant)**:
   - **TODA** query de recurso de negócio deve usar `tenantId` no banco (ex: `findFirst({ where: { id, tenantId } })`). NUNCA faça `findUnique` por ID para checar a permissão depois no código JavaScript. O filtro tem que ocorrer na query no banco de dados.
   - Filtre por `clientId` quando se tratar de dados de um cliente logado.
2. **Confiança Zero no Frontend (Nunca use o client-side como fonte da verdade)**:
   - Valores como `priceCents` e `discount` NUNCA podem ser aceitos diretamente do body payload sem validação ou limites derivados do servidor. Os preços do catálogo são consultados no momento em que o item é adicionado/faturado.
   - Qualquer valor que interfira em dinheiro, permissão, papéis, regras, limites ou comissões precisa de bound-check no lado servidor via query restrita.
3. **Escopo e Papéis (Roles)**:
   - O papel de `PROFESSIONAL` obriga que o ID da query reflita o acesso estrito aos dados que o competem. O service injeta o próprio `professionalId` nas condições (`WHERE`).
4. **Injeção SQL e Validação de Inputs**:
   - Todo acesso se faz pelo Prisma Client. SQLs cruas só com template string (`pg_advisory_xact_lock(hashtext(${id}))`), NUNca através de `$queryRawUnsafe` com variáveis embutidas.
   - Todas as portas de entrada (Bodies, Queries, Params) devem passar por validação com classe (`ValidationPipe`, `class-validator`) onde chaves não whitelistadas são bloqueadas e geram HTTP 400.
5. **Segurança de Autenticação e Sessões**:
   - Sessões dos staff (`User`) baseadas em JWT curto e Refresh Tokens persistidos com ROTAÇÃO ESTRITA por família. Tokens reutilizados revogam a família toda. O campo `isActive` do usuário é validado a cada chamada HTTP do backend (mesmo o token sendo válido, se estiver desativado ele não entra).
   - Clientes finais (`Consumer`) não se cruzam com guards de Staff. Possuem sistema próprio, logado em `/entrar`.

## 3. Regras de Negócio Inflexíveis e Lógica Crítica
1. **Lógica de Comissões**:
   - As comissões incidem sobre o valor **BRUTO** do item faturado, *antes* de qualquer desconto da comanda.
   - O sistema **não trabalha com conceito de fechamento de período de comissões**. O saldo é vivo e derivado de: soma do que tem em `CommissionEntry` menos a soma das devidas `CommissionPayout`.
   - Modificações em regras de comissão só têm efeitos em atendimentos e comissões *futuros*.
2. **Billing e Preços**:
   - A fonte única de verdade dos limites de planos mora em `PLAN_CATALOG` (dentro de `shared-types`). O valor trafegado do checkout não parte do cliente (o cliente informa apenas o `tier`).
3. **Bloqueio Concorrente (Race Conditions)**:
   - Todo fechamento/criação e pagamento de comandas, estoques e repasses precisa correr em transações (`$transaction`) suportadas por avisos de bloqueio manual (ex: `pg_advisory_xact_lock`). Isso evita os clássicos bugs de double booking ou duplicar recebimento por cliques rápidos do usuário.
4. **Tempo e Localização**:
   - Todas as datas/horas lidam internamente com fuso UTC, mas para manipulação local de lógica, assume-se expressamente `America/Sao_Paulo`. Datas se movem em formato `ISO-8601`, usando a biblioteca Luxon.

## 4. Convenções e Frontend (Next.js 16)
- **Cuidado com Next.js 16**: O repositório usa Next.js 16 (App Router, Turbopack) que possui breaking changes severas em comparação a versões anteriores. Sempre consulte a documentação real gerada em `node_modules/next/dist/docs/` ou regras oficiais.
- Server Components são padrão; use `"use client"` com critério apenas se precisar de APIs de navegador ou estado/hooks (contextos).
- Todas as mutações e comunicação de forms devem ocorrer via **Server Actions** em `actions.ts`. As ações do server fazem a conversão (por exemplo, `moneyToCents` a partir da input com máscara monetária vinda do `lib/masks.ts` e `<MaskedInput>`).
- Não faça `fetch` bruto de dados autenticados. Para rotas públicas: `lib/api.ts` e `lib/marketplace-api.ts`. Para rotas autenticadas (server-side): use `lib/api-server.ts` (`authedFetch`) que embute o JWT na requisição e resolve o Client IP `x-client-ip`.
- Reuso: Sempre reuse instâncias de API Clients como `marketplaceApi` ao invés de codificar requisições do zero no componente.
- O Frontend **não é a fonte de verdade**: Não aplique validação de regras de negócio estritamente no front. O backend sempre deve revalidar permissões, mascarar/sanitizar (bytes NUL, IDs via URL) e proteger.
- Dinheiro é SEMPRE `Cents` (`Int`) no transporte.
- Duração é em minutos (`Int`). Horários do dia são minutos a partir de meia-noite (`startMinute` / `endMinute`).
- Erros para usuários são sempre gerados através das exceções do NestJS (`NotFoundException`, `ConflictException`, etc) sem vazar `stacktrace` e com mensagens sempre amigáveis em português do Brasil.

## 5. Regras de Testes e Qualidade (Obrigatório)
1. **Regra Ouro de Testes**: Validação de segurança, tratamento de erros em limites (boundaries) e cenários críticos transacionais **têm que ter testes**. Nunca podem ser cortados por motivos de "simplicidade".
   - **SEMPRE que houver uma nova feature, adicione testes unitários para ela**.
   - Os testes **precisam garantir e simular tentativas de falhas de segurança**: Teste acessos por todos os papéis (roles) possíveis e simule a tentativa de um dono (tenantId) acessar ou manipular dados de um recurso atrelado a outro dono.
2. **Backend (Jest)**:
   - Services cobertos com testes unitários usando o Prisma mockado (`*.spec.ts` ao lado do arquivo com `jest` + `ts-jest`).
3. **E2E e Smoke Tests**:
   - Para fluxos vitais do backend que envolvem banco/roteamento/Auth real e fluxo de dinheiro, rodar os **Smoke E2E** localizados em `apps/backend/scripts/smoke/` (`functional.mjs` e `rotation.mjs`) usando o schema e2e isolado. Executar obrigatoriamente antes de mexer em DTOs, Auth ou manipulação de dinheiro.
4. **Frontend (Vitest + RTL + Playwright)**:
   - Os testes e2e usam Playwright (`apps/frontend/e2e/`).
   - Testes de componentes usam Vitest e React Testing Library (`apps/frontend/src/**/*.test.tsx`).
   - Rotas de alto risco do dashboard possuem cobertura para confirmações destrutivas. Sempre que adicionar uma função crítica ou criar novas ações destrutivas, expanda a suíte do frontend. Ausência de spec em uma funcionalidade legada não é permissão para não testar a nova feature equivalente.

## 6. Fluxo Git e Versionamento (Separação Rígida por Camada e Pipeline Pré-Commit)
- **Pipeline Mandatório Pré-Commit (Ordem Inflexível):**
  1. **Execução Real dos Testes:** Todos os testes unitários (backend e frontend com matriz completa de roles e IDOR) devem ser **de fato executados via terminal e passar 100%**.
  2. **Execução da Build:** Somente após os testes passarem, rodar a `build` dos pacotes afetados (ex.: `pnpm --filter ... build` ou `pnpm build`) e garantir zero erros de compilação/tipagem.
  3. **Commit Atômico:** Somente com testes e build 100% verdes, prosseguir para os commits. Se houver qualquer falha, NADA é commitado até a correção.
- **Sempre crie uma branch** para uma nova feature (ex: `feat/...`, `fix/...`) e só realize o merge na main quando solicitado.
- **SEPARAÇÃO ESTRITA DE COMMITS POR CAMADA (Zero agrupamento multi-camada):**
  - **É TERMINANTEMENTE PROIBIDO commitar Database, Backend e Frontend juntos no mesmo commit**, mesmo que façam parte da mesma feature.
  - O fatiamento dos commits deve ser feito estritamente por responsabilidade de pasta/módulo:
    1. **Database / Schema:** Apenas arquivos de `packages/database/...` (ex: `feat(db): add min and max lead time to tenant schema`).
    2. **Backend:** Apenas arquivos de `apps/backend/...` (ex: `feat(api): enforce lead time constraints in availability service`).
    3. **Frontend:** Apenas arquivos de `apps/frontend/...` (ex: `feat(frontend): add lead time inputs to profile settings form`).
    4. **Testes:** Commits dedicados para testes unitários ou e2e (ex: `test(api): ...`).
- Ao finalizar os testes e a feature na branch local, envie-a para o repositório remoto (GitHub) e aguarde o comando para prosseguir com o merge.
