import NextAuth, { type Session, type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { decodeJwtExpiryMs } from "./jwt-decode";
import { backendFetch } from "./backend-fetch";
import { EmailNotVerifiedError } from "./auth-errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Renova o access token perto do vencimento (12h no backend) usando o refresh token (30d).
// Revalida o usuário no banco a cada troca (ver AuthService.refresh) — não é só reassinar
// as claims antigas.
// O Next chama o callback `jwt` várias vezes por navegação (proxy, layout, página, Server Actions), todas com o
// MESMO cookie. Sem isto cada uma faria um POST /auth/refresh: gasta o limite de 10/min por IP do backend (um
// salão inteiro atrás do mesmo IP) e, com rotação, cria um token irmão por chamada. Aqui as chamadas com o mesmo
// refresh token dividem UMA renovação (em andamento ou concluída há poucos segundos). O resultado só é entregue
// a quem apresenta o token antigo (prova de posse) e vive só em memória deste processo; entre processos quem
// protege é a janela de tolerância do backend (RefreshTokenService).
const RENEWAL_SHARE_MS = 10_000;
const renewals = new Map<string, { promise: Promise<JWT>; expiresAt: number }>();

function refreshAccessToken(token: JWT): Promise<JWT> {
  const key = token.refreshToken;
  const now = Date.now();
  for (const [k, v] of renewals) if (v.expiresAt <= now) renewals.delete(k);

  const shared = key ? renewals.get(key) : undefined;
  if (shared) return shared.promise;

  const promise = renewAccessToken(token);
  if (key) renewals.set(key, { promise, expiresAt: now + RENEWAL_SHARE_MS });
  // Falha não fica guardada: a próxima requisição tenta de novo em vez de herdar o erro por 10s.
  promise.then((result) => {
    if (result.error && key) renewals.delete(key);
  });
  return promise;
}

async function renewAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await backendFetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });

    // 401 = o backend recusou ESTE refresh token (vencido, revogado, reutilizado, usuário desativado): a
    // sessão acabou de verdade. Qualquer outra falha (429, 5xx) é transitória: mantém a sessão e tenta de
    // novo na próxima requisição em vez de deslogar o usuário por um soluço do servidor.
    if (response.status === 401) return { ...token, error: "RefreshAccessTokenError" };
    if (!response.ok) return token;

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      user: {
        tenantId: string;
        role: "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";
        professionalId?: string;
      };
    };

    return {
      ...token,
      accessToken: data.accessToken,
      accessTokenExpires: decodeJwtExpiryMs(data.accessToken),
      refreshToken: data.refreshToken,
      tenantId: data.user.tenantId,
      role: data.user.role,
      professionalId: data.user.professionalId,
      error: undefined,
    };
  } catch {
    // Rede/backend fora: transitório. A próxima requisição tenta de novo (o token velho fica como está).
    return token;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  events: {
    // Logout de verdade: revoga a família do refresh token no backend. Só apagar o cookie deixava o token
    // copiado válido por 30 dias. Melhor esforço: se o backend estiver fora, o cookie some do mesmo jeito.
    async signOut(message) {
      const refreshToken = "token" in message ? message.token?.refreshToken : undefined;
      if (!refreshToken) return;
      try {
        await backendFetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // sem sorte: o token vence sozinho e a rotação limita o estrago
      }
    },
  },
  pages: { signIn: "/entrar" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const response = await backendFetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });

        if (!response.ok) {
          // O backend só diz que falta confirmar o e-mail depois de a senha estar certa; qualquer outra falha
          // continua sendo o "credenciais inválidas" genérico.
          if (response.status === 403) {
            const body = (await response.json().catch(() => null)) as { code?: string } | null;
            if (body?.code === "EMAIL_NOT_VERIFIED") throw new EmailNotVerifiedError();
          }
          return null;
        }

        const data = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
          user: {
            id: string;
            tenantId: string;
            role: "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";
            email: string;
            name: string;
            professionalId?: string;
          };
        };

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tenantId: data.user.tenantId,
          role: data.user.role,
          professionalId: data.user.professionalId,
        } satisfies User;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = decodeJwtExpiryMs(user.accessToken);
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.professionalId = user.professionalId;
        token.error = undefined;
        return token;
      }

      // Folga de 30s pra cobrir a duração da própria requisição em andamento.
      if (Date.now() < token.accessTokenExpires - 30_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role;
      session.user.professionalId = token.professionalId;
      return session;
    },
  },
});
