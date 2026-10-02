import type { MetadataRoute } from "next";

// Lets phones and tablets install the workspace to the home screen as a full-screen app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parcel · Realtor workspace",
    short_name: "Parcel",
    description: "Explore Upper Peninsula parcel records, compare properties, and organize your real estate research.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
