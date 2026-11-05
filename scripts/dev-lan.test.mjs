import { test } from "node:test";
import assert from "node:assert/strict";
import { lanSetup, main, NO_NETWORK, pickLanAddress } from "./dev-lan.mjs";

const iface = (address, over = {}) => [{ family: "IPv4", internal: false, address, ...over }];

test("escolhe o IP do Wi-Fi (en0) e ignora loopback, IPv6 e placas virtuais", () => {
  const ip = pickLanAddress({
    lo0: iface("127.0.0.1", { internal: true }),
    bridge100: iface("192.168.64.1"),
    utun3: iface("10.8.0.2"),
    en0: iface("192.168.3.71"),
    en5: [{ family: "IPv6", internal: false, address: "fe80::1" }],
  });
  assert.equal(ip, "192.168.3.71");
});

test("aceita as três faixas privadas (192.168, 10, 172.16–31) e recusa IP público ou 172 fora da faixa", () => {
  assert.equal(pickLanAddress({ en0: iface("10.0.0.5") }), "10.0.0.5");
  assert.equal(pickLanAddress({ en0: iface("172.20.1.9") }), "172.20.1.9");
  assert.equal(pickLanAddress({ en0: iface("172.32.1.9") }), null);
  assert.equal(pickLanAddress({ en0: iface("200.10.20.30") }), null);
  assert.equal(pickLanAddress({}), null);
});

test("sem Wi-Fi nomeado, usa a primeira placa real; placa virtual só se for a única", () => {
  assert.equal(pickLanAddress({ docker0: iface("172.17.0.1"), tailnet: iface("10.1.1.1") }), "10.1.1.1");
  assert.equal(pickLanAddress({ docker0: iface("172.17.0.1") }), "172.17.0.1");
});

test("a API do navegador aponta para o IP da rede, na porta da API", () => {
  assert.deepEqual(lanSetup("192.168.3.71"), {
    siteUrl: "http://192.168.3.71:3000",
    apiUrl: "http://192.168.3.71:3001",
    env: { NEXT_PUBLIC_API_URL: "http://192.168.3.71:3001" },
  });
});

test("main: sobe `pnpm dev` com NEXT_PUBLIC_API_URL no ambiente do processo (sem tocar em arquivo) e preserva o resto", () => {
  const lines = [];
  const calls = [];
  const child = main({
    interfaces: { en0: iface("192.168.3.71") },
    log: (l) => lines.push(l),
    run: (cmd, args, opts) => (calls.push({ cmd, args, opts }), { fake: true }),
    env: { PATH: "/bin", NEXT_PUBLIC_API_URL: "http://localhost:3001" },
  });
  assert.deepEqual(child, { fake: true });
  assert.equal(calls[0].cmd, "pnpm");
  assert.deepEqual(calls[0].args, ["dev"]);
  assert.equal(calls[0].opts.env.NEXT_PUBLIC_API_URL, "http://192.168.3.71:3001");
  assert.equal(calls[0].opts.env.PATH, "/bin");
  assert.match(lines.join("\n"), /http:\/\/192\.168\.3\.71:3000/);
});

test("main: sem rede local, avisa e NÃO sobe nada", () => {
  const lines = [];
  const calls = [];
  const child = main({ interfaces: { lo0: iface("127.0.0.1", { internal: true }) }, log: (l) => lines.push(l), run: (...a) => calls.push(a) });
  assert.equal(child, null);
  assert.deepEqual(calls, []);
  assert.deepEqual(lines, [NO_NETWORK]);
});
