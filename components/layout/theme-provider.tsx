"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
interface ThemeCtx { theme: Theme; toggle: () => void; }
const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("light-mode")) return "light";
    return "light";
  });

  useEffect(() => {
    // bm_theme is intentionally raw localStorage — it's a device-level UI preference
    // with no user identity requirement. Reading it before auth is both correct and
    // necessary to avoid a flash of the wrong theme on mount.
    const saved = (localStorage.getItem("bm_theme") as Theme | null) ?? "light"; // light is the default; only an explicit dark choice is kept
    setTheme(saved);
    document.documentElement.classList.toggle("light-mode", saved === "light");
  }, []);

  const toggle = () => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("bm_theme", next); // intentionally raw — see comment above
      document.documentElement.classList.toggle("light-mode", next === "light");
      return next;
    });
  };

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
