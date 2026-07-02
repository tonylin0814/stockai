import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "AI analysis has been removed." }, { status: 410 });
}
