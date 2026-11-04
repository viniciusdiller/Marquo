import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { ensureRedis, isPortOpen, MESSAGES } from "./dev-services.mjs";

const collect = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
};

test("Redis já respondendo: não chama o Docker", async () => {
  const { lines, log } = collect();
  const calls = [];
  const code = await ensureRedis({ isOpen: async () => true, run: (...args) => (calls.push(args), 0), log });
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(lines, [MESSAGES.already]);
});

test("Redis parado e Docker disponível: sobe SÓ o redis, esperando ficar saudável", async () => {
  const { lines, log } = collect();
  const calls = [];
  const code = await ensureRedis({ isOpen: async () => false, run: (cmd, args) => (calls.push([cmd, ...args]), 0), log });
  assert.equal(code, 0);
  assert.deepEqual(calls, [
    ["docker", "--version"],
    ["docker", "compose", "up", "-d", "--wait", "redis"],
  ]);
  assert.deepEqual(lines, [MESSAGES.starting, MESSAGES.started]);
});

test("sem Docker: falha com a explicação (não finge que subiu)", async () => {
  const { lines, log } = collect();
  const code = await ensureRedis({ isOpen: async () => false, run: () => null, log });
  assert.equal(code, 1);
  assert.deepEqual(lines, [MESSAGES.noDocker]);
});

test("Docker instalado mas o compose falha (Docker Desktop fechado): falha com a explicação", async () => {
  const { lines, log } = collect();
  const run = (_cmd, args) => (args[0] === "--version" ? 0 : 1);
  const code = await ensureRedis({ isOpen: async () => false, run, log });
  assert.equal(code, 1);
  assert.deepEqual(lines, [MESSAGES.starting, MESSAGES.dockerFailed]);
});

test("isPortOpen enxerga uma porta aberta e uma fechada de verdade", async () => {
  const server = net.createServer().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  assert.equal(await isPortOpen(port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortOpen(port), false);
});
