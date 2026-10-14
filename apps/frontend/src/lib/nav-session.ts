import "server-only";
import type { ConsumerMe, Paginated, PublicBooking } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { consumerAuthedFetch, getConsumerToken } from "@/lib/consumer-session";

export type NavSession =
  | { kind: "staff"; name: string; role: "OWNER" | "RECEPTIONIST" | "PROFESSIONAL" }
  | { kind: "consumer"; name: string; upcomingCount: number }
  | null;

// Quem está logado, pra qualquer barra superior do site mostrar o acesso certo. Duas
// identidades separadas (staff = NextAuth, cliente = cookie ta_consumer); staff tem prioridade
// se as duas existirem. O contador de compromissos é o total de horários futuros em TODOS os
// salões (o backend devolve só o total com pageSize=1, sem trazer os agendamentos). Falha
// (token expirado, backend fora) degrada pra deslogado em vez de quebrar a página.
export async function getNavSession(): Promise<NavSession> {
  try {
    const staff = await auth();
    if (staff?.user && !staff.error) {
      return { kind: "staff", name: staff.user.name ?? "", role: staff.user.role };
    }
  } catch {
    /* sessão de staff inválida: segue como deslogado/cliente */
  }

  if (!(await getConsumerToken())) return null;
  try {
    const [me, upcoming] = await Promise.all([
      consumerAuthedFetch<ConsumerMe>("/public/consumer/me"),
      consumerAuthedFetch<Paginated<PublicBooking>>(
        "/public/consumer/bookings?scope=upcoming&pageSize=1",
      ),
    ]);
    return { kind: "consumer", name: me.name, upcomingCount: upcoming.total };
  } catch {
    return null;
  }
}
