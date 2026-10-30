import { test as setup } from "@playwright/test";

const authFile = "e2e/.auth/owner.json";

// Login uma vez só, sessão salva e reaproveitada por todo spec via storageState (evita
// bater no rate-limit de login e deixa cada teste focado no fluxo que importa).
setup("autentica como dono", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail ou telefone").fill("dono@salaodemo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha123");
  await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
