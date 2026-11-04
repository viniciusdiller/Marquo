import { readFileSync } from "fs";
import { join } from "path";

// As categorias do marketplace precisam existir em QUALQUER banco (produção não roda o seed de demonstração). Sem elas o
// dono não tem o que marcar em /dashboard/marketplace e a busca pública só mostra "Todos".
const MIGRATIONS = join(__dirname, "../../../../packages/database/prisma/migrations");
const SQL = readFileSync(join(MIGRATIONS, "20261103120000_seed_service_categories/migration.sql"), "utf8");

describe("migration seed_service_categories", () => {
  it.each(["barbearia", "salao-de-beleza", "manicure-pedicure", "estetica", "sobrancelha-cilios"])("insere a categoria %s", (slug) => {
    expect(SQL).toContain(`'${slug}'`);
  });

  it("é idempotente: não duplica nem sobrescreve categoria que já existe (mesmo slug)", () => {
    expect(SQL).toMatch(/ON CONFLICT \("slug"\) DO NOTHING/);
    expect(SQL).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
  });
});
