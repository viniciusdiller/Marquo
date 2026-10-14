# @marquo/database

Pacote compartilhado de persistência do Marquo, responsável pelo schema, migrations, seed e Prisma Client.

## Configuração local

A partir da raiz do monorepo, instale as dependências, copie o ambiente de exemplo e inicie um PostgreSQL local compatível com os valores padrão do projeto:

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

`DATABASE_URL` continua sendo a configuração prioritária. O script do Studio possui um fallback apenas para desenvolvimento local, com a mesma URL usada pelo serviço PostgreSQL do Docker.

## Prisma Studio

Execute a partir da raiz:

```bash
pnpm db:studio
```

Ou diretamente neste pacote:

```bash
pnpm --filter @marquo/database db:studio
```

O script usa um launcher Node multiplataforma: ele localiza o binário local do Prisma, funciona no Windows, macOS e Linux, informa explicitamente o schema e fornece uma URL local apenas quando `DATABASE_URL` não foi carregada. Em produção ou ambientes compartilhados, defina sempre uma URL real por variável de ambiente; o fallback não substitui configuração de deploy.

No Windows, não execute `npx prisma studio` a partir de uma pasta arbitrária. Primeiro rode `pnpm install` na raiz do monorepo e use `pnpm db:studio`; o workspace então encontrará o Prisma instalado em `packages/database`.

## Scripts

| Comando | Finalidade |
|---|---|
| `pnpm db:generate` | Gera o Prisma Client. |
| `pnpm db:migrate` | Cria e aplica migrations em desenvolvimento. |
| `pnpm db:deploy` | Aplica migrations versionadas em deploy. |
| `pnpm db:seed` | Popula o banco com dados iniciais. |
| `pnpm db:studio` | Abre o Prisma Studio com schema e URL explícitos. |
