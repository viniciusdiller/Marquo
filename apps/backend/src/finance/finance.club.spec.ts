import { FinanceService } from "./finance.service";
import { PrismaService } from "../prisma/prisma.service";

function build(categories: Array<{ id: string; name: string }>) {
  const tx = {
    financialCategory: { findMany: jest.fn().mockResolvedValue(categories), findFirst: jest.fn().mockResolvedValue(categories[0] ?? null), create: jest.fn() },
    financialEntry: { create: jest.fn() },
  };
  return { tx, service: new FinanceService({} as PrismaService) };
}

describe("FinanceService.recordClubIncome", () => {
  const entry = { amountCents: 12000, description: "Clube: Corte — Rafael" };

  it("lança a mensalidade como receita JÁ PAGA, de origem CLUB (protegida), na categoria do clube", async () => {
    const { tx, service } = build([{ id: "c-clube", name: "Clube de assinaturas" }, { id: "c-outras", name: "Outras receitas" }]);
    await service.recordClubIncome(tx as never, "t-1", "u-1", entry);

    const data = tx.financialEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t-1",
      direction: "INCOME",
      source: "CLUB",
      status: "PAID",
      amountCents: 12000,
      categoryId: "c-clube",
      createdByUserId: "u-1",
    });
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  it("sem a categoria do clube (negócio antigo), cai para 'Outras receitas'", async () => {
    const { tx, service } = build([{ id: "c-outras", name: "Outras receitas" }]);
    await service.recordClubIncome(tx as never, "t-1", "u-1", entry);
    expect(tx.financialEntry.create.mock.calls[0][0].data.categoryId).toBe("c-outras");
  });

  // Criar categoria aqui faria listCategories achar que o negócio já tem as padrão e pular a criação delas.
  it("sem nenhuma das duas, lança sem categoria e NUNCA cria categoria", async () => {
    const { tx, service } = build([]);
    await service.recordClubIncome(tx as never, "t-1", "u-1", entry);
    expect(tx.financialEntry.create.mock.calls[0][0].data.categoryId).toBeNull();
    expect(tx.financialCategory.create).not.toHaveBeenCalled();
  });

  it("busca as categorias só deste negócio, de receita", async () => {
    const { tx, service } = build([]);
    await service.recordClubIncome(tx as never, "t-1", "u-1", entry);
    expect(tx.financialCategory.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1", direction: "INCOME" });
  });

  it("valor zero ou negativo não lança nada", async () => {
    const { tx, service } = build([]);
    await service.recordClubIncome(tx as never, "t-1", "u-1", { ...entry, amountCents: 0 });
    await service.recordClubIncome(tx as never, "t-1", "u-1", { ...entry, amountCents: -100 });
    expect(tx.financialEntry.create).not.toHaveBeenCalled();
  });
});

describe("FinanceService.recordTicketIncome: comanda de total zero", () => {
  it("comanda totalmente coberta pelo clube não gera receita de R$ 0,00", async () => {
    const { tx, service } = build([]);
    await service.recordTicketIncome(tx as never, "t-1", "u-1", { id: "tk-1", totalCents: 0 });
    expect(tx.financialEntry.create).not.toHaveBeenCalled();
  });

  it("comanda com valor continua gerando a receita normal", async () => {
    const { tx, service } = build([{ id: "c1", name: "Vendas de serviços" }]);
    await service.recordTicketIncome(tx as never, "t-1", "u-1", { id: "tk-1", totalCents: 4500 });
    expect(tx.financialEntry.create.mock.calls[0][0].data).toMatchObject({ source: "TICKET", amountCents: 4500, ticketId: "tk-1" });
  });
});

describe("FinanceService.reverseTicketIncome (reabertura de comanda)", () => {
  function setup(entry: unknown) {
    const tx = { financialEntry: { findFirst: jest.fn().mockResolvedValue(entry), update: jest.fn() } };
    return { tx, service: new FinanceService({} as PrismaService) };
  }

  // Não apaga: fica CANCELADO e solto da comanda (ticketId é único: fechar de novo cria outro), com o motivo na descrição.
  it("cancela a receita, solta da comanda e registra o motivo na descrição (o histórico financeiro se mantém)", async () => {
    const { tx, service } = setup({ id: "e-1", description: "Venda (comanda)" });
    expect(await service.reverseTicketIncome(tx as never, "t-1", "tk-1")).toEqual({ reversed: true });
    expect(tx.financialEntry.update).toHaveBeenCalledWith({
      where: { id: "e-1" },
      data: { status: "CANCELED", ticketId: null, description: "Venda (comanda) (estornada: comanda reaberta)" },
    });
  });

  it("procura só a receita DE COMANDA deste negócio e desta comanda", async () => {
    const { tx, service } = setup(null);
    await service.reverseTicketIncome(tx as never, "t-1", "tk-1");
    expect(tx.financialEntry.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t-1", ticketId: "tk-1", source: "TICKET" });
  });

  it("comanda sem receita (totalmente coberta pelo clube): nada a estornar", async () => {
    const { tx, service } = setup(null);
    expect(await service.reverseTicketIncome(tx as never, "t-1", "tk-1")).toEqual({ reversed: false });
    expect(tx.financialEntry.update).not.toHaveBeenCalled();
  });
});
