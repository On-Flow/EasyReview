interface ReviewToggleButtonProps {
  reviewed: boolean;
  onClick: () => void;
  scopeLabel: string;
  className?: string;
}

export default function ReviewToggleButton({
  reviewed,
  onClick,
  scopeLabel,
  className = "",
}: ReviewToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-2.5 py-1 rounded-md border shadow-sm transition-colors cursor-pointer ${
        reviewed
          ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900"
          : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      } ${className}`}
    >
      {reviewed ? `✓ ${scopeLabel} reviewed` : `Mark ${scopeLabel} reviewed`}
    </button>
  );
}
