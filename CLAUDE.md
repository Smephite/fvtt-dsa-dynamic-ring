# DSA5 Dynamic Token Ring — Developer Handoff

This document provides everything needed to continue developing this Foundry VTT module. It covers the Foundry module system, the DSA5 game system internals, the Dynamic Token Ring API, and all findings from the development and debugging sessions.

## Repository

**GitHub:** https://github.com/Smephite/fvtt-dsa-dynamic-ring

## Target Environment

- **Foundry VTT:** V14.361 (module.json declares minimum V12)
- **Game System:** DSA5 (Das Schwarze Auge / The Dark Eye 5th Edition) by Plushtoast
- **DSA5 System Repo:** https://github.com/Plushtoast/dsa5-foundryVTT (branch `foundry14` for current)
- **Live server:** https://dsa.kai.run

---

## 1. Foundry VTT Module System

### Module Structure

```
dsa5-dynamic-ring/
├── module.json          # Manifest (required)
├── scripts/
│   └── main.mjs         # ES module entry point
├── lang/
│   ├── en.json           # English i18n strings
│   └── de.json           # German i18n strings
└── README.md
```

### module.json

```json
{
  "id": "dsa5-dynamic-ring",
  "version": "0.1.0",
  "url": "https://github.com/Smephite/fvtt-dsa-dynamic-ring",
  "manifest": "https://github.com/Smephite/fvtt-dsa-dynamic-ring/releases/latest/download/module.json",
  "download": "https://github.com/Smephite/fvtt-dsa-dynamic-ring/releases/download/v0.1.0/module.zip",
  "compatibility": { "minimum": "12", "verified": "14" },
  "relationships": { "systems": [{ "id": "dsa5", "type": "system" }] },
  "esmodules": [ "scripts/main.mjs" ]
}
```

- `manifest` must point to the `module.json` inside a GitHub Release (not the repo tree)
- `download` must point to a zip file attached to the GitHub Release
- Without `url`, `manifest`, and `download`, Foundry refuses to install the module

### Hooks System

Hooks used by this module:

```js
Hooks.once("init", () => { /* runs once at startup */ });
Hooks.on("drawToken", (token) => { /* token drawn on canvas */ });
Hooks.on("refreshToken", (token) => { /* token visual refresh */ });
Hooks.on("hoverToken", (token, hovered) => { /* mouse enter/leave */ });
Hooks.on("destroyToken", (token) => { /* token removed from canvas */ });
Hooks.on("preUpdateActor", (actor, changes, options, userId) => { /* before actor update */ });
Hooks.on("updateActor", (actor, changes, options, userId) => { /* after actor update */ });
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => { /* after token document update */ });
```

### Settings API

```js
game.settings.register("module-id", "key", {
  scope: "world",              // "world" = GM-only, "client" = per-user
  config: true,
  type: Boolean,               // Boolean, String, Number
  default: true,
  choices: {},                 // for String dropdowns
  range: { min, max, step },   // for Number sliders
});

game.settings.get("module-id", "key");
game.settings.set("module-id", "key", value);
```

### Useful Foundry APIs

```js
game.version                          // e.g. "14.361"
game.modules.get("module-id")?.active
game.actors.contents
actor.getActiveTokens(true)
canvas.tokens.placeables
foundry.utils.Color.from(0xFF0000)
foundry.utils.setProperty(obj, "path.to.key", value)
```

---

## 2. DSA5 Actor Data Model

### Verified Structure (Foundry V14, DSA5 8.x)

```js
actor.system.status.wounds = {
  initial: 5,        // base from Konstitution
  value: 29,         // ← LIVE CURRENT HP — this is what changes in play
  advances: 0,
  modifier: 10,
  current: 29,       // mirrors value in observed data
  max: 39,           // ← MAXIMUM HP
  multiplier: 1,
  gearmodifier: 0,
  min: -12           // death threshold (negative)
};

actor.system.status.astralenergy = {
  value: 0,          // ← CURRENT AsP
  max: 0,            // 0 means non-caster
  // ... same structure
};

actor.system.status.karmaenergy = {
  value: 0,          // ← CURRENT KaP
  max: 0,            // 0 means non-blessed
};
```

### CRITICAL: How DSA5 sends HP updates

