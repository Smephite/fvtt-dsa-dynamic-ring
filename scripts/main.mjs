/**
 * DSA5 Dynamic Token Ring
 *
 * Hooks into Foundry VTT's Dynamic Token Ring system to provide
 * DSA5-specific ring color gradients (LeP/AsP/KaP) and flash effects.
 */

const MODULE_ID = "dsa5-dynamic-ring";

/* ---------------------------------------- */
/*  Color constants                         */
/* ---------------------------------------- */

const COLOR_DAMAGE  = 0xFF0000; // red   (standard RGB for Color.from)
const COLOR_HEALING = 0x00FF00; // green (standard RGB for Color.from)

const RING_GREEN  = 0x22CC44;
const RING_YELLOW = 0xDDAA00;
const RING_RED    = 0xCC2222;
const RING_GRAY   = 0x666666; // defeated / zero

// DSA5 actual data paths: setting key → actor.system.status key
const STATUS_KEY_MAP = { LeP: "wounds", AsP: "astralenergy", KaP: "karmaenergy" };
const STATUS_KEYS = Object.values(STATUS_KEY_MAP);

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
 * DSA5 stores: actor.system.status.wounds.current / .max (etc.)
 * The setting key (LeP/AsP/KaP) maps to the actual status key via STATUS_KEY_MAP.
 */
function getResource(actor, key) {
  if (!actor?.system?.status) return null;
  const statusKey = STATUS_KEY_MAP[key];
  const stat = actor.system.status[statusKey];
  if (stat && typeof stat.max === "number" && stat.max > 0) {
    return { value: Number(stat.current ?? 0), max: stat.max };
  }
  return null;
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
  const br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}

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

// V14: hasDynamicRing is undefined; check for the ring object and its method instead.
function hasRing(token) {
  return !!(token.ring && typeof token.ring.configureVisuals === "function");
}

/* ---------------------------------------- */
/*  Core ring update                        */
/* ---------------------------------------- */

/**
 * Apply the computed ring color via document.update().
 * configureVisuals() reads from document data, so setting ringColorLittleEndian
 * directly has no visible effect — only document.update() persists correctly.
 *
 * The guard prevents an update→refresh→update loop: after the async update
 * resolves, the stored color matches hex and subsequent calls are no-ops.
 *
 * To fill the entire background circle instead of (or in addition to) the
 * ring band, update "ring.colors.background" — more visible but covers the
 * token art tint area.
 */
function applyRingColor(token) {
  if (!hasRing(token)) return;
  const actor = token.actor;
  if (!actor) return;
  const color = computeRingColor(actor);
  if (color === null) return;

  const hex = "#" + color.toString(16).padStart(6, "0");
  if (token.document.ring?.colors?.ring === hex) return; // already up to date
  token.document.update({ "ring.colors.ring": hex });
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

function onDrawToken(token) {
  applyRingColor(token);
}

function onRefreshToken(token) {
  applyRingColor(token);
}

/**
 * Stash current resource values before the actor update so onUpdateActor
 * can compute a reliable delta. Keys must match the DSA5 status keys
 * (wounds/astralenergy/karmaenergy), not the setting keys (LeP/AsP/KaP).
 */
function onPreUpdateActor(actor, changes, options, userId) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  for (const statusKey of STATUS_KEYS) {
    if (statusChanges[statusKey]?.current !== undefined) {
      const current = actor.system?.status?.[statusKey]?.current ?? 0;
      foundry.utils.setProperty(options, `${MODULE_ID}.prev_${statusKey}`, current);
    }
  }
}

function onUpdateActor(actor, changes, options, userId) {
  if (!game.settings.get(MODULE_ID, "flashOnDamage")) return;

  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  for (const statusKey of STATUS_KEYS) {
    if (statusChanges[statusKey]?.current === undefined) continue;

    const newVal = statusChanges[statusKey].current;
    const prevVal = options?.[`${MODULE_ID}.prev_${statusKey}`] ?? newVal;
    const delta = newVal - prevVal;
    if (delta === 0) continue;

    const flashColor = delta < 0 ? COLOR_DAMAGE : COLOR_HEALING;
    const tokens = actor.getActiveTokens(true);
    for (const token of tokens) {
      if (!hasRing(token)) continue;
      token.ring.flashColor?.(foundry.utils.Color.from(flashColor), { duration: 500 });
    }
  }
}

function onUpdateActorRefreshRing(actor, changes, options, userId) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;

  const hasRelevantChange = STATUS_KEYS.some(k => statusChanges[k]?.current !== undefined);
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

// Refresh ring color when the token's dynamic ring is toggled on
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  if (changes?.ring?.enabled !== undefined) {
    const token = tokenDoc.object;
    if (token) applyRingColor(token);
  }
});
