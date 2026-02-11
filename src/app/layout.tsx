import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creador de Investigadores CoC 7e",
  description: "Asistente para crear hojas de personaje de La Llamada de Cthulhu 7a.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
