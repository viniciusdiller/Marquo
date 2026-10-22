import { auth } from "@/lib/auth";
import { backendFetch } from "@/lib/backend-fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Só aceita do backend um nome de arquivo simples; qualquer outra coisa cai no nome padrão (o cabeçalho é repassado
// ao navegador, então não pode carregar nada além de um nome seguro).
const SAFE_DISPOSITION = /^attachment; filename="[A-Za-z0-9._-]{1,120}"$/;
const FALLBACK_DISPOSITION = 'attachment; filename="marquo-dados.json"';

// Download da cópia dos dados do negócio (só o DONO). O arquivo vem em streaming do backend e é repassado sem ser
// carregado na memória do Next. Quem decide tudo é o backend (papel, tenant e limite de uso); aqui só se confere a
// sessão para não chamar a API à toa.
export async function GET() {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return new Response("Só o dono do negócio pode exportar os dados.", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await backendFetch(`${API_URL}/export/data`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
  } catch {
    return new Response("Não foi possível gerar a exportação agora.", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 429 || upstream.status === 409 ? upstream.status : 502;
    const message =
      status === 429
        ? "Muitas exportações seguidas. Aguarde alguns minutos."
        : status === 409
          ? "Já existe uma exportação em andamento. Aguarde terminar."
          : "Não foi possível gerar a exportação agora.";
    return new Response(message, { status });
  }

  const disposition = upstream.headers.get("content-disposition") ?? "";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": SAFE_DISPOSITION.test(disposition) ? disposition : FALLBACK_DISPOSITION,
      "Cache-Control": "no-store",
    },
  });
}
