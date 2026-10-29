# Exemplos de deploy

Arquivos de **exemplo** para colocar o Marquo no ar num servidor Linux com nginx e PM2. Nenhum contém segredo: copie,
troque os valores marcados com `TROQUE` e valide antes de usar.

| Arquivo | Para quê |
|---|---|
| [`nginx.marquo.example.conf`](nginx.marquo.example.conf) | Proxy HTTPS do site e da API, com `X-Forwarded-For` sobrescrito e restrição por IP |
| [`ecosystem.config.example.cjs`](ecosystem.config.example.cjs) | Processos do PM2 (backend com uma única instância) |
| [`backup.example.sh`](backup.example.sh) | Backup do banco e das imagens enviadas, com cópia externa |

## Atualizar o servidor (a cada versão nova)

```bash
cd /var/www/marquo                       # pasta do projeto
git pull
pnpm install --frozen-lockfile
# apps/frontend/.env precisa estar pronto ANTES do build: as variáveis NEXT_PUBLIC_* são gravadas no site aqui
pnpm build
pnpm --filter @marquo/database db:deploy # aplica as migrations novas no banco
pm2 restart ecosystem.config.cjs --update-env
```

Depois confira `pm2 logs` por alguns segundos e abra o site.

## nginx

1. Copie o arquivo para `/etc/nginx/sites-available/marquo`, ative com um link em `sites-enabled` e troque os IPs
   marcados: o seu (para `/plataforma`) e o do Admin (para `/internal/`).
2. `sudo nginx -t && sudo systemctl reload nginx`.
3. Confira de fora do servidor: `/plataforma` de outro IP deve dar 403, e `http://` deve redirecionar para `https://`.

Variáveis que combinam com este proxy:

| App | Variável | Valor |
|---|---|---|
| backend | `TRUST_PROXY_HOPS` | `1` |
| frontend | `TRUSTED_PROXY_HOPS` | `1` (é o padrão) |
| backend e frontend | `CLIENT_IP_SECRET` | o mesmo valor nos dois (`openssl rand -hex 32`) |
| frontend | `AUTH_URL` | `https://marquo.com.br` |
| frontend | `AUTH_TRUST_HOST` | `true` |

Feche as portas 3001 e 3004 no firewall: só o nginx deve alcançá-las (`ufw allow 80,443/tcp`, e nada de 3001/3004).

## PM2

```bash
cp deploy/ecosystem.config.example.cjs ecosystem.config.cjs   # ajuste APP_DIR
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup            # sobe sozinho quando o servidor reiniciar
pm2 install pm2-logrotate          # impede o log de encher o disco
```

Configure o mesmo `REDIS_URL` em todos os backends (Redis 7+, rede privada, autenticação e TLS quando disponível).
Redis precisa de persistência, política `noeviction` e monitoramento: se ficar indisponível, os controles de segurança
respondem 503 em vez de usar contadores locais. Reiniciar Redis sem persistência perde desafios e histórico anti-replay.
Na migração, desligue as instâncias antigas antes de iniciar as novas: o estado em memória anterior não é transferido.

Os exemplos continuam com uma instância por padrão. Para múltiplos servidores, compartilhe também os uploads; a
exportação tem trava apenas por processo e deve ter concorrência limitada na borda. Configure o pool PostgreSQL por
instância (`connection_limit` na DATABASE_URL) para o total de réplicas caber no limite do banco.

## Backup e restauração

1. Instale o script: `sudo cp deploy/backup.example.sh /usr/local/bin/marquo-backup.sh && sudo chmod 700 /usr/local/bin/marquo-backup.sh`.
2. Crie `~/.pgpass` (modo `600`) com `localhost:5432:BANCO:USUARIO:SENHA`, para o `pg_dump` não pedir senha.
3. Configure a cópia **fora do servidor** (por exemplo, um bucket com `rclone config`) e exporte `OFFSITE_REMOTE`.
4. Agende no cron (`sudo crontab -e`), por exemplo todo dia às 3h:
   ```
   0 3 * * * OFFSITE_REMOTE=meubucket:marquo-backups /usr/local/bin/marquo-backup.sh >> /var/log/marquo-backup.log 2>&1
   ```

