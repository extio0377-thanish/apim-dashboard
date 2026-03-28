import React, { createContext, useContext, useState, useEffect } from "react";

export type ThemeName = "red" | "blue" | "green" | "orange" | "pink" | "light";

export interface ThemeOption {
  name: ThemeName;
  label: string;
  primary: string;
  hex: string;
}

export const THEMES: ThemeOption[] = [
  { name: "red",    label: "Red",     primary: "0 72% 51%",    hex: "#d63031" },
  { name: "blue",   label: "Blue",    primary: "211 100% 47%", hex: "#0079f2" },
  { name: "green",  label: "Green",   primary: "142 72% 36%",  hex: "#1a9a47" },
  { name: "orange", label: "Orange",  primary: "25 95% 53%",   hex: "#f97316" },
  { name: "pink",   label: "Pink",    primary: "330 81% 60%",  hex: "#e84393" },
  { name: "light",  label: "Default", primary: "222 47% 25%",  hex: "#1e3a5f" },
];

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  themeOption: ThemeOption;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return (localStorage.getItem("apim_theme") as ThemeName) ?? "red";
  });

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem("apim_theme", t);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themeOption = THEMES.find((t) => t.name === theme) ?? THEMES[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeOption }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
