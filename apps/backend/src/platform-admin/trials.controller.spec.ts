import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformTrialsQueryDto, SetTrialDto } from "./dto/platform-admin.dto";
import { TrialsService } from "./trials.service";

const proto = PlatformAdminController.prototype;
const guards = (handler: keyof PlatformAdminController) => Reflect.getMetadata("__guards__", proto[handler] as object) as unknown[] | undefined;

describe("rotas do teste grátis (plataforma)", () => {
  it.each(["listTrials", "setTrial"] as const)("%s exige a sessão da plataforma", (handler) => {
    expect(guards(handler)).toContain(PlatformAdminGuard);
  });

  it("definir o teste usa o e-mail da conta da plataforma como autor e os dias do corpo", async () => {
    const setRemaining = jest.fn().mockResolvedValue({ id: "x" });
    const controller = new PlatformAdminController({} as never, {} as never, {} as never, {} as never, { setRemaining } as unknown as TrialsService, {} as never, {} as never);

    await controller.setTrial("3f2b8f0e-0000-4000-8000-000000000001", { days: 21 }, { email: "admin@marquo.com.br" } as never);

    expect(setRemaining).toHaveBeenCalledWith("3f2b8f0e-0000-4000-8000-000000000001", 21, "admin@marquo.com.br");
  });
});

describe("SetTrialDto", () => {
  const check = (value: unknown) => validate(plainToInstance(SetTrialDto, value));

  it("aceita de 0 a 365 dias inteiros", async () => {
    for (const days of [0, 1, 30, 365]) expect(await check({ days })).toHaveLength(0);
  });

  it("recusa negativo, acima de 365, decimal, texto e ausente", async () => {
    for (const days of [-1, 366, 1.5, "30", null, undefined]) expect(await check({ days })).not.toHaveLength(0);
    expect(await check({})).not.toHaveLength(0);
  });
});

describe("PlatformTrialsQueryDto", () => {
  const check = (value: unknown) => validate(plainToInstance(PlatformTrialsQueryDto, value));

  it("aceita filtro de status conhecido, busca e paginação", async () => {
    expect(await check({ status: "ACTIVE", search: "ana", page: "2", pageSize: "10" })).toHaveLength(0);
    expect(await check({ status: "EXPIRED" })).toHaveLength(0);
  });

  it("recusa status desconhecido, busca gigante e página fora do limite", async () => {
    expect(await check({ status: "QUALQUER" })).not.toHaveLength(0);
    expect(await check({ search: "x".repeat(101) })).not.toHaveLength(0);
    expect(await check({ pageSize: "1000" })).not.toHaveLength(0);
  });
});
