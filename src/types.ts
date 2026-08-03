export interface AuthUser {
  id?: string | null;
  email?: string | null;
  created_at?: string | null;
  onboarding_seen?: boolean | null;
  report_admin?: boolean | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ProjectSummary {
  brand_key: string;
  brand_name?: string | null;
  target_url?: string | null;
  run_count?: number;
  latest_run_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RepoRepository {
  id?: number | null;
  owner?: string | null;
  name?: string | null;
  full_name?: string | null;
  default_branch?: string | null;
  html_url?: string | null;
}

export interface RepoConnection {
  brand_key?: string | null;
  app_configured?: boolean;
  connection_status?: string | null;
  installation_id?: number | null;
  installation_account_login?: string | null;
  installation_account_type?: string | null;
  selected_repo_full_name?: string | null;
  selected_repo_name?: string | null;
  associated_repo_full_names?: string[];
  default_branch?: string | null;
  path_allowlist?: string[];
  repositories?: RepoRepository[];
  updated_at?: string | null;
}

export interface RepoRouteSuggestion {
  path: string;
  file_path: string;
  framework: string;
  kind: string;
  confidence: number;
}

export interface RunSummary {
  run_id: string;
  brand_key?: string | null;
  brand_name?: string | null;
  owner_user_id?: string | null;
  persona?: string | null;
  goal?: string | null;
  target_url?: string | null;
  target?: string | null;
  scope_mode?: string | null;
  scenario_list?: string[];
  status?: string | null;
  latest_report_status?: string | null;
  delivered_at?: string | null;
  source?: string | null;
  report_url?: string | null;
  report_ready?: boolean;
  queue_status?: string | null;
  summary_note?: string | null;
  repo_triage_enabled?: boolean;
  repo_triage_status?: string | null;
  repo_triage_summary?: string | null;
  risk_score?: number | null;
  findings_count?: number;
  journeys_count?: number;
  recommendations_count?: number;
  counts?: Record<string, number>;
  hero_screenshot?: string | null;
  session_url?: string | null;
  debug_url?: string | null;
}

export interface ReportEvidence {
  screenshots?: string[];
  videos?: string[];
  proof_state?: string | null;
  proof_source?: string | null;
  [key: string]: unknown;
}

export interface FindingDetails {
  current_url?: string | null;
  last_successful_step?: string | null;
  attempted_actions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ReportFinding {
  id?: string | null;
  type?: string | null;
  severity?: string | null;
  title?: string | null;
  expected_behavior?: string | null;
  observed_behavior?: string | null;
  recommended_fix?: string | null;
  confidence?: number | null;
  evidence?: ReportEvidence;
  diagnostic_details?: FindingDetails;
  page?: {
    url?: string | null;
    title?: string | null;
  } | null;
}

export interface ReportJourney {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  summary?: string | null;
  evidence?: ReportEvidence;
  steps?: Array<Record<string, unknown>>;
  step_video_clips?: Array<{
    step?: number | null;
    video?: string | null;
    clip_start_ms?: number | null;
    clip_end_ms?: number | null;
    content_type?: string | null;
    title?: string | null;
    finding_id?: string | null;
    finding_title?: string | null;
    finding_type?: string | null;
    level?: string | null;
  }>;
}

export interface ReportExperienceSpan {
  id?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  jump_ts_ms?: number | null;
  level?: string | null;
  label?: string | null;
  summary?: string | null;
  linked_finding_ids?: string[];
}

export interface EngineeringPerFinding {
  finding_id?: string | null;
  finding_title?: string | null;
  confidence?: number | null;
  suspected_files?: string[];
  probable_causes?: string[];
  suggested_checks?: string[];
  suggested_tests?: string[];
  matched_terms?: string[];
}

export interface EngineeringTriage {
  summary?: string | null;
  repo_label?: string | null;
  confidence?: number | null;
  based_on?: string[];
  generated_at?: string | null;
  suspected_files?: string[];
  probable_causes?: string[];
  suggested_checks?: string[];
  suggested_tests?: string[];
  per_finding?: EngineeringPerFinding[];
}

export interface QaReport {
  run_id: string;
  target?: string | null;
  status?: string | null;
  summary?: {
    note?: string | null;
    risk_score?: number | null;
    coverage?: Record<string, number>;
    counts?: Record<string, number>;
    [key: string]: unknown;
  } | null;
  findings?: ReportFinding[];
  tested_journeys?: ReportJourney[];
  experience_timeline?: {
    video_duration_ms?: number | null;
    spans?: ReportExperienceSpan[];
    [key: string]: unknown;
  } | null;
  recommendations?: string[];
  feature_inventory?: Record<string, unknown> | null;
  evidence_gallery?: {
    screenshots?: string[];
    videos?: string[];
    session_url?: string | null;
    debug_url?: string | null;
    [key: string]: unknown;
  } | null;
  evidence_manifest?: {
    recording?: {
      index: number;
      url: string;
      content_type?: string | null;
      byte_length?: number | null;
      segment_index?: number | null;
      segment_count?: number | null;
      segment_label?: string | null;
    } | null;
    videos?: Array<{
      index: number;
      url: string;
      content_type?: string | null;
      byte_length?: number | null;
      segment_index?: number | null;
      segment_count?: number | null;
      segment_label?: string | null;
    }>;
    screenshots?: Array<{
      index: number;
      url: string;
      content_type?: string | null;
      byte_length?: number | null;
    }>;
  } | null;
  artifacts?: {
    started_at?: string | null;
    finished_at?: string | null;
    viewport_width?: number | null;
    viewport_height?: number | null;
    [key: string]: unknown;
  } | null;
  metadata?: Record<string, unknown> | null;
  engineering_triage?: EngineeringTriage;
}

export interface RunLogEntry {
  ts?: string | null;
  timestamp?: string | null;
  event?: string | null;
  message?: string | null;
  note?: string | null;
  data?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}

export interface StatusResponse {
  ok: boolean;
  run_id: string;
  queue?: {
    queue_status?: string | null;
    status?: string | null;
    estimated_start_seconds?: number | null;
    queue_ahead?: number | null;
    enqueued_at?: string | null;
    picked_up_at?: string | null;
    completed_at?: string | null;
    failure_message?: string | null;
    [key: string]: unknown;
  } | null;
  report_ready?: boolean;
  report_url?: string | null;
  status_url?: string | null;
  report_status?: string | null;
  repo_triage?: Record<string, unknown> | null;
  progress?: {
    percent?: number | null;
    message?: string | null;
    updated_at?: string | null;
    [key: string]: unknown;
  } | null;
  artifacts?: {
    live_stream_enabled?: boolean;
    live_stream_embed_url?: string | null;
    live_stream_viewer_url?: string | null;
    local_screenshots?: string[];
    local_video_path?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    viewport_width?: number | null;
    viewport_height?: number | null;
    [key: string]: unknown;
  } | null;
  run_log?: RunLogEntry[];
  live_report?: {
    status?: string | null;
    summary?: {
      note?: string | null;
      [key: string]: unknown;
    } | null;
    findings?: ReportFinding[];
    tested_journeys?: ReportJourney[];
    latest_frame_url?: string | null;
  } | null;
  ui_report_url?: string | null;
}

export interface ShareResponse {
  ok: boolean;
  run_id: string;
  enabled: boolean;
  share_url?: string | null;
}

export interface ScheduleItem {
  id: string;
  brand_key: string;
  brand_name?: string | null;
  target_url?: string | null;
  name?: string | null;
  active?: boolean;
  frequency_hours?: number;
  scope_mode?: string | null;
  persona?: string | null;
  mission?: string | null;
  alert_webhook_url?: string | null;
  alert_on_partial?: boolean;
  alert_on_failed?: boolean;
  alert_on_high_findings?: boolean;
  last_run_id?: string | null;
  last_run_at?: string | null;
  last_report_status?: string | null;
  last_alert_at?: string | null;
  next_run_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AlertItem {
  id: string;
  brand_key?: string | null;
  title?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
  run_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorkerInfo {
  worker_id?: string | null;
  status?: string | null;
  worker_status?: string | null;
  heartbeat_status?: string | null;
  active_run_id?: string | null;
  current_run_id?: string | null;
  current_phase?: string | null;
  last_heartbeat_at?: string | null;
  last_seen_at?: string | null;
  heartbeat_age_seconds?: number | null;
  heartbeat_age_label?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type ManualQaFindingCategory = "bug" | "frustration_point" | "aha_moment" | "observation";

export type ManualQaFindingsAnalysisStatus = "not_started" | "queued" | "processing" | "complete" | "failed";

export interface ManualQaEvidenceAnchor {
  evidence_id?: string | null;
  recording_index?: number | null;
  start_ms?: number | null;
  end_ms?: number | null;
  quote?: string | null;
  visual_evidence?: string | null;
}

export interface ManualQaRecordingFinding {
  finding_id?: string | null;
  packet_id?: string | null;
  category?: ManualQaFindingCategory | string | null;
  title?: string | null;
  summary?: string | null;
  suggested_fix?: string | null;
  confidence?: string | number | null;
  support_verified?: boolean | null;
  evidence_anchor?: ManualQaEvidenceAnchor | null;
  evidence_anchors?: ManualQaEvidenceAnchor[];
}

export interface ManualQaAiUsage {
  provider?: string | null;
  currency?: "USD" | string | null;
  tracking_available?: boolean;
  cost_complete?: boolean;
  total_cost_usd?: number | null;
  request_count?: number | null;
  priced_request_count?: number | null;
  unpriced_response_count?: number | null;
  uncertain_request_count?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

export interface ManualQaRecordingAnalysisClip {
  evidence_id?: string | null;
  item_id?: string | null;
  recording_index?: number | null;
  label?: string | null;
  status?: "pending" | "processing" | "complete" | "failed" | string;
  duration_ms?: number | null;
  speech_segments?: Array<{
    start_ms?: number | null;
    end_ms?: number | null;
    text?: string | null;
    confidence?: number | null;
  }>;
  visual_events?: Array<{
    start_ms?: number | null;
    end_ms?: number | null;
    description?: string | null;
  }>;
  summary?: string | null;
  confidence?: number | null;
  error_code?: string | null;
  retryable?: boolean;
}

export interface ManualQaFindingsAnalysis {
  analysis_id?: string | null;
  status: ManualQaFindingsAnalysisStatus;
  source?: "recording_transcript" | string | null;
  media_count?: number | null;
  processed_media_count?: number | null;
  transcript_event_count?: number | null;
  queued_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  lease_id?: string | null;
  lease_expires_at?: string | null;
  error_code?: string | null;
  retryable?: boolean;
  attempt_count?: number | null;
  recording_fingerprint?: string | null;
  model?: string | null;
  aggregation_model?: string | null;
  verification_model?: string | null;
  semantic_verification_version?: number | null;
  ai_usage?: ManualQaAiUsage | null;
  clip_results?: ManualQaRecordingAnalysisClip[];
  findings?: ManualQaRecordingFinding[];
}

export interface ManualQaTranscriptEvent {
  type?: string | null;
  text?: string | null;
  source?: string | null;
  is_final?: boolean;
  confidence?: number | null;
  item_id?: string | null;
  page_url?: string | null;
  page_title?: string | null;
  evidence_id?: string | null;
  recording_index?: number | null;
  start_ms?: number | null;
  end_ms?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  at?: string | null;
}

export interface ManualQaWorkPacket {
  packet_id: string;
  status?: "open" | "needs_question" | "in_progress" | "done" | "dismissed" | string;
  category?: ManualQaFindingCategory | string | null;
  title?: string | null;
  summary?: string | null;
  suggested_fix?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  source_kind?: "recording_transcript" | "topic" | "drawing" | "technical" | "feedback" | string;
  analysis_id?: string | null;
  confidence?: string | number | null;
  page_anchor?: {
    url?: string | null;
    title?: string | null;
    viewport?: Record<string, number | null> | null;
    bounds?: Record<string, number | null> | null;
  } | null;
  evidence_anchor?: ManualQaEvidenceAnchor | null;
  evidence_anchors?: ManualQaEvidenceAnchor[];
  evidence_urls?: string[];
  evidence_media?: Array<{
    evidence_id?: string | null;
    kind?: string | null;
    label?: string | null;
    content_type?: string | null;
    byte_length?: number | null;
    url?: string | null;
    created_at?: string | null;
  }>;
  transcript_snippets?: string[];
  technical_signals?: Array<{
    type?: string | null;
    message?: string | null;
    url?: string | null;
    status?: number | null;
    at?: string | null;
  }>;
}

export interface ManualQaItem {
  id: string;
  title: string;
  instructions?: string | null;
  expected?: string | null;
  start_url?: string | null;
  area?: string | null;
  source?: string | null;
  status: "pending" | "reviewed" | "pass" | "fail" | "confusing" | "blocked" | "skip";
  note?: string | null;
  evidence_urls?: string[];
  evidence_media?: Array<{
    evidence_id?: string | null;
    kind?: string | null;
    label?: string | null;
    content_type?: string | null;
    url?: string | null;
    byte_length?: number | null;
    duration_ms?: number | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    created_at?: string | null;
  }>;
  widget_context?: {
    page_url?: string | null;
    page_title?: string | null;
    user_agent?: string | null;
    viewport?: Record<string, number | null>;
    console_events?: Array<Record<string, unknown>>;
    network_events?: Array<Record<string, unknown>>;
    page_errors?: Array<Record<string, unknown>>;
    transcript_events?: ManualQaTranscriptEvent[];
  };
  created_at?: string | null;
  reviewed_at?: string | null;
}

export interface ManualQaSession {
  session_id: string;
  title?: string | null;
  target_url?: string | null;
  brand_key?: string | null;
  brand_name?: string | null;
  status?: string | null;
  counts?: Record<string, number>;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  session_url?: string | null;
  browser?: {
    mode?: string | null;
    status?: string | null;
    target_url?: string | null;
    viewer_url?: string | null;
    embed_url?: string | null;
    live_stream_enabled?: boolean;
    note?: string | null;
    [key: string]: unknown;
  } | null;
  widget?: {
    enabled?: boolean;
    mode?: string | null;
    status?: string | null;
    installed?: boolean;
    installed_at?: string | null;
    last_seen_at?: string | null;
    note?: string | null;
  } | null;
  checklist?: ManualQaItem[];
  work_packets?: ManualQaWorkPacket[];
  findings_analysis?: ManualQaFindingsAnalysis | null;
  context?: {
    work_summary?: string | null;
    feature_name?: string | null;
    acceptance_criteria?: string[];
    scenario_list?: string[];
    changed_files?: string[];
    repository?: string | null;
    branch?: string | null;
    commit_sha?: string | null;
    pull_request_url?: string | null;
    developer_notes?: string | null;
    [key: string]: unknown;
  } | null;
  requested_by?: Record<string, unknown> | null;
  qualification_trial?: {
    kind?: "tester_qualification" | "paid_assignment" | string;
    status?: string | null;
    product_name?: string | null;
    test_focus?: string | null;
    submitted_at?: string | null;
    assignment?: {
      type?: "qualification" | "paid" | string;
      payout_status?: string | null;
    } | null;
    qualification?: {
      label?: string | null;
      status?: string | null;
      score?: number | null;
      reviewer_note?: string | null;
      scored_at?: string | null;
    } | null;
    lead_rating?: {
      score?: number | null;
      note?: string | null;
      rated_at?: string | null;
    } | null;
  } | null;
}

export interface QaTrialEvidence {
  evidence_id?: string | null;
  recording_index?: number | null;
  kind?: string | null;
  label?: string | null;
  content_type?: string | null;
  byte_length?: number;
  duration_ms?: number | null;
  url?: string | null;
  created_at?: string | null;
}

export interface HumanTestRequest {
  id: string;
  owner_user_id: string;
  owner_email: string;
  product_name: string;
  target_url: string;
  review_type: "specific_flow" | "general_first_time_user";
  test_focus: string;
  expected_success?: string | null;
  duration_minutes: number;
  assignment_type: "qualification" | "paid";
  tester_pay_cents: number;
  tester_pay_currency: string;
  payout_status: "not_applicable" | "pending" | "approved" | "paid";
  tester_reward_type: "cash" | "qa_credit";
  qa_credit_awarded_at?: string | null;
  funding_type: "cash" | "qa_credit";
  qa_credit_spent_cents: number;
  qa_credit_spent_at?: string | null;
  payout_approved_at?: string | null;
  payout_paid_at?: string | null;
  access_mode: "public_only" | "signup_allowed" | "test_account";
  access: {
    login_url?: string | null;
    credentials_supplied: boolean;
    account_creation_allowed: boolean;
    purchase_allowed: boolean;
    irreversible_actions_allowed: boolean;
    prohibited_actions: string[];
  };
  context?: Record<string, unknown> | null;
  status: "queued" | "available" | "assigned" | "in_progress" | "submitted" | "completed" | "cancelled";
  assigned_tester_application_id?: string | null;
  assigned_tester_name?: string | null;
  assigned_tester_email?: string | null;
  trial_session_id?: string | null;
  published_at?: string | null;
  claimed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface QaTrialView {
  session_id: string;
  role: "lead" | "tester" | "admin";
  status: "awaiting_consent" | "ready" | "in_progress" | "submitted" | "verified" | "completed";
  product_name: string;
  target_url: string;
  test_focus: string;
  duration_minutes: number;
  source_request_id?: string | null;
  assignment: {
    type: "qualification" | "paid";
    tester_pay_cents?: number;
    tester_pay_currency?: string;
    tester_reward_type: "cash" | "qa_credit";
    payout_status: "not_applicable" | "pending" | "approved" | "paid";
  };
  access: {
    mode: "public_only" | "signup_allowed" | "test_account";
    login_url?: string | null;
    credentials_supplied: boolean;
    account_creation_allowed: boolean;
    purchase_allowed: boolean;
    irreversible_actions_allowed: boolean;
    prohibited_actions: string[];
    credentials?: {
      login_url?: string | null;
      username?: string | null;
      password?: string | null;
      otp_mode?: "none" | "manual_prompt" | "provider_hook";
    };
  };
  consent: {
    accepted: boolean;
    lead_accepted: boolean;
    tester_accepted: boolean;
    recording_analysis_accepted?: boolean;
  };
  tester: {
    name?: string | null;
    public_name?: string | null;
    email?: string | null;
    accepted_at?: string | null;
  };
  lead: {
    name?: string | null;
    email?: string | null;
    accepted_at?: string | null;
  };
  submission: {
    submitted_at?: string | null;
    note?: string | null;
    evidence_media: QaTrialEvidence[];
  };
  report?: {
    status: ManualQaFindingsAnalysisStatus;
    source?: "recording_transcript" | string | null;
    completed_at?: string | null;
    findings: ManualQaRecordingFinding[];
  } | null;
  benchmark?: {
    issues: Array<{ id: string; title: string; description?: string | null }>;
    issue_count: number;
  };
  qualification: {
    label: string;
    status: "pending" | "pending_review" | "verified";
    score?: number | null;
    reviewer_note?: string | null;
    scored_at?: string | null;
    caught_issue_ids?: string[];
    coverage_score?: number | null;
    evidence_score?: number | null;
    clarity_score?: number | null;
  };
  lead_rating: {
    score?: number | null;
    note?: string | null;
    rated_at?: string | null;
  };
}

export interface QaTrialSummary {
  session_id: string;
  product_name: string;
  status: QaTrialView["status"];
  tester_name?: string | null;
  lead_name?: string | null;
  score?: number | null;
  customer_rating?: number | null;
  assignment_type?: "qualification" | "paid";
  tester_pay_cents?: number;
  tester_pay_currency?: string;
  tester_reward_type?: "cash" | "qa_credit";
  payout_status?: "not_applicable" | "pending" | "approved" | "paid";
  created_at?: string | null;
}

export interface WorkerSummary {
  total?: number;
  healthy?: number;
  stale?: number;
  offline?: number;
  active?: number;
  overall_status?: string | null;
  label?: string | null;
  detail?: string | null;
  latest_seen_at?: string | null;
  latest_heartbeat_age_seconds?: number | null;
}

export interface McpTokenSummary {
  id: string;
  name?: string | null;
  token_prefix?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SubmissionBrandProfile {
  brand_profile_id: string;
  brand_key?: string | null;
  track?: string | null;
  display_name?: string | null;
  website_url?: string | null;
  profile?: Record<string, any>;
}

export interface SubmissionSite {
  site_id?: string | null;
  site_name?: string | null;
  decision?: string | null;
  eligibility_tier?: string | null;
  effective_product_status?: string | null;
  product_status?: string | null;
}

export interface SubmissionPack {
  pack_id: string;
  pack_name?: string | null;
  track?: string | null;
  description?: string | null;
  sites?: SubmissionSite[];
  effective_site_count?: number;
  product_summary?: {
    total_sites?: number;
    green_count?: number;
    yellow_count?: number;
    red_count?: number;
  };
}

export interface SubmissionJobStatus {
  ok: boolean;
  job_id: string;
  job?: {
    job_id?: string;
    status?: string | null;
    site_name?: string | null;
    site_id?: string | null;
    report_ready?: boolean;
    [key: string]: unknown;
  } | null;
  progress?: Record<string, unknown> | null;
  report_ready?: boolean;
  status_url?: string | null;
  report_url?: string | null;
  artifacts?: Record<string, unknown> | null;
  run_log?: Array<Record<string, unknown>>;
  live_report?: {
    status?: string | null;
    summary?: Record<string, unknown> | null;
    site_profile?: Record<string, unknown> | null;
    asset_manifest?: {
      manifest_id?: string | null;
      brand_profile_id?: string | null;
      required_assets_count?: number;
      missing_items_count?: number;
    } | null;
  } | null;
}

export interface LaunchDraft {
  targetUrl: string;
  brandKey: string;
  brandName: string;
  runMode: "live_qa" | "controlled_ux";
  browserMode: "standard_browser" | "advanced_browser";
  validationTarget: "public_flow" | "login_signup" | "inside_product";
  accessMethod: "none" | "app_url" | "auth_url" | "credentials" | "saved_session" | "create_account";
  authUrl: string;
  authUsername: string;
  authPassword: string;
  scopeMode: string;
  persona: string;
  goalsText: string;
  userJob: string;
  entryPath: string;
  routeHintsText: string;
  successSignalsText: string;
  repoTriageEnabled: boolean;
  selectedRepoFullName: string;
}
