import { NextResponse } from "next/server";
import { reviewFiles } from "@/lib/aiReview";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params;
  const prNumber = Number(number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const files = body?.files;
  const prTitle = body?.prTitle;
  const prBody = typeof body?.prBody === "string" ? body.prBody : null;

  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((f) => typeof f?.path === "string" && typeof f?.patch === "string") ||
    typeof prTitle !== "string"
  ) {
    return NextResponse.json(
      { error: "Body must be { files: {path, patch}[], prTitle: string, prBody?: string }" },
      { status: 400 }
    );
  }

  const { comments, summary, meta } = await reviewFiles(files, prTitle, prBody);
  return NextResponse.json({ comments, summary, meta });
}
