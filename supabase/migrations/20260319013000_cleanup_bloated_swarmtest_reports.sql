-- Cleanup pass for historical swarmtest_reports rows that still contain
-- embedded base64 screenshots/videos or oversized persisted report blobs.
--
-- This migration intentionally targets only rows that need cleanup.

create or replace function public._swarmtest_jsonb_array_length_safe(value jsonb)
returns integer
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) = 'array' then jsonb_array_length(value)
    else 0
  end;
$$;

create or replace function public._swarmtest_filter_media_items(items jsonb, max_items integer default 24)
returns jsonb
language sql
immutable
as $$
  with normalized as (
    select case
      when jsonb_typeof(items) = 'array' then items
      else '[]'::jsonb
    end as arr
  ),
  entries as (
    select item #>> '{}' as value, ord
    from normalized,
      jsonb_array_elements(arr) with ordinality as entry(item, ord)
    where jsonb_typeof(item) = 'string'
  ),
  filtered as (
    select value, ord
    from entries
    where value <> ''
      and value not like 'data:image/%'
      and value not like 'data:video/%'
    order by ord
    limit greatest(max_items, 0)
  )
  select coalesce(jsonb_agg(to_jsonb(value) order by ord), '[]'::jsonb)
  from filtered;
$$;

create or replace function public._swarmtest_limit_jsonb_array_tail(items jsonb, max_items integer default 120)
returns jsonb
language sql
immutable
as $$
  with normalized as (
    select case
      when jsonb_typeof(items) = 'array' then items
      else '[]'::jsonb
    end as arr
  ),
  entries as (
    select item, ord
    from normalized,
      jsonb_array_elements(arr) with ordinality as entry(item, ord)
  ),
  limited as (
    select item, ord
    from entries
    order by ord desc
    limit greatest(max_items, 0)
  )
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  from limited;
$$;

create or replace function public._swarmtest_sanitize_evidence(evidence jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := evidence;
  screenshots jsonb;
  videos jsonb;
begin
  if evidence is null or jsonb_typeof(evidence) <> 'object' then
    return evidence;
  end if;

  if evidence ? 'screenshots' then
    screenshots := evidence->'screenshots';
    result := jsonb_set(
      result,
      '{screenshot_count}',
      to_jsonb(public._swarmtest_jsonb_array_length_safe(screenshots)),
      true
    );
    result := jsonb_set(
      result,
      '{screenshots}',
      public._swarmtest_filter_media_items(screenshots, 24),
      true
    );
  end if;

  if evidence ? 'videos' then
    videos := evidence->'videos';
    result := jsonb_set(
      result,
      '{video_count}',
      to_jsonb(public._swarmtest_jsonb_array_length_safe(videos)),
      true
    );
    result := jsonb_set(
      result,
      '{videos}',
      public._swarmtest_filter_media_items(videos, 24),
      true
    );
  end if;

  return result;
end;
$$;

create or replace function public._swarmtest_sanitize_evidence_collection(items jsonb)
returns jsonb
language sql
immutable
as $$
  with normalized as (
    select case
      when jsonb_typeof(items) = 'array' then items
      else '[]'::jsonb
    end as arr
  ),
  entries as (
    select
      case
        when jsonb_typeof(item) = 'object' and item ? 'evidence'
          then jsonb_set(item, '{evidence}', public._swarmtest_sanitize_evidence(item->'evidence'), true)
        else item
      end as item,
      ord
    from normalized,
      jsonb_array_elements(arr) with ordinality as entry(item, ord)
  )
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  from entries;
$$;

create or replace function public._swarmtest_sanitize_artifacts(artifacts jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := artifacts;
  screenshot_count integer;
begin
  if artifacts is null or jsonb_typeof(artifacts) <> 'object' then
    return artifacts;
  end if;

  if artifacts ? 'captured_screenshots' then
    screenshot_count := public._swarmtest_jsonb_array_length_safe(artifacts->'captured_screenshots');
    result := result - 'captured_screenshots';
    result := jsonb_set(result, '{captured_screenshot_count}', to_jsonb(screenshot_count), true);
  end if;

  return result;
end;
$$;

create or replace function public._swarmtest_sanitize_report(report jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := report;
begin
  if report is null or jsonb_typeof(report) <> 'object' then
    return report;
  end if;

  if report ? 'artifacts' then
    result := jsonb_set(result, '{artifacts}', public._swarmtest_sanitize_artifacts(report->'artifacts'), true);
  end if;

  if report ? 'evidence_gallery' then
    result := jsonb_set(result, '{evidence_gallery}', public._swarmtest_sanitize_evidence(report->'evidence_gallery'), true);
  end if;

  if report ? 'findings' then
    result := jsonb_set(result, '{findings}', public._swarmtest_sanitize_evidence_collection(report->'findings'), true);
  end if;

  if report ? 'tested_journeys' then
    result := jsonb_set(
      result,
      '{tested_journeys}',
      public._swarmtest_sanitize_evidence_collection(report->'tested_journeys'),
      true
    );
  end if;

  return result;
end;
$$;

create or replace function public._swarmtest_sanitize_payload(payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := payload;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return payload;
  end if;

  if payload ? 'report_json' then
    result := jsonb_set(result, '{report_json}', public._swarmtest_sanitize_report(payload->'report_json'), true);
  end if;

  if payload ? 'artifacts' then
    result := jsonb_set(result, '{artifacts}', public._swarmtest_sanitize_artifacts(payload->'artifacts'), true);
  end if;

  if payload ? 'run_log' then
    result := jsonb_set(result, '{run_log}', public._swarmtest_limit_jsonb_array_tail(payload->'run_log', 120), true);
  end if;

  if payload ? 'report_markdown' and jsonb_typeof(payload->'report_markdown') = 'string' then
    result := jsonb_set(result, '{report_markdown}', to_jsonb(left(payload->>'report_markdown', 12000)), true);
  end if;

  return result;
end;
$$;

with candidates as (
  select
    id,
    public._swarmtest_sanitize_payload(payload) as sanitized_payload,
    public._swarmtest_sanitize_evidence_collection(findings) as sanitized_findings
  from public.swarmtest_reports
  where
    payload::text like '%data:image/%'
    or payload::text like '%data:video/%'
    or findings::text like '%data:image/%'
    or findings::text like '%data:video/%'
    or length(coalesce(payload->>'report_markdown', '')) > 12000
    or public._swarmtest_jsonb_array_length_safe(payload->'run_log') > 120
    or public._swarmtest_jsonb_array_length_safe(payload #> '{artifacts,captured_screenshots}') > 0
    or public._swarmtest_jsonb_array_length_safe(payload #> '{report_json,artifacts,captured_screenshots}') > 0
)
update public.swarmtest_reports as reports
set
  payload = candidates.sanitized_payload,
  findings = candidates.sanitized_findings
from candidates
where reports.id = candidates.id
  and (
    reports.payload is distinct from candidates.sanitized_payload
    or reports.findings is distinct from candidates.sanitized_findings
  );

analyze public.swarmtest_reports;

drop function if exists public._swarmtest_sanitize_payload(jsonb);
drop function if exists public._swarmtest_sanitize_report(jsonb);
drop function if exists public._swarmtest_sanitize_artifacts(jsonb);
drop function if exists public._swarmtest_sanitize_evidence_collection(jsonb);
drop function if exists public._swarmtest_sanitize_evidence(jsonb);
drop function if exists public._swarmtest_limit_jsonb_array_tail(jsonb, integer);
drop function if exists public._swarmtest_filter_media_items(jsonb, integer);
drop function if exists public._swarmtest_jsonb_array_length_safe(jsonb);
