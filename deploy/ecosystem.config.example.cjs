// Exemplo de PM2 para o Marquo. Copie para a RAIZ do projeto no servidor como ecosystem.config.cjs, ajuste
// APP_DIR e suba com:  pm2 start ecosystem.config.cjs && pm2 save
//
// Pontos que não podem mudar:
//  - `cwd` de cada app: o Next e o Nest leem o .env da pasta onde sobem. Em outra pasta, o app sobe SEM as variáveis
//    (e o login quebra com UntrustedHost, por exemplo).
//  - Backend com UMA instância (`instances: 1`, modo fork): lockout de login, anti-replay da API interna e o throttle de
//    cadastro ficam na memória do processo. Em cluster, cada instância teria o seu contador.
//  - Nada de segredo aqui: eles ficam nos .env de cada app (que não vão para o git).
const APP_DIR = "/var/www/marquo"; // TROQUE pela pasta do projeto no servidor

module.exports = {
  apps: [
    {
      name: "marquo-backend",
      cwd: `${APP_DIR}/apps/backend`,
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
      kill_timeout: 10000,
    },
    {
      name: "marquo-frontend",
      cwd: `${APP_DIR}/apps/frontend`,
      script: "node_modules/next/dist/bin/next",
      args: "start", // a porta vem do PORT no apps/frontend/.env (ex.: 3004)
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
    },
  ],
};
