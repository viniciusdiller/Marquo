import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { isTourId, TOURS } from "./tours";

// Um tour por passo do guia de configuração (ids definidos pelo backend em TenantSetupStepId).
const STEP_IDS = ["services", "professionals", "working_hours", "service_links", "location", "contact"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
  });
}

describe("definição dos tours", () => {
  it("existe um tour para cada passo do guia, e só para eles", () => {
    expect(Object.keys(TOURS).sort()).toEqual([...STEP_IDS].sort());
    for (const id of STEP_IDS) expect(isTourId(id)).toBe(true);
    expect(isTourId("hacker")).toBe(false);
    expect(isTourId("__proto__")).toBe(false);
  });

  it("cada tour tem pontos com título, explicação e id único", () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.stops.length).toBeGreaterThan(0);
      expect(new Set(tour.stops.map((s) => s.id)).size).toBe(tour.stops.length);
      for (const stop of tour.stops) {
        expect(stop.title.length).toBeGreaterThan(3);
        expect(stop.body.length).toBeGreaterThan(15);
        expect(stop.target).toMatch(/^[a-z-]+$/);
      }
    }
  });

  it("o início de cada tour fica na tela onde o guia manda (href do passo)", () => {
    const hrefs: Record<string, string> = {
      services: "/dashboard/servicos",
      professionals: "/dashboard/profissionais",
      working_hours: "/dashboard/profissionais",
      service_links: "/dashboard/profissionais",
      location: "/dashboard/configuracoes",
      contact: "/dashboard/configuracoes",
    };
    for (const [id, href] of Object.entries(hrefs)) {
      const tour = TOURS[id as keyof typeof TOURS];
      expect(tour.href).toBe(href);
      expect(tour.stops[0].path.test(href)).toBe(true);
    }
  });

  it("a ficha do profissional (id na URL) é reconhecida, e a lista não", () => {
    const detail = TOURS.working_hours.stops.find((s) => s.id === "hours")!;
    expect(detail.path.test("/dashboard/profissionais/3f2b8f0e-0000-4000-8000-000000000001")).toBe(true);
    expect(detail.path.test("/dashboard/profissionais")).toBe(false);
    expect(TOURS.working_hours.stops[0].path.test("/dashboard/profissionais/")).toBe(true);
  });

  it("pontos que mudam de tela voltam para o ponto certo se a pessoa sair", () => {
    for (const id of ["working_hours", "service_links"] as const) {
      const detailStops = TOURS[id].stops.filter((s) => s.id !== "manage");
      for (const stop of detailStops) expect(stop.resume).toEqual({ href: "/dashboard/profissionais", index: 0 });
    }
  });

  it("o ponto 'Gerenciar' avança no clique e sabe o que fazer sem profissional", () => {
    for (const id of ["working_hours", "service_links"] as const) {
      const manage = TOURS[id].stops[0];
      expect(manage.advanceOn).toBe("click");
      expect(manage.missing?.goTo?.tourId).toBe("professionals");
    }
  });

  it("todo destaque aponta para um data-tour que EXISTE no código das telas (evita tour apontando para o nada)", () => {
    const root = join(__dirname, "../../app");
    const source = sourceFiles(root).map((file) => readFileSync(file, "utf8")).join("\n");
    for (const tour of Object.values(TOURS)) {
      for (const stop of tour.stops) {
        const anchored = source.includes(`data-tour="${stop.target}"`) || source.includes(`? "${stop.target}"`);
        expect(anchored, `sem âncora data-tour="${stop.target}" (${tour.id}/${stop.id})`).toBe(true);
      }
    }
  });
});
