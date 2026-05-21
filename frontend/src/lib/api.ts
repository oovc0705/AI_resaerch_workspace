/**
 * API 调用封装模块。
 * 集中管理所有与后端 API 的通信，提供类型安全的请求与响应处理。
 * 所有函数均为异步，使用 fetch API 与后端 FastAPI 服务通信。
 */

/** 后端 API 基础地址，Docker 部署时通过 Next.js rewrites 代理，使用空字符串 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** URL 记录的响应类型，与后端 URLResponse schema 对应 */
export interface URLResponse {
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

/** 分页列表响应类型，与后端 URLListResponse schema 对应 */
export interface URLListResponse {
  items: URLResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** 搜索与分页请求参数类型 */
export interface URLSearchParams {
  q?: string | null;
  page?: number;
  page_size?: number;
}

/** 问答响应类型 */
export interface QAResponse {
  answer: string;
  sources: { id: number; title: string; url: string }[];
}

/**
 * 创建一条新的 URL 记录。
 * 发送 POST /api/urls，如果 URL 已存在则抛出错误。
 * @param url - 要保存的 URL 字符串
 * @returns 创建成功的 URLResponse 对象
 */
export async function createUrl(url: string): Promise<URLResponse> {
  const response = await fetch(`${API_BASE_URL}/api/urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail ?? "创建失败");
  }

  return response.json() as Promise<URLResponse>;
}

/**
 * 获取 URL 记录列表（支持搜索和分页）。
 * 发送 GET /api/urls，支持 q、page、page_size 查询参数。
 * @param params - 搜索和分页参数
 * @returns 分页后的 URLListResponse 对象
 */
export async function searchUrls(
  params: URLSearchParams = {},
): Promise<URLListResponse> {
  const searchParams = new URLSearchParams();

  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}/api/urls${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("获取列表失败");
  }

  return response.json() as Promise<URLListResponse>;
}

/**
 * 获取所有 URL 记录列表（向后兼容，内部调用 searchUrls 取第一页）。
 * @returns URLResponse 数组
 */
export async function getUrls(): Promise<URLResponse[]> {
  const result = await searchUrls({ page: 1, page_size: 100 });
  return result.items;
}

/**
 * 删除指定 id 的 URL 记录。
 * 发送 DELETE /api/urls/{id}，返回 204 No Content。
 * @param id - 要删除的记录 id
 */
export async function deleteUrl(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/urls/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("删除失败");
  }
}

/**
 * 手动触发某条 URL 记录的 AI 处理（摘要、标签、embedding）。
 * 发送 POST /api/urls/{urlId}/process-ai。
 * @param urlId - 记录 id
 * @returns 处理后的 URLResponse
 */
export async function processAI(urlId: number): Promise<URLResponse> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/urls/${urlId}/process-ai`,
      { method: "POST" },
    );
  } catch {
    throw new Error("无法连接后端服务，请确认后端已启动（http://localhost:8000）");
  }

  if (!response.ok) {
    let detail = "AI 处理失败";
    try {
      const error = await response.json();
      detail = error.detail ?? detail;
    } catch {
      detail = `服务端错误 (HTTP ${response.status})`;
    }
    throw new Error(detail);
  }

  return response.json() as Promise<URLResponse>;
}

/**
 * 语义搜索：使用 embedding 向量检索最相关的内容。
 * 发送 GET /api/urls/search/semantic?q=查询&top_k=数量。
 * @param query - 查询文本
 * @param topK - 返回结果数（默认 5）
 * @returns 匹配的 URLResponse 数组
 */
export async function semanticSearch(
  query: string,
  topK: number = 5,
): Promise<URLResponse[]> {
  const params = new URLSearchParams({ q: query, top_k: String(topK) });
  const response = await fetch(
    `${API_BASE_URL}/api/urls/search/semantic?${params}`,
  );

  if (!response.ok) {
    throw new Error("语义搜索失败");
  }

  return response.json() as Promise<URLResponse[]>;
}

/**
 * RAG 问答：基于知识库内容回答用户问题。
 * 发送 POST /api/qa/ask，请求体为 { question, top_k }。
 * @param question - 用户问题
 * @param topK - 检索的相关文档数（默认 5）
 * @returns QAResponse，包含 answer 和 sources
 */
export async function askQuestion(
  question: string,
  topK: number = 5,
): Promise<QAResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/qa/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, top_k: topK }),
    });
  } catch {
    throw new Error("无法连接后端服务，请确认后端已启动（http://localhost:8000）");
  }

  if (!response.ok) {
    let detail = "问答失败";
    try {
      const error = await response.json();
      detail = error.detail ?? detail;
    } catch {
      detail = `服务端错误 (HTTP ${response.status})`;
    }
    throw new Error(detail);
  }

  return response.json() as Promise<QAResponse>;
}

/** 带文件上传的问答请求类型 */
export interface QAFileItem {
  filename: string;
  content: string;
}

/**
 * 带文件上传的 RAG 问答：基于知识库内容和上传文件回答用户问题。
 * 发送 POST /api/qa/ask-with-files，请求体为 { question, files, top_k }。
 * @param question - 用户问题
 * @param files - 上传文件数组
 * @param topK - 检索的相关文档数（默认 5）
 * @returns QAResponse，包含 answer 和 sources
 */
export async function askWithFiles(
  question: string,
  files: QAFileItem[],
  topK: number = 5,
): Promise<QAResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/qa/ask-with-files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, files, top_k: topK }),
    });
  } catch {
    throw new Error("无法连接后端服务，请确认后端已启动（http://localhost:8000）");
  }

  if (!response.ok) {
    let detail = "问答失败";
    try {
      const error = await response.json();
      detail = error.detail ?? detail;
    } catch {
      detail = `服务端错误 (HTTP ${response.status})`;
    }
    throw new Error(detail);
  }

  return response.json() as Promise<QAResponse>;
}
