import type {
  ApiErrorBody,
  AvailableSlot,
  PublicProfessional,
  PublicService,
  PublicTenant,
} from "@marquo/shared-types";

import { assertSafeApiPath } from "./api-path";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${assertSafeApiPath(path)}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Erro inesperado ao comunicar com o servidor.");
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export interface SignupInput {
  businessName: string;
  ownerName: string;
  email: string;
  // Telefone do dono (contato comercial da plataforma). O backend valida e normaliza.
  phone: string;
  password: string;
  // Versão dos Termos/Privacidade que o usuário aceitou (LEGAL_DOCS_VERSION); o backend confere.
  acceptedTermsVersion: string;
  // Cupom de campanha (opcional). Só o código: dias e desconto são sempre do servidor.
  couponCode?: string;
}

export const publicApi = {
  // Chamado direto do navegador (não por Server Action) de propósito: o throttle de 5/hora por
  // IP do backend precisa enxergar o IP do visitante. Por Server Action ele veria só o IP do
  // servidor Next e o limite valeria para o produto inteiro.
  signup: (input: SignupInput) =>
    request<{ slug: string; emailVerificationRequired?: boolean }>("/public/signup", { method: "POST", body: JSON.stringify(input) }),

  getTenant: (slug: string) => request<PublicTenant>(`/public/tenants/${encodeURIComponent(slug)}`),

  getServices: (slug: string) => request<PublicService[]>(`/public/tenants/${encodeURIComponent(slug)}/services`),

  getProfessionals: (slug: string, serviceId: string) =>
    request<PublicProfessional[]>(
      `/public/tenants/${encodeURIComponent(slug)}/professionals?serviceId=${encodeURIComponent(serviceId)}`,
    ),

  getTeam: (slug: string) => request<PublicProfessional[]>(`/public/tenants/${encodeURIComponent(slug)}/professionals/team`),

  getAvailability: (slug: string, professionalId: string, serviceId: string, date: string) =>
    request<AvailableSlot[]>(
      `/public/tenants/${encodeURIComponent(slug)}/professionals/${encodeURIComponent(professionalId)}/availability?serviceId=${encodeURIComponent(
        serviceId,
      )}&date=${encodeURIComponent(date)}`,
    ),
};
