import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ForgotPasswordDto } from "./forgot-password.dto";

const check = (value: unknown) => validate(plainToInstance(ForgotPasswordDto, value));

describe("ForgotPasswordDto", () => {
  it("aceita e normaliza o e-mail (minúsculo, sem espaços)", async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: "  Ana@Salao.COM " });
    expect(dto.email).toBe("ana@salao.com");
    expect(await check({ email: "ana@salao.com" })).toHaveLength(0);
  });

  it("recusa e-mail inválido, ausente ou gigante", async () => {
    expect(await check({ email: "sem-arroba" })).not.toHaveLength(0);
    expect(await check({})).not.toHaveLength(0);
    expect(await check({ email: `${"a".repeat(250)}@x.com` })).not.toHaveLength(0);
  });
});
