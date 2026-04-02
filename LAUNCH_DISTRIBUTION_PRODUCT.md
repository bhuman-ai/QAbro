# Launch Distribution Product

## Goal

Turn the current submission engine into a narrow, sellable product instead of a generic "submit everywhere" bot.

The right v1 is:

- small
- believable
- operationally reliable
- expandable into larger startup and local-presence offerings later

The wrong v1 is:

- broad
- vanity-heavy
- support-heavy
- dependent on community rituals or account-verification edge cases

## Product Thesis

The product is not:

- "submit to 100+ sites"

The product is:

- "fill one profile, and we distribute you to the launch and presence directories that are actually worth automating"

That means the catalog should be split by product viability, not just technical support tier.

## Current Catalog Scorecard

This table classifies the current catalog into:

- `green`: can be sold in a self-serve or mostly automated pack
- `yellow`: good add-on or assisted connector, but not safe enough for the core promise
- `red`: should not be in the public v1 promise

### Startup / Launch Catalog

| Site | Current engine status | Product status | Why |
|---|---|---|---|
| SaaSHub | `supported` / `assist` | `green` | Structured software directory with deterministic fields, useful categories/competitors, and a realistic automation path. |
| BetaList | `recon_needed` / `assist` | `yellow` | Relevant launch destination, but sign-in and connector maintenance make it better as assisted or premium. |
| Futurepedia | `recon_needed` / `assist` | `yellow` | Good AI-native add-on, but should be sold as an AI booster rather than core startup pack. |
| Toolify | `recon_needed` / `assist` | `yellow` | AI-directory fit, but not a safe baseline connector for all startups. |
| TopAI.tools | `recon_needed` / `assist` | `yellow` | Similar to Toolify: useful for AI products, but not broad or deterministic enough for the core promise. |
| Product Hunt | `manual_only` / `manual` | `red` | Community launch mechanics, timing, first-comment/social behavior, and account sensitivity make this a bad automation promise. |
| Indie Hackers | `manual_only` / `manual` | `red` | Community-oriented and operator-sensitive, so it should stay manual or white-glove only. |

### Local / Presence Catalog

| Site | Current engine status | Product status | Why |
|---|---|---|---|
| Google Business Profile | `recon_needed` / `assist` | `yellow` | Extremely valuable, but verification, login reuse, and duplicate/claim flows keep it out of a pure self-serve promise. |
| Apple Business Connect | `recon_needed` / `assist` | `yellow` | Strong local-presence connector, but better in an assisted pack because of auth and place-card ownership checkpoints. |
| Yelp | `recon_needed` / `assist` | `yellow` | Valuable local listing, but still fragile enough to treat as assisted. |
| BBB | `recon_needed` / `assist` | `yellow` | Trust signal worth including, but captcha/editorial friction prevents green classification. |
| Forney Chamber | `manual_only` / `manual` | `red` | Membership-style local listing; keep manual only. |

## Pack Strategy

### 1. Launch Starter

This is the first public startup product.

Promise:

- "We submit your startup to the launch directories that are actually automatable."

Contents:

- `SaaSHub`

This is intentionally small today. That is acceptable if the promise is honest.

Immediate expansion target:

- grow this to 5 to 10 true `green` startup connectors before pushing hard on self-serve volume

### 2. Launch Boosters

These are startup add-ons, not core.

Contents:

- `BetaList`
- `Futurepedia`
- `Toolify`
- `TopAI.tools`

Rules:

- only sell these as assisted or premium
- only include AI directories when the product is clearly AI-native

### 3. Community Launch

These are excluded from the core product.

Contents:

- `Product Hunt`
- `Indie Hackers`

Rules:

- never put these inside the default automation promise
- sell only as white-glove or manual concierge later, if at all

### 4. Presence Pack

This is the separate local-business / agency lane.

Contents:

- `Google Business Profile`
- `Apple Business Connect`
- `Yelp`
- `BBB`

Rules:

- assisted by default
- claim-or-create logic required
- duplicate avoidance required
- persistent authenticated profiles required

## Product Packaging

### Public Packaging

#### Launch Starter

For SaaS and startup founders.

Offer:

- one profile intake
- asset normalization
- automated submission to the current green pack
- proof dashboard and live evidence

Suggested pricing:

- `$79` to `$149` one-time

#### AI Boost

For AI-native products.

Offer:

- Launch Starter
- assisted submissions to AI-specific yellow connectors

Suggested pricing:

- Launch Starter price plus pass-through listing fees and ops margin

#### Presence Pack

For agencies, local businesses, and service businesses.

Offer:

- canonical business profile
- claim/create flows across trust and local listings
- reporting plus drift monitoring

Suggested pricing:

- setup fee plus monthly sync
- or per-location / per-client pricing

## Positioning

### Homepage Headline

Launch where automation actually works.

### Subhead

Fill one profile. We submit your startup to the launch directories that are worth automating, then track every placement with proof.

### Alternate Headline

One profile. Real distribution. No fake "100 sites" promise.

### Short Pitch

Launch Distribution helps startups publish once and get listed across the launch directories that matter and can actually be automated. No community hacks. No spreadsheet ops. Just structured distribution, evidence, and a maintained connector layer.

### "What We Do"

- normalize your startup profile
- generate site-specific copy and assets
- submit to vetted launch connectors
- capture evidence and status
- refresh broken connectors over time

### "What We Don't Do"

- fake community launches
- promise every site on the internet
- pretend phone verification and social rituals are automatable
- hide manual/editorial dependencies inside the core product promise

## Key KPI

The most important KPI is:

- `human minutes per successful submission`

If this does not keep going down, the product is not compounding.

Secondary KPIs:

- connector success rate
- preflight block rate
- captcha rate by connector
- approval rate by connector
- time to first live listing
- recon reuse rate

## What This Means Right Now

The current startup catalog is not yet broad enough for a large self-serve launch push.

The correct read is not:

- "we need more infrastructure"

The correct read is:

- "we need more true green connectors"

## Next Build Steps

1. Add `product_status` to the site catalog: `green`, `yellow`, `red`
2. Add a connector scorecard view with:
   - success rate
   - avg runtime
   - captcha rate
   - auth dependency
   - drift rate
3. Keep `Launch Starter` green-only
4. Keep `Launch Boosters` yellow-only
5. Keep `Community Launch` red/manual-only
6. Implement persistent authenticated profiles for:
   - Google
   - Yelp
   - Apple
7. Add 4 to 6 more green startup connectors before pushing broad self-serve acquisition

## Recommended Near-Term GTM

Short term:

- sell a narrow startup launch product with a believable promise
- use the local-presence product as the deeper internal proving ground

Practical order:

1. harden `Launch Starter`
2. sell assisted AI and launch boosters as premium
3. keep building `Presence Pack` for agencies and local businesses

That gives the company two lanes:

- a startup distribution wedge
- a local-presence / agency recurring product
