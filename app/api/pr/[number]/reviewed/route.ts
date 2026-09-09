import { NextResponse } from "next/server";
import { setHunkReviewed } from "@/lib/reviewed";

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
  const hunkId = body?.hunkId;
  const reviewed = body?.reviewed;
  if (typeof hunkId !== "string" || !hunkId || typeof reviewed !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { hunkId: string, reviewed: boolean }" },
      { status: 400 }
    );
  }

  setHunkReviewed(prNumber, hunkId, reviewed);
  return NextResponse.json({ ok: true });
}