**DSA5 fires `updateActor` with `changes.system.status.wounds.value`, NOT `.current`.**

Verified via live debugging:
```
updateActor fired Eolan {"wounds":{"value":5}}
```

The module watches for both fields as a safety net, but `.value` is what DSA5 actually sends. The original CLAUDE.md said `.current` was the live value — **that was wrong**.

`getResource()` reads `stat.value ?? stat.current` to handle both.

### Key Mapping

| User-facing name | Setting key | `system.status` key | Live value | Max |
|---|---|---|---|---|
| Lebenspunkte (LeP) | `LeP` | `wounds` | `.value` | `.max` |
| Astralpunkte (AsP) | `AsP` | `astralenergy` | `.value` | `.max` |
| Karmapunkte (KaP) | `KaP` | `karmaenergy` | `.value` | `.max` |

### Actor Types

- `"character"` — full player character
- `"npc"` — has wounds, may lack AsP/KaP
- `"creature"` — simplified combat stats

`getResource()` returns `null` when `max === 0`, so actors without AsP/KaP are silently skipped.

---

## 3. Dynamic Token Ring API (Foundry V14)

### Overview

Three layers: **Subject** (artwork), **Ring** (frame), **Background**. Each tintable independently.

- **Official KB:** https://foundryvtt.com/article/dynamic-token-rings/
- **V14 namespace:** `foundry.canvas.placeables.tokens.TokenRing`

### How to Change Ring Color

**CRITICAL: Setting `ringColorLittleEndian` directly does NOT work.** Use document update:

```js
await token.document.update({"ring.colors.ring": "#CC2222"});
await token.document.update({"ring.colors.background": "#CC2222"});
await token.document.update({"ring.colors.ring": null}); // reset to default
```

Loop guard — always compare before updating:
```js
if (token.document.ring?.colors?.ring === hex) return;
token.document.update({ "ring.colors.ring": hex });
```

### Flash Effect

```js
token.ring.flashColor(foundry.utils.Color.from(0xFF0000), { duration: 500 });
```

### Ring Detection (V14)

```js
// WRONG — undefined on V14:
token.document.hasDynamicRing

// CORRECT:
token.ring && typeof token.ring.configureVisuals === "function"
```

### Ring Color Band Limitation

`colorBand: { startRadius: 0.666, endRadius: 0.72 }` — very thin strip. Ring tinting is subtle. The PIXI health arc is the primary visual indicator.

---

## 4. Health Arc (PIXI)

A `PIXI.Graphics` child added to the token display object. Redraws on `drawToken`, `refreshToken`, and actor updates.

### Layout

- **Name:** `"dsa5-dynamic-ring.health-arc"` — used to locate and remove from `token.children`
- **Center:** `token.w / 2, token.h / 2`
- **Radius:** `token.w / 2 * (arcRadius / 100)` — scales with token size
- **Stroke width:** `Math.max(1, Math.round(token.w * arcWidth / 100))` — scales with token size
- **Fill direction:** Anchored at arc end angle; drains from start angle as HP drops
- **Color:** Single solid color from `colorForHP()` — no per-segment gradient
- **Visibility:** `gfx.visible = !showOnHover || !!token.hover`

### PIXI arc gotcha — always use `moveTo` before `arc`

PIXI draws a straight line from the current pen position to the start of each new arc call. This produces a visible stray line if you call `arc()` after a previous stroke ends at a different position.

```js
// Always do this before arc():
gfx.moveTo(cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle));
gfx.arc(cx, cy, radius, startAngle, endAngle);
```

### Schmerzstufen color mapping

```
value ≤ 5 LP         → 0xAA0000 (dark red)     Schmerz IV
pct ≤ 25%            → lerp → 0xDD4400         Schmerz III
pct ≤ 50%            → lerp → 0xDDAA00         Schmerz II
pct ≤ 75%            → lerp → 0x99CC00         Schmerz I
pct > 75%            → lerp → 0x22CC44 (green)  Kein Schmerz
```

---

## 5. Module Settings

