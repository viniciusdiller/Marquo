import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FieldCryptoService } from "../../common/crypto/field-crypto.service";
import { isValidCpf, normalizeCpf } from "../../common/utils/cpf.util";
import { isValidCnpj, normalizeCnpj } from "../../common/utils/cnpj.util";
import { isPlausibleBrazilianPhone, normalizePhone } from "../../common/utils/phone.util";

// O que o dono pode informar no checkout. Tudo opcional: o que faltar vem do cadastro salvo. Os dados do PAGADOR nunca
// vêm de outro lugar que não o dono autenticado (tenant e usuário saem do JWT).
export interface BillingProfileInput {
  cpfCnpj?: string;
  phone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
}

// Dados completos, já validados e normalizados, prontos para o Asaas.
export interface PayerData {
  document: string;
  phone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string | null;
  province: string;
}

export type BillingProfileField = "cpfCnpj" | "phone" | "postalCode" | "address" | "addressNumber" | "province";

const FIELD_LABEL: Record<BillingProfileField, string> = {
  cpfCnpj: "CPF ou CNPJ",
  phone: "telefone",
  postalCode: "CEP",
  address: "rua",
  addressNumber: "número",
  province: "bairro",
};

export interface BillingProfileView {
  // Máscara do documento salvo ("***.***.***-12"); o documento inteiro NUNCA volta para o navegador.
  documentHint: string | null;
  phone: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  complement: string | null;
  province: string | null;
  // Se o servidor consegue guardar o documento (chave de criptografia configurada).
  canStoreDocument: boolean;
  // O que ainda falta para o checkout de cartão (o Pix só precisa do documento).
  missingForCard: BillingProfileField[];
  missingForPix: BillingProfileField[];
}

