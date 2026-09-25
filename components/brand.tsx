import { cn } from "@/lib/utils";

/** Sastra logo mark + wordmark lockup. The SVG lives in /public and is public
 *  (served without auth), so it renders on the login screen too. */
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
      {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG mark */}
      <img
        src="/sastra-logo.svg"
        alt=""
        aria-hidden="true"
        className={cn("size-7 shrink-0", iconClassName)}
      />
      {showText ? (
        <span className={cn(textClassName)}>Sastra</span>
      ) : (
        <span className="sr-only">Sastra</span>
      )}
    </span>
  );
}