**Teste a restauração antes de precisar dela**, num banco descartável (nunca em cima do de produção):

```bash
createdb marquo_restore_teste
pg_restore --no-owner --dbname=marquo_restore_teste /var/backups/marquo/db-AAAAMMDD-HHMMSS.dump
psql marquo_restore_teste -c 'SELECT count(*) FROM "Tenant";'
dropdb marquo_restore_teste
```

As imagens: `tar -xzf uploads-AAAAMMDD-HHMMSS.tar.gz -C /pasta/de/teste` e confira que os arquivos abrem.


## Fila de notificações

Antes de publicar: suba Redis, configure `REDIS_URL`, aplique `db:deploy`, gere o Prisma client e reinicie o backend.
A migration é aditiva: cria `NotificationOutbox`; não envia e-mails nem altera agendamentos existentes.

Agendamento, cancelamento e remarcação gravam o snapshot da notificação na mesma transação do evento. Workers em
cada backend usam `FOR UPDATE SKIP LOCKED`, leases de 120 segundos e tokens de posse. Um worker interrompido deixa
o job para outra instância recuperar. O envio usa a mesma `Idempotency-Key` no Resend em cada tentativa.

A cada cinco segundos o worker drena lotes de cinco, por até 40 segundos; o scanner de lembretes roda a cada minuto
com lotes de 500, incluindo agendamentos anteriores à migration. `reminderSentAt` só é preenchido após sucesso.
Atendimentos criados com menos de 24 horas continuam dispensando lembrete, pois recebem confirmação imediata.
Lembretes de versões antigas da agenda ou cancelados são descartados antes do envio.

Falhas têm espera progressiva de 30 segundos até uma hora, no máximo oito tentativas e 23 horas após a primeira
tentativa (a [chave do Resend vale por 24 horas](https://resend.com/changelog/idempotency-keys)). Não há garantia de exactly-once além da janela do provedor.
Jobs `FAILED` exigem investigação; não os reenvie automaticamente com uma nova chave, pois o provedor pode ter
aceitado o primeiro envio. Requisições já em trânsito podem terminar durante um cancelamento/remarcação.

Monitore a fila e alerte sobre `FAILED`, jobs antigos e `PROCESSING` com lease expirado:

```sql
SELECT status, count(*), min("availableAt") AS oldest
FROM "NotificationOutbox" GROUP BY status;
```

O payload contém dados pessoais necessários ao template. É removido em `SENT`/`SKIPPED`, e registros são apagados
em cascata com o agendamento. Exclua payloads de jobs `FAILED` investigados e de jobs sem provedor configurado após
seu prazo operacional. Nunca exponha a tabela ou seu payload em endpoints públicos/logs.

## Testes de integração

Use apenas PostgreSQL/Redis descartáveis, sem tokens reais de e-mail/pagamento. O teste remove somente os tenants
que criou e não executa reset/truncate. Aplique todas as migrations antes:

```bash
export DATABASE_URL=postgresql://totalagenda_app:totalagenda_dev@localhost:5432/marquo_integration
export REDIS_URL=redis://localhost:6379/1
pnpm --filter @marquo/database db:generate
pnpm --filter @marquo/database db:deploy
INTEGRATION_TESTS=1 pnpm --filter backend test:integration
```

O job `PostgreSQL and Redis integration` do CI cobre concorrência de reserva/fechamento, replays de pagamento,
isolamento entre tenants, rollback da outbox, recuperação/retry de jobs e estado compartilhado entre dois clientes.
Configure este job e o job `verify` como checks obrigatórios na proteção da `main` (configuração do GitHub).
