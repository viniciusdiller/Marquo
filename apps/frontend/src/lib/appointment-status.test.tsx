import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUS_ORDER, getStatusAccentClasses, getStatusBlockClasses } from "./appointment-status";

describe("appointment-status", () => {
  it("todo status conhecido tem faixa lateral própria", () => {
    for (const status of APPOINTMENT_STATUS_ORDER) {
      expect(getStatusAccentClasses(status)).toMatch(/^border-l-/);
    }
  });

  it("status desconhecido não se passa por um conhecido", () => {
    expect(getStatusAccentClasses("NOVO")).toBe("border-l-zinc-400");
    expect(getStatusBlockClasses("NOVO")).toContain("border-dashed");
  });
});
