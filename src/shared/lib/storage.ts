/**
 * localStorage that never throws. Private-mode browsers, disabled site data
 * and quota errors all degrade to "no cache" instead of breaking the app.
 */
export function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage blocked — cache is best-effort */
  }
}
