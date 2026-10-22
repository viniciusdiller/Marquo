import { ConflictException, NotFoundException } from "@nestjs/common";
import { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { DataExportService } from "./data-export.service";

const MODELS = [
  "professional",
  "service",
  "client",
  "appointment",
  "waitlistEntry",
  "intakeForm",
  "intakeResponse",
  "product",
  "stockMovement",
  "ticket",
  "financialCategory",
  "financialEntry",
  "commissionPayout",
  "review",
] as const;

const TENANT = { id: "tenant-1", name: "Salão", slug: "salao-teste", createdAt: new Date("2026-01-01T00:00:00Z") };

function build(rowsByModel: Partial<Record<(typeof MODELS)[number], { id: string }[]>> = {}, tenant: unknown = TENANT) {
  const prisma: Record<string, unknown> = { tenant: { findUnique: jest.fn().mockResolvedValue(tenant) } };
  const findManys: Record<string, jest.Mock> = {};
  for (const model of MODELS) {
    findManys[model] = jest.fn().mockImplementation(async ({ take, cursor, skip }) => {
      const all = rowsByModel[model] ?? [];
      const start = cursor ? all.findIndex((r) => r.id === cursor.id) + (skip ?? 0) : 0;
      return all.slice(start, start + take);
    });
    prisma[model] = { findMany: findManys[model] };
  }
  const service = new DataExportService(prisma as unknown as PrismaService);
  return { service, findManys, tenantFind: (prisma.tenant as { findUnique: jest.Mock }).findUnique };
}

async function read(stream: Readable): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk.toString();
  return out;
}

describe("DataExportService", () => {
  it("gera um JSON válido com todas as seções, mesmo sem nenhum registro", async () => {
    const { service } = build();
    const { stream } = await service.start("tenant-1");
    const json = JSON.parse(await read(stream));

    expect(json.formato).toBe("marquo-export");
    expect(json.negocio.slug).toBe("salao-teste");
    for (const section of ["profissionais", "servicos", "clientes", "agendamentos", "comandas", "financeiro", "avaliacoes", "fichasRespostas"]) {
      expect(json[section]).toEqual([]);
    }
  });

  it("exporta os registros de cada tabela, paginando por cursor (nenhum perdido nem repetido)", async () => {
    const clients = Array.from({ length: 5 }, (_, i) => ({ id: `c-${i}`, name: `Cliente ${i}` }));
    const { service, findManys } = build({ client: clients });
    service.batchSize = 2;

    const json = JSON.parse(await read((await service.start("tenant-1")).stream));

    expect(json.clientes.map((c: { id: string }) => c.id)).toEqual(["c-0", "c-1", "c-2", "c-3", "c-4"]);
    expect(findManys.client).toHaveBeenCalledTimes(3);
    expect(findManys.client.mock.calls[1][0].cursor).toEqual({ id: "c-1" });
    expect(findManys.client.mock.calls[1][0].skip).toBe(1);
  });

  // IDOR/BOLA: o tenantId do JWT é a única fonte do filtro, em TODA tabela.
  it("filtra toda tabela por tenantId", async () => {
    const { service, findManys } = build();
    await read((await service.start("tenant-1")).stream);
    for (const model of MODELS) {
      expect(findManys[model].mock.calls[0][0].where).toEqual({ tenantId: "tenant-1" });
    }
  });

  // Vazamento: nada de hash, token ou dado de cobrança pode entrar no arquivo.
  it("nenhum select pede campo sensível (senha, token, refresh, cobrança)", async () => {
    const { service, findManys } = build();
    await read((await service.start("tenant-1")).stream);
    const selects = JSON.stringify(MODELS.map((m) => findManys[m].mock.calls[0][0].select));
    for (const forbidden of ["passwordHash", "passwordSetToken", "refreshToken", "tokenHash", "lockedUntil", "failedLoginAttempts", "externalReference", "mercadopago"]) {
      expect(selects.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // O profissional sai só com os dados de contato da equipe.
    expect(findManys.professional.mock.calls[0][0].select.user.select).toEqual({
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    });
  });

  it("avaliações saem sem a identidade de quem avaliou", async () => {
    const { service, findManys } = build();
    await read((await service.start("tenant-1")).stream);
    const select = findManys.review.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("consumerId");
    expect(select).not.toHaveProperty("consumer");
  });

  it("negócio inexistente: 404 e nenhuma consulta de dados", async () => {
    const { service, findManys } = build({}, null);
    await expect(service.start("tenant-x")).rejects.toThrow(NotFoundException);
    expect(findManys.client).not.toHaveBeenCalled();
  });

  it("uma exportação por negócio por vez: a segunda leva 409, e a trava é liberada ao terminar", async () => {
    const { service } = build();
    const first = await service.start("tenant-1");
    await expect(service.start("tenant-1")).rejects.toThrow(ConflictException);

    await read(first.stream);
    await expect(service.start("tenant-1")).resolves.toBeDefined();
  });

  it("outro negócio não é bloqueado pela exportação em andamento", async () => {
    const { service } = build();
    await service.start("tenant-1");
    await expect(service.start("tenant-2")).resolves.toBeDefined();
  });

  it("cliente que cancela o download libera a trava (stream destruído)", async () => {
    const { service } = build();
    const first = await service.start("tenant-1");
    first.stream.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(service.start("tenant-1")).resolves.toBeDefined();
  });

  it("nome do arquivo só com caracteres seguros e a data", async () => {
    const { service } = build({}, { ...TENANT, slug: 'sa"lão/../x' });
    const { filename } = await service.start("tenant-1");
    expect(filename).toMatch(/^marquo-dados-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);
    expect(filename).not.toMatch(/["/\\]/);
  });
});
