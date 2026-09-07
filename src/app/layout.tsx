import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Assistant",
  description: "Turn any study material into flashcards and a quiz.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never block pinch-zoom; some people need it to read.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

/**
 * Runs before the first paint, so the stored theme is applied to <html> while
 * the page is still blank. Doing this in React instead would render the
 * default theme first and repaint — the flash of wrong theme.
 *
 * Wrapped in try/catch because reading localStorage throws outright in some
 * privacy modes, and a theme preference is never worth a blank page.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("study-assistant:theme") || "system";
    var dark = stored === "dark" ||
      (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script mutates <html> before hydration, so React must not object.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-dvh overflow-hidden bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
