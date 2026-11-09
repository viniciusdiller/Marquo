import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRedirectError } from "./redirect.ts";

describe("isRedirectError", () => {
  it("retorna true para objeto com digest NEXT_REDIRECT", () => {
    const error = { digest: "NEXT_REDIRECT;replace;/entrar;307;" };
    assert.equal(isRedirectError(error), true);
  });

  it("retorna false para outros erros e valores não-objeto", () => {
    assert.equal(isRedirectError(new Error("Normal error")), false);
    assert.equal(isRedirectError({ digest: "OTHER_ERROR" }), false);
    assert.equal(isRedirectError(null), false);
    assert.equal(isRedirectError(undefined), false);
    assert.equal(isRedirectError("string error"), false);
  });
});
