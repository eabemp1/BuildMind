import { MetadataRoute } from "next";
import { FEATURES } from "@/lib/features";

export default function robots(): MetadataRoute.Robots {
  const allow = ["/", "/try", "/upgrade", "/students", "/auth/signup"];
  if (FEATURES.publicProjects) allow.splice(1, 0, "/explore");
  return {
    rules: [
      {
        userAgent: "*",
        allow,
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
