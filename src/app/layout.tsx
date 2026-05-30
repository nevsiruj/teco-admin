import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TECO — tu asistente económico",
  description: "Dashboard operativo de TECO",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
