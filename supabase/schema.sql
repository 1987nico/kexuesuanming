-- ============================================================
-- 科学算命 · 数据库 schema
-- 使用方式：在 Supabase Dashboard SQL Editor 一次性执行即可
-- ============================================================

-- 用户表（独立于 Supabase Auth；MVP 阶段先支持匿名 + 手机号）
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  wx_openid text unique,
  nickname text,
  created_at timestamptz not null default now()
);

-- 运行记录 = 一次完整漏斗 run
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  -- 状态机
  status text not null default 'survey'
    check (status in ('survey', 'step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'done')),
  -- 是否归档（用户主动归档历史 run）
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 问卷答卷
create table if not exists survey_answers (
  run_id uuid primary key references runs(id) on delete cascade,
  payload jsonb not null,
  principles_you_summary text,
  updated_at timestamptz not null default now()
);

-- Step 1 输出
create table if not exists step1_output (
  run_id uuid primary key references runs(id) on delete cascade,
  like_profile text not null,
  dislike_profile text not null,
  themes jsonb not null,             -- [{title, rationale}]
  principles_cross_check jsonb,      -- string[]
  conflict_note text,
  user_edits jsonb,                  -- 用户对 AI 输出的微调
  created_at timestamptz not null default now()
);

-- Step 2 30 条机会
create table if not exists step2_opportunities (
  run_id uuid references runs(id) on delete cascade,
  idx int not null,
  category text,
  title text not null,
  one_liner text not null,
  day_in_life text,
  work_content text,
  work_methods text,
  image_prompt text,
  image_url text,                    -- 可选：未来填充 AI 生图 URL
  evidence jsonb,                    -- [{label, url}]
  primary key (run_id, idx)
);

-- Step 3 用户评分（核心人机协同数据）
create table if not exists step3_scores (
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  score int not null check (score between 0 and 10),
  reason text not null,
  scored_at timestamptz not null default now(),
  primary key (run_id, opp_idx)
);

-- Step 4 PEST + 五力
create table if not exists step4_analysis (
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  pest jsonb not null,               -- {P, E, S, T}
  five_forces_now jsonb not null,
  five_forces_future jsonb not null,
  score_now numeric,
  score_future numeric,
  conclusion text,
  in_shortlist boolean not null default false,
  primary key (run_id, opp_idx)
);

-- Step 5 VRIN
create table if not exists step5_vrin (
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  v int check (v between 1 and 5),
  r int check (r between 1 and 5),
  i int check (i between 1 and 5),
  n int check (n between 1 and 5),
  total int,
  evidence jsonb,                    -- {v, r, i, n}
  ninety_day_actions jsonb,          -- [{day, action}]
  is_top3 boolean not null default false,
  rank int,                          -- 1-3
  primary key (run_id, opp_idx)
);

-- Step 6 失败验尸
create table if not exists step6_premortem (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  layer text not null check (layer in ('market','moat','capability','motivation','reality')),
  failure_reason text not null,
  early_signal_30d text,
  early_signal_90d text,
  early_signal_6m text,
  exit_condition text,
  mitigation text,
  user_fear_flag boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id, opp_idx, layer)
);

-- Step 6 "输的剧本" 叙事版
create table if not exists step6_narrative (
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  story_text text not null,
  primary key (run_id, opp_idx)
);

-- 90 天动作 ↔ 失败假设 多对多挂钩
create table if not exists step6_action_links (
  run_id uuid references runs(id) on delete cascade,
  opp_idx int not null,
  action_day text not null,
  failure_layer text not null check (failure_layer in ('market','moat','capability','motivation','reality')),
  primary key (run_id, opp_idx, action_day, failure_layer)
);

-- 价值验证指标（满意度问卷）
create table if not exists run_metrics (
  run_id uuid primary key references runs(id) on delete cascade,
  completion_status text,
  step3_completion_rate numeric,
  step3_total_time_sec int,
  satisfaction_score int check (satisfaction_score between 1 and 5),
  shocking_count int,                -- "输的剧本里有几条让你脊背发凉"
  would_recommend int check (would_recommend between -100 and 100),  -- NPS
  feedback_text text,
  thirty_day_action_taken boolean,
  recorded_at timestamptz not null default now()
);

-- 触发器：自动更新 runs.updated_at
create or replace function touch_runs_updated_at()
returns trigger language plpgsql as $$
begin
  update runs set updated_at = now() where id = NEW.run_id;
  return NEW;
end;
$$;

drop trigger if exists trg_survey_touch on survey_answers;
create trigger trg_survey_touch after insert or update on survey_answers
for each row execute function touch_runs_updated_at();

-- 索引
create index if not exists idx_runs_user on runs(user_id, created_at desc);
create index if not exists idx_step6_run_opp on step6_premortem(run_id, opp_idx);

-- ============================================================
-- 快速打分（轻量分享给他人）—— 跟 runs 完全解耦
-- 一个 panel = 一套固定题目 + 多个独立打分者
-- ============================================================

-- 打分面板：id 是人类可读字符串（如 'xuenian-30'），items 是 30 项 JSON 数组
create table if not exists quick_panels (
  id text primary key,
  title text not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);

-- 受邀打分者：填了名字即创建一条
create table if not exists quick_respondents (
  id uuid primary key default gen_random_uuid(),
  panel_id text not null references quick_panels(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 单条打分：每人每题一行
create table if not exists quick_scores (
  respondent_id uuid not null references quick_respondents(id) on delete cascade,
  opp_idx int not null,
  score int not null check (score between 0 and 10),
  reason text,
  scored_at timestamptz not null default now(),
  primary key (respondent_id, opp_idx)
);

create index if not exists idx_quick_respondents_panel on quick_respondents(panel_id);
create index if not exists idx_quick_scores_respondent on quick_scores(respondent_id);

-- ============================================================
-- 面霸君 · 小红书 V3 内容工厂与多租户地基
-- 本期单租户上线，但所有业务表预留 tenant_id。
-- ============================================================

create table if not exists tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  email text,
  phone text,
  password_hash text,
  role text not null default 'tenant_admin'
    check (role in ('owner', 'tenant_admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, phone)
);

create table if not exists growth_accounts (
  id uuid primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  name text not null,
  target_user text not null,
  core_problem text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growth_plans (
  id uuid primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  account_id uuid not null references growth_accounts(id) on delete cascade,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growth_runs (
  id uuid primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  account_id uuid not null references growth_accounts(id) on delete cascade,
  plan_id uuid references growth_plans(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'reviewed')),
  week int not null default 1 check (week between 1 and 4),
  objective text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_drafts (
  id uuid primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  account_id uuid not null references growth_accounts(id) on delete cascade,
  run_id uuid not null references growth_runs(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'reviewed')),
  title text not null,
  direction text not null check (direction in ('A', 'B', 'C')),
  content_type text not null check (content_type in ('diagnostic', 'tool', 'story')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  draft_id uuid not null references content_drafts(id) on delete cascade,
  asset_type text not null check (asset_type in ('cover_base', 'cover_final', 'image')),
  url text,
  prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists growth_reviews (
  id uuid primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  draft_id uuid not null references content_drafts(id) on delete cascade,
  classification text not null
    check (classification in ('scale', 'retest', 'weak_entry', 'weak_conversion', 'wrong_audience', 'pause')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists title_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  draft_id uuid references content_drafts(id) on delete cascade,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- 业务设置：每租户一行，存报告价格等可编辑的业务事实
create table if not exists growth_business_settings (
  tenant_id text primary key references tenants(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists hot_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  keyword text not null,
  source text not null default 'manual',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists benchmark_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  source_account_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists assessment_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  customer_name text not null,
  customer_contact text,
  value_profile jsonb not null,
  talent_mode text not null check (talent_mode in ('original-sync', 'local')),
  talent_answers jsonb not null,
  talent_profile jsonb not null,
  survey_answers jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_lite_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  assessment_profile_id uuid references assessment_profiles(id) on delete set null,
  customer_name text,
  customer_contact text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'report_ready', 'failed')),
  mode text check (mode in ('original-sync', 'local')),
  sync_evidence jsonb,
  answers jsonb,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  report_type text not null check (report_type in ('lite', 'deep')),
  price_cents int,
  customer_name text,
  customer_contact text,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'delivering', 'delivered', 'refunded')),
  assessment_profile_id uuid references assessment_profiles(id) on delete set null,
  run_id uuid references runs(id) on delete set null,
  lite_session_id uuid references report_lite_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  feature text not null,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  units int,
  cost_cents int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into tenants (id, name)
values ('mianbajun', '面霸君')
on conflict (id) do nothing;

create index if not exists idx_growth_accounts_tenant on growth_accounts(tenant_id, created_at desc);
create index if not exists idx_growth_plans_account on growth_plans(account_id, created_at desc);
create index if not exists idx_growth_runs_account on growth_runs(account_id, created_at desc);
create index if not exists idx_content_drafts_account on content_drafts(account_id, created_at desc);
create index if not exists idx_growth_reviews_draft on growth_reviews(draft_id, created_at desc);
create index if not exists idx_assessment_profiles_tenant on assessment_profiles(tenant_id, created_at desc);
create index if not exists idx_usage_events_tenant on usage_events(tenant_id, created_at desc);
