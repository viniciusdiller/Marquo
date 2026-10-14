// Única fonte de verdade dos hex da marca Marquo (ícone "M" + wordmark).
// Paleta "3a" (roxo + coral) — a outra branch (feat/marca-verde-dourado) troca só
// estes valores, mais o bloco --color-accent-* de globals.css e app/icon.svg.
export const BRAND = {
  primary: "#6C3BF4",
  accentCheck: "#FF6B5A",
  darkBg: "#17161A",
  wordmarkLight: "#6C3BF4",
  wordmarkDark: "#B9A0FF",
} as const;
