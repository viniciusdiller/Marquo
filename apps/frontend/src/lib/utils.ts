import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Padrão do shadcn/ui: junta classes e resolve conflitos do Tailwind (a última vence).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
