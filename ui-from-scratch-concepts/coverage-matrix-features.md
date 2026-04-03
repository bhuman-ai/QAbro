# Coverage Matrix: Features

## Concepts
- `A` Guided Triage Inbox
- `B` Single-Column Test Story
- `C` Reader With History Drawer
- `D` Status Board Dashboard
- `E` Fullscreen Wizard Then Reader
- `F` Command Palette Workspace

## Legend
`D` direct
`S` secondary
`H` hidden but covered
`P` partial
`M` missing

| Feature ID | Priority | Concept A | Concept B | Concept C | Concept D | Concept E | Concept F | Notes |
|---|---|---|---|---|---|---|---|---|
| F01 | P0 | D | D | D | P | D | P | Concepts D and F weaken the obvious homepage action. |
| F02 | P0 | D | D | D | D | D | D | Auth can stay consistent across all concepts. |
| F03 | P0 | D | D | D | D | P | P | E hides history too deeply; F makes retrieval too abstract. |
| F04 | P0 | D | D | D | D | D | P | F over-relies on command-style launch. |
| F05 | P0 | D | P | D | D | P | P | B/E/F make live progress too secondary. |
| F06 | P0 | D | D | D | D | D | D | All concepts can host a report reader. |
| F07 | P0 | D | D | D | D | D | D | Problem detail survives everywhere. |
| F08 | P1 | H | H | H | D | P | H | D keeps too much proof visible by default. |
| F09 | P1 | H | H | H | S | P | H | Sharing should exist but not dominate. |
| F10 | P1 | D | P | D | D | P | P | History-heavy actions are weak in B/E/F. |
| F11 | P1 | H | H | H | D | M | H | E silently drops the engineering handoff. |
| F12 | P2 | H | H | H | D | M | S | Best handled as a secondary utilities surface. |
| F13 | P2 | H | H | H | D | M | S | Present in repo coverage but should stay outside the main child-simple path. |
