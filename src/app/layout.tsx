import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Self-hosted at build time by next/font, so there is no runtime request to a font CDN.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const DESCRIPTION = "Explore Upper Peninsula parcel records, compare properties, and organize your real estate research.";

// Absolute URLs for the share image come from the deployment: an explicit site URL, otherwise Vercel's own.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Parcel",
  title: { default: "Parcel · Realtor workspace", template: "%s · Parcel" },
  description: DESCRIPTION,
  // The parcel data is for private/internal use, so keep the app out of search indexes.
  robots: { index: false, follow: false },
  // Stop iOS from turning parcel numbers (e.g. 052-265-006-00) into phone-number links.
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: { capable: true, title: "Parcel", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "Parcel",
    title: "Parcel · Realtor workspace",
    description: DESCRIPTION
  },
  twitter: { card: "summary_large_image", title: "Parcel · Realtor workspace", description: DESCRIPTION }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