function clean(value: string | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function documentOf(raw: string): string | null {
  if (isValidCpf(raw)) return normalizeCpf(raw);
  if (isValidCnpj(raw)) return normalizeCnpj(raw);
  return null;
}

function hintOf(document: string): string {
  return document.length === 14 ? `**.***.***/****-${document.slice(-2)}` : `***.***.***-${document.slice(-2)}`;
}

// Dados de cobrança do negócio, reaproveitados entre cobranças. O CPF/CNPJ é guardado criptografado (FieldCryptoService)
// e só sai daqui em direção ao Asaas; para a tela vai apenas a máscara. Toda leitura/escrita leva o tenantId do JWT.
@Injectable()
export class BillingProfileService {
  private readonly logger = new Logger(BillingProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCryptoService,
  ) {}

  async view(tenantId: string, userId: string): Promise<BillingProfileView> {
    const saved = await this.prisma.tenantBillingProfile.findFirst({ where: { tenantId } });
    const ownerPhone = await this.ownerPhone(tenantId, userId);
    const document = this.readDocument(tenantId, saved?.documentEnc ?? null);
    const merged = {
      document,
      phone: saved?.phone ?? ownerPhone,
      postalCode: saved?.postalCode ?? null,
      address: saved?.address ?? null,
      addressNumber: saved?.addressNumber ?? null,
      province: saved?.province ?? null,
    };
    return {
      documentHint: document ? hintOf(document) : (saved?.documentHint ?? null),
      phone: merged.phone,
      postalCode: merged.postalCode,
      address: merged.address,
      addressNumber: merged.addressNumber,
      complement: saved?.complement ?? null,
      province: merged.province,
      canStoreDocument: this.crypto.enabled,
      // `documentHint` sozinho não basta: sem conseguir decifrar, o documento precisa ser digitado de novo.
      missingForCard: this.missing(merged, true),
      missingForPix: this.missing(merged, false),
    };
  }

  // Junta o que o dono mandou com o que está salvo, valida TUDO no servidor e grava o que for novo. `needAddress` é
  // verdadeiro no cartão (o checkout do Asaas exige telefone e endereço do cliente); no Pix basta o documento.
  async resolve(
    tenantId: string,
    userId: string,
    input: BillingProfileInput,
    needAddress: boolean,
  ): Promise<PayerData> {
    const saved = await this.prisma.tenantBillingProfile.findFirst({ where: { tenantId } });

    const typedDocument = input.cpfCnpj ? documentOf(input.cpfCnpj) : null;
    if (input.cpfCnpj && !typedDocument) throw new BadRequestException("CPF ou CNPJ inválido.");
    const document = typedDocument ?? this.readDocument(tenantId, saved?.documentEnc ?? null);

    const typedPhone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !(typedPhone && isPlausibleBrazilianPhone(typedPhone))) {
      throw new BadRequestException("Telefone inválido. Informe DDD e número.");
    }
    const phone = typedPhone ?? saved?.phone ?? (await this.ownerPhone(tenantId, userId));

    const typedPostal = input.postalCode ? input.postalCode.replace(/\D/g, "") : null;
    if (input.postalCode && typedPostal?.length !== 8) throw new BadRequestException("CEP inválido. Informe os 8 dígitos.");
    const postalCode = typedPostal ?? saved?.postalCode ?? null;

    const address = clean(input.address, 120) ?? saved?.address ?? null;
    const addressNumber = clean(input.addressNumber, 20) ?? saved?.addressNumber ?? null;
    const province = clean(input.province, 80) ?? saved?.province ?? null;
    // Complemento em branco LIMPA o valor salvo; ausente (undefined) mantém.
    const complement = input.complement === undefined ? (saved?.complement ?? null) : clean(input.complement, 80);

    const merged = { document, phone, postalCode, address, addressNumber, province };
    const missing = this.missing(merged, needAddress);
    if (missing.length > 0) {
      throw new BadRequestException(`Preencha para continuar: ${missing.map((f) => FIELD_LABEL[f]).join(", ")}.`);
    }

    await this.save(tenantId, {
      document: typedDocument,
      phone: typedPhone,
      postalCode: typedPostal,
      address: clean(input.address, 120),
      addressNumber: clean(input.addressNumber, 20),
      province: clean(input.province, 80),
      complement,
      complementGiven: input.complement !== undefined,
    });

    return {
      document: document as string,
      phone: phone as string,
      postalCode: (postalCode ?? "") as string,
      address: (address ?? "") as string,
      addressNumber: (addressNumber ?? "") as string,
      complement,
      province: (province ?? "") as string,
    };
  }

  // Só o documento (Pix e troca de plano), usando o salvo quando o dono não digitou outro.
  async resolveDocument(tenantId: string, typed: string | undefined): Promise<string | null> {
    if (typed) {
      const document = documentOf(typed);
      if (!document) throw new BadRequestException("CPF ou CNPJ inválido.");
      await this.save(tenantId, { document });
      return document;
    }
    const saved = await this.prisma.tenantBillingProfile.findFirst({ where: { tenantId }, select: { documentEnc: true } });
    return this.readDocument(tenantId, saved?.documentEnc ?? null);
  }

  private missing(
    data: {
      document: string | null;
      phone: string | null;
      postalCode: string | null;
      address: string | null;
      addressNumber: string | null;
      province: string | null;
    },
    needAddress: boolean,
  ): BillingProfileField[] {
    const out: BillingProfileField[] = [];
    if (!data.document) out.push("cpfCnpj");
    if (needAddress) {
      if (!data.phone) out.push("phone");
      if (!data.postalCode) out.push("postalCode");
      if (!data.address) out.push("address");
      if (!data.addressNumber) out.push("addressNumber");
      if (!data.province) out.push("province");
    }
    return out;
  }

  private readDocument(tenantId: string, encrypted: string | null): string | null {
    if (!encrypted) return null;
    const plain = this.crypto.decrypt(encrypted, tenantId);
    if (!plain) {
      // Chave trocada/perdida ou valor adulterado: o dono digita de novo. Nunca loga o conteúdo.
      this.logger.warn(`Documento de cobrança ilegível (negócio ${tenantId}); será pedido de novo.`);
      return null;
    }
    return documentOf(plain);
  }

  private async save(
    tenantId: string,
    data: {
      document?: string | null;
      phone?: string | null;
      postalCode?: string | null;
      address?: string | null;
      addressNumber?: string | null;
      province?: string | null;
      complement?: string | null;
      complementGiven?: boolean;
    },
  ): Promise<void> {
    const patch: Record<string, string | null> = {};
    if (data.document && this.crypto.enabled) {
      patch.documentEnc = this.crypto.encrypt(data.document, tenantId);
      patch.documentHint = hintOf(data.document);
    }
    if (data.phone) patch.phone = data.phone;
    if (data.postalCode) patch.postalCode = data.postalCode;
    if (data.address) patch.address = data.address;
    if (data.addressNumber) patch.addressNumber = data.addressNumber;
    if (data.province) patch.province = data.province;
    if (data.complementGiven) patch.complement = data.complement ?? null;
    if (Object.keys(patch).length === 0) return;
    await this.prisma.tenantBillingProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...patch },
      update: patch,
    });
  }

  private async ownerPhone(tenantId: string, userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { phone: true } });
    return user?.phone ?? null;
  }
}
