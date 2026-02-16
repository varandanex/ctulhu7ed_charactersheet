import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creador de Investigadores CoC 7e",
  description: "Asistente para crear hojas de personaje de La Llamada de Cthulhu 7a.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Link href="/" className="home-floating-button" aria-label="Volver al inicio" title="Volver al inicio">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.5 12 5l8 6.5v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20.5H5a1 1 0 0 1-1-1z" />
          </svg>
        </Link>
        {children}
      </body>
    </html>
  );
}
