import { NextResponse } from "next/server";
import { generateStudySession } from "@/features/study-session/server/generate.server";
import { GenerateRequestSchema } from "@/features/study-session/api/schema";
import { chaosResponse, resolveChaosMode } from "@/features/study-session/dev/chaos";
import type { GenerateResponse } from "@/features/study-session/types";

/**
 * Transport only. This handler validates input, delegates, and shapes an HTTP
 * response — it contains no prompt text and no knowledge of Groq.
 *
 * The API key is read here on the server and never reaches the browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BY_CODE = {
  bad_request: 400,
  rate_limited: 429,
  upstream_error: 502,
  unparseable: 422,
  timeout: 504,
  server_error: 500,
} as const;

export async function POST(request: Request): Promise<NextResponse<GenerateResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Request body was not valid JSON.");
  }

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail("bad_request", first?.message ?? "Invalid request.");
  }

  // Dev-only failure injection, so the error paths can be demonstrated on
  // demand. It always answers, and never reaches the real provider.
  const chaos = resolveChaosMode(request);
  if (chaos) {
    const injected = await chaosResponse(chaos, request.signal);
    return injected.ok
      ? NextResponse.json(injected)
      : NextResponse.json(injected, { status: STATUS_BY_CODE[injected.error.code] });
  }

  const outcome = await generateStudySession(parsed.data, request.signal);
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error },
      { status: STATUS_BY_CODE[outcome.error.code] },
    );
  }

  return NextResponse.json({ ok: true, data: outcome.data, meta: outcome.meta });
}

function fail(
  code: keyof typeof STATUS_BY_CODE,
  message: string,
): NextResponse<GenerateResponse> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: STATUS_BY_CODE[code] });
}
