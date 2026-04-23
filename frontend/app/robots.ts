import { MetadataRoute } from "next";
import { FEATURES } from "@/lib/features";

export default function robots(): MetadataRoute.Robots {
  const allow = ["/", "/landing", "/try", "/upgrade", "/auth/signup"];
  if (FEATURES.publicProjects) allow.splice(2, 0, "/explore");
  return {
    rules: [
      {
        userAgent: "*",
        allow,
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
