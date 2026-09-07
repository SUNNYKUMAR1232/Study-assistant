"use client";

import { cn } from "@/shared/lib/cn";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { ApiStatus } from "./ApiStatus";
import type { StoredSession } from "../hooks/useSessionLibrary";

export interface SidebarProps {
  sessions: StoredSession[];
  activeId: string | null;
  isLoaded: boolean;
  onNewSession: () => void;
  onOpenSession: (session: StoredSession) => void;
  onRemoveSession: (id: string) => void;
}

export function Sidebar({
  sessions,
  activeId,
  isLoaded,
  onNewSession,
  onOpenSession,
  onRemoveSession,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium",
            "bg-white text-slate-900 transition-colors hover:bg-slate-50",
            "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          )}
        >
          <PlusIcon />
          New session
        </button>
      </div>

      <nav aria-label="Session history" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          History
        </h2>

        {!isLoaded ? null : sessions.length === 0 ? (
          <p className="px-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Nothing yet. Sessions you generate are saved here automatically.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const isActive = session.id === activeId;
              return (
                <li key={session.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenSession(session)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg py-2 pl-3 pr-9 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      isActive
                        ? "bg-white shadow-sm dark:bg-slate-800"
                        : "hover:bg-slate-200/70 dark:hover:bg-slate-800/60",
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {session.data.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                      {session.data.flashcards.length} cards · {session.data.quiz.length} questions ·{" "}
                      {formatWhen(session.createdAt)}
                    </span>
                  </button>

                  {/* Always reachable by keyboard; revealed on hover for pointers. */}
                  <button
                    type="button"
                    onClick={() => onRemoveSession(session.id)}
                    aria-label={`Delete session ${session.data.title}`}
                    className={cn(
                      "absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                      "hover:bg-slate-300/60 hover:text-rose-600 dark:hover:bg-slate-700 dark:hover:text-rose-400",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    )}
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 p-3 dark:border-slate-800/80">
        <div className="min-w-0"><ApiStatus /></div>
        <ThemeToggle />
      </div>
    </div>
  );
}

/** Relative for the recent past, absolute once that stops being useful. */
function formatWhen(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
