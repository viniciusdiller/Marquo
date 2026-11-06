import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marquo.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/minha-conta",
          "/minha-conta/",
          "/api/",
          "/definir-senha",
          "/esqueci-senha",
          "/verificar-email",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

