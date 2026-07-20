import { generateImageAsset } from "@/lib/image/router";
import type { DeepDiagramKey, DeepReportGenerated } from "./deepReport";

const STYLE =
  "黑金配色、米白色背景、高级简约的咨询报告信息图风格，排版干净、留白充足、中文清晰专业、无错别字、无多余装饰、无水印。";

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(str).join("；");
  return String(v);
}

function dirName(rec: Record<string, unknown>): string {
  return str(rec["方向"] ?? rec["direction"] ?? rec["name"]);
}

/** 依据大报告生成内容，构造 5 张图的 gpt-image-2 提示词。返回 key->prompt。 */
export function buildDiagramPrompts(generated: DeepReportGenerated): Partial<Record<DeepDiagramKey, string>> {
  const prompts: Partial<Record<DeepDiagramKey, string>> = {};
  const dd = generated.diagram_data ?? {};

  // 1) Step5 机会×胜算矩阵
  const matrix = dd.matrix ?? [];
  if (matrix.length) {
    const points = matrix
      .map((m) => `${m.direction} ${m.opportunity}/${m.win}`)
      .join("、");
    const top3 = matrix
      .slice()
      .sort((a, b) => b.opportunity + b.win - (a.opportunity + a.win))
      .slice(0, 3)
      .map((m, i) => `${i + 1} ${m.direction}`)
      .join("、");
    prompts.matrix = `横版信息图。顶部居中标题「Step 5 · 机会大小 × 个人胜算矩阵」，下方金色装饰线。主体是二维坐标：纵轴「Step5 个人胜算(VRIN)」从下(低/弱)到上(高/强)，横轴「Step4 市场机会大小」从左(低/小)到右(高/大)。金色虚线分四象限，右上象限淡金色高亮并标注「优先主线：高机会+高胜算」。将这些方向按"机会/胜算"分数(满分16)散点标注(黑色圆点+方向名+分数，分越高越靠右上)：${points}。右侧金框小卡片标题「Top 3」依次列：${top3}。底部小字：评分说明 每项满分16分 格式为 机会得分/胜算得分 仅供内部参考。${STYLE}`;
  }

  // 2) Step3 亮区聚类图
  const bright = dd.bright_zone ?? [];
  if (bright.length) {
    const items = bright.map((b) => `${b.direction} ${b.score}分`).join("、");
    prompts.bright_zone = `横版信息图。顶部居中标题「Step 3 · 感性验证亮区聚类图」，下方金色装饰线。用气泡聚类图表现各候选方向的本人感性打分(满分10)：分数越高的气泡越大、越靠近中心「亮区」并用金色，7分及以上归入金色高亮的「亮区(≥7分)」并说明"进入下一步"，7分以下用灰色气泡放在外围。各气泡标注方向名与分数：${items}。${STYLE}`;
  }

  // 3) Step4 市场验证矩阵
  const mm = dd.market_matrix ?? [];
  if (mm.length) {
    const items = mm.map((m) => `${m.direction} 机会${m.opportunity}/门槛${m.barrier}`).join("、");
    prompts.market = `横版信息图。顶部居中标题「Step 4 · 市场验证矩阵」，下方金色装饰线。二维坐标：纵轴「市场机会大小」从下(小)到上(大)，横轴「竞争门槛/进入难度」从左(低)到右(高)。金色虚线分四象限，并给四象限命名：右上「难而值得(高机会高门槛)」、左上「蓝海先机(高机会低门槛)」、左下「红海低价(低机会低门槛)」、右下「鸡肋(低机会高门槛)」。将各方向按 机会/门槛(满分10)散点标注(黑点+方向名+分数)：${items}。${STYLE}`;
  }

  // 4) Step6 失败验尸鱼骨图
  const premortem = generated.premortem ?? [];
  const main = premortem[0] ?? {};
  const failure = str(main["失败剧本"]);
  const signals = Array.isArray(main["早期预警信号"]) ? (main["早期预警信号"] as unknown[]).map(str) : [];
  if (failure || signals.length) {
    const bones = signals.slice(0, 5).join("、") || "线索不足、定位过宽、交付过重、获客成本高、无转介绍";
    prompts.fishbone = `横版鱼骨图(石川图)。顶部居中标题「Step 6 · 失败验尸鱼骨图」，下方金色装饰线。鱼骨图头部(鱼头)写失败结果：「${dirName(main) || "主方向"}为什么会失败」。主骨为水平金色箭头指向鱼头，从主骨向斜上/斜下分出若干条鱼刺分支，每条分支代表一个失败原因/早期信号，分支末端用中文标注：${bones}。整体黑金配色、米白背景、结构清晰。${STYLE}`;
  }

  // 5) 90 天验证路线图
  const plan = generated.ninety_day_plan ?? {};
  const p1 = str(plan["第0到30天"]);
  const p2 = str(plan["第30到60天"]);
  const p3 = str(plan["第60到90天"]);
  const stop = str(plan["止损线"]);
  if (p1 || p2 || p3) {
    prompts.roadmap = `横版时间轴路线图。顶部居中标题「90 天验证路线图」，下方金色装饰线。一条从左到右的金色时间轴，分三个阶段节点，每个节点一个圆角卡片：「Day 0-30」写：${p1 || "锁定人群、访谈验证"}；「Day 30-60」写：${p2 || "做样本、验证付费"}；「Day 60-90」写：${p3 || "标准化、放大"}。底部用红色/深色条标注止损线：${stop || "无付费验证即暂停"}。${STYLE}`;
  }

  return prompts;
}

/** 并发生成 5 张图（容错：单张失败不影响其他）。返回 key->dataURL。 */
export async function generateReportDiagrams(
  generated: DeepReportGenerated
): Promise<Partial<Record<DeepDiagramKey, string>>> {
  const prompts = buildDiagramPrompts(generated);
  const entries = Object.entries(prompts) as Array<[DeepDiagramKey, string]>;

  const results = await Promise.all(
    entries.map(async ([key, prompt]) => {
      try {
        const image = await generateImageAsset({ prompt, size: "1536x1024" });
        return [key, image.imageDataUrl] as const;
      } catch (error) {
        console.warn(`[reportDiagrams] ${key} 生成失败:`, (error as Error).message);
        return [key, undefined] as const;
      }
    })
  );

  const images: Partial<Record<DeepDiagramKey, string>> = {};
  for (const [key, url] of results) {
    if (url) images[key] = url;
  }
  return images;
}
