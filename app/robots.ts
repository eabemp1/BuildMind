import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/explore", "/try", "/upgrade", "/auth/signup"],
        disallow: [
          "/today",
          "/dashboard",
          "/projects",
          "/ventures",
          "/ai-coach",
          "/break-my-startup",
          "/reports",
          "/settings",
          "/reflect",
          "/onboarding",
          "/api/",
          "/my-ventures",
        ],
      },
    ],
    sitemap: "https://buildmind.live/sitemap.xml",
    host: "https://buildmind.live",
  };
}
