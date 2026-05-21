/**
 * DSA5 Dynamic Token Ring
 *
 * Hooks into Foundry VTT's Dynamic Token Ring system to provide
 * DSA5-specific ring color gradients (LeP/AsP/KaP) and flash effects.
 *
 * The approach mirrors what dnd5e does with getRingColors / flashRing,
 * but implemented as a module that monkey-patches the Token document
 * and canvas classes via libWrapper-free hooks.
 */

const MODULE_ID = "dsa5-dynamic-ring";

/* ---------------------------------------- */
/*  Color constants (little-endian ABGR)    */
/* ---------------------------------------- */

// Flash colors
const COLOR_DAMAGE  = 0xFF0000FF; // red
const COLOR_HEALING = 0xFF00FF00; // green

// Ring gradient colors (standard RGBA hex for Color.from)
const RING_GREEN  = 0x22CC44;
const RING_YELLOW = 0xDDAA00;
const RING_RED    = 0xCC2222;
const RING_GRAY   = 0x666666; // defeated / zero

/* ---------------------------------------- */
/*  Settings                                */
/* ---------------------------------------- */

function registerSettings() {
  game.settings.register(MODULE_ID, "flashOnDamage", {
    name: `${MODULE_ID}.settings.flashOnDamage.name`,
    hint: `${MODULE_ID}.settings.flashOnDamage.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "ringColorSource", {
    name: `${MODULE_ID}.settings.ringColorSource.name`,
    hint: `${MODULE_ID}.settings.ringColorSource.hint`,
    scope: "world",
    config: true,
    type: String,
    default: "LeP",
    choices: {
      LeP: `${MODULE_ID}.settings.ringColorSource.choices.LeP`,
      AsP: `${MODULE_ID}.settings.ringColorSource.choices.AsP`,
      KaP: `${MODULE_ID}.settings.ringColorSource.choices.KaP`,
    },
  });

  game.settings.register(MODULE_ID, "lowThreshold", {
    name: `${MODULE_ID}.settings.lowThreshold.name`,
    hint: `${MODULE_ID}.settings.lowThreshold.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 25,
    range: { min: 5, max: 50, step: 5 },
  });

  game.settings.register(MODULE_ID, "midThreshold", {
    name: `${MODULE_ID}.settings.midThreshold.name`,
    hint: `${MODULE_ID}.settings.midThreshold.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 50,
    range: { min: 20, max: 80, step: 5 },
  });
}

/* ---------------------------------------- */
/*  Helpers                                 */
/* ---------------------------------------- */

/**
 * Resolve the current and max value of a DSA5 resource.
 * DSA5 stores status values at actor.system.status.<key>.value / .max
 * but the exact path can differ between system versions.
 * We try the most common paths and fall back gracefully.
 *
 * @param {Actor} actor
 * @param {string} key  "LeP", "AsP", or "KaP"
 * @returns {{value: number, max: number} | null}
 */
function getResource(actor, key) {
  if (!actor?.system?.status) return null;

  // Primary path: system.status.LeP.value / .max
  const stat = actor.system.status[key];
  if (stat && typeof stat.max === "number" && stat.max > 0) {
    return { value: Number(stat.value ?? 0), max: stat.max };
  }
  return null;
}

/**
 * Linearly interpolate between two 0xRRGGBB colors.
 */
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
  const br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}

/**
 * Compute the ring color for a token based on its resource percentage.
 * Returns a standard 0xRRGGBB color.
 */
function computeRingColor(actor) {
  const key = game.settings.get(MODULE_ID, "ringColorSource");
  const res = getResource(actor, key);
  if (!res) return null;

  const pct = Math.clamp(res.value / res.max, 0, 1) * 100;
  const low = game.settings.get(MODULE_ID, "lowThreshold");
  const mid = game.settings.get(MODULE_ID, "midThreshold");

  if (pct <= 0) return RING_GRAY;
  if (pct <= low) return lerpColor(RING_RED, RING_YELLOW, pct / low);
  if (pct <= mid) return lerpColor(RING_YELLOW, RING_GREEN, (pct - low) / (mid - low));
  return RING_GREEN;
}

/**
 * Convert a standard 0xRRGGBB to the little-endian 0xAABBGGRR that
 * Foundry's TokenRing shader expects.
 */
function toLittleEndian(color) {
  const r = (color >> 16) & 0xFF;
  const g = (color >> 8) & 0xFF;
  const b = color & 0xFF;
  return 0xFF000000 | (b << 16) | (g << 8) | r;
}

/* ---------------------------------------- */
/*  Core hooks                              */
/* ---------------------------------------- */

/**
 * Hook: Override the ring color whenever a token's visuals are configured.
 * This fires on every token draw/refresh, so we just compute and apply.
 */
function onDrawToken(token) {
  applyRingColor(token);
}

function onRefreshToken(token) {
  applyRingColor(token);
}

function applyRingColor(token) {
  // Only operate on tokens that have the dynamic ring enabled
  if (!token.ring?.enabled) return;
  if (!token.document?.hasDynamicRing) return;

  const actor = token.actor;
  if (!actor) return;

  const color = computeRingColor(actor);
  if (color === null) return;

  // Apply the color to the ring's dynamic color band
  token.ring.ringColorLittleEndian = toLittleEndian(color);
  // Trigger visual update
  token.ring.configureVisuals?.();
}

/**
 * Hook: Flash the ring on HP changes (damage = red, healing = green).
 * We listen to actor updates and find the corresponding token(s).
 */
function onUpdateActor(actor, changes, options, userId) {
  if (!game.settings.get(MODULE_ID, "flashOnDamage")) return;

  // Check if any of our tracked resources changed
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  for (const key of ["LeP", "AsP", "KaP"]) {
    if (statusChanges[key]?.value === undefined) continue;

    const oldVal = actor._source?.system?.status?.[key]?.value
      ?? actor.system?.status?.[key]?.value;
    const newVal = statusChanges[key].value;

    // Can't reliably determine delta from the update hook alone
    // in all Foundry versions, so we use the diff from options if available
    const delta = newVal - (options?.[`${MODULE_ID}.prev_${key}`] ?? oldVal);
    if (delta === 0) continue;

    const flashColor = delta < 0 ? COLOR_DAMAGE : COLOR_HEALING;

    // Find all tokens for this actor and flash them
    const tokens = actor.getActiveTokens(true);
    for (const token of tokens) {
      if (!token.ring?.enabled) continue;
      token.ring.flashColor?.(
        foundry.utils.Color.from(flashColor),
        { duration: 500 }
      );
    }
  }
}

/**
 * Hook: Before the actor update, stash current values so we can
 * compute a reliable delta in the update hook.
 */
function onPreUpdateActor(actor, changes, options, userId) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  for (const key of ["LeP", "AsP", "KaP"]) {
    if (statusChanges[key]?.value !== undefined) {
      const current = actor.system?.status?.[key]?.value ?? 0;
      foundry.utils.setProperty(options, `${MODULE_ID}.prev_${key}`, current);
    }
  }
}

/**
 * When actor data is updated, refresh the ring color on all their tokens.
 */
function onUpdateActorRefreshRing(actor, changes, options, userId) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  const relevantKeys = ["LeP", "AsP", "KaP"];
  const hasRelevantChange = relevantKeys.some(k => statusChanges[k]?.value !== undefined);
  if (!hasRelevantChange) return;

  const tokens = actor.getActiveTokens(true);
  for (const token of tokens) {
    applyRingColor(token);
  }
}

/* ---------------------------------------- */
/*  Init                                    */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing DSA5 Dynamic Token Ring`);
  registerSettings();
});

Hooks.on("drawToken", onDrawToken);
Hooks.on("refreshToken", onRefreshToken);
Hooks.on("preUpdateActor", onPreUpdateActor);
Hooks.on("updateActor", (actor, changes, options, userId) => {
  onUpdateActor(actor, changes, options, userId);
  onUpdateActorRefreshRing(actor, changes, options, userId);
});

// Also refresh when a token's dynamic ring is toggled on
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  if (changes?.ring?.enabled !== undefined) {
    const token = tokenDoc.object;
    if (token) applyRingColor(token);
  }
});
