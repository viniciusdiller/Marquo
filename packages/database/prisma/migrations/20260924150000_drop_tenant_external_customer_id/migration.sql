-- O provisionamento pelo Admin-TotalSoftware (webhook /webhooks/totalsoftware) foi aposentado: o
-- cadastro e a cobrança passaram a ser do próprio Marquo. Tenant.externalCustomerId (id do
-- cliente no Admin) não tem mais uso. DESTRUTIVA: os valores existentes são descartados.
DROP INDEX "Tenant_externalCustomerId_key";
ALTER TABLE "Tenant" DROP COLUMN "externalCustomerId";
