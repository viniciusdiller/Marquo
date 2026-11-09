import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marquo - Agenda online para salões e barbearias",
    short_name: "Marquo",
    description:
      "Cada profissional com sua própria agenda online. Cliente marca pelo link, sem complicação.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#6C3BF4",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

