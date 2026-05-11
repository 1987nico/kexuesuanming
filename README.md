# 科学算命 · 5 步漏斗

把职业/事业选择做成一个漏斗：从「喜欢的范围」里发散，再用感性、市场、资源三层验证，最后用「失败验尸」把可能的输法先想清楚。

> 当前阶段：**产品价值验证**。MVP 聚焦"AI 工作流质量 + Step 3 人机协同体验 + Step 6 失败验尸冲击力"是否真的能帮用户做出更好的决策。传播/增长功能后置。

## 一图看懂

```
登录 → 问卷 + PrinciplesYou
  → Step 1 价值观双三圈（喜欢区 × 排除带）
  → Step 2 发散 30 个画面化机会
  → Step 3 卡片打分 ≥7 进下一步 ⭐ 人机协同关键
  → Step 4 PEST + 五力（现状/演化双评分）收敛到 ~6
  → Step 5 VRIN + 决策矩阵 收口到 Top 3
  → Step 6 失败验尸：输的剧本 + 5 层鱼骨 + 90 天动作挂钩 ⭐ 反向收束
  → 完整报告（可 PDF 导出）+ 价值验证反馈
```

## 技术栈

- **前端**：Next.js 14 (App Router) + Tailwind + framer-motion
- **后端**：Next.js Route Handlers（API-First 严格解耦，未来切小程序前端复用同一后端）
- **AI 路由**：`LLMRouter` 抽象层
  - 主：Anthropic Claude（价值验证阶段）
  - 兜底/未来合规切换：DeepSeek（国产）
  - 切换只改后端环境变量，前端零改动
- **联网检索**：Tavily Search API（Step 2 外部佐证 + Step 4 PEST 数据）
- **数据**：Supabase Postgres（生产）/ 内存存储（本地 demo，零配置）

## 快速开始

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 至少填入主推理 API key（价值验证阶段足够）
#    ANTHROPIC_API_KEY=sk-ant-...
#    （可选）TAVILY_API_KEY=tvly-...
#    （可选）DEEPSEEK_API_KEY=...   兜底
#    （可选）SUPABASE_*                  不填则用内存存储

# 3. 启动
npm run dev
# 打开 http://localhost:3000，移动端视图（按 F12 切换设备）
```

## 关键文件

```
app/
├── page.tsx                                # 首页
├── run/[id]/
│   ├── survey/page.tsx                     # 问卷（对齐 问卷.xlsx）
│   ├── step1/page.tsx                      # 价值观双三圈
│   ├── step2/page.tsx                      # 30 机会发散
│   ├── step3/page.tsx                      # ⭐ 卡片打分（核心交互）
│   ├── step4/page.tsx                      # PEST + 波特五力
│   ├── step5/page.tsx                      # VRIN + Top 3
│   ├── step6/page.tsx                      # ⭐ 失败验尸（含输的剧本叙事）
│   ├── report/page.tsx                     # 完整报告 + PDF 导出
│   └── feedback/page.tsx                   # 价值验证反馈
└── api/runs/                               # API-First 后端
    ├── route.ts                            # POST 新建 run
    └── [id]/
        ├── route.ts                        # GET 完整快照
        ├── survey/route.ts                 # PUT 问卷
        ├── step1..6/generate/route.ts      # POST 触发各 step 生成
        ├── step3/scores/route.ts           # POST 提交评分
        └── metrics/route.ts                # POST 价值验证指标

lib/
├── llm/
│   ├── router.ts                           # LLMRouter (Claude/DeepSeek/OpenAI 路由)
│   └── prompts/
│       ├── methodology.ts                  # 共享方法论 System Prompt
│       ├── step1..6.ts                     # 各 step 提示词模板
├── search/tavily.ts                        # 联网检索封装
├── survey/schema.ts                        # 问卷 zod schema + 枚举
├── db/
│   ├── store.ts                            # MemoryStore + SupabaseStore 抽象
│   └── supabase.ts                         # Supabase 客户端
└── workflow/runner.ts                      # 工作流编排（编排 LLM + Tavily + Store）

supabase/schema.sql                         # 生产环境 DB schema
```

## 价值验证指标

任何一项不达标 = 产品价值未被验证，先迭代产品，不进增长阶段。

| 指标 | 阈值 | 采集点 |
|---|---|---|
| Step 3 流程完成率 | ≥ 60% | `step3_completion_rate` |
| Step 3 平均完成时长 | 15–35 分钟 | `step3_total_time_sec` |
| 报告满意度 (1–5) | ≥ 4.0 | `satisfaction_score` |
| 失败验尸冲击力 | ≥ 2 条脊背发凉 | `shocking_count` |
| NPS (0–10) | ≥ 30 (NPS) | `would_recommend` |
| 30 天行为指标 | 至少执行 1 条 90 天动作 | 电话回访 |

## 未来增长阶段（已规划，未实现）

- 小程序前端：新建一个 Taro 4 项目，**复用同一后端 API**，不是改造迁移
- 国产模型主推理切换：改 `LLM_PRIMARY_PROVIDER=deepseek` 一行
- AI 生成内容备案 + 微信小程序商务号审核上架
- 长图分享 / 邀请朋友打分 / 邀请码

## 部署

```bash
npm run build
npm start
```

推荐部署到 Vercel + Supabase Cloud。本地 demo 不配置 Supabase 也能跑（自动用内存存储）。
