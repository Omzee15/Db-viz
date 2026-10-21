import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://dbviz.buildc3.tech/",
      lastModified: "2026-10-21",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
