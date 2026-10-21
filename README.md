# Marquo

Sistema de **agendamento e gestão para salões, barbearias e prestadores de serviço por horário**.

Cada negócio (tenant) ganha uma **página pública própria** para receber agendamentos e um **painel de gestão**
completo. Os clientes finais agendam, remarcam e acompanham seus compromissos em uma conta única, válida em todos os
estabelecimentos.

> Produto de **VALLE CONSULTORIA E NEGOCIOS LTDA** (CNPJ 64.576.289/0001-74).
> Código proprietário: todos os direitos reservados.

## O que o Marquo faz

**Para o estabelecimento (painel em `/dashboard`)**

- **Agenda** por profissional, com criação por horário, remarcação, cancelamento e bloqueios (folgas e férias)
- **Clientes**: ficha completa, histórico, observações, etiquetas e fichas de anamnese
- **Comandas e caixa**: serviços, produtos e itens avulsos, descontos, formas de pagamento e controle de caixa
- **Estoque** de produtos, com baixa automática na venda
- **Comissões e repasses** por profissional
- **Financeiro**: lançamentos, fluxo de caixa, DRE simples e contas a pagar e a receber
- **Equipe** com papéis (dono, recepção e profissional) e limites por plano
- **Página pública** personalizável (logo, cor, galeria, equipe, avaliações) e presença no marketplace

**Para o cliente final**

- Busca de estabelecimentos por cidade, categoria ou proximidade, com avaliações
- Agendamento online, lista de espera e gestão dos próprios compromissos
- Confirmações e avisos por e-mail, com convite para o calendário (Google Agenda e arquivo `.ics`)

**Para a plataforma**

- Painel interno para criar negócios, aplicar cupons e planos de cortesia, suspender contas e consultar métricas
- Planos com teste gratuito de 14 dias e cobrança por cartão recorrente ou Pix (Mercado Pago)

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS 10, Passport (JWT), class-validator, Luxon |
| Frontend | Next.js 16 (App Router) + React 19, Tailwind CSS v4, NextAuth v5, Zod |
| Banco de dados | PostgreSQL 16 + Prisma 5 |
| E-mail | Resend |
| Pagamentos | Mercado Pago |
| Testes | Jest (backend), Vitest + Testing Library (frontend), Playwright (E2E) |

## Estrutura do repositório

```
apps/
  backend/        API REST em NestJS (porta 3001)
  frontend/       Site público e painel em Next.js (porta 3000)
packages/
  database/       Schema do Prisma, migrations, seed e client gerado
  shared-types/   Tipos e constantes compartilhados entre front e back
docs/
  roadmap.md      Plano de funcionalidades
```

## Rodando localmente

**Requisitos:** Node.js 20 ou superior, pnpm 9 (`corepack enable`) e Docker (para o PostgreSQL).

```bash
# 1. Banco de dados (PostgreSQL em localhost:5432)
docker compose up -d

# 2. Dependências
pnpm install

# 3. Variáveis de ambiente (veja a seção abaixo)

# 4. Migrations e dados iniciais
pnpm --filter @marquo/database db:migrate
pnpm --filter @marquo/database db:seed

# 5. Backend (:3001) e frontend (:3000)
pnpm dev
```

### Variáveis de ambiente

Cada app lê o `.env` da própria pasta. Nenhum arquivo `.env` é versionado.

| Arquivo | Para quê |
|---|---|
| `apps/backend/.env` | API: banco, JWT, URL do frontend, e-mail, pagamentos e painel da plataforma |
| `apps/frontend/.env` | Site: URL da API, segredo de sessão e URL pública |
| `packages/database/.env` | Apenas `DATABASE_URL`, usada pelo Prisma |

O arquivo [`.env.example`](.env.example) lista as variáveis do backend, com comentários sobre cada uma, e o
[`apps/frontend/.env.local.example`](apps/frontend/.env.local.example) lista as do frontend. O backend valida o
ambiente ao iniciar e **não sobe** se alguma variável obrigatória estiver faltando ou inválida.

Segredos (como `JWT_SECRET`) devem ter 32 caracteres ou mais. Gere com:

```bash
openssl rand -hex 32
```

## Testes

```bash
pnpm test                                  # todos os pacotes
pnpm --filter backend test                 # backend (Jest)
pnpm --filter frontend test                # frontend (node:test + Vitest)
pnpm --filter frontend test:e2e            # E2E (Playwright)
```

## Build e publicação

Num servidor, a partir de um checkout limpo:

```bash
pnpm install --frozen-lockfile

# Crie o apps/frontend/.env ANTES do build: as variáveis NEXT_PUBLIC_* são
# gravadas no site durante o `next build`.
pnpm build

# Aplica as migrations no banco de produção
pnpm --filter @marquo/database db:deploy
```

Depois, suba os dois processos (por exemplo, com o PM2):

```bash
pnpm --filter backend start:prod      # node dist/main, lê apps/backend/.env
pnpm --filter frontend start          # next start, lê apps/frontend/.env
```

Pontos importantes:

- O `pnpm build` gera o client do Prisma automaticamente antes de compilar o backend.
- Em produção (`NODE_ENV=production`) o backend exige variáveis adicionais; consulte o `.env.example`.
- Rode **uma única instância** do backend.
- Use um proxy reverso com HTTPS na frente dos dois processos e mantenha as portas 3000 e 3001 acessíveis apenas por ele.
- O diretório `apps/backend/uploads/` guarda as imagens enviadas pelos estabelecimentos e precisa de disco persistente
  e backup.

## Documentação

- [Roadmap](docs/roadmap.md): plano de funcionalidades e o que já foi entregue.

## Licença

Projeto proprietário. Todos os direitos reservados a VALLE CONSULTORIA E NEGOCIOS LTDA. O código está disponível
para consulta, mas não pode ser copiado, modificado ou redistribuído sem autorização por escrito.
