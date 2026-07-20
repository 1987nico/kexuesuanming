/**
 * 金样本对照脚本：初步诊断报告流水线端到端验证
 *
 * 用法：先起 dev server（npm run dev），然后：
 *   node scripts/golden-initial-report.mjs [baseUrl]
 *
 * 步骤：
 * 1. 用固定金样本数据（放放画像）POST /api/reports/assessment-profiles 生成底稿；
 * 2. 下载 /api/reports/initial/:id/pdf；
 * 3. 校验 PDF 页数、文件大小、必含词与禁用词；
 * 4. 输出到 output/pdf/golden-initial-diagnosis.pdf，便于人工对照放放模板。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.argv[2] || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "output", "pdf");

const goldenBody = {
  customer_name: "金样本客户",
  customer_contact: "手机：13800000000",
  survey_answers: {
    decision_type: "创业",
    decision_timing: "3个月内大概率要动",
    stuck_point: "不知道自己适合什么",
    energy_source: "做判断和决策",
    avoid_state: "做看起来体面但没复利的事",
    transferable_asset: "行业经验",
    interested_direction: "个人 IP 咨询、AI 视频",
    excluded_direction: "低价代运营",
  },
  value_profile: {
    liked_values: ["学习/进化", "了解世界", "被爱"],
    excluded_values: ["安稳度日，优哉游哉", "有知己好友", "创新"],
    like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
    exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
    filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
  },
};

const REQUIRED_TERMS = ["金样本客户", "初步诊断报告", "价值观双三圈", "90 天验证框架", "数据附录", "保密交付"];
const BANNED_TERMS = ["科学算命", "小报告", "大报告", "VRIN", "转化桥", "未填写", "尚未生成"];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

async function main() {
  // 1. 拿 252 题中性答案模板
  const templateRes = await fetch(`${BASE_URL}/api/reports/talent-template`);
  if (!templateRes.ok) throw new Error(`talent-template 请求失败：${templateRes.status}`);
  const template = await templateRes.json();
  const talentAnswers = template.neutral_answers;
  if (!talentAnswers || Object.keys(talentAnswers).length < 252) {
    throw new Error("未取到 252 题中性答案模板");
  }

  // 2. 创建金样本底稿
  const profileRes = await fetch(`${BASE_URL}/api/reports/assessment-profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...goldenBody, talent_answers: talentAnswers }),
  });
  const profileData = await profileRes.json();
  if (!profileRes.ok) throw new Error(`创建底稿失败：${JSON.stringify(profileData)}`);
  const profileId = profileData.profile.id;
  ok(`金样本底稿已创建：${profileId}`);

  // 3. 下载 PDF（首次会触发文案生成 + 渲染，耐心等）
  console.log("正在生成 PDF（首次含 LLM 文案生成，可能需要 30-90 秒）...");
  const started = Date.now();
  const pdfRes = await fetch(`${BASE_URL}/api/reports/initial/${profileId}/pdf`);
  if (!pdfRes.ok) {
    const err = await pdfRes.text();
    throw new Error(`PDF 生成失败（${pdfRes.status}）：${err.slice(0, 300)}`);
  }
  const pdf = Buffer.from(await pdfRes.arrayBuffer());
  ok(`PDF 生成完成：${(pdf.length / 1024).toFixed(0)} KB，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // 4. 基本校验
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) fail("返回内容不是合法 PDF");
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pageCount === 12) ok(`页数正确：12 页`);
  else fail(`页数异常：${pageCount}（期望 12）`);
  if (pdf.length < 60 * 1024) fail(`PDF 过小（${pdf.length} 字节），可能渲染不完整`);

  // 5. 文本校验（取报告页 HTML 而不是 PDF 字节，因为中文在 PDF 里是编码字节）
  const htmlRes = await fetch(`${BASE_URL}/reports/initial/${profileId}`);
  const html = await htmlRes.text();
  for (const term of REQUIRED_TERMS) {
    if (html.includes(term)) ok(`必含词存在：${term}`);
    else fail(`缺少必含词：${term}`);
  }
  for (const term of BANNED_TERMS) {
    if (!html.includes(term)) ok(`禁用词未出现：${term}`);
    else fail(`出现禁用词/占位符：${term}`);
  }

  // 6. 落盘
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "golden-initial-diagnosis.pdf");
  writeFileSync(outPath, pdf);
  ok(`已保存：${outPath}`);
  console.log(`\n报告页预览：${BASE_URL}/reports/initial/${profileId}`);
  if (process.exitCode) {
    console.error("\n有校验未通过，请检查上方 ✗ 项。");
  } else {
    console.log("\n全部校验通过。请人工对照放放模板逐页检查版式。");
  }
}

main().catch((error) => {
  console.error("脚本执行失败：", error.message);
  process.exit(1);
});
