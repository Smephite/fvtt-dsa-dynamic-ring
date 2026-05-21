# DSA5 Dynamic Token Ring

A Foundry VTT module that visualizes **Das Schwarze Auge 5** resources (LeP, AsP, KaP) on tokens using a PIXI health arc and Foundry's Dynamic Token Ring system.

## Features

- **Health arc** drawn directly on the token, showing current resource as a colored progress bar
- **Schmerzstufen color coding** — color transitions follow DSA5 pain thresholds:
  - Green → healthy (> 75% LP)
  - Yellow-green → Schmerz I (≤ 75%)
  - Orange → Schmerz II (≤ 50%)
  - Dark orange → Schmerz III (≤ 25%)
  - Dark red → Schmerz IV (≤ 5 LP absolute)
- **Flash on damage/healing** — ring flashes red on damage, green on healing
- **Configurable resource source** — track LeP, AsP, or KaP
- **Show on hover** — optionally hide the arc until the mouse is over the token
- **Fully adjustable arc** — span, rotation, stroke width, and radius all configurable
- **Bilingual** — English and German UI

## Requirements

- Foundry VTT v12+
- DSA5 system (`dsa5`)
- Dynamic Token Ring must be **enabled** on each token for flash effects (Prototype Token → Ring Enabled ✓)

## Installation

### Manifest URL
In Foundry's Add-on Modules browser, paste the manifest URL from the latest GitHub release.

### Manual
1. Copy the `dsa5-dynamic-ring` folder into your Foundry `Data/modules/` directory
2. Restart Foundry and enable the module in your world's Module Management

## Configuration

All settings are under **Game Settings → Module Settings → DSA5 Dynamic Token Ring**:

| Setting | Default | Description |
|---|---|---|
| Flash on Damage/Healing | On | Ring flashes red on damage, green on healing |
| Ring Color Source | LeP | Which resource drives the arc color (LeP / AsP / KaP) |
| Show on Hover Only | Off | Hide arc and ring tint until hovering over the token |
| Arc Span | 120° | Total width of the arc in degrees |
| Arc Offset | 0° | Rotation of the arc center from 3 o'clock (−90° = 12pm, 90° = 6pm) |
| Arc Width | 5% | Stroke thickness as a percentage of the token's width |
| Arc Radius | 78% | Distance from token center as % of token radius |

## How It Works

On every token draw, refresh, and actor update the module renders a PIXI arc as a child of the token. The arc color smoothly interpolates between the five DSA5 Schmerzstufen boundary colors based on the current resource value. The ring tint (via `token.document.update`) mirrors the same color for tokens with Dynamic Ring enabled.

Flash effects use `token.ring.flashColor()` and trigger on any detected delta in the tracked resource.

No system files are modified — everything works through Foundry's hook system.

## Compatibility Notes

- Compatible with **SETT: Some Extra Token Ring Types** for custom ring styles.
- Should work alongside **REDY: Reactive Dynamic Token Rings**, but you may get double-flashes on damage — disable REDY's flash if that happens.
- If the DSA5 system adds native ring support in a future version, disable this module to avoid conflicts.

## Known Limitations

- Only one resource can drive the arc color at a time (configurable via settings).
- The arc is drawn within the token's own PIXI layer — it won't appear above tokens stacked on top of it. Keeping the arc inside the token boundary (lower radius %) avoids most overlap issues.
- `document.update()` calls for the ring tint are async and trigger a network sync. Rapid consecutive HP changes may produce a short visual lag on the ring color (the arc itself updates instantly).

## License

MIT
