// Client retry queue (spec: "No lost answers"). A request is saved to localStorage before
// it is sent and removed once the server has answered, so a dropped Wi-Fi connection or a
// deploy mid-session never loses an answer: it is retried until it gets through, and a
// reload resends it. Answers carry a client ID, so the server never counts one twice.

export const PENDING_KEY = "lengualearn.pending";

export type QueuedRequest = { url: string; body: unknown };
export type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SendResult = { ok: true; data: unknown } | { ok: false; status: number; error: string };

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

export async function sendQueued(
  request: QueuedRequest,
  deps: {
    fetchFn?: typeof fetch;
    storage?: QueueStorage | null;
    wait?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number) => void;
  } = {},
): Promise<SendResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const storage = deps.storage === undefined ? safeStorage() : deps.storage;
  const wait = deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(request));
  } catch {
    // Storage can be full or blocked; the in-memory retry below still runs.
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchFn(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      if (res.ok) {
        const data: unknown = await res.json();
        clear(storage);
        return { ok: true, data };
      }
      if (res.status < 500) {
        // The server understood and refused; retrying would not change that.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        clear(storage);
        return { ok: false, status: res.status, error: body.error ?? res.statusText };
      }
    } catch {
      // Network error: fall through to retry.
    }
    deps.onRetry?.(attempt + 1);
    await wait(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
  }
}

/** A request left over from before a reload, if any. */
export function pendingRequest(storage: QueueStorage | null = safeStorage()): QueuedRequest | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as QueuedRequest) : null;
  } catch {
    return null;
  }
}

function clear(storage: QueueStorage | null) {
  try {
    storage?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

function safeStorage(): QueueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
