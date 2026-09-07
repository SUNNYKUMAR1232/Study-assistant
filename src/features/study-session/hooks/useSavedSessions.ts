"use client";

import { useCallback, useEffect, useState } from "react";
import { readJSON, writeJSON } from "@/shared/lib/storage";
import { GenerationMetaSchema, StudySessionSchema } from "../api/schema";
import type { GenerationMeta, StudySession } from "../types";
import { z } from "zod";

/**
 * Sessions the user chose to keep, in localStorage.
 *
 * Stored data is validated on read with the same schema as model output —
 * an older app version's records are untrusted input too.
 */

const KEY = "study-assistant:saved:v1";
const MAX_SAVED = 20;

const SavedSessionSchema = z.object({
  id: z.string(),
  savedAt: z.number(),
  data: StudySessionSchema,
  meta: GenerationMetaSchema,
});

export type SavedSession = z.infer<typeof SavedSessionSchema>;

export interface UseSavedSessionsResult {
  sessions: SavedSession[];
  save: (data: StudySession, meta: GenerationMeta) => void;
  remove: (id: string) => void;
  isSaved: (title: string) => boolean;
}

export function useSavedSessions(): UseSavedSessionsResult {
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  // Read after mount only: localStorage does not exist during SSR, and
  // reading it in render would produce a hydration mismatch.
  useEffect(() => {
    const raw = readJSON<unknown>(KEY);
    const parsed = z.array(SavedSessionSchema).safeParse(raw);
    setSessions(parsed.success ? parsed.data : []);
  }, []);

  const save = useCallback(
    (data: StudySession, meta: GenerationMeta) => {
      setSessions((previous) => {
        const entry: SavedSession = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          savedAt: Date.now(),
          data,
          meta,
        };
        const deduped = previous.filter((session) => session.data.title !== data.title);
        const next = [entry, ...deduped].slice(0, MAX_SAVED);
        writeJSON(KEY, next);
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      setSessions((previous) => {
        const next = previous.filter((session) => session.id !== id);
        writeJSON(KEY, next);
        return next;
      });
    },
    [],
  );

  const isSaved = useCallback(
    (title: string) => sessions.some((session) => session.data.title === title),
    [sessions],
  );

  return { sessions, save, remove, isSaved };
}
