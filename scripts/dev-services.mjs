// Garante o Redis de pé antes do `pnpm dev`. O backend exige Redis para iniciar (estado de segurança compartilhado:
// códigos de verificação, limites de tentativa) e, sem ele, o frontend só mostra ECONNREFUSED na porta 3001. Este script
// sobe o serviço `redis` do docker-compose.yml se ele ainda não estiver respondendo. Só serve para desenvolvimento local.
import { spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

export const REDIS_HOST = "127.0.0.1";
export const REDIS_PORT = 6379;

// true se algo já aceita conexão na porta (Redis do compose, do Homebrew, de outro projeto...).
export function isPortOpen(port, host = REDIS_HOST, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export const MESSAGES = {
  already: `✔ Redis já está respondendo em ${REDIS_HOST}:${REDIS_PORT}.`,
  starting: "→ Subindo o Redis (docker compose up -d --wait redis)...",
  started: "✔ Redis no ar.",
  noDocker:
    "✖ O backend precisa de Redis e o Docker não foi encontrado.\n" +
    "  Instale o Docker Desktop e abra-o, ou instale o Redis direto: brew install redis && brew services start redis",
  dockerFailed:
    "✖ Não consegui subir o Redis pelo Docker. O Docker Desktop está aberto?\n" +
    "  Abra o Docker Desktop e rode `pnpm dev` de novo (ou veja o erro acima).",
};

// `run` é injetável para testar sem Docker de verdade. Devolve o código de saída do processo (ou null se não existir).
export function defaultRun(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return result.error ? null : result.status;
}

export async function ensureRedis({ isOpen = isPortOpen, run = defaultRun, log = console.log } = {}) {
  if (await isOpen(REDIS_PORT)) {
    log(MESSAGES.already);
    return 0;
  }

  const hasDocker = run("docker", ["--version"]) === 0;
  if (!hasDocker) {
    log(MESSAGES.noDocker);
    return 1;
  }

  log(MESSAGES.starting);
  // Só o Redis: o Postgres do compose não é necessário se você já usa outro banco local.
  const code = run("docker", ["compose", "up", "-d", "--wait", "redis"]);
  if (code !== 0) {
    log(MESSAGES.dockerFailed);
    return 1;
  }
  log(MESSAGES.started);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await ensureRedis());
}
