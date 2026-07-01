import { createHash, createHmac } from "node:crypto";

// 火山引擎「视觉智能」即梦 AI 文生图 3.0 接入
// 文档：CVSync2AsyncSubmitTask 提交 → CVSync2AsyncGetResult 轮询
const SERVICE = "cv";
const VERSION = "2022-08-31";
const REGION = "cn-north-1";
const HOST = "visual.volcengineapi.com";
const ENDPOINT = `https://${HOST}`;
const DEFAULT_REQ_KEY = "high_aes_general_v30l_zt2i";

export function isVolcengineConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!(env.VOLCENGINE_AK && env.VOLCENGINE_SK);
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signHeaders(ak: string, sk: string, query: Record<string, string>, body: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const xDate =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const shortDate = xDate.slice(0, 8);
  const bodyHash = sha256Hex(body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${bodyHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");

  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`;
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    Authorization: `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "X-Date": xDate,
    "X-Content-Sha256": bodyHash,
    "Content-Type": "application/json",
    Host: HOST,
  } as Record<string, string>;
}

async function callVisual(action: string, payload: Record<string, unknown>) {
  const ak = process.env.VOLCENGINE_AK as string;
  const sk = process.env.VOLCENGINE_SK as string;
  const query = { Action: action, Version: VERSION };
  const body = JSON.stringify(payload);
  const headers = signHeaders(ak, sk, query, body);
  const url = `${ENDPOINT}/?Action=${action}&Version=${VERSION}`;
  const res = await fetch(url, { method: "POST", headers, body });
  const data = (await res.json()) as any;
  return data;
}

export interface VolcengineImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  timeoutMs?: number;
}

export async function generateJimengImage(options: VolcengineImageOptions): Promise<{ imageUrl: string; model: string }> {
  const reqKey = process.env.VOLCENGINE_JIMENG_REQ_KEY || DEFAULT_REQ_KEY;
  const width = options.width ?? 1024;
  const height = options.height ?? 1536;

  const submit = await callVisual("CVSync2AsyncSubmitTask", {
    req_key: reqKey,
    prompt: options.prompt,
    width,
    height,
    seed: -1,
    use_pre_llm: true,
    scale: 2.5,
  });
  if (submit?.code !== 10000 || !submit?.data?.task_id) {
    throw new Error(`jimeng_submit_failed:${submit?.code ?? "?"}:${submit?.message ?? ""}`.slice(0, 200));
  }
  const taskId = submit.data.task_id as string;

  const deadline = Date.now() + (options.timeoutMs ?? 24000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await callVisual("CVSync2AsyncGetResult", {
      req_key: reqKey,
      task_id: taskId,
      req_json: JSON.stringify({ return_url: true, logo_info: { add_logo: false } }),
    });
    const status = result?.data?.status;
    if (status === "done") {
      const url = result?.data?.image_urls?.[0];
      if (!url) throw new Error("jimeng_no_image_url");
      return { imageUrl: url, model: reqKey };
    }
    if (status === "not_found" || status === "expired" || result?.code === 50411) {
      throw new Error(`jimeng_task_failed:${status ?? result?.code}`);
    }
  }
  throw new Error("jimeng_timeout");
}
