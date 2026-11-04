import { join } from "path";
import { mkdir, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@marquo/database";
import { TenantSetupStatus, TenantSetupStep } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateTenantProfileDto } from "./dto/update-tenant-profile.dto";
import { UpdateMarketplaceDto } from "./dto/update-marketplace.dto";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "../common/constants/uploads";
import { convertToWebp } from "../common/utils/image.util";

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const LOGO_MAX_DIMENSION = 800;
const GALLERY_MAX_DIMENSION = 1600;
const MAX_GALLERY_IMAGES = 12;

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  // Campos explícitos: o painel (qualquer papel, inclusive PROFESSIONAL) recebe só o perfil do
  // próprio negócio — nunca colunas de billing/integração (createdAt, trial, suspensão...).
  findById(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        trialEndsAt: true,
        updatedAt: true,
        description: true,
        address: true,
        businessHours: true,
        logoUrl: true,
        accentColor: true,
        whatsappNumber: true,
        instagramUrl: true,
        showServices: true,
        showTeam: true,
        showGallery: true,
        showContact: true,
        minSchedulingLeadTimeMinutes: true,
        maxSchedulingLeadTimeDays: true,
        notifyStaffByEmail: true,
        galleryImages: { orderBy: { position: "asc" } },
      },
    });
  }

  async findPublicBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        businessHours: true,
        logoUrl: true,
        updatedAt: true,
        accentColor: true,
        whatsappNumber: true,
        instagramUrl: true,
        showServices: true,
        showTeam: true,
        showGallery: true,
        showContact: true,
        minSchedulingLeadTimeMinutes: true,
        maxSchedulingLeadTimeDays: true,
        galleryImages: {
          select: { id: true, url: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }

    return tenant;
  }

  // Texto opcional em branco limpa o campo (null); undefined (campo ausente) não altera nada.
  updateProfile(tenantId: string, dto: UpdateTenantProfileDto) {
    const nullable = (value?: string) => (value === undefined ? undefined : value.trim() === "" ? null : value);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...dto,
        description: nullable(dto.description),
        address: nullable(dto.address),
        businessHours: nullable(dto.businessHours),
        accentColor: nullable(dto.accentColor),
        whatsappNumber: nullable(dto.whatsappNumber),
        instagramUrl: nullable(dto.instagramUrl),
      },
    });
  }

  // Aceita a própria transação (tx) quando chamado de dentro de updateMarketplace — usar
  // this.prisma ali leria por uma conexão separada, que ainda não enxerga a escrita recém
  // feita (não comitada), e devolveria pro cliente HTTP o estado de ANTES da atualização
  // mesmo com o banco já correto por baixo.
  async getMarketplaceSettings(tenantId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const [tenant, categories] = await Promise.all([
      db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: {
          listedInMarketplace: true,
          city: true,
          neighborhood: true,
          latitude: true,
          longitude: true,
          priceRange: true,
          categories: { select: { category: { select: { slug: true } } } },
        },
      }),
      db.serviceCategory.findMany({ orderBy: { position: "asc" } }),
    ]);
    return {
      ...tenant,
      categorySlugs: tenant.categories.map((c) => c.category.slug),
      availableCategories: categories,
    };
  }

  async updateMarketplace(tenantId: string, dto: UpdateMarketplaceDto) {
    const { categorySlugs, ...scalar } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (categorySlugs) {
        const categories = await tx.serviceCategory.findMany({
          where: { slug: { in: categorySlugs } },
          select: { id: true },
        });
        await tx.tenantCategory.deleteMany({ where: { tenantId } });
        await tx.tenantCategory.createMany({
          data: categories.map((c) => ({ tenantId, categoryId: c.id })),
        });
      }

      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: scalar,
        select: { id: true },
      });

      // Não deixa listar sem cidade e sem pelo menos uma categoria — vitrine vazia é ruído.
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: updated.id },
        select: { listedInMarketplace: true, city: true, _count: { select: { categories: true } } },
      });
      if (tenant.listedInMarketplace && (!tenant.city || tenant._count.categories === 0)) {
        throw new BadRequestException(
          "Para aparecer no marketplace, informe a cidade e ao menos uma categoria.",
        );
      }

      return this.getMarketplaceSettings(tenantId, tx);
    });
  }

  private assertValidImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nenhum arquivo enviado.");
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException("Formato de imagem não suportado. Use JPEG, PNG ou WEBP.");
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException("Imagem muito grande (máximo 5MB).");
    }
  }

  async updateLogo(tenantId: string, file: Express.Multer.File) {
    this.assertValidImage(file);

    const tenantDir = join(UPLOADS_DIR, "tenants", tenantId);
    await mkdir(tenantDir, { recursive: true });

    // Nome fixo por tenant: reupload sobrescreve o arquivo anterior, sem lixo acumulando.
    await convertToWebp(file.buffer, {
      maxDimension: LOGO_MAX_DIMENSION,
      quality: 80,
      outPath: join(tenantDir, "logo.webp"),
    });

    const logoUrl = `${UPLOADS_URL_PREFIX}/tenants/${tenantId}/logo.webp`;
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl } });
  }

  async removeLogo(tenantId: string) {
    // Só o arquivo do logo — não o diretório do tenant inteiro, que também guarda a galeria.
    await unlink(join(UPLOADS_DIR, "tenants", tenantId, "logo.webp")).catch(() => {});
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: null } });
  }

  async addGalleryImage(tenantId: string, file: Express.Multer.File) {
    this.assertValidImage(file);

    const existingCount = await this.prisma.tenantGalleryImage.count({ where: { tenantId } });
    if (existingCount >= MAX_GALLERY_IMAGES) {
      throw new BadRequestException(`Limite de ${MAX_GALLERY_IMAGES} fotos na galeria atingido.`);
    }

    const galleryDir = join(UPLOADS_DIR, "tenants", tenantId, "gallery");
    await mkdir(galleryDir, { recursive: true });

    const filename = `${randomUUID()}.webp`;
    await convertToWebp(file.buffer, {
      maxDimension: GALLERY_MAX_DIMENSION,
      quality: 82,
      outPath: join(galleryDir, filename),
    });

    const url = `${UPLOADS_URL_PREFIX}/tenants/${tenantId}/gallery/${filename}`;
    return this.prisma.tenantGalleryImage.create({
      data: { tenantId, url, position: existingCount },
    });
  }

  async removeGalleryImage(tenantId: string, imageId: string) {
    const image = await this.prisma.tenantGalleryImage.findFirst({
      where: { id: imageId, tenantId },
    });
    if (!image) {
      throw new NotFoundException("Foto não encontrada.");
    }

    const filename = image.url.split("/").pop()!;
    await unlink(join(UPLOADS_DIR, "tenants", tenantId, "gallery", filename)).catch(() => {});
    await this.prisma.tenantGalleryImage.delete({ where: { id: imageId } });
  }

  async getSetupStatus(tenantId: string): Promise<TenantSetupStatus> {
    const [tenant, servicesCount, professionalsCount, workingHoursCount, linkedServicesCount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          slug: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          whatsappNumber: true,
        },
      }),
      this.prisma.service.count({ where: { tenantId, isActive: true } }),
      this.prisma.professional.count({ where: { tenantId, isActive: true } }),
      this.prisma.workingHours.count({ where: { professional: { tenantId, isActive: true } } }),
      this.prisma.professionalService.count({
        where: {
          professional: { tenantId, isActive: true },
          isActive: true,
          service: { isActive: true },
        },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }

    const hasServices = servicesCount > 0;
    const hasProfessionals = professionalsCount > 0;
    const hasWorkingHours = workingHoursCount > 0;
    const hasLinkedServices = linkedServicesCount > 0;
    const hasLocation = Boolean(
      (tenant.address && tenant.address.trim().length > 0) ||
      (tenant.latitude != null && tenant.longitude != null)
    );
    const hasContact = Boolean(tenant.whatsappNumber && tenant.whatsappNumber.trim().length > 0);

    const steps: TenantSetupStep[] = [
      {
        id: "services",
        title: "Cadastrar serviços",
        description: "Adicione cortes, barba ou outros serviços com duração e preço.",
        isComplete: hasServices,
        href: "/dashboard/servicos",
        importance: "critical",
      },
      {
        id: "professionals",
        title: "Cadastrar equipe / barbeiros",
        description: "Cadastre pelo menos um profissional que atenderá os clientes.",
        isComplete: hasProfessionals,
        href: "/dashboard/profissionais",
        importance: "critical",
      },
      {
        id: "working_hours",
        title: "Definir horários de expediente",
        description: "Configure os dias da semana e horários em que cada barbeiro atende.",
        isComplete: hasWorkingHours,
        href: "/dashboard/profissionais",
        importance: "critical",
      },
      {
        id: "service_links",
        title: "Vincular serviços ao barbeiro",
        description: "Defina quais serviços cada profissional está habilitado a prestar.",
        isComplete: hasLinkedServices,
        href: "/dashboard/profissionais",
        importance: "critical",
      },
      {
        id: "location",
        title: "Endereço e localização",
        description: "Informe o endereço e ponto no mapa para clientes e marketplace encontrarem você.",
        isComplete: hasLocation,
        href: "/dashboard/configuracoes",
        importance: "recommended",
      },
      {
        id: "contact",
        title: "WhatsApp de atendimento",
        description: "Adicione o número de WhatsApp para exibir na sua página pública.",
        isComplete: hasContact,
        href: "/dashboard/configuracoes",
        importance: "recommended",
      },
    ];

    const completedStepsCount = steps.filter((s) => s.isComplete).length;
    const totalStepsCount = steps.length;
    const isReadyForBooking = hasServices && hasProfessionals && hasWorkingHours && hasLinkedServices;
    const isFullySetup = completedStepsCount === totalStepsCount;

    return {
      isFullySetup,
      isReadyForBooking,
      completedStepsCount,
      totalStepsCount,
      slug: tenant.slug,
      steps,
    };
  }
}
