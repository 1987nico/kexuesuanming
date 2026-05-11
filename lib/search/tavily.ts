/**
 * Tavily 联网检索封装 —— 用于 Step 2 外部佐证 + Step 4 PEST 数据抓取
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score?: number;
}

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
}

export async function tavilySearch(
  query: string,
  options: TavilySearchOptions = {}
): Promise<{ answer?: string; results: TavilySearchResult[] }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // 价值验证阶段允许没有 key，返回空，让 LLM 用通用知识跑（降级）
    return { results: [] };
  }
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options.maxResults ?? 5,
      search_depth: options.searchDepth ?? "basic",
      include_answer: options.includeAnswer ?? false,
    }),
    // 价值验证阶段：30s 超时
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    console.warn("[tavily] failed:", r.status, await r.text().catch(() => ""));
    return { results: [] };
  }
  const data = await r.json();
  return {
    answer: data.answer,
    results: (data.results || []).map((x: any) => ({
      title: x.title,
      url: x.url,
      content: x.content,
      published_date: x.published_date,
      score: x.score,
    })),
  };
}

/** 多个查询并发 */
export async function tavilyMulti(queries: string[], options: TavilySearchOptions = {}) {
  return Promise.all(queries.map((q) => tavilySearch(q, options).catch(() => ({ results: [] }))));
}
