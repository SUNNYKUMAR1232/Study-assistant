import { cn } from "@/shared/lib/cn";
import { parseListText } from "@/shared/lib/parseListText";

/**
 * Renders model text as a list when it is one, and as a paragraph otherwise.
 *
 * A list is left-aligned even inside a centred layout: centred list items are
 * genuinely hard to read, because the eye loses the line start.
 */
export function RichText({
  value,
  className,
  align = "center",
}: {
  value: string;
  className?: string;
  /** Alignment used only when the content is a plain paragraph. */
  align?: "center" | "left";
}) {
  const parsed = parseListText(value);

  if (parsed.kind === "text") {
    return (
      <p className={cn(align === "center" ? "text-balance text-center" : "text-left", className)}>
        {parsed.text}
      </p>
    );
  }

  const List = parsed.kind === "ordered" ? "ol" : "ul";

  return (
    <div className={cn("w-full text-left", className)}>
      {parsed.lead ? <p className="mb-2">{parsed.lead}</p> : null}
      <List
        className={cn(
          "space-y-1.5",
          parsed.kind === "ordered"
            ? "list-decimal marker:font-medium marker:text-slate-400 dark:marker:text-slate-500"
            : "list-disc marker:text-slate-400 dark:marker:text-slate-500",
          // Hanging indent: wrapped lines align under the text, not the marker.
          "pl-5",
        )}
      >
        {parsed.items.map((item, index) => (
          <li key={index} className="pl-1">
            {item}
          </li>
        ))}
      </List>
    </div>
  );
}
