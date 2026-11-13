# Lowsec design system — "Hostile space / mission control"

Lowsec's UI follows the visual language of **EVE Frontier** and **EVE Online** (black, cream, one signal orange, the EVE security colour ramp) and **Elite Dangerous** (key/value info panels, route bar). It also borrows the clarity of **FTL / Into the Breach** (show the risk before you commit) and the juice of **Balatro / Hades** (count-ups, hit-stop, sound). The research brief that drove these choices is summarised below; every token lives in code.

| What | Where |
|---|---|
| Tokens (colour, type, spacing, shape, motion) | `apps/web/styles/tokens.css` |
| Primitive classes (panel, button, pill, tooltip, table, bars) | `apps/web/styles/ui.css` |
| React kit | `apps/web/ui/*` (import from `@/ui`) |
| Fonts (self-hosted, OFL) | `apps/web/app/fonts.ts`, `apps/web/app/fonts/*.woff2` |
| Sound (Kenney, CC0) | `apps/web/lib/sound.ts`, `apps/web/public/sfx/*.ogg` |
| Icons | `lucide-react` via `apps/web/ui/icons.tsx` (no emoji anywhere in the UI) |

## Principles
1. **The screen is ≥85% void/hull.** Colour is information, not decoration.
2. **One orange per screen.** `--signal` marks the single primary action and the player's own convoy.
3. **Red means danger or loss, nothing else.** Risk uses the EVE security ramp: highsec cyan → lowsec orange → nullsec red. The game is called *Lowsec*, so the ramp tells the story.
4. **Show the risk before the choice.** Lanes and routes show ambush %, toll and ETA before you depart.
5. **Numbers are the heroes.** All values are mono, tabular and right-aligned, and they count up when they change.
6. **Honesty labels are part of the design.** `TEE verified` appears only for a verified `provider_tee` signature (see `components/Badge.tsx`). Otherwise the UI shows `MOCK`. Intents shows `QUOTE ONLY`, and the Guild is labelled `RULE-BASED · no AI`. These labels are restyled, never hidden or renamed.

## Palette (`styles/tokens.css`)
| Token | Value | Use |
|---|---|---|
| `--void` | `#050608` | page / space |
| `--hull` / `--glass` | `#0B0D11` / `rgba(10,12,16,.72)` | solid / floating panels |
| `--ink` / `--ink-2` / `--ink-3` | `#FAFAE5` / `#B9B8A6` / `#6F6E63` | text / secondary / labels |
| `--line` / `--line-strong` | cream at 12% / 28% | hairlines |
| `--signal` | `#FF4700` | the one CTA, the player |
| `--sec-high` … `--sec-null` | `#2FEFEF` `#8FEF2F` `#F06000` `#F00000` | security / risk ramp (full 11 steps `--sec-10`…`--sec-00`) |
| `--gold` | `#F0B43C` | currency |
| `--profit` / `--loss` | `#3DDC97` / `#FF3B3B` | deltas |
| `--tee` / `--mock` | `#7CF5C8` / `#F5A524` | AI verification status |
| `--forja` `--mina` `--puerto` | town accents | town identity |

## Type
| Role | Family | Style |
|---|---|---|
| Display (`--ff-display`) | Chakra Petch 500–700 | UPPERCASE, tracking 0.06em. Panel titles 15px, towns 28px, titles 40px, alerts 56px |
| Labels and numbers (`--ff-mono`) | JetBrains Mono 400–700 | labels 11px UPPERCASE, tracking 0.12em. Values 14–20px `tabular-nums` |
| Body (`--ff-body`) | IBM Plex Sans Condensed 400–600 | 14px / 1.45 for AI reasoning and help text |

The fonts are vendored woff2 files loaded with `next/font/local`, so `pnpm build` works offline in a fresh clone.

## Space and shape
- 4px base: `--s-1`…`--s-7` = 4, 8, 12, 16, 24, 32, 48. Screen gutter 24px.
- **Radius 0.** Panels get a 10px notch top-left and bottom-right. Buttons get a 6px notch bottom-right.
- 1px hairlines. Panel titles carry a 2×16px orange tick.
- The panel frame is drawn by two clipped pseudo-layers, so the panel itself is not clipped and tooltips can overflow it.

## Components (`@/ui`)
| Component | Notes |
|---|---|
| `Panel({title, sub, right, icon, variant, tone})` | Notched glass panel. `title` is rendered as an exact `<h3>`. `tone="alert" \| "active"` recolours the frame |
| `Button({variant, size, icon, kbd, sound})` | `primary` (orange), `secondary`, `danger` (hatched lowsec), `ghost`. Plays a click cue |
| `Pill({tone, icon, href})` | 18px status chip (border + 12% fill) |
| `Tooltip({title, content, placement})`, `KV({items})` | Elite-style key/value tooltip |
| `Table({columns, rows, rowKey})` | EVE Overview table: 28px rows, hairlines, numeric columns right-aligned, orange hover bar |
| `Stat({label, value, tone, size})`, `CountUp({value, tick})` | Big mono numbers that tween (rAF, ease-out) with optional rising coin ticks |
| `SegBar({total, filled, burned})`, `Progress({value, color})` | FTL-style segmented cargo bar and a thin progress bar |
| `SecTag({sec})`, `secColor()`, `riskToSec()` | EVE security tag and ramp helpers |
| `Icon({name})`, `GoodIcon({good})`, `ICONS` | Semantic lucide icons. They work in HTML and inside SVG (`x`/`y`) |
| `SoundToggle` | Mute toggle |

Legacy class names (`.panel`, `button.primary`, `.badge`, `table`) are mapped onto the same primitives. The demo recorder (`demo/record.mjs`) and the end-to-end test (`scripts/e2e.mjs`) keep their selectors.

## Sound
Nine Kenney CC0 cues: `hover`, `click`, `confirm`, `error`, `launch`, `arrive`, `alarm`, `explosion` and `coin`. Call `sfx(name, {volume, rate})`. Sound is on by default and the audio context starts on the first click or keypress, as browsers require. The mute choice is saved in `localStorage`. If a file can't be decoded, procedural WebAudio fallbacks play instead.

## Motion
120ms fade+rise for tooltips, 200ms pulse when a value changes, and 300–600ms count-ups. The ambush sequence runs for about 1.6s: hit-stop, flash, shockwave, shake, then the in-world alert. `prefers-reduced-motion` disables the animations.

## Credits
- Fonts: Chakra Petch, JetBrains Mono and IBM Plex Sans Condensed under the SIL Open Font License 1.1 (`apps/web/app/fonts/OFL-*.txt`).
- Icons: Lucide (ISC).
- Sounds: Kenney "Sci-Fi Sounds" and "Interface Sounds" (CC0, `apps/web/public/sfx/LICENSE-kenney.txt`).
