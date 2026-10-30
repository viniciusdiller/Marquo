import { test, expect } from "@playwright/test";

test.describe("Comandas e caixa", () => {
  test("abre comanda avulsa, adiciona item e cancela com confirmação", async ({ page }) => {
    await page.goto("/dashboard/comandas");
    await page.getByRole("button", { name: "Nova comanda", exact: true }).click();
    await page.getByRole("dialog", { name: "Nova comanda" }).getByRole("button", { name: "Abrir sem cliente" }).click();
    await page.waitForURL(/\/dashboard\/comandas\/.+/);

    await page.getByLabel("Tipo de item").selectOption("CUSTOM");
    await page.getByPlaceholder("Descrição").fill("Item de teste Playwright");
    await page.getByLabel("Valor do item (R$)").fill("25,00");
    await page.getByRole("button", { name: "Adicionar" }).click();

    await expect(page.getByText("Item de teste Playwright")).toBeVisible();
    await expect(page.getByText("R$ 25,00").first()).toBeVisible();

    // Exercita o ConfirmDialog da Fase A: cancelar comanda era um clique só antes.
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Cancelar esta comanda?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancelar comanda" }).click();

    await page.waitForURL("**/dashboard/comandas");
  });

  test("caixa: abre (se preciso) e mostra o fluxo de fechamento com confirmação", async ({ page }) => {
    await page.goto("/dashboard/caixa");

    const openButton = page.getByRole("button", { name: "Abrir caixa" });
    if (await openButton.isVisible().catch(() => false)) {
      await page.getByLabel("Fundo de troco (R$)").fill("0,00");
      await openButton.click();
    }

    await expect(page.getByRole("heading", { name: "Fechar caixa" })).toBeVisible();
    await page.getByLabel("Dinheiro contado (R$)").fill("0,00");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    // Exercita o ConfirmDialog da Fase A: fechar caixa era definitivo num clique só.
    const confirm = page.getByRole("alertdialog", { name: "Fechar o caixa?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Voltar" }).click();
    await expect(confirm).toBeHidden();

    // Não confirma de verdade — este teste não deve alterar o estado do caixa pros outros.
    await expect(page.getByRole("heading", { name: "Fechar caixa" })).toBeVisible();
  });
});
