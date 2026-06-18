const MODULE_ID = "dsa5-dynamic-ring";

/* ---------------------------------------- */
/*  Settings                                */
/* ---------------------------------------- */

export function registerGCSettings() {
  game.settings.register(MODULE_ID, "gcAutoClose", {
    name: `${MODULE_ID}.settings.gcAutoClose.name`,
    hint: `${MODULE_ID}.settings.gcAutoClose.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
}

/* ---------------------------------------- */
/*  Group Check Window                      */
/* ---------------------------------------- */

class GroupCheckWindow extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    window: { resizable: true },
    position: { width: 420 },
  };

  static PARTS = {
    main: { template: "systems/dsa5/templates/chat/roll/groupcheck.hbs" },
  };

  static #instances = new Map();

  constructor(messageId, options = {}) {
    super(options);
    this.messageId = messageId;
    this._listenersAttached = false;
  }

  get title() {
    return game.i18n.localize("HELP.groupcheck");
  }

  async _prepareContext(_options) {
    return game.messages.get(this.messageId)?.flags?.gc ?? {};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Give the section the .message class and data-message-id so that DSA5's
    // chat listeners can locate the message via $(el).parents('.message').
    const section = this.element.querySelector('[data-application-part="main"]');
    if (section) {
      section.classList.add("message");
      section.dataset.messageId = this.messageId;
    }
    if (!this._listenersAttached) {
      game.dsa5?.apps?.GroupCheck?.chatListeners?.($(this.element));
      this._listenersAttached = true;
    }
  }

  _onClose(options) {
    GroupCheckWindow.#instances.delete(this.messageId);
    return super._onClose(options);
  }

  static open(message) {
    const existing = GroupCheckWindow.#instances.get(message.id);
    if (existing) { existing.bringToTop(); return; }
    const win = new GroupCheckWindow(message.id);
    GroupCheckWindow.#instances.set(message.id, win);
    win.render({ force: true });
  }

  static refresh(message) {
    const win = GroupCheckWindow.#instances.get(message.id);
    if (!win) return;
    if (game.settings.get(MODULE_ID, "gcAutoClose") && message.flags?.gc?.openRolls === 0) {
      win.close();
      return;
    }
    win.render();
  }
}

/* ---------------------------------------- */
/*  Hook handlers                           */
/* ---------------------------------------- */

function onCreateChatMessage(message) {
  if (!message.flags?.gc) return;
  GroupCheckWindow.open(message);
}

function onUpdateChatMessage(message) {
  if (!message.flags?.gc) return;
  GroupCheckWindow.refresh(message);
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

export function registerGCHooks() {
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("updateChatMessage", onUpdateChatMessage);
}
