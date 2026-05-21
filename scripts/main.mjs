/**
 * DSA5 Dynamic Token Ring
 *
 * Colors and arcs follow DSA5 Schmerzstufen thresholds:
 *   Schmerz IV  ≤ 5 LP (absolute)
 *   Schmerz III ≤ 25% max LP
 *   Schmerz II  ≤ 50% max LP
 *   Schmerz I   ≤ 75% max LP
 *   Kein Schmerz > 75% max LP
 */

const MODULE_ID = "dsa5-dynamic-ring";

/* ---------------------------------------- */
/*  Color constants                         */
/* ---------------------------------------- */

const COLOR_DAMAGE  = 0xFF0000;
const COLOR_HEALING = 0x00FF00;

// Boundary colors at each Schmerzstufe threshold
const COLOR_PAIN_NONE = 0x22CC44; // > 75%  — kein Schmerz
const COLOR_PAIN_I    = 0x99CC00; // 75%    — Schmerz I
const COLOR_PAIN_II   = 0xDDAA00; // 50%    — Schmerz II
const COLOR_PAIN_III  = 0xDD4400; // 25%    — Schmerz III
const COLOR_PAIN_IV   = 0xAA0000; // ≤ 5 LP — Schmerz IV

// DSA5 status key mapping: setting key → actor.system.status key
const STATUS_KEY_MAP = { LeP: "wounds", AsP: "astralenergy", KaP: "karmaenergy" };
const STATUS_KEYS = Object.values(STATUS_KEY_MAP);

