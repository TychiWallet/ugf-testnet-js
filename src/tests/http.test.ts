import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../http.js";
import { UGFAuthError, UGFError } from "../types.js";

const BASE = "https://api.example.com";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

describe("HttpClient", () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient(BASE);
  });

  it("sets and clears token", () => {
    client.setToken("abc");
    expect(client.getToken()).toBe("abc");
    client.clearToken();
    expect(client.getToken()).toBeNull();
  });

  it("throws UGFAuthError on 401 and clears token", async () => {
    client.setToken("stale");
    global.fetch = mockFetch(401, {});
    await expect(client.get("/test")).rejects.toBeInstanceOf(UGFAuthError);
    expect(client.getToken()).toBeNull();
  });

  it("throws UGFError with body.error on non-2xx", async () => {
    global.fetch = mockFetch(400, { error: "bad request" });
    await expect(client.get("/test")).rejects.toMatchObject({
      message: "bad request",
      code: "HTTP_ERROR",
      statusCode: 400,
    });
  });

  it("throws UGFError with body.message if no body.error", async () => {
    global.fetch = mockFetch(500, { message: "server exploded" });
    await expect(client.get("/test")).rejects.toMatchObject({
      message: "server exploded",
    });
  });

  it("returns parsed JSON on 2xx", async () => {
    global.fetch = mockFetch(200, { ok: true });
    const res = await client.get<{ ok: boolean }>("/test");
    expect(res.ok).toBe(true);
  });

  it("sends Authorization header when token set", async () => {
    client.setToken("tok123");
    const spy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({}),
    });
    global.fetch = spy;
    await client.get("/test");
    const headers = spy.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer tok123");
  });

  it("omits Authorization header when no token", async () => {
    const spy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({}),
    });
    global.fetch = spy;
    await client.get("/test");
    const headers = spy.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBeUndefined();
  });
});
