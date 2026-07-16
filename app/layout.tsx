import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asian Food Centre — Grocery, reimagined",
  description: "A modern AFC Grocery shopping and AI assistant prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
