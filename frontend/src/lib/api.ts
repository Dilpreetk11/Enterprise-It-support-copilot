export interface Citation { title?: string; url?: string | null; type?: string; document_id?: string | null }
export interface ChatResponse {
  answer: string; source_used: string; citations: Citation[]; trace: string[];
  retry_count: number; status: string;
}
export interface Health {
  status: string; service: string; environment: string; llm_provider: string; llm_model: string;
  embedding_model: string; groq_configured: boolean; pinecone_configured: boolean;
  tavily_configured: boolean; admin_key_set: boolean;
}
export interface IngestResult { message: string; file?: string; files?: number; chunks: number; vectors_created: number }
export interface AuditEntry { created_at: string; question: string; source_used: string; duration_ms: number | null }
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ApiError"; }
}
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function request<T>(path: string, init: RequestInit = {}, timeout = 180_000): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(timeout) });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((v: { msg?: string }) => v.msg).join("; ") : `Request failed (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    if (!data) throw new ApiError("The backend returned an invalid JSON response.", response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new ApiError("The request timed out. The backend may still finish processing; check before retrying an upload.", 0);
    throw new ApiError("Cannot reach the API. Check the backend URL, HTTPS, and allowed CORS origins.", 0);
  }
}
const adminHeaders = (key: string) => ({ "X-Admin-Key": key });
export const api = {
  health: () => request<Health>("/api/health", {}, 30_000),
  chat: (question: string) => request<ChatResponse>("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
  ingest: (file: File, key: string) => {
    const body = new FormData(); body.append("file", file);
    return request<IngestResult>("/api/ingest", { method: "POST", headers: adminHeaders(key), body }, 300_000);
  },
  samples: (key: string) => request<IngestResult>("/api/admin/ingest-samples", { method: "POST", headers: adminHeaders(key) }, 300_000),
  audit: (key: string) => request<{ entries: AuditEntry[] }>("/api/admin/audit", { headers: adminHeaders(key) }),
};
export function safeUrl(value?: string | null) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

export async function timedChat(question: string) {
  const start = performance.now();
  const result = await api.chat(question);
  return { result, duration: performance.now() - start };
}
