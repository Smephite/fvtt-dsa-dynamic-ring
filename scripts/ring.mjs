const MODULE_ID = "dsa5-dynamic-ring";

/* ---------------------------------------- */
/*  Color constants                         */
/* ---------------------------------------- */

const COLOR_DAMAGE  = 0xFF0000;
const COLOR_HEALING = 0x00FF00;

const COLOR_PAIN_NONE = 0x22CC44; // > 75%  — kein Schmerz
const COLOR_PAIN_I    = 0x99CC00; // 75%    — Schmerz I
const COLOR_PAIN_II   = 0xDDAA00; // 50%    — Schmerz II
const COLOR_PAIN_III  = 0xDD4400; // 25%    — Schmerz III
const COLOR_PAIN_IV   = 0xAA0000; // ≤ 5 LP — Schmerz IV

const STATUS_KEY_MAP = { LeP: "wounds", AsP: "astralenergy", KaP: "karmaenergy" };
const STATUS_KEYS = Object.values(STATUS_KEY_MAP);

const HEALTH_ARC_NAME = `${MODULE_ID}.health-arc`;

/* ---------------------------------------- */
/*  Settings                                */
/* ---------------------------------------- */

export function registerRingSettings() {
  game.settings.register(MODULE_ID, "ringTintEnabled", {
    name: `${MODULE_ID}.settings.ringTintEnabled.name`,
    hint: `${MODULE_ID}.settings.ringTintEnabled.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

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

  game.settings.register(MODULE_ID, "arcSpan", {
    name: `${MODULE_ID}.settings.arcSpan.name`,
    hint: `${MODULE_ID}.settings.arcSpan.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 120,
    range: { min: 10, max: 360, step: 5 },
  });

  game.settings.register(MODULE_ID, "arcOffset", {
    name: `${MODULE_ID}.settings.arcOffset.name`,
    hint: `${MODULE_ID}.settings.arcOffset.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: -180, max: 180, step: 5 },
  });

  game.settings.register(MODULE_ID, "arcWidth", {
    name: `${MODULE_ID}.settings.arcWidth.name`,
    hint: `${MODULE_ID}.settings.arcWidth.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    range: { min: 1, max: 20, step: 1 },
  });

  game.settings.register(MODULE_ID, "arcRadius", {
    name: `${MODULE_ID}.settings.arcRadius.name`,
    hint: `${MODULE_ID}.settings.arcRadius.hint`,
    scope: "world",
    config: true,
    type: Number,
    default: 78,
    range: { min: 10, max: 100, step: 2 },
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
    return { value: Number(stat.value ?? stat.current ?? 0), max: stat.max };
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
  if (!game.settings.get(MODULE_ID, "ringTintEnabled")) return;
  if (!hasRing(token)) return;
  if (!game.user.isGM) return;
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

    const span     = game.settings.get(MODULE_ID, "arcSpan")   * Math.PI / 180;
    const offset   = game.settings.get(MODULE_ID, "arcOffset") * Math.PI / 180;
    const arcWidth = Math.max(1, Math.round(token.w * game.settings.get(MODULE_ID, "arcWidth") / 100));
    const radius   = token.w / 2 * (game.settings.get(MODULE_ID, "arcRadius") / 100);

    // offset=0 → centered at 3pm (angle 0); negative = rotate toward 12pm
    const arcStart = offset - span / 2;
    const arcEnd   = offset + span / 2;

    // Background track
    gfx.lineStyle({ width: arcWidth, color: 0x111111, alpha: 0.5, cap: PIXI.LINE_CAP.ROUND });
    gfx.moveTo(cx + radius * Math.cos(arcStart), cy + radius * Math.sin(arcStart));
    gfx.arc(cx, cy, radius, arcStart, arcEnd);

    // Filled portion — anchored at bottom end, drains from top end as HP drops
    const pct = Math.clamp(res.value / res.max, 0, 1);
    if (pct > 0) {
      const fillStart = arcStart + (1 - pct) * span;
      gfx.lineStyle({ width: arcWidth, color: colorForHP(res.value, res.max), alpha: 1, cap: PIXI.LINE_CAP.ROUND });
      gfx.moveTo(cx + radius * Math.cos(fillStart), cy + radius * Math.sin(fillStart));
      gfx.arc(cx, cy, radius, fillStart, arcEnd);
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
/*  Hook handlers                           */
/* ---------------------------------------- */

function onDrawToken(token) {
  applyRingColor(token);
  refreshHealthArc(token);
}

function onRefreshToken(token) {
  applyRingColor(token);
  refreshHealthArc(token);
}

function onPreUpdateActor(actor, changes, options) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;
  for (const statusKey of STATUS_KEYS) {
    const changed = statusChanges[statusKey];
    if (changed?.value !== undefined || changed?.current !== undefined) {
      const stat = actor.system?.status?.[statusKey];
      const prev = stat?.value ?? stat?.current ?? 0;
      foundry.utils.setProperty(options, `${MODULE_ID}.prev_${statusKey}`, prev);
    }
  }
}

function onUpdateActor(actor, changes, options) {
  if (!game.settings.get(MODULE_ID, "flashOnDamage")) return;
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;
  for (const statusKey of STATUS_KEYS) {
    const changed = statusChanges[statusKey];
    if (changed?.value === undefined && changed?.current === undefined) continue;
    const newVal = changed.value ?? changed.current;
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
  const gfx = token.children?.find(c => c.name === HEALTH_ARC_NAME);
  if (gfx) gfx.visible = hovered;
}

function onUpdateActorRefresh(actor, changes) {
  const statusChanges = changes?.system?.status;
  if (!statusChanges) return;
  if (!STATUS_KEYS.some(k => statusChanges[k]?.value !== undefined || statusChanges[k]?.current !== undefined)) return;
  for (const token of actor.getActiveTokens(true)) {
    applyRingColor(token);
    refreshHealthArc(token);
  }
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

export function registerRingHooks() {
  Hooks.on("drawToken",    onDrawToken);
  Hooks.on("refreshToken", onRefreshToken);
  Hooks.on("hoverToken",   onHoverToken);
  Hooks.on("destroyToken", removeHealthArc);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", (actor, changes, options) => {
    onUpdateActor(actor, changes, options);
    onUpdateActorRefresh(actor, changes);
  });
  Hooks.on("updateToken", (tokenDoc, changes) => {
    if (changes?.ring?.enabled !== undefined) {
      const token = tokenDoc.object;
      if (token) applyRingColor(token);
    }
  });
}
