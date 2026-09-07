"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { readJSON, writeJSON } from "@/shared/lib/storage";
import { GenerationMetaSchema, StudySessionSchema } from "../api/schema";
import type { GenerationMeta, StudySession } from "../types";

/**
 * The session history behind the sidebar.
 *
 * Sessions save themselves. A history list the user has to remember to
 * populate is a history list that stays empty, so every successful
 * generation is persisted automatically and the user curates by deleting.
 *
 * Stored records are validated on read with the same schemas as model
 * output — an older app version's data is untrusted input too.
 */

const KEY = "study-assistant:library:v1";
const MAX_SESSIONS = 50;

const StoredSessionSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  data: StudySessionSchema,
  meta: GenerationMetaSchema,
});

export type StoredSession = z.infer<typeof StoredSessionSchema>;

export interface UseSessionLibraryResult {
  sessions: StoredSession[];
  activeId: string | null;
  /** True until localStorage has been read, so the UI can avoid a flash. */
  isLoaded: boolean;
  setActiveId: (id: string | null) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  /** Persist a freshly generated session and make it active. */
  record: (data: StudySession, meta: GenerationMeta) => void;
}

export function useSessionLibrary(): UseSessionLibraryResult {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Read after mount only: localStorage does not exist during SSR, and
  // reading it in render would produce a hydration mismatch.
  useEffect(() => {
    const parsed = z.array(StoredSessionSchema).safeParse(readJSON<unknown>(KEY));
    setSessions(parsed.success ? parsed.data : []);
    setIsLoaded(true);
  }, []);

  // Guards against re-recording the same result when the component re-renders
  // or when a cached response replays an already-stored session.
  const lastRecordedRef = useRef<string | null>(null);

  const record = useCallback((data: StudySession, meta: GenerationMeta) => {
    const fingerprint = `${data.title}|${data.flashcards.length}|${data.quiz.length}|${meta.model}`;
    if (lastRecordedRef.current === fingerprint) return;
    lastRecordedRef.current = fingerprint;

    const entry: StoredSession = {
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      data,
      meta,
    };

    setSessions((previous) => {
      // Re-opening a stored session must not clone it, so replace any entry
      // with identical content rather than appending a duplicate.
      const deduped = previous.filter(
        (session) =>
          session.data.title !== data.title ||
          session.data.flashcards.length !== data.flashcards.length,
      );
      const next = [entry, ...deduped].slice(0, MAX_SESSIONS);
      writeJSON(KEY, next);
      return next;
    });

    setActiveId(entry.id);
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((previous) => {
      const next = previous.filter((session) => session.id !== id);
      writeJSON(KEY, next);
      return next;
    });
    setActiveId((current) => (current === id ? null : current));
  }, []);

  const clearAll = useCallback(() => {
    setSessions([]);
    writeJSON(KEY, []);
    setActiveId(null);
    lastRecordedRef.current = null;
  }, []);

  const selectActive = useCallback((id: string | null) => {
    // Opening a stored session should not be treated as a new result.
    if (id === null) lastRecordedRef.current = null;
    setActiveId(id);
  }, []);

  return { sessions, activeId, isLoaded, setActiveId: selectActive, remove, clearAll, record };
}
