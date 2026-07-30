# Product Hunt launch package

## Role in the acquisition system

Product Hunt is a one-to-many launch seed for the live, compounding `/qa-mcp`
search asset. It is not the long-term acquisition engine by itself. The launch
should create attributable visits, activation evidence, ecosystem citations,
and language that can improve the organic-search loop.

## Listing fields

- **Product name:** Before Users Do
- **Tagline:** Browser-backed QA for coding agents
- **Destination:** `https://beforeusersdo.com/qa-mcp?utm_source=product_hunt&utm_medium=launch&utm_campaign=qa_mcp_launch`
- **Status:** Live and usable
- **Description:** Before Users Do is a hosted QA MCP that lets coding agents test a reachable web app, capture screenshots plus console and network evidence, and return a fix-ready report before the feature ships.
- **Suggested topics:** Developer Tools, Artificial Intelligence, Testing and QA
- **Pricing tag:** Confirm from the live commercial offer in the Product Hunt composer before publishing. No public pricing was found in the inspected product path.
- **Thumbnail:** `marketing/product-hunt/assets/product-hunt-thumbnail.png`
- **Gallery image 1:** `marketing/product-hunt/assets/product-hunt-gallery-live-page.png`
- **Gallery image 2:** `marketing/product-hunt/assets/product-hunt-gallery-evidence-board.png`

The tagline is 35 characters and the description is 195 characters, keeping
both within the conservative limits in Product Hunt's current launch guidance.
Topic names are candidates and must be matched to the current composer options.

## Gallery order and captions

1. **Live offer:** The real, live QA MCP page shows the agent-to-browser-to-proof
   handoff and sends builders into the measured install path.
2. **Evidence board:** Screenshots, console failures, network proof, and a
   fix-ready verdict come back in one QA report.

## Maker first-comment scaffold

> Hey Product Hunt — I built Before Users Do for the uncomfortable moment when
> a coding agent says a feature is finished, but you still do not know whether
> the real user flow works.
>
> [Maker: add one honest sentence about the specific experience that made you
> build this.]
>
> Before Users Do is a hosted MCP that lets a coding agent run browser-backed QA
> against a reachable preview, collect screenshots plus console and network
> evidence, and return a fix-ready report in the same workflow.
>
> It is live now. I would especially value feedback on the install handoff and
> whether the first report gives you enough confidence to ship.

The bracketed maker sentence must be completed by the maker. Do not fabricate
a personal story or post the comment from a company account.

## Publish-time checklist

- Sign in with the maker's personal Product Hunt account; company accounts
  cannot submit a product.
- Confirm that no existing Before Users Do product page owns this launch.
- Paste the tracked destination exactly as written above.
- Select the current Product Hunt topic names that best match the candidates.
- Confirm the truthful pricing tag from the live offer.
- Upload the 240 × 240 thumbnail and both 1270 × 760 gallery images.
- Complete the one-sentence maker story and read the full first comment.
- Preview the listing on desktop and mobile.
- Ask for feedback, not upvotes.
- Obtain explicit approval immediately before accepting any new terms or
  publishing the external listing.

## Measurement

- **Primary event:** `first_qa_report_completed`
- **Diagnostic campaign:** `product_hunt / launch / qa_mcp_launch`
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

## Asset provenance

The thumbnail reuses the existing navy shield and purple zap brand mark. The
first gallery asset is a crop of the verified live `/qa-mcp` page. The second
was generated with the built-in image-generation tool using only the existing
navy, purple, warm-white, and restrained warning palette. It depicts the
observed evidence types without customer claims, testimonials, usage metrics,
or performance promises.

The final generated-image prompt was: “Create a premium flat vector-like
evidence board for a developer-tool launch, with one browser screenshot module,
one console-error module, one failed-network-request module, and one fix-ready
verdict module; use `#0f172a`, `#8b5cf6`, `#f8fafc`, muted slate, and restrained
warning accents; no text, logos, people, robots, gradients, fake metrics, or
watermarks.”

## Platform references

- [Product Hunt: How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
- [Product Hunt launch guide](https://www.producthunt.com/launch)
- [Product Hunt: Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch)
