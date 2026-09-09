import type { IssueComment, Review } from "@/lib/types";

export default function ConversationPanel({
  issueComments,
  reviews,
}: {
  issueComments: IssueComment[];
  reviews: Review[];
}) {
  const items = [
    ...issueComments.map((c) => ({
      kind: "comment" as const,
      author: c.author,
      body: c.body,
      at: c.createdAt,
    })),
    ...reviews
      .filter((r) => r.body)
      .map((r) => ({
        kind: "review" as const,
        author: r.author,
        body: r.body ?? "",
        at: r.submittedAt ?? "",
        state: r.state,
      })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="text-sm font-semibold mb-3">
        Conversation ({items.length})
      </h2>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="text-sm border-l-2 border-gray-200 dark:border-gray-800 pl-3">
            <span className="font-medium">{item.author}</span>
            {"state" in item && (
              <span className="text-xs text-gray-500 ml-2">{item.state}</span>
            )}
            <span className="text-xs text-gray-500 ml-2">
              {item.at ? new Date(item.at).toLocaleString() : ""}
            </span>
            <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