| Key | Type | Default | Range | Description |
|---|---|---|---|---|
| `flashOnDamage` | Boolean | `true` | — | Flash ring on HP change |
| `ringColorSource` | String | `"LeP"` | LeP/AsP/KaP | Resource driving arc color |
| `showOnHover` | Boolean | `false` | — | Hide arc + ring tint until hover |
| `arcSpan` | Number | `120` | 10–360, step 5 | Arc width in degrees |
| `arcOffset` | Number | `0` | −180–180, step 5 | Center rotation from 3pm in degrees |
| `arcWidth` | Number | `5` | 1–20, step 1 | Stroke width as % of token width |
| `arcRadius` | Number | `78` | 10–100, step 2 | Radius as % of token half-width |

---

## 6. Current Module State

### What Works

- Health arc draws on all tokens, updates on HP changes, respects all arc settings
- Schmerzstufen color coding with smooth interpolation between thresholds
- Flash effect on damage/healing (`token.ring.flashColor`)
- Ring tint via `token.document.update` with loop guard
- Show-on-hover mode for both arc visibility and ring tint
- NPC/creature handling — skips resources with `max === 0`

### Known Remaining Issues

- **`document.update()` not debounced** — rapid HP changes (e.g. AoE) may cause multiple network syncs. The arc updates instantly; only the ring tint can lag.
- **Arc z-order** — rendered inside the token's own PIXI layer, so it won't appear above tokens stacked on top. Keeping radius below ~80% avoids most overlap.

---

## 7. Debugging

### Console snippets

```js
// Check all module settings
["flashOnDamage","ringColorSource","showOnHover","arcSpan","arcOffset","arcWidth","arcRadius"]
  .forEach(k => console.log(k, game.settings.get("dsa5-dynamic-ring", k)));

// Inspect a token's arc
let tok = canvas.tokens.placeables[0];
let arc = tok.children?.find(c => c.name === "dsa5-dynamic-ring.health-arc");
console.log("arc:", arc, "visible:", arc?.visible, "token.w:", tok.w);

// Inspect live HP (note: DSA5 uses .value, not .current)
let a = game.actors.contents.find(a => a.type === "character");
console.log(JSON.stringify(a.system.status.wounds));

// Confirm updateActor fires and what field DSA5 sends
Hooks.on("updateActor", (actor, changes) =>
  console.log("updateActor", actor.name, JSON.stringify(changes?.system?.status)));

// Test ring color change
let tok = canvas.tokens.placeables.find(t => t.document.ring?.enabled);
await tok.document.update({"ring.colors.ring": "#FF0000"});
tok.ring.flashColor(foundry.utils.Color.from(0x00FF00), {duration: 600});

// Force-refresh all arcs
canvas.tokens.placeables.forEach(t => t.renderFlags.set({ redrawEffects: true }));
```

### Common issues

| Symptom | Likely cause |
|---|---|
| Arc always `visible: false` | `showOnHover` is `true` — check with `game.settings.get("dsa5-dynamic-ring", "showOnHover")` |
| Arc doesn't update on HP change | DSA5 changed the update field — add a `Hooks.on("updateActor")` log to inspect `changes.system.status` |
| Ring tint not changing | Token doesn't have Dynamic Ring enabled, or `hasRing()` returns false |
| Straight line across arc | Missing `moveTo` before an `arc()` call |

---

## 8. Creating a New Release

**Prerequisites:** `gh` CLI authenticated. If SSH fails: `git remote set-url origin https://github.com/Smephite/fvtt-dsa-dynamic-ring.git`

**1. Bump version in `module.json`:**
```json
"version": "0.X.0",
"download": "https://github.com/Smephite/fvtt-dsa-dynamic-ring/releases/download/v0.X.0/module.zip"
```

**2. Commit and push:**
```bash
git add module.json
git commit -m "Release v0.X.0"
git push origin main
```

**3. Build zip from tracked files only:**
```bash
git archive --format=zip --prefix=dsa5-dynamic-ring/ HEAD -o /tmp/module.zip
```

**4. Create GitHub release:**
```bash
gh release create v0.X.0 /tmp/module.zip module.json \
  --title "v0.X.0" \
  --notes "## Changes\n- ..."
```

### Checklist
- [ ] `module.json` version matches the tag
- [ ] `module.json` download URL contains the new tag
- [ ] Both `module.json` and `module.zip` attached to the release
- [ ] Commit is pushed before `gh release create`
