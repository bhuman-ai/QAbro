# Product Hunt launch package

## Role in the acquisition system

Product Hunt is a one-to-many launch seed for the measured self-serve funnel
and supports the live, compounding `/qa-mcp` search asset. It is not the
long-term acquisition engine by itself. The launch should create attributable
visits, activation evidence, ecosystem citations, and language that can improve
the organic-search loop.

## Listing fields

- **Product name:** Before Users Do
- **Tagline:** Browser-backed QA for coding agents
- **Destination:** `https://beforeusersdo.com/`
- **Status:** Live and usable
- **Description:** Your AI coder says “done.” Before Users Do checks whether the feature actually works. Connect one MCP to run the live flow, capture the broken screen, console errors, failed requests, and steps to reproduce, then hand the evidence back so the agent can fix it.
- **Suggested topics:** Developer Tools, Artificial Intelligence, Testing and QA
- **Pricing tag:** Paid (with a free trial or plan)
- **Pricing copy:** Free plan available.
- **Thumbnail:** `marketing/product-hunt/assets/product-hunt-thumbnail.png`
- **Gallery image 1:** `marketing/product-hunt/assets/product-hunt-gallery-imagegen-hero.png`
- **Gallery image 2:** `marketing/product-hunt/assets/product-hunt-gallery-imagegen-proof.png`

The tagline is 35 characters and the description is 260 characters, keeping
both within the conservative limits in Product Hunt's current launch guidance.
Topic names are candidates and must be matched to the current composer options.

## Gallery order and captions

1. **Product promise:** A purpose-built launch graphic uses the homepage's
   actual promise and app → BUD → happy-customer workflow.
2. **Fix-ready handoff:** A purpose-built launch graphic uses the real report
   vocabulary:
   broken screen, expected behavior, reproduction path, console error, network
   request, and suggested fix prompt.

## Maker first-comment scaffold

> Hey Product Hunt — I built Before Users Do for the uncomfortable moment when
> a coding agent says a feature is finished, but you still do not know whether
> the real user flow works.
>
> The gap is simple: AI can write the feature, but “done” is not trustworthy
> until the customer flow has actually run.
>
> Before Users Do is a hosted MCP that lets a coding agent run browser-backed QA
> against a reachable preview, collect screenshots plus console and network
> evidence, and return a fix-ready report in the same workflow.
>
> There is a free plan available.
>
> It is live now. I would especially value feedback on the install handoff and
> whether the first report gives you enough confidence to ship.

This comment uses the product's observed thesis instead of inventing a personal
anecdote. Post it from the maker's personal account, not a company account.

## Publish-time checklist

- Sign in with the maker's personal Product Hunt account; company accounts
  cannot submit a product.
- Confirm that no existing Before Users Do product page owns this launch.
- Paste the tracked destination exactly as written above.
- Select the current Product Hunt topic names that best match the candidates.
- Select `Paid (with a free trial or plan)` and include `Free plan available.`
- Upload the 240 × 240 thumbnail and both 1270 × 760 gallery images.
- Read the completed first comment from the maker's perspective.
- Preview the listing on desktop and mobile.
- Ask for feedback, not upvotes.
- Obtain explicit approval immediately before accepting any new terms or
  publishing the external listing.

## Measurement

- **Primary event:** `first_qa_report_completed`
- **Diagnostic campaign:** `product_hunt / referral / qa_mcp_launch`
- **Start condition:** The Product Hunt listing is published and can produce
  attributable exposure.
- **Initial window:** Seven days after publication or 100 attributed landing
  visits, whichever is later.
- **Continue if:** The launch produces at least one completed QA report, or at
  least five percent of attributed visitors choose the install CTA while the
  activation sample is still small.
- **Change the message or placement if:** Product Hunt shows exposure but sends
  no attributable visitors.
- **Change the offer-page handoff if:** 100 attributed visitors produce no
  install clicks, or install clicks repeatedly fail to reach MCP activation.
- **Attribution note:** Product Hunt does not accept tracked URLs. The browser
  maps a `producthunt.com` referrer to the campaign fields above without storing
  the full referrer. Privacy settings that suppress the referrer remain a
  measurement caveat.

## Asset provenance

The thumbnail reuses the existing navy shield and purple zap brand mark. The
two gallery assets were created with the built-in Imagegen tool using direct
homepage captures as authoritative references. They recompose the site's actual
copy, BUD pipeline, evidence vocabulary, palette, card shapes, icons, and
editorial hierarchy into Product Hunt-specific artwork. No new mascot,
unrelated visual language, customer claim, testimonial, metric, or performance
promise was introduced.

The final prompt set asked Imagegen to:

- recompose “Catch frustrations before users do.” with the exact supporting
  copy and `Your vibecoded app → BUD → Happy customers` pipeline;
- recompose “When something breaks, your AI coder gets the full context.” with
  the exact broken-screen, expected, repro, console, network, and fix-prompt
  evidence labels;
- preserve the site's `#0f172a`, `#8b5cf6`, and `#f8fafc` palette, rounded
  cards, navy outlines, purple icons, and restrained status colors;
- exclude navigation, browser chrome, buttons, robots, new mascots, fake
  dashboards, extra copy, claims, metrics, and watermarks.

## Platform references

- [Product Hunt: How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
- [Product Hunt launch guide](https://www.producthunt.com/launch)
- [Product Hunt: Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch)
