import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterConsumerDto, RequestRegisterCodeDto } from "./consumer-dtos";

const base = { name: "Ana", phone: "(11) 98888-7777", email: "ana@example.com", password: "senha-correta-123", consent: true };
const check = (value: unknown) => validate(plainToInstance(RegisterConsumerDto, value));

describe("RegisterConsumerDto.emailCode", () => {
  it("é opcional no DTO (a exigência é do service, conforme o e-mail do sistema estar configurado)", async () => {
    expect(await check(base)).toHaveLength(0);
  });

  it("aceita exatamente 6 dígitos", async () => {
    expect(await check({ ...base, emailCode: "042913" })).toHaveLength(0);
  });

  it("recusa qualquer outra coisa", async () => {
    for (const emailCode of ["12345", "1234567", "12345a", " 123456", "123 456", "", "０４２９１３"]) {
      expect(await check({ ...base, emailCode })).not.toHaveLength(0);
    }
  });
});

describe("RequestRegisterCodeDto", () => {
  const checkRequest = (value: unknown) => validate(plainToInstance(RequestRegisterCodeDto, value));

  it("normaliza o e-mail (minúsculo, sem espaços) e valida o formato", async () => {
    expect(plainToInstance(RequestRegisterCodeDto, { email: "  Ana@Example.COM " }).email).toBe("ana@example.com");
    expect(await checkRequest({ email: "ana@example.com" })).toHaveLength(0);
    expect(await checkRequest({ email: "sem-arroba" })).not.toHaveLength(0);
    expect(await checkRequest({})).not.toHaveLength(0);
  });
});
