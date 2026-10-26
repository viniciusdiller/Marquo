import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PlatformVerifyCodeDto } from "./platform-admin.dto";

const check = (value: unknown) => validate(plainToInstance(PlatformVerifyCodeDto, value));
const CHALLENGE = "a1".repeat(24);

describe("PlatformVerifyCodeDto", () => {
  it("aceita desafio de 48 hex e código de 6 dígitos", async () => {
    expect(await check({ challengeId: CHALLENGE, code: "042913" })).toHaveLength(0);
  });

  it("recusa código que não tem exatamente 6 dígitos", async () => {
    for (const code of ["12345", "1234567", "12345a", "", " 123456", "123 456"]) {
      expect(await check({ challengeId: CHALLENGE, code })).not.toHaveLength(0);
    }
  });

  it("recusa desafio fora do formato (nunca vai para o armazém com lixo)", async () => {
    for (const challengeId of ["", "abc", "g".repeat(48), "a".repeat(47), "a".repeat(49), "../etc/passwd"]) {
      expect(await check({ challengeId, code: "123456" })).not.toHaveLength(0);
    }
  });

  it("recusa campos ausentes", async () => {
    expect(await check({})).not.toHaveLength(0);
    expect(await check({ challengeId: CHALLENGE })).not.toHaveLength(0);
  });
});
