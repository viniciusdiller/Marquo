"use client";

import { type ComponentPropsWithoutRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import clsx from "clsx";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "tenant";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent-500 text-white shadow-lg shadow-accent-500/20 hover:bg-accent-600",
  secondary:
    "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-stone-200",
  ghost:
    "bg-transparent text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-900/5 dark:text-white dark:ring-white/20 dark:hover:bg-white/10",
  // Cor de destaque escopada ao tenant (ver app/[slug]/layout.tsx), não a marca fixa do
  // Marquo — usado só dentro da página pública do salão/wizard/conta do cliente.
  tenant: "bg-(--tenant-accent) text-white shadow-lg hover:brightness-90",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  href?: string;
  children?: ComponentPropsWithoutRef<"button">["children"];
}

export function Button({ variant = "primary", className, href, children, ...props }: ButtonProps) {
  const classes = clsx(baseClasses, variantClasses[variant], className);

  if (href) {
    return (
      <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="inline-block">
        <Link href={href} className={classes}>
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={classes}
      {...props}
    >
      {children}
    </motion.button>
  );
}
