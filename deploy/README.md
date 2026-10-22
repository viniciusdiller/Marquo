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

Mantenha **uma instância** do backend: o bloqueio de login por tentativas e a proteção contra repetição da API
interna vivem na memória do processo.

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
