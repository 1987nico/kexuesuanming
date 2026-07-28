import { readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";

const BASE_URL = "https://www.shuangshoujianai.com";
const COOKIE_PATH = "/private/tmp/growth-acceptance.cookies";
const LEDGER_PATH = "/private/tmp/growth-title-production-stress-ledger.json";
// 用户验收是“一个运营连续点换一批”，不是并发压测。默认六个业务空间各
// 五批，共30批；更长耐久测试可显式传 GROWTH_STRESS_ROUNDS。
const ROUNDS = Number(process.env.GROWTH_STRESS_ROUNDS || 5);

const NATIVE_METHODS = {
  buyer: ["human_pain", "tug_of_war", "contrarian", "nostalgia"],
  expert: ["human_pain", "tug_of_war", "scarce_material", "superlative", "contrarian", "inventory"],
  merchant: ["human_pain", "scarce_material", "inventory"],
};
const SPACES = [
  ["overseas_student", "buyer"],
  ["overseas_student", "merchant"],
  ["overseas_student", "expert"],
  ["executive", "buyer"],
  ["executive", "merchant"],
  ["executive", "expert"],
];

function titleFingerprint(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0-9一二三四五六七八九十百千万两]+/gu, "#")
    .replace(/[\s，。！？、；：“”‘’（）()《》【】\[\]…—\-_.·|｜]/gu, "");
}

function bigrams(value) {
  const text = titleFingerprint(value);
  if (text.length < 2) return new Set([text]);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}

function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function parseSessionCookie(raw) {
  const line = raw.split(/\r?\n/u).find((item) => (
    item.split(/\t/u)[5] === "mianba_session"
  ));
  if (!line) throw new Error("专用测试账号会话不存在，请重新登录。");
  const columns = line.split(/\t/u);
  return `mianba_session=${columns[6]}`;
}

