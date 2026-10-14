import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { IntakeFieldDto, UpsertIntakeFormDto } from "./dto/upsert-intake-form.dto";
import { SubmitIntakeResponseDto } from "./dto/submit-intake-response.dto";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Injectable()
export class IntakeService {
  constructor(private readonly prisma: PrismaService) {}

  listForms(tenantId: string) {
    return this.prisma.intakeForm.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createForm(tenantId: string, dto: UpsertIntakeFormDto) {
    this.assertUniqueKeys(dto.fields);
    return this.prisma.intakeForm.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        fields: dto.fields as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateForm(tenantId: string, id: string, dto: UpsertIntakeFormDto) {
    await this.getFormOrThrow(tenantId, id);
    this.assertUniqueKeys(dto.fields);
    return this.prisma.intakeForm.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        fields: dto.fields as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // `actor` restringe PROFESSIONAL: ele não enxerga a base de clientes (rota de clientes é
  // OWNER/RECEPTIONIST), então só pode preencher a ficha de um cliente que ELE atende — provado
  // por um atendimento próprio (professionalId no WHERE). Sem isso, qualquer id de cliente do
  // tenant (visível em qualquer atendimento do calendário) recebia ficha de qualquer profissional.
  async submitResponse(
    tenantId: string,
    dto: SubmitIntakeResponseDto,
    actor?: Pick<AuthenticatedUser, "role" | "professionalId">,
  ) {
    const scopedToOwnAppointments = actor?.role === Role.PROFESSIONAL;
    if (scopedToOwnAppointments && (!dto.appointmentId || !actor.professionalId)) {
      throw new BadRequestException("Informe o atendimento do cliente para registrar a ficha.");
    }
    const [form, client] = await Promise.all([
      this.getFormOrThrow(tenantId, dto.formId),
      this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!client) {
      throw new NotFoundException("Cliente não encontrado.");
    }

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: {
          id: dto.appointmentId,
          tenantId,
          clientId: dto.clientId,
          ...(scopedToOwnAppointments ? { professionalId: actor.professionalId } : {}),
        },
        select: { id: true },
      });
      if (!appointment) {
        throw new BadRequestException("Atendimento não pertence a este cliente.");
      }
    }

    const fields = form.fields as unknown as IntakeFieldDto[];
    const answers = this.sanitizeAnswers(fields, dto.answers);

    return this.prisma.intakeResponse.create({
      data: {
        tenantId,
        formId: dto.formId,
        clientId: dto.clientId,
        appointmentId: dto.appointmentId,
        answers: answers as Prisma.InputJsonValue,
      },
    });
  }

  private async getFormOrThrow(tenantId: string, id: string) {
    const form = await this.prisma.intakeForm.findFirst({ where: { id, tenantId } });
    if (!form) {
      throw new NotFoundException("Ficha não encontrada.");
    }
    return form;
  }

  private assertUniqueKeys(fields: IntakeFieldDto[]) {
    const keys = fields.map((f) => f.key.trim());
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException("As chaves dos campos da ficha devem ser únicas.");
    }
    for (const field of fields) {
      if (field.type === "select" && (!field.options || field.options.length === 0)) {
        throw new BadRequestException(`O campo "${field.label}" (select) precisa de opções.`);
      }
    }
  }

  // Só aceita chaves declaradas no form; coage tipos; exige campos required.
  private sanitizeAnswers(fields: IntakeFieldDto[], raw: Record<string, unknown>) {
    const result: Record<string, string | boolean> = {};
    for (const field of fields) {
      // hasOwn: uma chave como "constructor" não pode ler o protótipo do objeto de respostas.
      const value = Object.hasOwn(raw, field.key) ? raw[field.key] : undefined;
      if (value === undefined || value === null || value === "") {
        if (field.required) {
          throw new BadRequestException(`O campo "${field.label}" é obrigatório.`);
        }
        continue;
      }
      if (field.type === "boolean") {
        result[field.key] = value === true || value === "true";
      } else if (field.type === "select") {
        if (!field.options?.includes(String(value))) {
          throw new BadRequestException(`Valor inválido para "${field.label}".`);
        }
        result[field.key] = String(value);
      } else {
        result[field.key] = String(value).slice(0, 4000);
      }
    }
    return result;
  }
}
