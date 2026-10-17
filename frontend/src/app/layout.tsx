import type { Metadata } from "next";
import "./globals.css";
import "./dark-theme.css";
export const metadata: Metadata = { title: "IT Support Copilot · NovaRetail", description: "Grounded IT support with private knowledge, verified sources, and transparent agent decisions." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
