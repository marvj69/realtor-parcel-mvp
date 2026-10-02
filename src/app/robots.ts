import type { MetadataRoute } from "next";

// Parcel data is for private/internal use; ask crawlers to stay out entirely.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
