-- 24小时单篇复盘：每篇笔记只保留一份正式记录。
-- 新版业务字段继续放在 payload JSON 中，因此本次不增加物理列。
begin;

with ranked_growth_reviews as (
  select
    id,
    row_number() over (partition by draft_id order by created_at desc, id desc) as row_number
  from growth_reviews
)
delete from growth_reviews
where id in (
  select id
  from ranked_growth_reviews
  where row_number > 1
);

create unique index if not exists idx_growth_reviews_one_per_draft
  on growth_reviews(draft_id);

commit;
