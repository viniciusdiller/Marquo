-- Categorias globais do marketplace. Antes só o seed de demonstração as criava, então um banco de produção (que não roda
-- o seed) ficava com a tabela vazia: o dono não via nenhuma categoria para marcar e a busca pública só mostrava "Todos".
-- Idempotente: quem já tem a categoria (mesmo slug) não é alterado, nem ganha duplicata.
INSERT INTO "ServiceCategory" ("id", "slug", "name", "position") VALUES
    (gen_random_uuid()::text, 'barbearia', 'Barbearia', 0),
    (gen_random_uuid()::text, 'salao-de-beleza', 'Salão de beleza', 1),
    (gen_random_uuid()::text, 'manicure-pedicure', 'Manicure e pedicure', 2),
    (gen_random_uuid()::text, 'estetica', 'Estética', 3),
    (gen_random_uuid()::text, 'sobrancelha-cilios', 'Sobrancelha e cílios', 4)
ON CONFLICT ("slug") DO NOTHING;
