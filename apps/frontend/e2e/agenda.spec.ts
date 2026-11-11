import { test, expect } from "@playwright/test";

test.describe("Agenda", () => {
  test("cria um atendimento e cancela com confirmação", async ({ page }) => {
    await page.goto("/dashboard/agenda");
    await page.getByRole("button", { name: "Novo atendimento" }).click();

    const dialog = page.getByRole("dialog", { name: "Novo atendimento" });
    await expect(dialog).toBeVisible();

    const clientName = `Cliente Playwright ${Date.now()}`;
    await dialog.getByPlaceholder("Nome").fill(clientName);
    await dialog.getByPlaceholder("(11) 91234-5678").fill("11999998888");

    // Amanhã, num horário variável — sempre no futuro, e navega pra "Próximo dia" depois de
    // criar (o formulário não muda o dia em exibição na Agenda). Horário varia por execução
    // pra não colidir com um atendimento deixado por uma rodada anterior (mesmo slot).
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hour = String(8 + (Date.now() % 11)).padStart(2, "0");
    const minute = Date.now() % 2 === 0 ? "00" : "30";
    // Data e hora agora são os seletores do shadcn (calendário + colunas de hora/minuto), não o campo nativo.
    await dialog.getByRole("button", { name: "Início (data)" }).click();
    await page.getByRole("button", { name: new RegExp(`, ${tomorrow.getDate()} de `) }).first().click();
    await dialog.getByRole("button", { name: "Início (hora)" }).click();
    await page.getByRole("listbox", { name: "Hora" }).getByRole("option", { name: hour, exact: true }).click();
    await page.getByRole("listbox", { name: "Minuto" }).getByRole("option", { name: minute, exact: true }).click();

    await dialog.getByRole("button", { name: "Criar" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await page.getByRole("button", { name: "Próximo dia" }).click();
    await page.getByText(clientName).click();

    const panel = page.getByRole("dialog", { name: clientName });
    await panel.getByRole("button", { name: "Cancelar atendimento" }).click();

    // Exercita o ConfirmDialog da Fase A: sem ele isso cancelava no primeiro clique.
    const confirm = page.getByRole("alertdialog", { name: "Cancelar este atendimento?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancelar atendimento" }).click();
    await expect(confirm).toBeHidden();
    // A agenda recarrega e fecha o painel após qualquer mudança (reload() sempre chama
    // setSelected(null)) — não fica mostrando "Cancelado" dentro do painel.
    await expect(panel).toBeHidden();

    await page.getByText(clientName).click();
    await expect(page.getByRole("dialog", { name: clientName }).getByText("Cancelado")).toBeVisible();
  });
});
