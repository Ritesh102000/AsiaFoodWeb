import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asian Food Centre — Home tastes better here",
  description: "Explore South Asian groceries, discover eight GTA stores, and ask the AFC Assistant about products, prices, policies, pickup, and delivery.",
  applicationName: "AFC Grocery",
  keywords: ["Asian Food Centre", "South Asian grocery", "GTA grocery", "Brampton grocery", "AFC Assistant"],
};

export const viewport: Viewport = { themeColor: "#042f20", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
