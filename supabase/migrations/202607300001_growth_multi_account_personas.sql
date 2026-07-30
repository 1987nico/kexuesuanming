-- 双手剑增长系统：同一业务×视角支持多个账号人设。
-- 正式上线前执行；本地预览阶段只随代码交付，不自动连接或修改生产库。

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

update growth_accounts
set
  business_line = coalesce(business_line, payload ->> 'business_line'),
  persona = coalesce(persona, payload ->> 'persona'),
  profile_name = coalesce(
    nullif(profile_name, ''),
    nullif(payload ->> 'profile_name', ''),
    nullif(payload ->> 'one_liner', ''),
    name
  ),
  profile_status = coalesce(nullif(payload ->> 'profile_status', ''), profile_status, 'active'),
  is_default_profile = coalesce(nullif(payload ->> 'is_default_profile', '')::boolean, is_default_profile, false),
  display_order = coalesce(nullif(payload ->> 'display_order', '')::integer, display_order, 0),
  last_used_at = coalesce(nullif(payload ->> 'last_used_at', '')::timestamptz, last_used_at, updated_at),
  platform = coalesce(platform, payload #>> '{platform_binding,platform}'),
  platform_account_name = coalesce(platform_account_name, payload #>> '{platform_binding,account_name}'),
  platform_account_uid = coalesce(platform_account_uid, payload #>> '{platform_binding,account_uid}'),
  profile_creation_request_id = coalesce(profile_creation_request_id, payload ->> 'profile_creation_request_id');

with ranked as (
  select
    id,
    row_number() over (
      partition by tenant_id, owner_user_id, business_line, persona
      order by updated_at desc, created_at desc, id
    ) as position
  from growth_accounts
  where profile_status = 'active'
)
update growth_accounts as account
set is_default_profile = ranked.position = 1
from ranked
where ranked.id = account.id;

create index if not exists growth_accounts_workspace_profiles_idx
  on growth_accounts (
    tenant_id,
    owner_user_id,
    business_line,
    persona,
    profile_status,
    is_default_profile desc,
    display_order,
    last_used_at desc
  );

create unique index if not exists growth_accounts_profile_request_unique_idx
  on growth_accounts (tenant_id, owner_user_id, profile_creation_request_id)
  where profile_creation_request_id is not null;

create unique index if not exists growth_accounts_platform_binding_unique_idx
  on growth_accounts (tenant_id, owner_user_id, platform, platform_account_uid)
  where profile_status = 'active'
    and platform is not null
    and platform_account_uid is not null
    and platform_account_uid <> '';
