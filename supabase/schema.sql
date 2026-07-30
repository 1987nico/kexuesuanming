-- 面霸君系统 Supabase schema
-- 用法：在 Supabase SQL Editor 执行本文件，然后配置：
-- NEXT_PUBLIC_SUPABASE_URL=...
-- SUPABASE_SERVICE_ROLE_KEY=...

create extension if not exists pgcrypto;

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
  account text,
  display_name text,
  email text,
  phone text,
  password_hash text,
  role text not null default 'operator'
    check (role in ('admin', 'operator')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, phone)
);

alter table tenant_users add column if not exists account text;
alter table tenant_users add column if not exists display_name text;
alter table tenant_users add column if not exists disabled boolean not null default false;

update tenant_users
set
  account = lower(coalesce(nullif(account, ''), nullif(email, ''), nullif(phone, ''), id::text)),
  display_name = coalesce(nullif(display_name, ''), nullif(email, ''), nullif(phone, ''), '面霸君账号'),
  role = case
    when role in ('owner', 'tenant_admin', 'admin') then 'admin'
    else 'operator'
  end
where account is null
   or display_name is null
   or role not in ('admin', 'operator');

alter table tenant_users alter column account set not null;
alter table tenant_users alter column display_name set not null;
alter table tenant_users alter column role set default 'operator';
alter table tenant_users drop constraint if exists tenant_users_role_check;
alter table tenant_users add constraint tenant_users_role_check check (role in ('admin', 'operator'));

create unique index if not exists tenant_users_tenant_account_idx
  on tenant_users (tenant_id, lower(account));

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  user_id uuid not null references tenant_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx
  on auth_sessions (tenant_id, user_id, expires_at desc);

create index if not exists auth_sessions_expires_idx
  on auth_sessions (expires_at);

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
-- 单篇笔记只保留一份正式24小时复盘；历史重复记录保留最新一条。
with ranked_growth_reviews as (
  select id, row_number() over (partition by draft_id order by created_at desc, id desc) as row_number
  from growth_reviews
)
delete from growth_reviews
where id in (select id from ranked_growth_reviews where row_number > 1);
create unique index if not exists idx_growth_reviews_one_per_draft on growth_reviews(draft_id);
create index if not exists idx_assessment_profiles_tenant on assessment_profiles(tenant_id, created_at desc);
create index if not exists idx_usage_events_tenant on usage_events(tenant_id, created_at desc);

-- ============================================================
-- 阶段0 · 数据归属与操作审计（2026-07-05）
-- 目的：为"操作者视图 / 管理者驾驶舱"打数据地基。
-- owner_user_id = 记录归属人（tenant_users.id）；历史数据为 null。
-- ============================================================

alter table assessment_profiles add column if not exists owner_user_id uuid;
alter table assessment_profiles add column if not exists tags text[] not null default '{}';
alter table report_orders add column if not exists owner_user_id uuid;
alter table growth_accounts add column if not exists owner_user_id uuid;
alter table growth_plans add column if not exists owner_user_id uuid;
alter table growth_runs add column if not exists owner_user_id uuid;
alter table content_drafts add column if not exists owner_user_id uuid;
alter table growth_reviews add column if not exists owner_user_id uuid;
alter table usage_events add column if not exists user_id uuid;

create index if not exists idx_report_orders_owner on report_orders(tenant_id, owner_user_id, created_at desc);
create index if not exists idx_assessment_profiles_owner on assessment_profiles(tenant_id, owner_user_id, created_at desc);
create index if not exists idx_content_drafts_owner on content_drafts(tenant_id, owner_user_id, created_at desc);

-- 增长系统 v4：同一业务×视角下的多账号人设（正式发布前先执行对应 migration）。
alter table growth_accounts add column if not exists business_line text;
alter table growth_accounts add column if not exists persona text;
alter table growth_accounts add column if not exists profile_name text;
alter table growth_accounts add column if not exists profile_status text not null default 'active';
alter table growth_accounts add column if not exists is_default_profile boolean not null default false;
alter table growth_accounts add column if not exists display_order integer not null default 0;
alter table growth_accounts add column if not exists last_used_at timestamptz;
alter table growth_accounts add column if not exists platform text;
alter table growth_accounts add column if not exists platform_account_name text;
alter table growth_accounts add column if not exists platform_account_uid text;
alter table growth_accounts add column if not exists profile_creation_request_id text;

create index if not exists growth_accounts_workspace_profiles_idx
  on growth_accounts (tenant_id, owner_user_id, business_line, persona, profile_status, is_default_profile desc, display_order, last_used_at desc);
create index if not exists idx_usage_events_user on usage_events(tenant_id, user_id, created_at desc);

-- 操作流水：管理者视图的"谁在什么时候干了什么"直接读这张表
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_tenant on activity_log(tenant_id, created_at desc);
create index if not exists idx_activity_log_user on activity_log(tenant_id, user_id, created_at desc);

-- ============================================================
-- 服务端访问授权
-- Supabase 新版 sb_secret_* 会以 service_role 访问数据库；表由 SQL Editor
-- 创建时不会自动授予表权限，因此生产 API 需要显式 grant。
-- ============================================================

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
