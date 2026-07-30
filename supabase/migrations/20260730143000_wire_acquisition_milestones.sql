create or replace function public.record_swarmtest_mcp_first_use()
returns trigger
language plpgsql
as $$
begin
  if old.last_used_at is null and new.last_used_at is not null then
    insert into public.swarmtest_acquisition_events (
      event_name,
      event_key,
      owner_user_id,
      occurred_at,
      properties
    )
    values (
      'mcp_key_first_used',
      'mcp_key_first_used:' || new.id::text,
      new.owner_user_id,
      new.last_used_at,
      jsonb_build_object('token_id', new.id::text)
    )
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_mcp_first_use on public.swarmtest_mcp_tokens;

create trigger trg_swarmtest_mcp_first_use
after update of last_used_at on public.swarmtest_mcp_tokens
for each row execute function public.record_swarmtest_mcp_first_use();

create or replace function public.record_swarmtest_report_acquisition_milestones()
returns trigger
language plpgsql
as $$
declare
  first_touch public.swarmtest_acquisition_events%rowtype;
  finding_count integer := 0;
  activation_latency integer := 0;
  launch_surface text := 'unknown';
  qa_mode text := 'unknown';
begin
  if new.owner_user_id is null or new.owner_user_id = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    launch_surface := coalesce(
      nullif(new.payload #>> '{run_request,metadata,launched_by}', ''),
      nullif(new.source, ''),
      'unknown'
    );
    qa_mode := coalesce(
      nullif(new.payload #>> '{run_request,scope,mode}', ''),
      nullif(new.payload #>> '{run_request,scope_mode}', ''),
      nullif(new.payload #>> '{run_request,metadata,qa_mode}', ''),
      'unknown'
    );

    select *
      into first_touch
      from public.swarmtest_acquisition_events
      where owner_user_id = new.owner_user_id
      order by occurred_at asc, id asc
      limit 1;

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
      'first_qa_requested',
      'first_qa_requested:' || new.owner_user_id,
      first_touch.visitor_id,
      new.owner_user_id,
      coalesce(new.created_at, now()),
      first_touch.landing_path,
      first_touch.utm_source,
      first_touch.utm_medium,
      first_touch.utm_campaign,
      first_touch.utm_content,
      first_touch.utm_term,
      coalesce(first_touch.is_test, false),
      jsonb_build_object(
        'run_id', new.run_id,
        'launch_surface', launch_surface,
        'qa_mode', qa_mode
      )
    )
    on conflict (event_key) do nothing;
  end if;

  if
    lower(coalesce(new.status, '')) = 'completed'
    and (
      tg_op = 'INSERT'
      or lower(coalesce(old.status, '')) is distinct from 'completed'
    )
  then
    select *
      into first_touch
      from public.swarmtest_acquisition_events
      where owner_user_id = new.owner_user_id
      order by occurred_at asc, id asc
      limit 1;

    if jsonb_typeof(new.findings) = 'array' then
      finding_count := jsonb_array_length(new.findings);
    end if;

    if first_touch.occurred_at is not null then
      activation_latency := greatest(
        0,
        floor(extract(epoch from (coalesce(new.delivered_at, now()) - first_touch.occurred_at)))::integer
      );
    end if;

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
      'first_qa_report_completed',
      'first_qa_report_completed:' || new.owner_user_id,
      first_touch.visitor_id,
      new.owner_user_id,
      coalesce(new.delivered_at, now()),
      first_touch.landing_path,
      first_touch.utm_source,
      first_touch.utm_medium,
      first_touch.utm_campaign,
      first_touch.utm_content,
      first_touch.utm_term,
      coalesce(first_touch.is_test, false),
      jsonb_build_object(
        'run_id', new.run_id,
        'report_status', 'completed',
        'finding_count', finding_count,
        'activation_latency_seconds', activation_latency
      )
    )
    on conflict (event_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_swarmtest_report_acquisition_milestones on public.swarmtest_reports;

create trigger trg_swarmtest_report_acquisition_milestones
after insert or update of status on public.swarmtest_reports
for each row execute function public.record_swarmtest_report_acquisition_milestones();
