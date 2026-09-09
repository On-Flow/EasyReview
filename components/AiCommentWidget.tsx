import type { AiComment } from "@/lib/types";

const severityStyles: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  moderate: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  minor: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  nit: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function AiCommentWidget({ comments }: { comments: AiComment[] }) {
  return (
    <div className="bg-indigo-50 dark:bg-indigo-950/40 border-y border-indigo-200 dark:border-indigo-900 px-4 py-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-400 font-medium">
        AI review
      </p>
      {comments.map((c) => (
        <div key={c.id} className="text-sm flex items-start gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${severityStyles[c.severity]}`}
          >
            {c.severity}
          </span>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
