import type { TopicSourceSnapshot } from "./types";

export interface LinkValidationResult {
  link_status: TopicSourceSnapshot["link_status"];
  http_status?: number;
  checked_at: string;
  message: string;
}

export function classifySourceStatus(status: number): TopicSourceSnapshot["link_status"] {
  if (status >= 200 && status < 400) return "accessible";
  if (status === 404 || status === 410) return "invalid";
  return "restricted";
}

export async function validateSourceLink(url: string, timeoutMs = 8_000): Promise<LinkValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "ShuangshoujianGrowthPreview/3.2" },
      cache: "no-store",
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "ShuangshoujianGrowthPreview/3.2", Range: "bytes=0-0" },
        cache: "no-store",
      });
    }
    const linkStatus = classifySourceStatus(response.status);
    return {
      link_status: linkStatus,
      http_status: response.status,
      checked_at: new Date().toISOString(),
      message: linkStatus === "accessible" ? "链接可访问" : linkStatus === "invalid" ? "链接已失效，不能参与生成" : `站点返回 ${response.status}，需要人工复核`,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      link_status: "restricted",
      checked_at: new Date().toISOString(),
      message: timedOut ? "链接检测超过8秒，需要人工复核" : "网络无法完成检测，需要人工复核",
    };
  } finally {
    clearTimeout(timeout);
  }
}
