import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "AI reports have been removed." }, { status: 410 });
}
