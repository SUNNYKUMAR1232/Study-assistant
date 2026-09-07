import { NextResponse } from "next/server";
import { checkHealth } from "@/features/study-session/server/health.server";
import type { HealthResponse } from "@/features/study-session/types";

/**
 * Connection status for the indicator in the header.
 *
 * Always returns 200 with a status field — a non-200 here would be
 * indistinguishable from the app itself being down, which is the one thing
 * this endpoint exists to tell apart.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<HealthResponse>> {
  // `?force=1` skips the server-side cache, for the manual "check again" button.
  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await checkHealth(force);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
