import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/try", "/upgrade", "/students"],
        disallow: [
          "/auth/login",
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
          "/admin",
          "/owner",
        ],
      },
    ],
    sitemap: "https://buildmind.live/sitemap.xml",
    host: "https://buildmind.live",
  };
}
