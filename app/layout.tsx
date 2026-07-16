import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-display",
});

const body = Manrope({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Asian Food Centre — One-stop shop for the flavours of home",
  description: "Shop South Asian groceries across eight GTA stores, and ask the AFC Assistant about products, prices, policies, pickup, and delivery.",
  applicationName: "AFC Grocery",
  keywords: ["Asian Food Centre", "South Asian grocery", "GTA grocery", "Brampton grocery", "AFC Assistant"],
};

export const viewport: Viewport = { themeColor: "#0c3d22", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}
