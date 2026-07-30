with production_events as (
  select
    date_trunc('day', occurred_at) as event_day,
    coalesce(visitor_id::text, owner_user_id) as person_key,
    event_name,
    coalesce(nullif(utm_source, ''), 'direct') as source,
    coalesce(nullif(utm_medium, ''), 'none') as medium,
    coalesce(nullif(utm_campaign, ''), 'unattributed') as campaign,
    properties
  from public.swarmtest_acquisition_events
  where is_test = false
),
daily as (
  select
    event_day,
    source,
    medium,
    campaign,
    count(distinct person_key) filter (where event_name = 'offer_viewed') as offer_views,
    count(distinct person_key) filter (where event_name = 'primary_cta_clicked') as cta_clicks,
    count(distinct person_key) filter (where event_name = 'signup_completed') as signups,
    count(distinct person_key) filter (where event_name = 'mcp_key_created') as keys_created,
    count(distinct person_key) filter (where event_name = 'mcp_key_first_used') as keys_first_used,
    count(distinct person_key) filter (where event_name = 'first_qa_requested') as first_qa_requests,
    count(distinct person_key) filter (where event_name = 'first_qa_report_completed') as first_reports,
    percentile_cont(0.5) within group (
      order by (properties ->> 'activation_latency_seconds')::numeric
    ) filter (
      where event_name = 'first_qa_report_completed'
        and properties ? 'activation_latency_seconds'
    ) as median_activation_seconds
  from production_events
  group by event_day, source, medium, campaign
)
select
  *,
  round(100.0 * cta_clicks / nullif(offer_views, 0), 1) as cta_rate_pct,
  round(100.0 * signups / nullif(cta_clicks, 0), 1) as signup_rate_pct,
  round(100.0 * keys_created / nullif(signups, 0), 1) as key_creation_rate_pct,
  round(100.0 * keys_first_used / nullif(keys_created, 0), 1) as mcp_activation_rate_pct,
  round(100.0 * first_qa_requests / nullif(keys_first_used, 0), 1) as qa_request_rate_pct,
  round(100.0 * first_reports / nullif(first_qa_requests, 0), 1) as first_report_rate_pct,
  round(100.0 * first_reports / nullif(offer_views, 0), 1) as landing_conversion_rate_pct
from daily
order by event_day desc, first_reports desc, offer_views desc;
