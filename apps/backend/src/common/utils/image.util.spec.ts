import { mkdtempSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { convertToWebp } from "./image.util";

describe("convertToWebp", () => {
  sharp.cache(false);
  const dir = mkdtempSync(join(tmpdir(), "img-"));
  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignora erro de lock em SOs com retenção temporária de handles
    }
  });
  const opts = (name: string) => ({ maxDimension: 100, quality: 80, outPath: join(dir, name) });

  it("converte PNG válido pra WebP dentro do limite de dimensão", async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#6c3bf4" },
    })
      .png()
      .toBuffer();

    await convertToWebp(png, opts("ok.webp"));

    expect(existsSync(join(dir, "ok.webp"))).toBe(true);
    const meta = await sharp(join(dir, "ok.webp")).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(100);
  });

  // Regressão: o mimetype vinha do cliente e o sharp abre SVG — um SVG mandado como image/png
  // era processado (leitura de arquivo/SSRF via referência externa, XML entities).
  it("recusa SVG mesmo que o cliente o declare como imagem raster", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(convertToWebp(svg, opts("svg.webp"))).rejects.toThrow(BadRequestException);
    expect(existsSync(join(dir, "svg.webp"))).toBe(false);
  });

  it("recusa bytes que não são imagem", async () => {
    await expect(convertToWebp(Buffer.from("isto não é uma imagem"), opts("x.webp"))).rejects.toThrow(
      BadRequestException,
    );
  });

  // Regressão: PNG pequeno em bytes mas gigante em pixels (decompression bomb).
  it("recusa imagem com pixels acima do teto de decodificação", async () => {
    const bomb = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);

    await expect(convertToWebp(bomb, opts("bomb.webp"))).rejects.toThrow(BadRequestException);
  }, 30_000);
});
