/**
 * 报告页 → A4 PDF 渲染
 *
 * - Vercel/生产：@sparticuz/chromium 提供无头 Chromium 二进制。
 * - 本地开发：优先用本机 Chrome（CHROME_PATH 可覆盖）。
 * - 渲染后按 profileId + 内容版本缓存（Supabase Storage 优先，否则本地 .data/pdf/）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDBConfigured, supabaseServer } from "@/lib/db/supabase";

const PDF_BUCKET = "report-pdfs";

const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
];

async function resolveExecutablePath(): Promise<{ executablePath: string; args: string[]; serverless: boolean }> {
  const fromEnv = process.env.CHROME_PATH;
  const local = fromEnv && existsSync(fromEnv) ? fromEnv : LOCAL_CHROME_PATHS.find((p) => existsSync(p));

  // 本地 next start 会加载 .env.production.local；若其中带 VERCEL=1，仍应优先使用本机 Chrome。
  if (local) {
    return { executablePath: local, args: [], serverless: false };
  }

  // Vercel / AWS Lambda 环境
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      serverless: true,
    };
  }
  throw new Error("未找到本机 Chrome，可通过环境变量 CHROME_PATH 指定浏览器路径。");
}

export async function renderPagePDF(url: string, opts?: { pageSelector?: string }): Promise<Buffer> {
  const pageSelector = opts?.pageSelector ?? ".ir-page";
  const puppeteer = (await import("puppeteer-core")).default;
  const { executablePath, args, serverless } = await resolveExecutablePath();
  const browser = await puppeteer.launch({
    executablePath,
    args: [...args, "--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    headless: true,
    defaultViewport: { width: 1240, height: 1754 },
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: serverless ? 45000 : 90000 });
    // 等报告样式真正生效再打印：A4 页宽约 794px（210mm @ 96dpi）
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const width = el.getBoundingClientRect().width;
        return Math.abs(width - 794) < 24;
      },
      { timeout: 30000 },
      pageSelector
    );
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ---------- 缓存 ----------

function localPdfPath(key: string) {
  return path.join(process.cwd(), ".data", "pdf", `${key}.pdf`);
}

export async function getCachedPDF(key: string): Promise<Buffer | null> {
  if (isDBConfigured()) {
    try {
      const { data, error } = await supabaseServer().storage.from(PDF_BUCKET).download(`${key}.pdf`);
      if (!error && data) return Buffer.from(await data.arrayBuffer());
    } catch {
      // bucket 不存在等情况直接当作未命中
    }
    return null;
  }
  const filePath = localPdfPath(key);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

export async function putCachedPDF(key: string, pdf: Buffer): Promise<void> {
  if (isDBConfigured()) {
    try {
      const db = supabaseServer();
      await db.storage.createBucket(PDF_BUCKET, { public: false }).catch(() => undefined);
      await db.storage.from(PDF_BUCKET).upload(`${key}.pdf`, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    } catch (error) {
      console.warn("[pdf] Supabase 缓存写入失败：", (error as Error)?.message);
    }
    return;
  }
  try {
    const filePath = localPdfPath(key);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, pdf);
  } catch (error) {
    console.warn("[pdf] 本地缓存写入失败：", (error as Error)?.message);
  }
}
