"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Theme preference, stored per browser.
 *
 * Three states, not two: "system" is a real choice, and it keeps following the
 * OS if the user changes it later. Picking light or dark pins it until they
 * change their mind.
 *
 * The initial application happens in an inline script in the document head
 * (see layout.tsx) so there is no flash; this hook takes over afterwards.
 */

export const THEME_KEY = "study-assistant:theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface UseThemeResult {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** False until mounted. Render theme-dependent icons only once true. */
  isReady: boolean;
  setTheme: (preference: ThemePreference) => void;
  toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [isReady, setIsReady] = useState(false);

  // Read after mount: the server has no localStorage, and reading it during
  // render would make the markup disagree with the client on hydration.
  useEffect(() => {
    const stored = readPreference();
    setPreference(stored);
    setResolved(applyTheme(stored));
    setIsReady(true);
  }, []);

  // While the preference is "system", keep following the OS.
  useEffect(() => {
    if (preference !== "system") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setResolved(applyTheme("system"));
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    setResolved(applyTheme(next));
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked — the theme still applies for this page view */
    }
  }, []);

  // Flips whatever is actually on screen, which is what the user is looking
  // at — consulting the OS here would ignore an explicit choice.
  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { preference, resolved, isReady, setTheme, toggle };
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* fall through to the default */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolvePreference(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/** Mirrors what the inline head script does, for changes made at runtime. */
function applyTheme(preference: ThemePreference): ResolvedTheme {
  const next = resolvePreference(preference);
  const root = document.documentElement;
  root.dataset.theme = next;
  // Keeps native controls (scrollbars, date pickers) in the right mode.
  root.style.colorScheme = next;
  return next;
}