const cookie = parseSessionCookie(await readFile(COOKIE_PATH, "utf8"));

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 135_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        cookie,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: "invalid_json",
        raw_response: raw.slice(0, 500),
      };
    }
    return { ok: response.ok, status: response.status, data, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSpace(businessLine, persona) {
  let response = await request(
    `/api/growth/bootstrap?businessLine=${businessLine}&persona=${persona}`,
    { timeoutMs: 60_000 },
  );
  if (!response.ok) throw new Error(`${businessLine}/${persona}读取失败：HTTP ${response.status}`);
  if (!response.data.account) {
    const created = await request("/api/growth/bootstrap", {
      method: "POST",
      timeoutMs: 120_000,
      body: {
        businessLine,
        persona,
        accountName: `标题压力验收-${businessLine}-${persona}`,
      },
    });
    if (!created.ok || !created.data.account) {
      throw new Error(`${businessLine}/${persona}创建测试人设失败：HTTP ${created.status}`);
    }
    response = await request(
      `/api/growth/bootstrap?businessLine=${businessLine}&persona=${persona}`,
      { timeoutMs: 60_000 },
    );
  }
  const runs = Array.isArray(response.data.runs) ? response.data.runs : [];
  const history = runs.flatMap((run) => (
    Array.isArray(run.topic_pool)
      ? run.topic_pool.map((topic) => ({
        method_id: topic.method_id,
        title: topic.title,
        mother_topic_key: run.title_fingerprints?.find((item) => (
          item.method_id === topic.method_id && item.title === topic.title
        ))?.mother_topic_key,
        material_signature: run.title_fingerprints?.find((item) => (
          item.method_id === topic.method_id && item.title === topic.title
        ))?.material_signature,
      }))
      : []
  ));
  return {
    key: `${businessLine}/${persona}`,
    businessLine,
    persona,
    accountId: response.data.account.id,
    history,
    batches: [],
  };
}

function validateNewBatch(state, response, round) {
  if (response.elapsedMs > 120_000) {
    throw Object.assign(new Error("标题批次超过120秒交付上限"), {
      evidence: {
        space: state.key,
        round,
        elapsed_ms: response.elapsedMs,
        limit_ms: 120_000,
      },
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error("标题接口没有完成本批交付"), {
      evidence: {
        space: state.key,
        round,
        http_status: response.status,
        error: response.data.error,
        message: response.data.message,
        failed_methods: response.data.failedMethods,
        elapsed_ms: response.elapsedMs,
      },
    });
  }
  const expectedMethods = NATIVE_METHODS[state.persona];
  const deliveries = Array.isArray(response.data.methodDeliveries)
    ? response.data.methodDeliveries
    : [];
  const failedNative = expectedMethods.filter((methodId) => {
    const delivery = deliveries.find((item) => item.method_id === methodId);
    return !delivery || delivery.status !== "ready" || delivery.title_origin !== "new";
  });
  if (failedNative.length) {
    throw Object.assign(new Error("原生法槽位没有全部交付新标题"), {
      evidence: { space: state.key, round, failed_method_ids: failedNative, deliveries },
    });
  }
  const topics = Array.isArray(response.data.newTopics) ? response.data.newTopics : [];
  const nativeTopics = expectedMethods.map((methodId) => topics.find((topic) => topic.method_id === methodId));
  if (nativeTopics.some((topic) => !topic)) {
    throw Object.assign(new Error("接口成功但缺少原生法标题"), {
      evidence: { space: state.key, round, expected_method_ids: expectedMethods },
    });
  }
  const acceptedInBatch = [];
  for (const topic of nativeTopics) {
    const title = String(topic.title || "").trim();
    if (!title || Array.from(title).length > 20) {
      throw Object.assign(new Error("标题为空或超过20字"), {
        evidence: { space: state.key, round, method_id: topic.method_id, title },
      });
    }
    if (!String(topic.title_promise || "").trim()) {
      throw Object.assign(new Error("标题没有绑定正文承诺"), {
        evidence: { space: state.key, round, method_id: topic.method_id, title },
      });
    }
    if (/[A-Za-z]{3,}[\u3400-\u9fff]|[\u3400-\u9fff][A-Za-z]{3,}/u.test(title)
      && !/(?:AI|offer|QS)/iu.test(title)) {
      throw Object.assign(new Error("标题出现中英文硬拼或乱码"), {
        evidence: { space: state.key, round, method_id: topic.method_id, title },
      });
    }
    if (state.businessLine === "overseas_student" && state.persona === "buyer"
      && !/(?:我家|孩子|娃|儿子|女儿|家长|爸妈|父母|陪孩子|陪娃)/u.test(title)) {
      throw Object.assign(new Error("留学生买家标题没有体现家长身份"), {
        evidence: { space: state.key, round, method_id: topic.method_id, title },
      });
    }
    const exact = state.history.find((item) => titleFingerprint(item.title) === titleFingerprint(title));
    const near = state.history
      .map((item) => ({ ...item, score: similarity(item.title, title) }))
      .sort((a, b) => b.score - a.score)[0];
    if (exact || (near && near.score >= 0.78)) {
      throw Object.assign(new Error("标题与历史标题重复或高度近似"), {
        evidence: {
          space: state.key,
          round,
          method_id: topic.method_id,
          title,
          duplicate_title: exact?.title ?? near.title,
          similarity: exact ? 1 : near.score,
        },
      });
    }
    const batchNear = acceptedInBatch
      .map((item) => ({ ...item, score: similarity(item.title, title) }))
      .sort((a, b) => b.score - a.score)[0];
    if (batchNear && batchNear.score >= 0.78) {
      throw Object.assign(new Error("同一批标题彼此高度近似"), {
        evidence: {
          space: state.key,
          round,
          method_id: topic.method_id,
          title,
          duplicate_title: batchNear.title,
          similarity: batchNear.score,
        },
      });
    }
    acceptedInBatch.push(topic);
  }
  return nativeTopics;
}

const ledger = {
  objective: `正式部署上的6空间×${ROUNDS}批真实用户标题验收`,
  deployment: "dpl_F8NQeu2zVjEvgM4wqz8SNs4XZHZi",
  started_at: new Date().toISOString(),
  status: "running",
  batches_passed: 0,
  batches_required: SPACES.length * ROUNDS,
  fallback_titles: 0,
  total_titles: 0,
  under_90_seconds: 0,
  failure: null,
  spaces: [],
};

try {
  const states = await Promise.all(SPACES.map(([businessLine, persona]) => (
    loadSpace(businessLine, persona)
  )));
  ledger.spaces = states.map((state) => ({ key: state.key, batches: state.batches }));
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  for (let round = 1; round <= ROUNDS; round += 1) {
    // 严格模拟一个运营逐次点击：任何时候只生成一个业务空间。并发三路会把
    // 平台资源抖动误判成用户功能故障，也不符合真实操作路径。
    for (let offset = 0; offset < states.length; offset += 1) {
      const group = states.slice(offset, offset + 1);
      const responses = await Promise.all(group.map((state) => request("/api/growth/topics", {
        method: "POST",
        // 给客户端留少量网络收尾时间，但正式验收仍由上面的 120 秒硬门槛
        // 判定；超过 120 秒即失败，不能把“最终返回了”算作通过。
        timeoutMs: 125_000,
        body: {
          accountId: state.accountId,
          businessLine: state.businessLine,
          persona: state.persona,
          generationMode: "default",
          action: "regenerate_titles",
          requestId: `stress-${state.businessLine}-${state.persona}-${round}-${crypto.randomUUID()}`,
        },
      })));
      for (let index = 0; index < group.length; index += 1) {
        const state = group[index];
        const response = responses[index];
        const topics = validateNewBatch(state, response, round);
        const fallbackCount = topics.filter((topic) => Boolean(topic.fallback_premise_key)).length;
        const runFingerprints = response.data.run?.title_fingerprints ?? [];
        const historyRows = topics.map((topic) => {
          const stored = runFingerprints.find((item) => (
            item.method_id === topic.method_id && item.title === topic.title
          ));
          return {
            method_id: topic.method_id,
            title: topic.title,
            mother_topic_key: stored?.mother_topic_key,
            material_signature: stored?.material_signature,
          };
        });
        state.history.unshift(...historyRows);
        state.batches.push({
          round,
          elapsed_ms: response.elapsedMs,
          titles: topics.map((topic) => topic.title),
          fallback_count: fallbackCount,
        });
        ledger.batches_passed += 1;
        ledger.total_titles += topics.length;
        ledger.fallback_titles += fallbackCount;
        if (response.elapsedMs <= 90_000) ledger.under_90_seconds += 1;
      }
      await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    }
  }

  const fallbackRatio = ledger.total_titles
    ? ledger.fallback_titles / ledger.total_titles
    : 1;
  if (fallbackRatio > 0.2) {
    throw Object.assign(new Error("静态兜底已成为主要供题来源"), {
      evidence: { fallback_ratio: fallbackRatio, limit: 0.2 },
    });
  }
  ledger.status = "passed";
  ledger.fallback_ratio = fallbackRatio;
  ledger.finished_at = new Date().toISOString();
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: ledger.status,
    deployment: ledger.deployment,
    batches_passed: ledger.batches_passed,
    batches_required: ledger.batches_required,
    fallback_ratio: fallbackRatio,
    under_90_seconds: ledger.under_90_seconds,
    ledger_path: LEDGER_PATH,
  }));
} catch (error) {
  ledger.status = "failed";
  ledger.failure = {
    message: error.message,
    ...(error.evidence || {}),
  };
  ledger.finished_at = new Date().toISOString();
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  console.error(JSON.stringify({
    status: ledger.status,
    deployment: ledger.deployment,
    batches_passed: ledger.batches_passed,
    failure: ledger.failure,
    ledger_path: LEDGER_PATH,
  }));
  process.exitCode = 1;
}
