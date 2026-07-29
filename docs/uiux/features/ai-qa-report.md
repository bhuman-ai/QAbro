# AI QA report

## Concept packet

- **Primary Action:** `Watch recording`
- **Primary Risk:** The buyer receives a completed report whose recording is missing, points at a deleted worker file, or opens a short blocker clip instead of the full session.
- **Information Budget:** At the top, show the executive summary, one recording action, and one unavailable state. Keep clips, screenshots, thoughts, and detailed findings below.
- **View Model Contract:** The report API returns a buyer-safe evidence manifest. `recording` is the durable full-session asset; `videos` and `screenshots` are secondary proof. URLs point to the authenticated evidence proxy and never expose worker paths or private storage coordinates.
- **Concept Options:** Embed a large player above the summary; keep a replay card near the bottom; place one `Watch recording` action beside the summary.
- **Concept Winner:** Put `Watch recording` beside the summary and open the existing focused replay modal. Remove the duplicate replay card near the bottom.

## Flow

1. The worker records the QA run and writes local screenshots and video.
2. Every captured file is uploaded to private durable storage.
3. The worker reads each upload back and verifies its byte prefix and stored length.
4. The pipeline confirms every captured local evidence source has a durable or embedded report representation.
5. Only then may the worker send the completed callback and delete local files.
6. The report API builds a private playback manifest and selects the worker's full-session video as `recording`; when that reference is unavailable, it selects the largest non-clip video.
7. The buyer opens the report and sees `Watch recording` in the first summary card.

## States

- **ready:** Show `Watch recording`. It opens the full recording through `/api/qa/evidence`, with shared-link access preserved when applicable.
- **legacy fallback:** If no manifest exists, use the older evidence-index lookup.
- **unavailable:** Show one `Recording unavailable` label and no dead replay control.
- **upload incomplete:** Do not notify the buyer that the report is complete. Mark the run `failed_validation`, keep local files, and make the queue retryable while attempts remain.
- **playback:** Support byte-range requests so the buyer can seek through the recording.

## Safety

- Never return local worker paths, storage bucket names, object paths, or service credentials in the manifest.
- Shared report links carry their existing share key into evidence URLs.
- Clips remain available as supporting proof but never replace the full session as the primary recording.
