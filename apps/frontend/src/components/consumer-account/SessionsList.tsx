"use client";

import { useTransition } from "react";
import { DateTime } from "luxon";
import { DeviceMobile, Monitor } from "@phosphor-icons/react/dist/ssr";
import type { ConsumerDevice } from "@marquo/shared-types";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/minha-conta/actions";

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const browser = /edg/i.test(userAgent)
    ? "Edge"
    : /chrome/i.test(userAgent)
      ? "Chrome"
      : /firefox/i.test(userAgent)
        ? "Firefox"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Navegador";
  const os = /android/i.test(userAgent)
    ? "Android"
    : /iphone|ipad/i.test(userAgent)
      ? "iOS"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /mac os/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : null;
  return os ? `${browser} · ${os}` : browser;
}

function isMobile(userAgent: string | null): boolean {
  return !!userAgent && /android|iphone|ipad/i.test(userAgent);
}

// Lista de dispositivos com sessão ativa (ConsumerAuthService.listSessions) — cada linha é a
// própria sessão que "nunca expira" enquanto o cliente continuar usando o site (proxy.ts a
// renova sozinho perto do vencimento); revogar aqui é o jeito de derrubar um dispositivo
// específico sem precisar trocar a senha.
export function SessionsList({ sessions }: { sessions: ConsumerDevice[] }) {
  const [pending, startTransition] = useTransition();
  const hasOthers = sessions.some((s) => !s.current);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <p className="font-brand font-semibold text-zinc-900 dark:text-white">Dispositivos conectados</p>
        {hasOthers ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => revokeOtherSessionsAction())}
            className="text-xs font-semibold text-red-600 hover:opacity-80 disabled:opacity-50 dark:text-red-400"
          >
            Sair dos outros
          </button>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-white/5">
        {sessions.map((session) => {
          const Icon = isMobile(session.userAgent) ? DeviceMobile : Monitor;
          return (
            <li key={session.id} className="flex items-center gap-3 py-3">
              <Icon size={22} className="shrink-0 text-zinc-400 dark:text-stone-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                  {deviceLabel(session.userAgent)}
                  {session.current ? (
                    <span className="ml-2 rounded-full bg-(--tenant-accent)/10 px-2 py-0.5 text-[11px] font-semibold text-(--tenant-accent)">
                      Este dispositivo
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-zinc-500 dark:text-stone-400">
                  Ativo{" "}
                  {DateTime.fromISO(session.lastSeenAt).setLocale("pt-BR").toRelative()}
                </p>
              </div>
              {!session.current ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => revokeSessionAction(session.id))}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:opacity-80 disabled:opacity-50 dark:text-red-400"
                >
                  Sair
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
