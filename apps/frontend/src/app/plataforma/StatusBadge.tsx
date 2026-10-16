import clsx from "clsx";
import { STATUS_LABEL, STATUS_TONE, type PlatformBillingStatus } from "@/lib/platform-api";

const TONE = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  bad: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  muted: "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-stone-300",
} as const;

export function StatusBadge({ status }: { status: PlatformBillingStatus | string }) {
  const known = status in STATUS_LABEL;
  const tone = known ? STATUS_TONE[status as PlatformBillingStatus] : "muted";
  const label = known ? STATUS_LABEL[status as PlatformBillingStatus] : status;
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone])}>
      {label}
    </span>
  );
}
