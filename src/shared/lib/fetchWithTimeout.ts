/**
 * fetch + a hard timeout, sharing one abort signal with the caller.
 * The caller's signal still wins, so a component unmount cancels in flight.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 45_000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
