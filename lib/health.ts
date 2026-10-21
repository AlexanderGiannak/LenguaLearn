/**
 * Resolves true if `ping` succeeds within `timeoutMs`, false on error or timeout.
 * Never throws, so the health route can always answer instead of hanging the
 * Railway health check or the uptime monitor.
 */
export async function checkDatabase(
  ping: () => Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    // Calling ping inside .then() turns a synchronous throw into a rejection. The
    // rejection handler is attached here so a ping that fails after the timeout
    // already won does not surface as an unhandled rejection.
    return await Promise.race([
      Promise.resolve()
        .then(ping)
        .then(
          () => true,
          () => false,
        ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
