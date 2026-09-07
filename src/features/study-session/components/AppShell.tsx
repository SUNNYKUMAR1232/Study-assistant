"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Two-pane layout: a persistent sidebar from `lg` up, an off-canvas drawer
 * below it.
 *
 * The sidebar is mounted ONCE and repositioned with CSS. Rendering it twice
 * (a desktop copy and a drawer copy) would duplicate its whole subtree —
 * including the connection indicator, which would then run two polling
 * loops and double the health requests.
 *
 * The drawer is a real modal below `lg`: Escape closes it, focus moves in
 * and is restored on close, and background scroll is locked. Those semantics
 * are applied only when it is actually behaving as a drawer, which is why
 * the breakpoint is tracked in JS as well as in CSS.
 */

const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind's `lg`

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  title: string;
  isDrawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  /** Rendered in the mobile top bar, next to the menu button. */
  action?: ReactNode;
}

export function AppShell({
  sidebar,
  children,
  title,
  isDrawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  action,
}: AppShellProps) {
  const isDesktop = useIsDesktop();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Modal behaviour belongs to the drawer, not to the desktop rail.
  const isModal = isDrawerOpen && !isDesktop;

  useEffect(() => {
    if (!isModal) return;

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Capture the opener now: by cleanup time the ref may point elsewhere.
    const opener = openerRef.current;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseDrawer();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Send focus back where it came from, not to the top of the document.
      opener?.focus();
    };
  }, [isModal, onCloseDrawer]);

  // Resizing to desktop while the drawer is open must not leave it "open".
  useEffect(() => {
    if (isDesktop && isDrawerOpen) onCloseDrawer();
  }, [isDesktop, isDrawerOpen, onCloseDrawer]);

  return (
    <div
      className={cn(
        "flex h-dvh overflow-hidden",
        // The frosted panels need something worth blurring behind them, so the
        // app sits on a gradient rather than one flat fill.
        "bg-gradient-to-br from-white via-slate-50 to-slate-200",
        "dark:from-slate-950 dark:via-slate-950 dark:to-slate-900",
      )}
    >
      {/* Scrim — drawer only. */}
      <div
        onClick={onCloseDrawer}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-200 lg:hidden",
          "motion-reduce:transition-none",
          isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        {...(isModal ? { role: "dialog", "aria-modal": true } : {})}
        aria-label="Session history"
        // Hidden from assistive tech only while it is an off-screen drawer.
        aria-hidden={!isDesktop && !isDrawerOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs flex-col shadow-xl",
          "border-r border-slate-200/80 dark:border-slate-800/80",
          // The surface lives here, not on the sidebar's content, so the
          // drawer's own header is frosted too rather than see-through.
          "backdrop-blur-xl",
          // Over arbitrary page content it stays nearly opaque: blur alone
          // does not stop high-contrast text bleeding through. From `lg` it
          // only covers the background gradient, where glass is safe.
          "bg-slate-100/95 lg:bg-slate-100/70",
          "dark:bg-slate-900/95 dark:lg:bg-slate-900/60",
          "transition-transform duration-200 motion-reduce:transition-none",
          isDrawerOpen ? "translate-x-0" : "-translate-x-full",
          // From lg up it stops being a drawer entirely.
          "lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-3 py-2 lg:hidden dark:border-slate-800/80">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Study Assistant
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close menu"
            tabIndex={isDrawerOpen ? undefined : -1}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1">{sidebar}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex items-center gap-2 px-3 py-2 lg:hidden",
            "border-b border-slate-200/80 bg-white/70 backdrop-blur-xl",
            "dark:border-slate-800/80 dark:bg-slate-950/70",
          )}
        >
          <button
            ref={openerRef}
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open session history"
            aria-expanded={isDrawerOpen}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MenuIcon />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          {action}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/** Tracks the `lg` breakpoint. Starts false so SSR matches the mobile shell. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
