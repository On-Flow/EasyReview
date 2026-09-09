import { NextResponse } from "next/server";
import { setHunksReviewed } from "@/lib/reviewed";

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
  const hunkIds = body?.hunkIds;
  const reviewed = body?.reviewed;
  if (
    !Array.isArray(hunkIds) ||
    hunkIds.length === 0 ||
    !hunkIds.every((id) => typeof id === "string" && id) ||
    typeof reviewed !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Body must be { hunkIds: string[], reviewed: boolean }" },
      { status: 400 }
    );
  }

  setHunksReviewed(prNumber, hunkIds, reviewed);
  return NextResponse.json({ ok: true });
}
