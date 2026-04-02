insert into storage.buckets (id, name, public)
select 'qa-evidence', 'qa-evidence', false
where not exists (
  select 1
  from storage.buckets
  where id = 'qa-evidence'
);
