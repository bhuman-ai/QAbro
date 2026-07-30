create or replace function public.record_swarmtest_mcp_milestones()
returns trigger
language plpgsql
as $$
declare
  first_touch public.swarmtest_acquisition_events%rowtype;
begin
  select *
    into first_touch
    from public.swarmtest_acquisition_events
    where owner_user_id = new.owner_user_id
    order by occurred_at asc, id asc
    limit 1;

  if tg_op = 'INSERT' then
    insert into public.swarmtest_acquisition_events (
      event_name,
      event_key,
      visitor_id,
      owner_user_id,
      occurred_at,
      landing_path,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      is_test,
      properties
    )
    values (
      'mcp_key_created',
      'mcp_key_created:' || new.id::text,
      first_touch.visitor_id,
      new.owner_user_id,
      new.created_at,
      first_touch.landing_path,
      first_touch.utm_source,
      first_touch.utm_medium,
      first_touch.utm_campaign,
      first_touch.utm_content,
      first_touch.utm_term,
      coalesce(first_touch.is_test, false),
      jsonb_build_object(
        'token_id', new.id::text,
        'source', coalesce(
          nullif(new.metadata ->> 'source', ''),
          nullif(new.metadata ->> 'created_by', ''),
          'dashboard'
        )
      )
    )
    on conflict (event_key) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.last_used_at is null and new.last_used_at is not null then
    insert into public.swarmtest_acquisition_events (
      event_name,
      event_key,
      visitor_id,
      owner_user_id,
      occurred_at,
      landing_path,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      is_test,
      properties
    )
    values (
      'mcp_key_first_used',
      'mcp_key_first_used:' || new.id::text,
      first_touch.visitor_id,
      new.owner_user_id,
      new.last_used_at,
      first_touch.landing_path,
      first_touch.utm_source,
      first_touch.utm_medium,
      first_touch.utm_campaign,
      first_touch.utm_content,
      first_touch.utm_term,
      coalesce(first_touch.is_test, false),
      jsonb_build_object('token_id', new.id::text)
    )
    on conflict (event_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_swarmtest_mcp_first_use on public.swarmtest_mcp_tokens;
drop trigger if exists trg_swarmtest_mcp_milestones on public.swarmtest_mcp_tokens;

create trigger trg_swarmtest_mcp_milestones
after insert or update of last_used_at on public.swarmtest_mcp_tokens
for each row execute function public.record_swarmtest_mcp_milestones();
