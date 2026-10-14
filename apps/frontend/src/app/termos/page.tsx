import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { TERMS_SECTIONS } from "@/lib/legal-content";

export const metadata: Metadata = { title: "Termos de Uso - Marquo" };

export default function TermosPage() {
  return <LegalDocument title="Termos de Uso" sections={TERMS_SECTIONS} />;
}
