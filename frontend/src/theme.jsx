import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

function getInitialTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "day" || stored === "night") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "night");
    localStorage.setItem("theme", theme);
    const meta = document.getElementById("theme-color-meta");
    if (meta) meta.setAttribute("content", theme === "night" ? "#0d1614" : "#eeede2");
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "night" ? "day" : "night"));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
