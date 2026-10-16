// Link do WhatsApp a partir do telefone nacional salvo (só dígitos, sem DDI). Sem React nem next/*: testável
// com node --test. Devolve null para qualquer coisa que não pareça um telefone brasileiro, em vez de montar
// um link para um número impossível.
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const national = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return null;
  if (!/^[1-9][1-9]/.test(national)) return null;
  const base = `https://wa.me/55${national}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
