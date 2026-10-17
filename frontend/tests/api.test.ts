import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, safeUrl } from "../src/lib/api";
afterEach(() => vi.unstubAllGlobals());
describe("FastAPI contract", () => {
  it("sends only the question and receives complete JSON", async () => {
    const result = { answer: "Use VPN", source_used: "private_kb", citations: [], trace: ["Router -> KB"], retry_count: 0, status: "success" };
    const fetch = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal("fetch", fetch);
    expect(await api.chat("VPN help")).toEqual(result);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/chat$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ question: "VPN help" }), headers: { "Content-Type": "application/json" }, cache: "no-store" });
  });
  it("uses multipart file and the existing admin header", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ chunks: 1, vectors_created: 1 })); vi.stubGlobal("fetch", fetch);
    await api.ingest(new File(["handbook"], "policy.md"), "test-admin");
    const init = fetch.mock.calls[0][1];
    expect(init.headers).toEqual({ "X-Admin-Key": "test-admin" });
    expect(init.body.get("file").name).toBe("policy.md");
  });
  it("surfaces unauthorized and FastAPI validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ detail: "Invalid admin key." }, { status: 401 })).mockResolvedValueOnce(Response.json({ detail: [{ msg: "String should have at least 2 characters" }] }, { status: 422 })));
    await expect(api.audit("wrong")).rejects.toThrow("Invalid admin key.");
    await expect(api.chat("a")).rejects.toThrow("at least 2 characters");
  });
  it("handles non-JSON servers, disconnected APIs and timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("Bad gateway", { status: 502 })).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError")));
    await expect(api.health()).rejects.toMatchObject({ status: 502 });
    await expect(api.health()).rejects.toThrow("Cannot reach the API");
    await expect(api.health()).rejects.toThrow("may still finish processing");
  });
  it("rejects empty or invalid successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    await expect(api.health()).rejects.toBeInstanceOf(ApiError);
  });
  it("never renders unsafe citation URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,test")).toBeUndefined();
    expect(safeUrl("/private/file.pdf")).toBeUndefined();
    expect(safeUrl("https://example.com/guide")).toBe("https://example.com/guide");
  });
});
