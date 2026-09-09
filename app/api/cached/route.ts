import { NextResponse } from "next/server";
import { listCachedPrs } from "@/lib/cache";

export async function GET() {
  const cached = await listCachedPrs();
  return NextResponse.json({ cached });
}
