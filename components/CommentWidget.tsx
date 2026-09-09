import type { ReviewComment } from "@/lib/types";
import Markdown from "./Markdown";

export default function CommentWidget({ comments }: { comments: ReviewComment[] }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/40 border-y border-blue-200 dark:border-blue-900 px-4 py-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-blue-700 dark:text-blue-400 font-medium">
        Human review comment
      </p>
      {comments.map((c) => (
        <div key={c.id} className="text-sm">
          <span className="font-medium">{c.author}</span>
          <span className="text-gray-500 text-xs ml-2">
            {new Date(c.createdAt).toLocaleString()}
          </span>
          <Markdown>{c.body}</Markdown>
        </div>
      ))}
    </div>
  );
}
