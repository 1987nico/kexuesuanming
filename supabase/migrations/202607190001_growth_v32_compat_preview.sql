-- 双手剑增长系统 v3.2 生产兼容迁移。
-- 历史 A/B/C 与正文类型继续保留；新流程不再写伪造占位值。

alter table if exists public.content_drafts
  add column if not exists schema_version text,
  add column if not exists method_attribution_status text,
  add column if not exists method_group text,
  add column if not exists method_id text,
  add column if not exists generation_mode text,
  add column if not exists legacy_direction text,
  add column if not exists legacy_content_type text,
  add column if not exists eligible_for_method_learning boolean;

alter table if exists public.content_drafts
  alter column direction drop not null,
  alter column content_type drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_drafts_schema_version_check') then
    alter table public.content_drafts add constraint content_drafts_schema_version_check
      check (schema_version is null or schema_version in ('legacy_v1', 'method_v3_2')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_drafts_method_attribution_status_check') then
    alter table public.content_drafts add constraint content_drafts_method_attribution_status_check
      check (method_attribution_status is null or method_attribution_status in ('missing', 'confirmed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_drafts_generation_mode_check') then
    alter table public.content_drafts add constraint content_drafts_generation_mode_check
      check (generation_mode is null or generation_mode in ('default', 'explore')) not valid;
  end if;
end $$;

comment on column public.content_drafts.schema_version is
  'legacy_v1 keeps original history read-only; method_v3_2 participates in the new workflow.';
comment on column public.content_drafts.eligible_for_method_learning is
  'Only explicit method_v3_2 samples may be true. Never backfill legacy content to true automatically.';

create table if not exists public.growth_topic_sources (
  id uuid primary key,
  tenant_id text not null,
  account_id uuid not null,
  method_id text not null,
  original_url text not null,
  payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id)
);

create index if not exists growth_topic_sources_account_method_idx
  on public.growth_topic_sources (account_id, method_id, collected_at desc);

-- 注意：本文件不包含历史A/B/C回填，也不创建“诊断型”等正文标签占位值。
