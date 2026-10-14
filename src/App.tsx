import React, { useEffect, useState } from "react";
import { MedGemmaDemoPage } from "./demo/MedGemmaDemoPage";

type ThemeMode = "light" | "dark";

// Ported verbatim from the landing repo so both deployments share the
// persisted "stemcare-theme" preference.
function getInitialTheme(): ThemeMode {
  try {
    const storedTheme = window.localStorage.getItem("stemcare-theme");
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

// The demo is the whole app here; the landing page lives at stemcare.co.uk.
const LANDING_URL = "https://stemcare.co.uk/";

function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  // Demo dark-mode selectors target :root[data-theme]; this effect is
  // load-bearing (in the landing repo it was set by the shared App shell).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("stemcare-theme", theme);
  }, [theme]);

  return (
    <MedGemmaDemoPage
      onBackToLanding={() => {
        window.location.href = LANDING_URL;
      }}
      theme={theme}
      onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
    />
  );
}

export default App;
