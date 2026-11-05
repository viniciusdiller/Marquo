// `pnpm dev:lan`: sobe o ambiente de desenvolvimento acessível pelo celular (mesmo Wi-Fi). O navegador do celular não
// enxerga o "localhost" do computador, então a URL da API que vai para o navegador (NEXT_PUBLIC_API_URL) precisa ser o IP
// do computador na rede. Variável do processo tem prioridade sobre os arquivos de ambiente, então nenhum arquivo é alterado.
import { spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Faixas de rede doméstica/corporativa (RFC 1918). Nunca um IP público.
const PRIVATE = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
// Placas virtuais (Docker, VPN, VM) costumam aparecer antes do Wi-Fi: o Wi-Fi/Ethernet vence.
const PREFERRED_NAME = /^(en0|en1|wlan|wi-?fi|eth|ethernet)/i;
const VIRTUAL_NAME = /^(bridge|docker|veth|vmnet|vboxnet|utun|awdl|llw|lo)/i;

export function pickLanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const item of list ?? []) {
      if (item.family !== "IPv4" || item.internal || !PRIVATE.some((range) => range.test(item.address))) continue;
      const rank = PREFERRED_NAME.test(name) ? 0 : VIRTUAL_NAME.test(name) ? 2 : 1;
      candidates.push({ name, address: item.address, rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? null;
}

export const API_PORT = 3001;
export const SITE_PORT = 3000;

export function lanSetup(ip) {
  return {
    siteUrl: `http://${ip}:${SITE_PORT}`,
    apiUrl: `http://${ip}:${API_PORT}`,
    env: { NEXT_PUBLIC_API_URL: `http://${ip}:${API_PORT}` },
  };
}

export const NO_NETWORK =
  "✖ Não achei o IP do computador numa rede local (192.168.x.x, 10.x.x.x ou 172.16-31.x.x). Conecte-se ao Wi-Fi e tente de novo.";

export function main({ interfaces, run = spawn, log = console.log, env = process.env } = {}) {
  const ip = pickLanAddress(interfaces);
  if (!ip) {
    log(NO_NETWORK);
    return null;
  }
  const { siteUrl, apiUrl, env: extraEnv } = lanSetup(ip);
  log(`\n📱 Abra no celular (mesmo Wi-Fi): ${siteUrl}`);
  log(`   A API chamada pelo navegador do celular: ${apiUrl}`);
  log(`   Se o Next subir em outra porta (a ${SITE_PORT} ocupada), use a porta que ele mostrar.\n`);
  return run("pnpm", ["dev"], { stdio: "inherit", env: { ...env, ...extraEnv }, shell: process.platform === "win32" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = main();
  if (!child) process.exit(1);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 0));
}
