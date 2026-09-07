/**
 * Turns an answer that is secretly a list back into a list.
 *
 * Models write "1) do this 2) then this 3) finally this" as one run-on
 * string. Rendering that as a centred paragraph is unreadable, and asking the
 * prompt to stop doing it only works until it doesn't — so the UI recognises
 * the shape instead. This also fixes sessions already saved in history.
 *
 * Pure and presentation-agnostic: it reports structure, it does not render.
 */

export type ParsedText =
  | { kind: "text"; text: string }
  | { kind: "ordered" | "unordered"; lead: string | null; items: string[] };

/** Two digits max, so a year like "1789." is never mistaken for a marker. */
const ORDERED_MARKER = /(^|\s)(\d{1,2})[.)]\s+/g;
const BULLET_MARKER = /(?:^|\n)\s*[-•*]\s+/g;

export function parseListText(raw: string): ParsedText {
  const text = raw.trim();
  if (!text) return { kind: "text", text };

  return parseOrdered(text) ?? parseUnordered(text) ?? { kind: "text", text };
}

function parseOrdered(text: string): ParsedText | null {
  const matches = [...text.matchAll(ORDERED_MARKER)];
  if (matches.length < 2) return null;

  // Only treat it as a list if the numbers actually count 1, 2, 3…
  // Prose such as "…by 2. Later, 7) …" should stay prose.
  const numbers = matches.map((m) => Number(m[2] ?? ""));
  const isSequential = numbers.every((n, i) => n === i + 1);
  if (!isSequential) return null;

  // Capture groups are optional to the type system, hence the fallbacks.
  const starts = matches.map((m) => ({
    markerStart: m.index + (m[1] ?? "").length,
    contentStart: m.index + m[0].length,
  }));

  const lead = text.slice(0, starts[0]!.markerStart).trim();
  const items = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.markerStart : text.length;
    return text.slice(s.contentStart, end).trim();
  });

  if (items.some((item) => item.length === 0)) return null;
  return { kind: "ordered", lead: lead || null, items };
}

function parseUnordered(text: string): ParsedText | null {
  const matches = [...text.matchAll(BULLET_MARKER)];
  if (matches.length < 2) return null;

  const starts = matches.map((m) => ({
    markerStart: m.index + (m[0].startsWith("\n") ? 1 : 0),
    contentStart: m.index + m[0].length,
  }));

  const lead = text.slice(0, starts[0]!.markerStart).trim();
  const items = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.markerStart : text.length;
    return text.slice(s.contentStart, end).trim();
  });

  if (items.some((item) => item.length === 0)) return null;
  return { kind: "unordered", lead: lead || null, items };
}
