import { cn } from "@/lib/utils";

// The Sastra mark: a three-piece S with exact 180-degree symmetry. Drawn inline in
// currentColor so it follows the app's theme (text-brand-mark: violet, lilac in dark mode).
// The same shape lives in public/sastra-logo.svg, the source for scripts/gen-icons.mjs.
const MARK = [
  "M0 0C30.85 36.77 87.50 52.00 87.50 69.00L87.5 100C56.65 63.23 0.00 48.00 0.00 31.00Z",
  "M30.90 2.40C57.90 -7.00 87.50 16.40 87.50 22.40L87.50 39.00C86.00 38.01 36.00 18.00 30.90 2.40Z",
  "M56.60 97.60C29.60 107.00 0.00 83.60 0.00 77.60L0.00 61.00C1.50 61.99 51.50 82.00 56.60 97.60Z",
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-6.25 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={cn("size-7 shrink-0 fill-current text-brand-mark", className)}
    >
      {MARK.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Sastra logo mark + wordmark lockup. Renders on the login screen too (no assets needed). */
export function Brand({
  className,
  iconClassName,
  textClassName,
  showText = true,
}: {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap font-heading text-lg font-semibold tracking-tight",
        className
      )}
    >
      <BrandMark className={iconClassName} />
      {showText ? (
        <span className={cn(textClassName)}>Sastra</span>
      ) : (
        <span className="sr-only">Sastra</span>
      )}
    </span>
  );
}
