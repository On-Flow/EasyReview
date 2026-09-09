interface ReviewProgressBadgeProps {
  reviewed: number;
  total: number;
  size?: "sm" | "md";
  className?: string;
}

export default function ReviewProgressBadge({
  reviewed,
  total,
  size = "sm",
  className = "",
}: ReviewProgressBadgeProps) {
  if (total === 0) return null;

  const complete = reviewed === total;
  const started = reviewed > 0;
  const sizeClasses = size === "md" ? "text-sm px-3 py-1 gap-2" : "text-xs px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold shrink-0 ${sizeClasses} ${
        complete
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : started
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      } ${className}`}
    >
      {complete && "✓"} {reviewed}/{total} reviewed
    </span>
  );
}