// Health arc — 120° centered at 3 o'clock (1pm → 5pm)
const HEALTH_ARC_NAME = `${MODULE_ID}.health-arc`;
const ARC_SPAN  = (120 * Math.PI) / 180;
const ARC_START = -ARC_SPAN / 2; // −60° = 1pm position

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

  game.settings.register(MODULE_ID, "showOnHover", {
    name: `${MODULE_ID}.settings.showOnHover.name`,
    hint: `${MODULE_ID}.settings.showOnHover.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}

/* ---------------------------------------- */
/*  Helpers                                 */
/* ---------------------------------------- */

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
  return (Math.round(ar + (br - ar) * t) << 16)
       | (Math.round(ag + (bg - ag) * t) << 8)
       |  Math.round(ab + (bb - ab) * t);
}

/**
 * Map an absolute HP value to a color following DSA5 Schmerzstufen.
 * Colors lerp smoothly between stage boundary colors so the arc shows
 * a continuous gradient rather than hard cuts.
 */
function colorForHP(value, max) {
  if (value <= 5) return COLOR_PAIN_IV;

  const pct = value / max;

  if (pct <= 0.25) {
    // Schmerz III zone: lerp from IV (at 5 LP) → III (at 25%)
    const t = (value - 5) / (max * 0.25 - 5);
    return lerpColor(COLOR_PAIN_IV, COLOR_PAIN_III, Math.clamp(t, 0, 1));
  }
  if (pct <= 0.50) {
    return lerpColor(COLOR_PAIN_III, COLOR_PAIN_II, (pct - 0.25) / 0.25);
  }
  if (pct <= 0.75) {
    return lerpColor(COLOR_PAIN_II, COLOR_PAIN_I, (pct - 0.50) / 0.25);
  }
  return lerpColor(COLOR_PAIN_I, COLOR_PAIN_NONE, (pct - 0.75) / 0.25);
}

function computeRingColor(actor) {
  const key = game.settings.get(MODULE_ID, "ringColorSource");
  const res = getResource(actor, key);
  return res ? colorForHP(res.value, res.max) : null;
}

// V14: hasDynamicRing is undefined; duck-type instead.
function hasRing(token) {
  return !!(token.ring && typeof token.ring.configureVisuals === "function");
}

/* ---------------------------------------- */
/*  Ring color                              */
/* ---------------------------------------- */

function applyRingColor(token) {
  if (!hasRing(token)) return;
  const showOnHover = game.settings.get(MODULE_ID, "showOnHover");
  if (showOnHover && !token.hover) {
    if (token.document.ring?.colors?.ring !== null) {
      token.document.update({ "ring.colors.ring": null });
    }
    return;
  }
  const color = computeRingColor(token.actor);
  if (color === null) return;
  const hex = "#" + color.toString(16).padStart(6, "0");
  if (token.document.ring?.colors?.ring === hex) return; // loop guard
  token.document.update({ "ring.colors.ring": hex });
}

/* ---------------------------------------- */
/*  Health arc (PIXI)                       */
/* ---------------------------------------- */

function refreshHealthArc(token) {
  const key = game.settings.get(MODULE_ID, "ringColorSource");
  const res = token.actor ? getResource(token.actor, key) : null;

  let gfx = token.children?.find(c => c.name === HEALTH_ARC_NAME);
  if (!gfx) {
    gfx = new PIXI.Graphics();
    gfx.name = HEALTH_ARC_NAME;
    token.addChild(gfx);
  }
  gfx.clear();

  if (res) {
    const cx = token.w / 2;
    const cy = token.h / 2;
    const radius = token.w / 2 + 5;
    const arcWidth = Math.max(3, Math.round(token.w / 20));
    const END = ARC_START + ARC_SPAN;

    // Background track (full 120°)
    gfx.lineStyle({ width: arcWidth, color: 0x111111, alpha: 0.5, cap: PIXI.LINE_CAP.ROUND });
    gfx.moveTo(cx + radius * Math.cos(ARC_START), cy + radius * Math.sin(ARC_START));
    gfx.arc(cx, cy, radius, ARC_START, END);

    // Filled portion — solid color of current Schmerzstufe
    const pct = Math.clamp(res.value / res.max, 0, 1);
    if (pct > 0) {
      const fillEnd = ARC_START + pct * ARC_SPAN;
      gfx.lineStyle({ width: arcWidth, color: colorForHP(res.value, res.max), alpha: 1, cap: PIXI.LINE_CAP.ROUND });
      gfx.moveTo(cx + radius * Math.cos(ARC_START), cy + radius * Math.sin(ARC_START));
      gfx.arc(cx, cy, radius, ARC_START, fillEnd);
    }
  }

  const showOnHover = game.settings.get(MODULE_ID, "showOnHover");
  gfx.visible = !showOnHover || !!token.hover;
}

function removeHealthArc(token) {
  const gfx = token.children?.find(c => c.name === HEALTH_ARC_NAME);
  if (gfx) { token.removeChild(gfx); gfx.destroy(); }
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

function onDrawToken(token) {
  applyRingColor(token);
  refreshHealthArc(token);
}

function onRefreshToken(token) {
  applyRingColor(token);
  refreshHealthArc(token);
}

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
    for (const token of actor.getActiveTokens(true)) {
      if (!hasRing(token)) continue;
      token.ring.flashColor?.(foundry.utils.Color.from(flashColor), { duration: 500 });
    }
  }
}

function onHoverToken(token, hovered) {
  if (!game.settings.get(MODULE_ID, "showOnHover")) return;
  applyRingColor(token);
  const gfx = token.children?.find(c => c.name === HEALTH_ARC_NAME);
  if (gfx) gfx.visible = hovered;
}

function onUpdateActorRefresh(actor, changes, options, userId) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;
  if (!STATUS_KEYS.some(k => statusChanges[k]?.current !== undefined)) return;
  for (const token of actor.getActiveTokens(true)) {
    applyRingColor(token);
    refreshHealthArc(token);
  }
}

/* ---------------------------------------- */
/*  Init                                    */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing DSA5 Dynamic Token Ring`);
  registerSettings();
});

Hooks.on("drawToken",    onDrawToken);
Hooks.on("refreshToken", onRefreshToken);
Hooks.on("hoverToken",   onHoverToken);
Hooks.on("destroyToken", removeHealthArc);
Hooks.on("preUpdateActor", onPreUpdateActor);
Hooks.on("updateActor", (actor, changes, options, userId) => {
  onUpdateActor(actor, changes, options, userId);
  onUpdateActorRefresh(actor, changes, options, userId);
});
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  if (changes?.ring?.enabled !== undefined) {
    const token = tokenDoc.object;
    if (token) applyRingColor(token);
  }
});
