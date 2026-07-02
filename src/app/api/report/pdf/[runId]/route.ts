import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "AI reports have been removed." }, { status: 410 });
}
