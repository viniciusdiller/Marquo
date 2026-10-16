import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

// Só rasters comuns. SVG e afins ficam de fora de propósito: o libvips/librsvg renderiza SVG
// (com referências externas e XML entities), então aceitar "qualquer coisa que o sharp abra"
// transformava o upload num vetor de leitura de arquivo/SSRF e de XSS por SVG servido.
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);

// Teto de pixels decodificados (não de bytes): um PNG de poucos KB pode declarar dezenas de
// milhares de pixels por lado e estourar a memória ao decodificar (decompression bomb). O
// padrão do sharp (~268M px) ainda deixa passar ~1 GB de RGBA por requisição.
const MAX_INPUT_PIXELS = 40_000_000;

// O mimetype do multipart é dito pelo cliente — o formato de verdade vem dos bytes (o sharp
// lê o cabeçalho), nunca do Content-Type/extensão. Reencoda sempre pra WebP: descarta payload
// embutido e metadados (EXIF/GPS).
export async function convertToWebp(
  buffer: Buffer,
  opts: {
    maxDimension: number;
    quality: number;
    outPath: string;
    // "square": recorta no centro para um quadrado maxDimension × maxDimension (avatar). Padrão: cabe dentro.
    crop?: "square";
  },
): Promise<void> {
  const open = () => sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });

  let format: string | undefined;
  try {
    format = (await open().metadata()).format;
  } catch {
    throw new BadRequestException("Não foi possível processar a imagem enviada.");
  }
  if (!format || !ALLOWED_INPUT_FORMATS.has(format)) {
    throw new BadRequestException("Formato de imagem não suportado. Use JPEG, PNG ou WEBP.");
  }

  try {
    await open()
      .rotate() // respeita a orientação do EXIF antes de descartar os metadados (foto de celular não sai deitada)
      .resize(
        opts.maxDimension,
        opts.maxDimension,
        opts.crop === "square"
          ? { fit: "cover", position: "attention" }
          : { fit: "inside", withoutEnlargement: true },
      )
      .webp({ quality: opts.quality })
      .toFile(opts.outPath);
  } catch {
    throw new BadRequestException("Não foi possível processar a imagem enviada.");
  }
}
