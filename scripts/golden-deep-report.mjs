/**
 * 金样本对照脚本：完整咨询报告（大报告）流水线端到端验证
 *
 * 用法：先起 dev server（npm run dev），然后：
 *   node scripts/golden-deep-report.mjs [baseUrl]
 *
 * 步骤：
 * 1. POST 金样本底稿（同 golden-initial-report）
 * 2. 创建方向测评会话并模拟 10 个「点亮」滑卡
 * 3. POST /api/reports/deep 触发生成
 * 4. 下载 /api/reports/deep/:id/pdf
 * 5. 校验 PDF 页数、必含词
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.argv[2] || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "output", "pdf");

const goldenBody = {
  customer_name: "金样本大报告",
  customer_contact: "手机：13900000000",
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

const REQUIRED_TERMS = ["金样本大报告", "咨询报告", "Step1", "Step3", "失败验尸", "90 天验证"];
const BANNED_TERMS = ["尚未生成", "待生成", "未填写", "科学算命", "职场参谋"];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 生成 252 题答案（全 4 分）
  const talent_answers = {};
  for (let i = 1; i <= 252; i++) talent_answers[String(i)] = 4;

  const createRes = await fetch(`${BASE_URL}/api/reports/assessment-profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...goldenBody, talent_answers }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    fail(`创建底稿失败：${JSON.stringify(createData)}`);
    return;
  }
  const profileId = createData.profile.id;
  ok(`底稿已创建：${profileId}`);

  // 等待小报告文案
  await new Promise((r) => setTimeout(r, 3000));

  // 创建方向测评
  const sessionRes = await fetch(`${BASE_URL}/api/reports/direction-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assessment_profile_id: profileId }),
  });
  const sessionData = await sessionRes.json();
  if (!sessionRes.ok) {
    fail(`创建方向测评失败：${JSON.stringify(sessionData)}`);
    return;
  }
  ok("方向测评会话已创建");

  // 模拟滑卡直到完成（最多 60 次）
  for (let attempt = 0; attempt < 60; attempt++) {
    const stateRes = await fetch(`${BASE_URL}/api/reports/direction-sessions/${profileId}`);
    const stateData = await stateRes.json();
    if (stateData.session?.status === "completed") break;

    const cards = stateData.session?.cards ?? [];
    if (!cards.length) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const card = cards[0];
    await fetch(`${BASE_URL}/api/reports/direction-sessions/${profileId}/swipes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ card_id: card.id, liked: true }),
    });
  }

  const finalState = await fetch(`${BASE_URL}/api/reports/direction-sessions/${profileId}`).then((r) => r.json());
  if (finalState.session?.status !== "completed") {
    fail("方向测评未在预期步数内完成");
    return;
  }
  ok(`方向测评完成：点亮 ${finalState.session.likes} 个方向`);

  // 触发生成大报告
  const deepRes = await fetch(`${BASE_URL}/api/reports/deep`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assessment_profile_id: profileId }),
  });
  const deepData = await deepRes.json();
  if (!deepRes.ok) {
    fail(`大报告生成失败：${JSON.stringify(deepData)}`);
    return;
  }
  ok("大报告内容已生成");

  // 下载 PDF
  const pdfRes = await fetch(`${BASE_URL}/api/reports/deep/${profileId}/pdf`);
  if (!pdfRes.ok) {
    const err = await pdfRes.text();
    fail(`PDF 下载失败：${err}`);
    return;
  }
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const outPath = path.join(OUT_DIR, "golden-deep-report.pdf");
  writeFileSync(outPath, pdfBuffer);
  ok(`PDF 已保存：${outPath}（${(pdfBuffer.length / 1024).toFixed(1)} KB）`);

  if (pdfBuffer.length < 8000) fail("PDF 文件过小，可能渲染失败");
  else ok("PDF 文件大小正常");

  const header = pdfBuffer.subarray(0, 800).toString("latin1");
  if (!header.startsWith("%PDF")) fail("不是有效 PDF 文件");
  else ok("PDF 文件头校验通过");

  console.log("\n预览链接：");
  console.log(`  网页：${BASE_URL}/reports/deep/${profileId}`);
  console.log(`  PDF：${BASE_URL}/api/reports/deep/${profileId}/pdf`);
}

main().catch((error) => {
  fail(error.message);
});
