import type { Metadata } from "next";
import "sweetalert2/dist/sweetalert2.min.css";
import "./globals.css";
import "./crud-modal.css";

export const metadata: Metadata = {
  title: "Sistema de almacén",
  icons: { icon: "/brands/pcp.png" },
  description: "PCP - Sistema de control y almacén",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
