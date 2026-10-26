import "reflect-metadata";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { TenantDeletionService } from "./tenant-deletion.service";
import { DeleteTenantDto } from "./dto/platform-admin.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

const proto = PlatformAdminController.prototype;
const guards = (handler: keyof PlatformAdminController) => Reflect.getMetadata("__guards__", proto[handler] as object) as unknown[] | undefined;

describe("rotas de exclusão de dados (plataforma)", () => {
  it.each(["deletionCandidates", "deletionPreview", "deleteTenantData"] as const)(
    "%s exige a sessão da plataforma (PlatformAdminGuard)",
    (handler) => {
      expect(guards(handler)).toContain(PlatformAdminGuard);
    },
  );

  it("a exclusão usa o e-mail da conta da plataforma como autor da auditoria", async () => {
    const purge = jest.fn().mockResolvedValue({ purged: true, slug: "x" });
    const controller = new PlatformAdminController({} as never, {} as never, {} as never, { purge } as unknown as TenantDeletionService, {} as never);

    await controller.deleteTenantData("3f2b8f0e-0000-4000-8000-000000000001", { confirmSlug: "x" }, { email: "admin@marquo.com.br" } as never);

    expect(purge).toHaveBeenCalledWith("3f2b8f0e-0000-4000-8000-000000000001", { confirmSlug: "x" }, "admin@marquo.com.br");
  });
});

describe("DeleteTenantDto", () => {
  const check = (value: unknown) => validate(plainToInstance(DeleteTenantDto, value));

  it("aceita confirmação e motivo opcional", async () => {
    expect(await check({ confirmSlug: "salao-teste" })).toHaveLength(0);
    expect(await check({ confirmSlug: "salao-teste", reason: "Pedido do titular" })).toHaveLength(0);
  });

  it("recusa confirmação vazia/ausente, gigante, e motivo gigante", async () => {
    expect(await check({})).not.toHaveLength(0);
    expect(await check({ confirmSlug: "   " })).not.toHaveLength(0);
    expect(await check({ confirmSlug: "a".repeat(121) })).not.toHaveLength(0);
    expect(await check({ confirmSlug: "x", reason: "r".repeat(301) })).not.toHaveLength(0);
  });

  it("não aceita campos extras que mudariam o comportamento (ex.: tenantId no corpo)", () => {
    const dto = plainToInstance(DeleteTenantDto, { confirmSlug: "x", tenantId: "outro" });
    expect(Object.keys(dto)).toContain("confirmSlug");
    // O alvo SEMPRE vem da URL (ParseUUIDPipe); o corpo só confirma. O ValidationPipe global (forbidNonWhitelisted) recusa o extra.
  });
});
