const API_BASE = "http://localhost:8000";

export interface UrlRecord {
  id: number;
  url: string;
  title: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  scraped: boolean;
  error: string | null;
  summary: string | null;
  tags: string[];
}

export interface UrlListResponse {
  items: UrlRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QARequest {
  question: string;
  top_k?: number;
}

export interface QAResponse {
  answer: string;
  sources: { id: number; title: string; url: string }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { id: number; title: string; url: string }[];
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ApiConfig {
  configured: boolean;
  api_key: string | null;
  base_url: string | null;
  model: string | null;
  embedding_model: string | null;
}

export async function createUrl(url: string): Promise<UrlRecord> {
  const res = await fetch(`${API_BASE}/api/urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "request failed" }));
    throw new Error(err.detail || "request failed");
  }
  return res.json();
}

export async function getUrls(q?: string, page = 1, pageSize = 20): Promise<UrlListResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const res = await fetch(`${API_BASE}/api/urls?${params}`);
  if (!res.ok) throw new Error("failed to fetch urls");
  return res.json();
}

export async function deleteUrl(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/urls/${id}`, { method: "DELETE" });
}

export async function processAI(id: number): Promise<UrlRecord> {
  const res = await fetch(`${API_BASE}/api/urls/${id}/process-ai`, { method: "POST" });
  if (!res.ok) throw new Error("failed to process AI");
  return res.json();
}

export async function askQuestion(question: string, topK = 5): Promise<QAResponse> {
  const res = await fetch(`${API_BASE}/api/qa/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: topK }),
  });
  if (!res.ok) throw new Error("failed to get answer");
  return res.json();
}

export async function askWithFiles(
  question: string,
  files: { filename: string; content: string }[],
  topK = 5
): Promise<QAResponse> {
  const res = await fetch(`${API_BASE}/api/qa/ask-with-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, files, top_k: topK }),
  });
  if (!res.ok) throw new Error("failed to get answer");
  return res.json();
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
