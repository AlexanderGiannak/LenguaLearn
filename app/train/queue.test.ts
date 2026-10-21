import { describe, expect, it, vi } from "vitest";
import { sendQueued, type QueueStorage } from "./queue";

function memoryStorage(): QueueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const noWait = () => Promise.resolve();

describe("sendQueued", () => {
  it("sends, returns the reply, and clears the saved request", async () => {
    const storage = memoryStorage();
    const fetchFn = vi.fn().mockResolvedValue(ok({ next: 1 }));
    const result = await sendQueued(
      { url: "/a", body: { x: 1 } },
      { fetchFn, storage, wait: noWait },
    );
    expect(result).toEqual({ ok: true, data: { next: 1 } });
    expect(storage.data.size).toBe(0);
  });

  it("keeps retrying through network errors and server errors", async () => {
    const storage = memoryStorage();
    const onRetry = vi.fn();
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok({ done: true }));
    const result = await sendQueued(
      { url: "/a", body: {} },
      { fetchFn, storage, wait: noWait, onRetry },
    );
    expect(result).toEqual({ ok: true, data: { done: true } });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("saves the request while it is in flight, so a reload can resend it", async () => {
    const storage = memoryStorage();
    let seen: string | undefined;
    const fetchFn = vi.fn().mockImplementation(async () => {
      seen = storage.data.get("lengualearn.pending");
      return ok({});
    });
    await sendQueued({ url: "/a", body: { id: "q1" } }, { fetchFn, storage, wait: noWait });
    expect(JSON.parse(seen!)).toEqual({ url: "/a", body: { id: "q1" } });
  });

  it("gives up on a request the server refuses and reports it", async () => {
    const storage = memoryStorage();
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "question already answered" }), { status: 409 }),
      );
    const result = await sendQueued({ url: "/a", body: {} }, { fetchFn, storage, wait: noWait });
    expect(result).toEqual({ ok: false, status: 409, error: "question already answered" });
    expect(storage.data.size).toBe(0);
  });

  it("backs off longer between attempts, up to a ceiling", async () => {
    const waits: number[] = [];
    const fetchFn = vi.fn();
    for (let i = 0; i < 6; i++) fetchFn.mockRejectedValueOnce(new TypeError("offline"));
    fetchFn.mockResolvedValueOnce(ok({}));
    await sendQueued(
      { url: "/a", body: {} },
      { fetchFn, storage: memoryStorage(), wait: async (ms) => void waits.push(ms) },
    );
    expect(waits).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });
});
