import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { PrismaService } from "../prisma/prisma.service";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../common/utils/image.util", () => ({
  convertToWebp: jest.fn().mockResolvedValue(undefined),
}));

import { unlink } from "fs/promises";
import { convertToWebp } from "../common/utils/image.util";

function buildPrismaMock() {
  return {
    tenant: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    serviceCategory: { findMany: jest.fn() },
    tenantCategory: { deleteMany: jest.fn(), createMany: jest.fn() },
    tenantGalleryImage: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn(prismaTxProxy)),
  } as unknown as PrismaService;
}

// $transaction aqui só repassa o mesmo mock como "tx" — os testes de updateMarketplace
// verificam as chamadas no prisma raiz mesmo, já que tx e prisma são o mesmo objeto.
let prismaTxProxy: any;

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    mimetype: "image/png",
    size: 1024,
    buffer: Buffer.from("fake"),
    ...overrides,
  } as Express.Multer.File;
}

describe("TenantsService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrismaMock();
    prismaTxProxy = prisma;
    service = new TenantsService(prisma);
  });

  describe("findPublicBySlug", () => {
    it("rejeita slug de negócio inexistente", async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findPublicBySlug("nao-existe")).rejects.toThrow(NotFoundException);
    });

    it("retorna o tenant quando o slug existe", async () => {
      const tenant = { id: "tenant-1", slug: "salao-demo" };
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(tenant);
      await expect(service.findPublicBySlug("salao-demo")).resolves.toBe(tenant);
    });
    it("projeta latitude e longitude para o mapa do perfil publico", async () => {
      const tenant = { id: "tenant-1", slug: "salao-demo", latitude: -22.89889, longitude: -42.46985 };
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(tenant);
      const res = await service.findPublicBySlug("salao-demo");
      expect(res).toBe(tenant);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "salao-demo" },
          select: expect.objectContaining({
            latitude: true,
            longitude: true,
          }),
        }),
      );
    });
  });

  describe("updateProfile", () => {
    // Texto em branco limpa o campo (null); campo ausente (undefined) não deve sobrescrever
    // o que já está salvo. Sem essa distinção um formulário parcial apagaria dados intocados.
    it("converte string em branco para null e mantém undefined como undefined", async () => {
      (prisma.tenant.update as jest.Mock).mockResolvedValue({});

      await service.updateProfile("tenant-1", {
        description: "   ",
        address: "Rua Nova, 123",
        businessHours: undefined,
      } as any);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: expect.objectContaining({
          description: null,
          address: "Rua Nova, 123",
          businessHours: undefined,
        }),
      });
    });

    it("previne IDOR garantindo que o update ocorra estritamente no ID do salão autenticado", async () => {
      // Regra de Segurança: Em /tenants/me, não confiamos em um ID enviado no payload pelo front.
      // A chamada do banco é engessada com o ID extraído localmente pela camada de Auth.
      (prisma.tenant.update as jest.Mock).mockResolvedValue({});

      await service.updateProfile("tenant-logado-seguro", {
        minSchedulingLeadTimeMinutes: 50,
      } as any);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-logado-seguro" }, // <- a garantia anti-IDOR no banco
        data: expect.objectContaining({
          minSchedulingLeadTimeMinutes: 50,
        }),
      });
    });
  });

  describe("getMarketplaceSettings", () => {
    it("achata as categorias vinculadas em uma lista de slugs e retorna endereco", async () => {
      (prisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        listedInMarketplace: true,
        address: "Rua das Flores, 123",
        city: "São Paulo",
        categories: [{ category: { slug: "barbearia" } }, { category: { slug: "salao" } }],
      });
      (prisma.serviceCategory.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMarketplaceSettings("tenant-1");

      expect(result.address).toBe("Rua das Flores, 123");
      expect(result.categorySlugs).toEqual(["barbearia", "salao"]);
    });

    it("achata as categorias vinculadas em uma lista de slugs", async () => {
      (prisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        listedInMarketplace: true,
        city: "São Paulo",
        categories: [{ category: { slug: "barbearia" } }, { category: { slug: "salao" } }],
      });
      (prisma.serviceCategory.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMarketplaceSettings("tenant-1");

      expect(result.categorySlugs).toEqual(["barbearia", "salao"]);
    });
  });

  describe("updateMarketplace", () => {
    it("rejeita listar no marketplace sem cidade nem categoria", async () => {
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: "tenant-1" });
      (prisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        listedInMarketplace: true,
        city: null,
        _count: { categories: 0 },
      });

      await expect(
        service.updateMarketplace("tenant-1", { listedInMarketplace: true } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("permite listar quando tem cidade e pelo menos uma categoria", async () => {
      (prisma.serviceCategory.findMany as jest.Mock).mockResolvedValue([{ id: "cat-1" }]);
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ id: "tenant-1" });
      (prisma.tenant.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce({
          listedInMarketplace: true,
          city: "São Paulo",
          _count: { categories: 1 },
        })
        // segunda chamada é a de getMarketplaceSettings ao final do método
        .mockResolvedValueOnce({
          listedInMarketplace: true,
          city: "São Paulo",
          categories: [{ category: { slug: "barbearia" } }],
        });

      await expect(
        service.updateMarketplace("tenant-1", {
          listedInMarketplace: true,
          categorySlugs: ["barbearia"],
        } as any),
      ).resolves.toEqual(
        expect.objectContaining({ listedInMarketplace: true, categorySlugs: ["barbearia"] }),
      );
      expect(prisma.tenantCategory.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    });

    // Regressão: a resposta devolvida pro dono após ligar a listagem mostrava o estado de
    // ANTES da mudança (listedInMarketplace: false, sem categorias) mesmo a escrita tendo
    // sido feita com sucesso — porque a releitura final chamava this.prisma em vez de tx, e
    // uma conexão fora da transação não enxerga o que ela ainda não comitou.
    it("lê o resultado final pela MESMA transação da escrita, não por this.prisma", async () => {
      const txOnly = {
        tenant: {
          update: jest.fn().mockResolvedValue({ id: "tenant-1" }),
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValueOnce({ listedInMarketplace: true, city: "São Paulo", _count: { categories: 1 } })
            .mockResolvedValueOnce({
              listedInMarketplace: true,
              city: "São Paulo",
              categories: [{ category: { slug: "barbearia" } }],
            }),
        },
        serviceCategory: { findMany: jest.fn().mockResolvedValue([]) },
        tenantCategory: { deleteMany: jest.fn(), createMany: jest.fn() },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(txOnly));

      await service.updateMarketplace("tenant-1", { listedInMarketplace: true } as any);

      // A releitura final tem que ter acontecido em txOnly (2 chamadas: a checagem de
      // city/categoria + o getMarketplaceSettings do retorno) — nenhuma no prisma raiz.
      expect(txOnly.tenant.findUniqueOrThrow).toHaveBeenCalledTimes(2);
      expect(prisma.tenant.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.serviceCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe("updateLogo", () => {
    it("rejeita mimetype fora da lista permitida", async () => {
      await expect(
        service.updateLogo("tenant-1", makeFile({ mimetype: "image/svg+xml" })),
      ).rejects.toThrow(BadRequestException);
      expect(convertToWebp).not.toHaveBeenCalled();
    });

    it("rejeita arquivo acima do limite de tamanho", async () => {
      await expect(
        service.updateLogo("tenant-1", makeFile({ size: 10 * 1024 * 1024 })),
      ).rejects.toThrow(BadRequestException);
      expect(convertToWebp).not.toHaveBeenCalled();
    });

    it("converte pro tamanho máximo de logo e grava a URL", async () => {
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ logoUrl: "/uploads/tenants/tenant-1/logo.webp" });

      await service.updateLogo("tenant-1", makeFile());

      expect(convertToWebp).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ maxDimension: 800 }),
      );
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: { logoUrl: "/uploads/tenants/tenant-1/logo.webp" },
      });
    });
  });

  describe("removeLogo", () => {
    it("zera a logo mesmo se o arquivo físico já não existir", async () => {
      (unlink as jest.Mock).mockRejectedValueOnce(new Error("ENOENT"));
      (prisma.tenant.update as jest.Mock).mockResolvedValue({ logoUrl: null });

      await service.removeLogo("tenant-1");

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: { logoUrl: null },
      });
    });
  });

  describe("addGalleryImage", () => {
    it("rejeita quando o tenant já atingiu o limite de fotos", async () => {
      (prisma.tenantGalleryImage.count as jest.Mock).mockResolvedValue(12);

      await expect(service.addGalleryImage("tenant-1", makeFile())).rejects.toThrow(
        BadRequestException,
      );
      expect(convertToWebp).not.toHaveBeenCalled();
    });

    it("usa o tamanho máximo de galeria e a posição seguinte disponível", async () => {
      (prisma.tenantGalleryImage.count as jest.Mock).mockResolvedValue(3);
      (prisma.tenantGalleryImage.create as jest.Mock).mockResolvedValue({ id: "img-1" });

      await service.addGalleryImage("tenant-1", makeFile());

      expect(convertToWebp).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ maxDimension: 1600 }),
      );
      expect(prisma.tenantGalleryImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: "tenant-1", position: 3 }),
      });
    });
  });

  describe("removeGalleryImage", () => {
    // Regressão de IDOR: sem o tenantId na query, um dono conseguiria remover foto da
    // galeria de outro salão só sabendo o id da imagem.
    it("rejeita remover uma foto que não pertence ao tenant", async () => {
      (prisma.tenantGalleryImage.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.removeGalleryImage("tenant-1", "img-de-outro-tenant")).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tenantGalleryImage.findFirst).toHaveBeenCalledWith({
        where: { id: "img-de-outro-tenant", tenantId: "tenant-1" },
      });
      expect(prisma.tenantGalleryImage.delete).not.toHaveBeenCalled();
    });

    it("remove a foto quando pertence ao tenant", async () => {
      (prisma.tenantGalleryImage.findFirst as jest.Mock).mockResolvedValue({
        id: "img-1",
        tenantId: "tenant-1",
        url: "/uploads/tenants/tenant-1/gallery/abc.webp",
      });

      await service.removeGalleryImage("tenant-1", "img-1");

      expect(prisma.tenantGalleryImage.delete).toHaveBeenCalledWith({ where: { id: "img-1" } });
    });
  });
});
