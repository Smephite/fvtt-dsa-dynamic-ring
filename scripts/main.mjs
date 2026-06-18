/**
 * DSA5 Dynamic Token Ring — entry point
 *
 * Registers settings and hooks for:
 *   - Dynamic health arc and ring tint  (ring.mjs)
 *   - Gruppensammelprobe window         (group-check-window.mjs)
 */

import { registerRingSettings, registerRingHooks } from "./ring.mjs";
import { registerGCSettings, registerGCHooks } from "./group-check-window.mjs";

const MODULE_ID = "dsa5-dynamic-ring";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing DSA5 Dynamic Token Ring`);
  registerRingSettings();
  registerGCSettings();
});

registerRingHooks();
registerGCHooks();
