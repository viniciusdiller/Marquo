import { strFromU8, unzipSync } from "fflate";
import { cell, columnLetter, escapeXml, excelDate, excelDateTime, sheetName, writeXlsx, type SheetSpec } from "./xlsx-writer";

async function build(sheets: SheetSpec<any>[]): Promise<Record<string, string>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of writeXlsx(sheets)) chunks.push(chunk);
  const files = unzipSync(Buffer.concat(chunks));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

describe("xlsx-writer", () => {
  it("monta o pacote mínimo do Excel: tipos, workbook com as abas, estilos e uma planilha por aba", async () => {
    const files = await build([
      { name: "Clientes", columns: [{ header: "Nome", type: "text", value: (r: { n: string }) => r.n }], batches: async function* () { yield [{ n: "Ana" }]; } },
      { name: "Vazia", columns: [{ header: "X", type: "text", value: () => null }], batches: async function* () {} },
    ]);
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml",
      "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
    ]);
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Clientes" sheetId="1" r:id="rId1"/>');
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Vazia" sheetId="2" r:id="rId2"/>');
    expect(files["xl/worksheets/sheet1.xml"]).toContain('<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">Ana</t></is></c></row>');
    expect(files["xl/worksheets/sheet1.xml"]).toContain('<autoFilter ref="A1:A2"/>');
    // aba sem linhas ainda tem o cabeçalho e fecha certo
    expect(files["xl/worksheets/sheet2.xml"]).toMatch(/<row r="1">.*<\/row><\/sheetData><autoFilter ref="A1:A1"\/><\/worksheet>$/);
  });

  it("junta vários lotes numa aba só, numerando as linhas em sequência", async () => {
    const files = await build([
      {
        name: "N",
        columns: [{ header: "n", type: "number", value: (r: number) => r }],
        batches: async function* () { yield [1, 2]; yield [3]; },
      },
    ]);
    const sheet = files["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<row r="4"><c r="A4"><v>3</v></c></row>');
  });

  it("texto que parece fórmula continua TEXTO (sem injeção de fórmula)", () => {
    expect(cell("A2", "text", "=HYPERLINK(\"http://x\")")).toBe('<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t></is></c>');
    expect(cell("A2", "text", "=1+1")).not.toContain("<f>");
  });

  it("escapa XML e remove caracteres de controle inválidos", () => {
    expect(escapeXml('a<b>&"c"\u0001')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });

  it("dinheiro em centavos vira reais com formato de moeda; vazio não gera célula", () => {
    expect(cell("B2", "money", 12345)).toBe('<c r="B2" s="4"><v>123.45</v></c>');
    expect(cell("B2", "money", null)).toBe("");
    expect(cell("B2", "text", "")).toBe("");
    expect(cell("B2", "text", true)).toContain("Sim");
  });

  it("data/hora no fuso do negócio e data pura sem deslocar o dia", () => {
    // 10/03/2026 15:00 em São Paulo (UTC-3) = 18:00Z
    expect(excelDateTime(new Date("2026-03-10T18:00:00.000Z"))).toBeCloseTo(46091 + 15 / 24, 6);
    expect(excelDate(new Date("2026-03-10T00:00:00.000Z"))).toBe(46091);
  });

  it("letras de coluna e nomes de aba válidos", () => {
    expect([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(27)]).toEqual(["A", "Z", "AA", "AB"]);
    expect(sheetName("Itens/das:comandas [teste] com um nome bem comprido demais")).toHaveLength(31);
    expect(sheetName("a/b")).toBe("a b");
  });
});
