"use client";

import { Button } from "@/shared/ui/Button";
import { Card, CardBody } from "@/shared/ui/Card";
import type { SavedSession } from "../hooks/useSavedSessions";

export function SavedSessionsList({
  sessions,
  onOpen,
  onRemove,
}: {
  sessions: SavedSession[];
  onOpen: (session: SavedSession) => void;
  onRemove: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <Card>
      <CardBody>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saved sessions</h2>
        <ul className="mt-3 space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => onOpen(session)}
                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {session.data.title}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {session.data.flashcards.length} cards · {session.data.quiz.length} questions ·{" "}
                  {new Date(session.savedAt).toLocaleDateString()}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete saved session ${session.data.title}`}
                onClick={() => onRemove(session.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
