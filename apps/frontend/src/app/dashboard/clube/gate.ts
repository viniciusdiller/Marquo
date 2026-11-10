import type { ClubOverview } from "@marquo/shared-types";

// Por que o clube está bloqueado, na linguagem do dono. No período de teste não existe assinatura: o teste vale como o plano de
// entrada (Essencial, sem clube), e escolher "Profissional" no cadastro é só uma preferência de exibição, não ativa plano algum.
export function blockedMessage(overview: Pick<ClubOverview, "onTrial" | "planName">): { title: string; description: string } {
  if (overview.onTrial) {
    return {
      title: "O clube não está incluído no período de teste",
      description:
        "O teste usa o plano de entrada (Essencial), que não tem clube. Assine o Profissional ou o Premium em Plano e cobrança para liberar. Escolher um plano no cadastro não ativa nada: vale a assinatura.",
    };
  }
  return {
    title: "Disponível nos planos Profissional e Premium",
    description: `Seu plano atual${overview.planName ? ` (${overview.planName})` : ""} não inclui o clube. Troque para o Profissional ou o Premium para liberar: você vende pacotes mensais, controla os usos de cada cliente e o valor entra no Financeiro.`,
  };
}
