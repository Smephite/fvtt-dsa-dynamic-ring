# DSA5 Dynamic Token Ring

A Foundry VTT module that integrates **Das Schwarze Auge 5** resources (LeP, AsP, KaP) into Foundry's Dynamic Token Ring system.

## Features

- **Ring color gradient** reflects current resource level:
  - **Green** → healthy (above mid threshold)
  - **Yellow** → wounded (between low and mid threshold)
  - **Red** → critical (below low threshold)
  - **Gray** → at zero
- **Flash on damage/healing**: ring flashes red on damage, green on healing
- **Configurable resource source**: track LeP, AsP, or KaP
- **Adjustable thresholds**: customize when the ring transitions between colors
- **Bilingual**: English and German UI

## Requirements

- Foundry VTT v12+
- DSA5 system (`dsa5`)
- Dynamic Token Ring must be **enabled** on each token (Prototype Token → Ring Enabled ✓)

## Installation

### Manual
1. Copy the `dsa5-dynamic-ring` folder into your Foundry `Data/modules/` directory
2. Restart Foundry and enable the module in your world's Module Management

### Manifest URL
In Foundry's Add-on Modules browser, paste:
```
<your-hosted-url>/module.json
```

## Configuration

All settings are under **Game Settings → Module Settings → DSA5 Dynamic Token Ring**:

| Setting | Default | Description |
|---|---|---|
| Flash on Damage/Healing | ✓ | Red flash on damage, green on healing |
| Ring Color Source | LeP | Which resource drives the color gradient |
| Low Threshold | 25% | Below this → red zone |
| Mid Threshold | 50% | Below this → yellow zone |

## How It Works

The module hooks into Foundry's `drawToken` and `refreshToken` events to set the ring's color band based on the selected resource's current/max ratio. On actor updates, it detects changes to LeP/AsP/KaP and triggers flash animations.

No system files are modified — everything works through Foundry's hook system.

## Compatibility Notes

- This module uses the same Dynamic Token Ring API that dnd5e uses internally. If the DSA5 system adds native ring support in the future, you may want to disable this module to avoid conflicts.
- Compatible with **SETT: Some Extra Token Ring Types** for custom ring styles.
- Should work alongside **REDY: Reactive Dynamic Token Rings**, but you may get double-flashes on damage — disable REDY's generic flash if that happens.

## Known Limitations

- The ring color band is a single color — it doesn't render a "progress bar fill" inside the ring. It changes the entire ring's hue to represent the resource level. This is a limitation of Foundry's TokenRing API, not this module.
- Only one resource can drive the ring color at a time (configurable via settings).
- The DSA5 system's exact data paths (`system.status.LeP.value`) may change between major system versions. If the ring stops responding after a DSA5 update, check for a module update.

## License

MIT
