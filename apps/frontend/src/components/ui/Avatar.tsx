import clsx from "clsx";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Foto do profissional (caminho servido pelo backend) ou, sem foto, as iniciais. O caminho vem do backend e
// SEMPRE começa com /uploads/: qualquer outra coisa é ignorada em vez de virar um <img> para fora.
export function Avatar({
  name,
  photoUrl,
  size = 48,
  tone = "tenant",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  // "tenant": cor de destaque do salão (páginas públicas /[slug]); "brand": cor do Marquo (dashboard).
  tone?: "tenant" | "brand";
  className?: string;
}) {
  const safe = photoUrl && photoUrl.startsWith("/uploads/") ? photoUrl : null;
  const style = { width: size, height: size } as const;

  if (safe) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API_URL}${safe}`}
        alt={`Foto de ${name}`}
        width={size}
        height={size}
        style={style}
        loading="lazy"
        className={clsx("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.max(12, Math.round(size * 0.36)) }}
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-brand font-bold",
        tone === "tenant"
          ? "bg-(--tenant-accent)/10 text-(--tenant-accent)"
          : "bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-300",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
