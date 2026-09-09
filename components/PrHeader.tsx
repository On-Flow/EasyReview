import type { PrMeta } from "@/lib/types";
import Markdown from "./Markdown";

export default function PrHeader({ pr }: { pr: PrMeta }) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
      <h1 className="text-xl font-semibold">
        {pr.title} <span className="text-gray-400 font-normal">#{pr.number}</span>
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
          {pr.author}
        </a>{" "}
        wants to merge <code className="text-xs">{pr.headRef}</code> into{" "}
        <code className="text-xs">{pr.baseRef}</code> · {pr.state}
      </p>
      {pr.body && (
        <div className="mt-3 max-h-40 overflow-y-auto">
          <Markdown>{pr.body}</Markdown>
        </div>
      )}
    </div>
  );
}
