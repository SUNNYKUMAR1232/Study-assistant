import { cn } from "@/shared/lib/cn";

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", className)}
    >
      <div
        className="h-full rounded-full bg-slate-900 transition-[width] duration-300 motion-reduce:transition-none dark:bg-slate-100"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
