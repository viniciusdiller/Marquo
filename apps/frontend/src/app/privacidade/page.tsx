import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { PRIVACY_SECTIONS } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de privacidade, proteção de dados pessoais e diretrizes LGPD da plataforma Marquo.",
  alternates: {
    canonical: "/privacidade",
  },
};

export default function PrivacidadePage() {
  return <LegalDocument title="Política de Privacidade" sections={PRIVACY_SECTIONS} />;
}
