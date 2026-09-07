"use client";

import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/hooks/useTheme";

/**
 * Sun/moon toggle.
 *
 * The icon is withheld until after mount: the server cannot know the stored
 * preference, so rendering one would guess wrong half the time and swap on
 * hydration. The button keeps its footprint meanwhile, so nothing shifts.
 */
export function ThemeToggle() {
  const { resolved, isReady, toggle, preference } = useTheme();
  const nextTheme = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!isReady}
      aria-label={isReady ? `Switch to ${nextTheme} mode` : "Theme"}
      title={
        isReady
          ? `${preference === "system" ? "Following your system theme" : `${resolved} mode`} — switch to ${nextTheme}`
          : undefined
      }
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors",
        "hover:bg-slate-200 hover:text-slate-900",
        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        "disabled:cursor-default disabled:opacity-0",
      )}
    >
      {isReady ? resolved === "dark" ? <SunIcon /> : <MoonIcon /> : null}
    </button>
  );
}

/** Shown in dark mode: activating it brings the light theme. */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shown in light mode: activating it brings the dark theme. */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
