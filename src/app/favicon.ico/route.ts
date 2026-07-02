import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const icon = await readFile(path.join(process.cwd(), "public", "brand", "rh-favicon.png"));

  return new Response(icon, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-cache, max-age=0, must-revalidate"
    }
  });
}
