update public.swarmtest_reports
set payload = jsonb_set(
  payload,
  '{report_markdown}',
  to_jsonb(
    left(
      regexp_replace(
        regexp_replace(
          payload->>'report_markdown',
          '!\[[^]]*\]\(data:(image|video)/[^)]*\)',
          '[embedded media removed]',
          'gi'
        ),
        'data:(image|video)/[^[:space:])]+',
        '[embedded media removed]',
        'gi'
      ),
      12000
    )
  ),
  true
)
where payload ? 'report_markdown'
  and jsonb_typeof(payload->'report_markdown') = 'string'
  and (payload->>'report_markdown') ~* 'data:(image|video)/';

analyze public.swarmtest_reports;
