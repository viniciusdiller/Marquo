import { strToU8, Zip, ZipDeflate } from "fflate";
import { DateTime } from "luxon";

// Gerador mínimo de planilha .xlsx (Office Open XML) em STREAMING, sem dependência pesada: o zip sai do fflate (zero
// dependências) e o XML é escrito aqui. Só o necessário para exportar dados: texto, número, dinheiro, data e data/hora,
// cabeçalho em negrito, primeira linha congelada e filtro automático.
//
// - Texto vai como "inline string": um valor que começa com "=" é TEXTO, nunca fórmula (sem injeção de fórmula).
// - Memória: cada aba é escrita em lotes; o gerador só produz o próximo pedaço quando quem lê pede (backpressure).

export type CellType = "text" | "number" | "money" | "datetime" | "date";

export interface Column<R> {
  header: string;
  type: CellType;
  width?: number;
  value: (row: R) => unknown;
}

export interface SheetSpec<R = never> {
  name: string;
  columns: Column<R>[];
  // Lotes de linhas (cada lote é um array). Quem define a aba decide como paginar no banco.
  batches: () => AsyncIterable<R[]>;
}

export const XLSX_TIMEZONE = "America/Sao_Paulo";
const MAX_CELL_CHARS = 32_767;
// Estilos (índices de cellXfs em styles.xml).
const STYLE = { header: 1, datetime: 2, date: 3, money: 4 } as const;

// Caracteres de controle que o XML 1.0 não aceita (quebrariam a planilha): o objetivo é justamente casá-los.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Nome de aba: até 31 caracteres e sem []:*?/\
export function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Aba";
}

// Data/hora do Excel = dias desde 30/12/1899, no horário LOCAL do negócio.
export function excelDateTime(date: Date): number {
  const dt = DateTime.fromJSDate(date, { zone: XLSX_TIMEZONE });
  return (dt.toMillis() + dt.offset * 60_000) / 86_400_000 + 25_569;
}

// Data pura (@db.Date): o banco guarda meia-noite UTC; converter de fuso deslocaria um dia.
export function excelDate(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000 + 25_569;
}

function textCell(ref: string, text: string, style?: number): string {
  const safe = escapeXml(text.slice(0, MAX_CELL_CHARS));
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${safe}</t></is></c>`;
}

export function cell(ref: string, type: CellType, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "boolean") return textCell(ref, raw ? "Sim" : "Não");
  switch (type) {
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? `<c r="${ref}"><v>${raw}</v></c>` : textCell(ref, String(raw));
    case "money":
      // Valores do sistema são centavos inteiros: na planilha viram reais.
      return typeof raw === "number" && Number.isFinite(raw) ? `<c r="${ref}" s="${STYLE.money}"><v>${raw / 100}</v></c>` : "";
    case "datetime":
    case "date": {
      const date = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(date.getTime())) return "";
      const serial = type === "date" ? excelDate(date) : excelDateTime(date);
      return `<c r="${ref}" s="${type === "date" ? STYLE.date : STYLE.datetime}"><v>${serial}</v></c>`;
    }
    default:
      return textCell(ref, String(raw));
  }
}

const CONTENT_TYPES = (count: number) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from(
    { length: count },
    (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")}</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = (names: string[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;

const WORKBOOK_RELS = (count: number) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("")}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="&quot;R$&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const DEFAULT_WIDTH: Record<CellType, number> = { text: 24, number: 10, money: 14, datetime: 17, date: 12 };

function sheetHead<R>(columns: Column<R>[]): string {
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? DEFAULT_WIDTH[c.type]}" customWidth="1"/>`).join("");
  const header = columns.map((c, i) => textCell(`${columnLetter(i)}1`, c.header, STYLE.header)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData><row r="1">${header}</row>`;
}

export async function* writeXlsx(sheets: SheetSpec<any>[]): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else out.push(chunk);
  });
  function* drain(): Generator<Uint8Array> {
    if (failure) throw failure;
    while (out.length) yield out.shift()!;
  }
  const addFile = (path: string, content: string) => {
    const file = new ZipDeflate(path, { level: 6 });
    zip.add(file);
    file.push(strToU8(content), true);
  };

  const names = sheets.map((s) => sheetName(s.name));
  addFile("[Content_Types].xml", CONTENT_TYPES(sheets.length));
  addFile("_rels/.rels", ROOT_RELS);
  addFile("xl/workbook.xml", WORKBOOK(names));
  addFile("xl/_rels/workbook.xml.rels", WORKBOOK_RELS(sheets.length));
  addFile("xl/styles.xml", STYLES);
  yield* drain();

  for (const [index, sheet] of sheets.entries()) {
    const file = new ZipDeflate(`xl/worksheets/sheet${index + 1}.xml`, { level: 6 });
    zip.add(file);
    file.push(strToU8(sheetHead(sheet.columns)));
    let rowNumber = 1;
    for await (const batch of sheet.batches()) {
      let xml = "";
      for (const row of batch) {
        rowNumber += 1;
        const cells = sheet.columns.map((c, i) => cell(`${columnLetter(i)}${rowNumber}`, c.type, c.value(row))).join("");
        xml += `<row r="${rowNumber}">${cells}</row>`;
      }
      if (xml) file.push(strToU8(xml));
      yield* drain();
    }
    const lastCol = columnLetter(Math.max(0, sheet.columns.length - 1));
    file.push(strToU8(`</sheetData><autoFilter ref="A1:${lastCol}${rowNumber}"/></worksheet>`), true);
    yield* drain();
  }

  zip.end();
  yield* drain();
}
