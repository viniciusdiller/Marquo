import { ImageResponse } from "next/og";

// Imagem de compartilhamento (Google, WhatsApp, redes sociais) no tamanho recomendado 1200x630. Antes o site usava o
// logotipo horizontal de e-mail (480x139), que aparecia cortado ou minúsculo nas prévias.
export const alt = "Marquo - Agenda online para salões e barbearias";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "linear-gradient(135deg, #2a1173 0%, #6C3BF4 60%, #8f6bff 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              background: "white",
              color: "#6C3BF4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 76,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -4 }}>Marquo</div>
        </div>
        <div style={{ marginTop: 44, fontSize: 52, fontWeight: 700, lineHeight: 1.15, maxWidth: 960 }}>
          Agenda online para salões e barbearias
        </div>
        <div style={{ marginTop: 24, fontSize: 32, opacity: 0.85 }}>
          Cada profissional com sua agenda. O cliente marca pelo link.
        </div>
        <div style={{ marginTop: "auto", fontSize: 30, opacity: 0.9 }}>marquo.com.br</div>
      </div>
    ),
    size,
  );
}
