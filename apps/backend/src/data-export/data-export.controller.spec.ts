import "reflect-metadata";
import { StreamableFile } from "@nestjs/common";
import { Role } from "@marquo/database";
import { Readable } from "stream";
import { DataExportController } from "./data-export.controller";
import { DataExportService } from "./data-export.service";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { SKIP_BILLING_CHECK_KEY } from "../common/decorators/skip-billing-check.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

const handler = DataExportController.prototype.download;

describe("DataExportController", () => {
  it("só o dono exporta (recepção e profissional não)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.OWNER]);
  });

  it("funciona com a conta bloqueada por cobrança (o direito aos dados não depende de estar em dia)", () => {
    expect(Reflect.getMetadata(SKIP_BILLING_CHECK_KEY, handler)).toBe(true);
  });

  it("usa o tenantId do JWT e devolve o arquivo como anexo JSON", async () => {
    const start = jest.fn().mockResolvedValue({ filename: "marquo-dados-x-2026-10-22.json", stream: Readable.from(["{}"]) });
    const controller = new DataExportController({ start } as unknown as DataExportService);
    const user: AuthenticatedUser = { userId: "u-1", tenantId: "tenant-1", role: Role.OWNER };

    const result = await controller.download(user);

    expect(start).toHaveBeenCalledWith("tenant-1");
    expect(result).toBeInstanceOf(StreamableFile);
    const options = result.options;
    expect(options.type).toContain("application/json");
    expect(options.disposition).toBe('attachment; filename="marquo-dados-x-2026-10-22.json"');
  });
});
