(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // src/module.js
  var MODULE_ID = "pf2e-toolbelt";

  // src/shared/libwrapper.js
  function registerWrapper(path, callback, type = "WRAPPER") {
    return libWrapper.register(MODULE_ID, path, callback, type);
  }
  __name(registerWrapper, "registerWrapper");
  function unregisterWrapper(id) {
    libWrapper.unregister(MODULE_ID, id);
  }
  __name(unregisterWrapper, "unregisterWrapper");
  function wrapperError(feature, path) {
    console.error(
      `an error occured in the feature '${feature}' of the module '${MODULE_ID}' with the wrapper: '${path}'`
    );
  }
  __name(wrapperError, "wrapperError");

  // src/shared/localize.js
  function localize(...args) {
    let [key, data] = args;
    key = `${MODULE_ID}.${key}`;
    if (data)
      return game.i18n.format(key, data);
    return game.i18n.localize(key);
  }
  __name(localize, "localize");
  function hasLocalization(key) {
    return game.i18n.has(`${MODULE_ID}.${key}`, false);
  }
  __name(hasLocalization, "hasLocalization");
  function localizePath(key) {
    return `${MODULE_ID}.${key}`;
  }
  __name(localizePath, "localizePath");
  function subLocalize(subKey) {
    const fn = /* @__PURE__ */ __name((...args) => localize(`${subKey}.${args[0]}`, args[1]), "fn");
    Object.defineProperties(fn, {
      warn: {
        value: (...args) => warn(`${subKey}.${args[0]}`, args[1], args[2]),
        enumerable: false,
        configurable: false
      },
      info: {
        value: (...args) => info(`${subKey}.${args[0]}`, args[1], args[2]),
        enumerable: false,
        configurable: false
      },
      error: {
        value: (...args) => error(`${subKey}.${args[0]}`, args[1], args[2]),
        enumerable: false,
        configurable: false
      },
      has: {
        value: (key) => hasLocalization(`${subKey}.${key}`),
        enumerable: false,
        configurable: false
      },
      path: {
        value: (key) => localizePath(`${subKey}.${key}`),
        enumerable: false,
        configurable: false
      },
      template: {
        value: (key, { hash }) => fn(key, hash),
        enumerable: false,
        configurable: false
      }
    });
    return fn;
  }
  __name(subLocalize, "subLocalize");

  // src/shared/notification.js
  function notify(str, arg1, arg2, arg3) {
    const type = typeof arg1 === "string" ? arg1 : "info";
    const data = typeof arg1 === "object" ? arg1 : typeof arg2 === "object" ? arg2 : void 0;
    const permanent = typeof arg1 === "boolean" ? arg1 : typeof arg2 === "boolean" ? arg2 : arg3 ?? false;
    ui.notifications.notify(localize(str, data), type, { permanent });
  }
  __name(notify, "notify");
  function warn(...args) {
    const [str, arg1, arg2] = args;
    notify(str, "warning", arg1, arg2);
  }
  __name(warn, "warn");
  function info(...args) {
    const [str, arg1, arg2] = args;
    notify(str, "info", arg1, arg2);
  }
  __name(info, "info");
  function error(...args) {
    const [str, arg1, arg2] = args;
    notify(str, "error", arg1, arg2);
  }
  __name(error, "error");

  // src/shared/pf2e/item.js
  var HANDWRAPS_SLUG = "handwraps-of-mighty-blows";
  function canBeInvested(item) {
    return item.traits.has("invested");
  }
  __name(canBeInvested, "canBeInvested");
  function hasWornSlot(item) {
    return item.system.equipped.inSlot != null;
  }
  __name(hasWornSlot, "hasWornSlot");
  function isWornAs(item) {
    return item.system.usage.type === "worn" && item.system.equipped.inSlot;
  }
  __name(isWornAs, "isWornAs");
  function isInvestedOrWornAs(item) {
    return item.isInvested || isWornAs(item);
  }
  __name(isInvestedOrWornAs, "isInvestedOrWornAs");
  function isHandwrapsOfMightyBlows(item) {
    return item.isOfType("weapon") && item.slug === HANDWRAPS_SLUG && item.category === "unarmed";
  }
  __name(isHandwrapsOfMightyBlows, "isHandwrapsOfMightyBlows");
  function isHeld(item) {
    return item.system.usage.type === "held";
  }
  __name(isHeld, "isHeld");
  function isTwoHanded(item) {
    return isHeld(item) && item.system.usage.value === "held-in-two-hands";
  }
  __name(isTwoHanded, "isTwoHanded");
  function isOneHanded(item) {
    return isHeld(item) && item.system.usage.value === "held-in-one-hand";
  }
  __name(isOneHanded, "isOneHanded");
  function inSlotValue(item, value) {
    const usage = item.system.usage;
    return usage.type === "worn" && usage.where ? value : void 0;
  }
  __name(inSlotValue, "inSlotValue");
  function toggleInvestedValue(item, invest) {
    const value = invest ?? !item.system.equipped.invested;
    return item.traits.has("invested") ? value : void 0;
  }
  __name(toggleInvestedValue, "toggleInvestedValue");
  function itemCarryUpdate(item, { carryType = "worn", handsHeld = 0, inSlot, invested, containerId }) {
    const update = {
      _id: item.id,
      system: {
        equipped: {
          carryType,
          handsHeld,
          inSlot: inSlotValue(item, inSlot),
          invested: toggleInvestedValue(item, invested)
        }
      }
    };
    if (containerId !== void 0) {
      update.system.containerId = containerId;
    }
    return update;
  }
  __name(itemCarryUpdate, "itemCarryUpdate");

  // src/shared/settings.js
  function getSetting(setting) {
    return game.settings.get(MODULE_ID, setting);
  }
  __name(getSetting, "getSetting");
  function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value);
  }
  __name(setSetting, "setSetting");
  function choiceSettingIsEnabled(setting) {
    return getSetting(setting) !== "disabled";
  }
  __name(choiceSettingIsEnabled, "choiceSettingIsEnabled");

  // src/features/arp.js
  var PREPARE_WEAPON_DATA = "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData";
  var PREPARE_WEAPON_DERIVED_DATA = "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareDerivedData";
  var PREPARE_ARMOR_DATA = "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData";
  var PREPARE_ARMOR_DERIVED_DATA = "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareDerivedData";
  function registerArp() {
    return {
      settings: [
        {
          name: "auto-runes",
          type: String,
          default: "disabled",
          choices: ["disabled", "force", "lower"],
          requiresReload: true
        }
      ],
      conflicts: ["pf2e-arp"],
      init: () => {
        const setting = getSetting("auto-runes");
        if (setting === "disabled")
          return;
        registerWrapper(PREPARE_WEAPON_DATA, onPrepareWeaponData, "WRAPPER");
        registerWrapper(
          PREPARE_WEAPON_DERIVED_DATA,
          onPrepareWeaponDerivedData,
          "WRAPPER"
        );
        registerWrapper(PREPARE_ARMOR_DATA, onPrepareArmorData, "WRAPPER");
        registerWrapper(
          PREPARE_ARMOR_DERIVED_DATA,
          onPrepareArmorDerivedData,
          "WRAPPER"
        );
        if (setting === "force") {
          Hooks.on("renderPhysicalItemSheetPF2e", renderPhysicalItemSheetPF2e);
        }
      },
      ready: (isGM) => {
        if (isGM && choiceSettingIsEnabled("auto-runes") && game.settings.get("pf2e", "automaticBonusVariant") !== "noABP") {
          game.settings.set("pf2e", "automaticBonusVariant", "noABP");
          info("arp.forceVariant");
        }
      }
    };
  }
  __name(registerArp, "registerArp");
  function isValidActor(actor, isCharacter = false) {
    return actor && !actor.getFlag("pf2e", "disableABP") && (!isCharacter || actor.isOfType("character"));
  }
  __name(isValidActor, "isValidActor");
  var WEAPON_POTENCY_PRICE = {
    1: 35,
    2: 935,
    3: 8935,
    4: 8935
  };
  var WEAPON_STRIKING_PRICE = {
    1: 65,
    2: 1065,
    3: 31065
  };
  function isShieldWeapon(weapon) {
    return ["shield-boss", "shield-spikes"].includes(
      weapon._source.system.baseItem
    );
  }
  __name(isShieldWeapon, "isShieldWeapon");
  function isValidWeapon(weapon) {
    const traits = weapon._source.system.traits.value;
    const { group, category, slug } = weapon._source.system;
    if (category === "unarmed" && slug !== HANDWRAPS_SLUG) {
      return !!weapon.actor.itemTypes.weapon.find(
        (weapon2) => weapon2.slug === HANDWRAPS_SLUG && weapon2.category === "unarmed" && weapon2.isEquipped && weapon2.isInvested
      );
    }
    return (group !== "shield" || isShieldWeapon(weapon)) && !traits.includes("alchemical") && !traits.includes("bomb");
  }
  __name(isValidWeapon, "isValidWeapon");
  function onPrepareWeaponData(wrapped) {
    try {
      const actor = this.actor;
      if (!isValidActor(actor, true) || !isValidWeapon(this))
        return wrapped();
      const traits = this._source.system.traits.value;
      if (traits.includes("alchemical") && traits.includes("bomb"))
        return wrapped();
      const level = actor.level;
      const forceUpdate = getSetting("auto-runes") === "force";
      const expectedPotency = level < 2 ? null : level < 10 ? 1 : level < 16 ? 2 : 3;
      const expectedStriking = level < 4 ? null : level < 12 ? 1 : level < 19 ? 2 : 3;
      if (this.system.runes.potency <= expectedPotency || forceUpdate) {
        this.system.runes.potency = expectedPotency;
      }
      if (this.system.runes.striking <= expectedStriking || forceUpdate) {
        this.system.runes.striking = expectedStriking;
      }
    } catch {
      wrapperError("auto-runes", PREPARE_WEAPON_DATA);
    }
    wrapped();
  }
  __name(onPrepareWeaponData, "onPrepareWeaponData");
  function onPrepareWeaponDerivedData(wrapped) {
    wrapped();
    try {
      if (!isValidActor(this.actor) || this.isSpecific || !isValidWeapon(this))
        return;
      let coins = this.price.value.toObject();
      if (!coins.gp)
        return;
      const potency = this.system.runes.potency;
      if (potency)
        coins.gp -= WEAPON_POTENCY_PRICE[potency];
      const striking = this.system.runes.striking;
      if (striking)
        coins.gp -= WEAPON_STRIKING_PRICE[striking];
      coins = new game.pf2e.Coins(coins);
      if ((potency || striking) && !this.system.runes.property.length) {
        coins = coins.add(this._source.system.price.value);
      }
      this.system.price.value = coins;
    } catch {
      wrapperError("auto-runes", PREPARE_WEAPON_DERIVED_DATA);
    }
  }
  __name(onPrepareWeaponDerivedData, "onPrepareWeaponDerivedData");
  var ARMOR_POTENCY_PRICE = {
    1: 160,
    2: 1060,
    3: 20560,
    4: 20560
  };
  var ARMOR_RESILIENCY_PRICE = {
    1: 340,
    2: 3440,
    3: 49440
  };
  function isValidArmor(armor) {
    return true;
  }
  __name(isValidArmor, "isValidArmor");
  function onPrepareArmorData(wrapped) {
    try {
      const actor = this.actor;
      if (!isValidActor(actor, true) || !isValidArmor(this))
        return wrapped();
      const level = actor.level;
      const forceUpdate = getSetting("auto-runes") === "force";
      const expectedPotency = level < 5 ? null : level < 11 ? 1 : level < 18 ? 2 : 3;
      const expectedResilient = level < 8 ? null : level < 14 ? 1 : level < 20 ? 2 : 3;
      if (this.system.runes.potency <= expectedPotency || forceUpdate) {
        this.system.runes.potency = expectedPotency;
      }
      if (this.system.runes.resilient <= expectedResilient || forceUpdate) {
        this.system.runes.resilient = expectedResilient;
      }
    } catch {
      wrapperError("auto-runes", PREPARE_ARMOR_DATA);
    }
    wrapped();
  }
  __name(onPrepareArmorData, "onPrepareArmorData");
  function onPrepareArmorDerivedData(wrapped) {
    wrapped();
    try {
      if (!isValidActor(this.actor) || this.isSpecific || !isValidArmor(this))
        return;
      let coins = this.price.value.toObject();
      if (!coins.gp)
        return;
      const potency = this.system.runes.potency;
      if (potency)
        coins.gp -= ARMOR_POTENCY_PRICE[potency];
      const resiliency = this.system.runes.resilient;
      if (resiliency)
        coins.gp -= ARMOR_RESILIENCY_PRICE[resiliency];
      coins = new game.pf2e.Coins(coins);
      if ((potency || resiliency) && !this.system.runes.property.length) {
        coins = coins.add(this._source.system.price.value);
      }
      this.system.price.value = coins;
    } catch {
      wrapperError("auto-runes", PREPARE_ARMOR_DERIVED_DATA);
    }
  }
  __name(onPrepareArmorDerivedData, "onPrepareArmorDerivedData");
  function renderPhysicalItemSheetPF2e(sheet, html) {
    const item = sheet.item;
    if (!item || !item.isOfType("weapon", "armor") || !isValidActor(item.actor, true))
      return;
    const lookups = ["potency", "striking", "resilient"].map((x) => `[name="system.runes.${x}"]`).join(", ");
    html.find(`[data-tab=details] fieldset .form-group:has(${lookups})`).hide();
  }
  __name(renderPhysicalItemSheetPF2e, "renderPhysicalItemSheetPF2e");

  // src/shared/hook.js
  function createHook(event, listener, callback = () => {
  }) {
    let HOOK = null;
    return (value, otherSettings = [], skipCallback = false) => {
      const others = typeof otherSettings === "string" ? [otherSettings] : otherSettings;
      const settingValue = value || others.some((s) => getSetting(s));
      if (settingValue && !HOOK) {
        HOOK = Hooks.on(event, listener);
      } else if (!settingValue && HOOK) {
        Hooks.off(event, HOOK);
        HOOK = null;
      }
      if (!skipCallback)
        callback(settingValue);
    };
  }
  __name(createHook, "createHook");
  function createChoicesHook(event, listener, callback = () => {
  }) {
    let HOOK = null;
    return (value, skipCallback = false) => {
      if (value === "disabled" && HOOK) {
        Hooks.off(event, HOOK);
        HOOK = null;
      } else if (value !== "disabled" && !HOOK) {
        HOOK = Hooks.on(event, listener);
      }
      if (!skipCallback)
        callback(value);
    };
  }
  __name(createChoicesHook, "createChoicesHook");
  function registerUpstreamHook(hook, fn) {
    const id = Hooks.on(hook, fn);
    const index = Hooks.events[hook].findIndex((x) => x.id === id);
    if (index !== 0) {
      const [hooked] = Hooks.events[hook].splice(index, 1);
      Hooks.events[hook].unshift(hooked);
    }
    return id;
  }
  __name(registerUpstreamHook, "registerUpstreamHook");

  // src/features/debug.js
  var appHook = createHook("renderApplication", onRender);
  var actorHook = createHook("renderActorSheet", onRender);
  var itemHook = createHook("renderItemSheet", onRender);
  function registerDebug() {
    return {
      settings: [
        {
          name: "debug",
          type: Boolean,
          default: false,
          config: false,
          scope: "client",
          onChange: (value) => setup(value)
        }
      ],
      init: () => {
        setup();
      }
    };
  }
  __name(registerDebug, "registerDebug");
  function setup(value) {
    const enabled2 = value ?? getSetting("debug");
    appHook(enabled2);
    actorHook(enabled2);
    itemHook(enabled2);
  }
  __name(setup, "setup");
  function onRender(app, html) {
    const link = html.find(".document-id-link")[0];
    if (!link)
      return;
    link.addEventListener(
      "click",
      (event) => {
        if (!event.shiftKey)
          return;
        const obj = app.object;
        if (!obj)
          return;
        event.preventDefault();
        event.stopPropagation();
        const type = obj.type;
        let i = 2;
        let variable = type;
        while (window[variable]) {
          variable = `${type}${i++}`;
        }
        window[variable] = obj;
        console.log(variable, obj);
      },
      true
    );
  }
  __name(onRender, "onRender");

  // src/features/effects.js
  var setHook = createHook(
    "renderEffectsPanel",
    renderEffectsPanel,
    refreshEffectsPanel
  );
  function registerEffectsPanelHelper() {
    return {
      settings: [
        {
          name: "effect-remove",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setHook(value, "condition-sheet")
        },
        {
          name: "condition-sheet",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setHook(value, "effect-remove")
        }
      ],
      conflicts: ["pf2e-effect-description"],
      init: () => {
        setHook(false, ["effect-remove", "condition-sheet"]);
      }
    };
  }
  __name(registerEffectsPanelHelper, "registerEffectsPanelHelper");
  function refreshEffectsPanel() {
    game.pf2e.effectPanel?.render();
  }
  __name(refreshEffectsPanel, "refreshEffectsPanel");
  function renderEffectsPanel(panel, html) {
    const removeRow = `<div>${localize("effects.remove")}</div>`;
    const editIcon = `<a data-action="edit" data-tooltip="Edit Item"><i class="fa-solid fa-fw fa-pencil"></i></a>`;
    const effectPanels = html.find(".effect-item[data-item-id]").toArray();
    for (const effectPanel of effectPanels) {
      const id = effectPanel.dataset.itemId;
      const effect = panel.actor?.items.get(id);
      if (!effect)
        continue;
      if (getSetting("effect-remove") && !effect.isLocked && effect.badge && effect.badge.type === "counter") {
        effectPanel.querySelector(".effect-info .instructions").insertAdjacentHTML("beforeend", removeRow);
        effectPanel.querySelector(".icon").addEventListener(
          "contextmenu",
          (event) => onRemoveEffect(event, panel),
          true
        );
      }
      if (getSetting("condition-sheet") && effect.isOfType("condition")) {
        const h1 = effectPanel.querySelector(".effect-info > h1");
        h1.insertAdjacentHTML("beforeend", editIcon);
        h1.querySelector('[data-action="edit"]').addEventListener(
          "click",
          (event) => onConditionSheet(event, panel)
        );
      }
    }
  }
  __name(renderEffectsPanel, "renderEffectsPanel");
  function onConditionSheet(event, panel) {
    const effect = getEffect(event, panel);
    if (!effect?.isOfType("condition"))
      return;
    event.preventDefault();
    effect.sheet.render(true);
  }
  __name(onConditionSheet, "onConditionSheet");
  function onRemoveEffect(event, panel) {
    if (!event.shiftKey)
      return;
    const effect = getEffect(event, panel);
    if (!effect || effect.isLocked || !effect.badge || effect.badge.type !== "counter")
      return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    effect.delete();
  }
  __name(onRemoveEffect, "onRemoveEffect");
  function getEffect(event, panel) {
    const target = event.currentTarget;
    const effect = target.closest(".effect-item[data-item-id]");
    const id = effect.dataset.itemId;
    return panel.actor?.items.get(id);
  }
  __name(getEffect, "getEffect");

  // src/apps/giveth/popup.js
  var MoveLootPopup = class extends FormApplication {
    static {
      __name(this, "MoveLootPopup");
    }
    constructor(object, options, callback) {
      super(object, options);
      this.onSubmitCallback = callback;
    }
    async getData() {
      const [prompt, buttonLabel] = this.options.isPurchase ? ["PF2E.loot.PurchaseLootMessage", "PF2E.loot.PurchaseLoot"] : ["PF2E.loot.MoveLootMessage", "PF2E.loot.MoveLoot"];
      return {
        ...await super.getData(),
        maxQuantity: this.options.maxQuantity,
        newStack: this.options.newStack,
        lockStack: this.options.lockStack,
        prompt,
        buttonLabel
      };
    }
    static get defaultOptions() {
      return {
        ...FormApplication.defaultOptions,
        id: "MoveLootPopup",
        classes: [],
        title: game.i18n.localize("PF2E.loot.MoveLootPopupTitle"),
        template: "systems/pf2e/templates/popups/loot/move-loot-popup.hbs",
        width: "auto",
        maxQuantity: 1,
        newStack: false,
        lockStack: false,
        isPurchase: false
      };
    }
    async _updateObject(_event, formData) {
      this.onSubmitCallback(formData.quantity, formData.newStack);
    }
  };

  // src/shared/misc.js
  function localeCompare(a, b) {
    return a.localeCompare(b, game.i18n.lang);
  }
  __name(localeCompare, "localeCompare");
  function refreshCharacterSheets(actor) {
    for (const win of Object.values(ui.windows)) {
      const winActor = win.actor;
      if (!(win instanceof ActorSheet) || !winActor.isOfType("character"))
        continue;
      if (!actor || actor === winActor)
        win.render();
    }
  }
  __name(refreshCharacterSheets, "refreshCharacterSheets");
  function compareArrays(arr1, arr2) {
    if (arr1.length !== arr2.length)
      return false;
    const clonedArr2 = arr2.slice();
    for (const arr1Value of arr1) {
      const index = clonedArr2.findIndex((arr2Value) => arr1Value === arr2Value);
      if (index === -1)
        return false;
      clonedArr2.splice(index, 1);
    }
    return true;
  }
  __name(compareArrays, "compareArrays");
  function ordinalString(value) {
    const pluralRules = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" });
    const suffix = game.i18n.localize(
      `PF2E.OrdinalSuffixes.${pluralRules.select(value)}`
    );
    return game.i18n.format("PF2E.OrdinalNumber", { value, suffix });
  }
  __name(ordinalString, "ordinalString");
  function isInstanceOf(obj, name) {
    if (typeof obj !== "object")
      return false;
    let cursor = Reflect.getPrototypeOf(obj);
    while (cursor) {
      if (cursor.constructor.name === name)
        return true;
      cursor = Reflect.getPrototypeOf(cursor);
    }
    return false;
  }
  __name(isInstanceOf, "isInstanceOf");
  function setInMemory(doc, key, value) {
    return setProperty(doc, `modules.${MODULE_ID}.${key}`, value);
  }
  __name(setInMemory, "setInMemory");
  function getInMemory(doc, key) {
    return getProperty(doc, `modules.${MODULE_ID}.${key}`);
  }
  __name(getInMemory, "getInMemory");
  function deleteInMemory(doc, key) {
    const split = `modules.${MODULE_ID}.${key}`.split(".");
    const last = split.pop();
    let cursor = doc;
    for (const key2 of split) {
      cursor = cursor[key2];
      if (!cursor)
        return true;
    }
    return delete cursor[last];
  }
  __name(deleteInMemory, "deleteInMemory");
  function calculateDistanceBetweenPoints(x1, y1, x2, y2) {
    const x = x2 - x1;
    const y = y2 - y1;
    return Math.sqrt(x * x + y * y);
  }
  __name(calculateDistanceBetweenPoints, "calculateDistanceBetweenPoints");
  function getElementIndex(el) {
    return Array.from(el.parentElement.children).indexOf(el);
  }
  __name(getElementIndex, "getElementIndex");
  function indexIsValid(index) {
    return index !== void 0 && index !== -1;
  }
  __name(indexIsValid, "indexIsValid");

  // src/shared/path.js
  function templatePath(...path) {
    const pathStr = path.filter((x) => typeof x === "string").join("/");
    return `modules/${MODULE_ID}/templates/${pathStr}.hbs`;
  }
  __name(templatePath, "templatePath");

  // src/shared/actor.js
  var registered = {
    wrapperIds: [],
    tabs: new Collection()
  };
  var CHARACTER_SHEET_INNER_RENDER = "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner";
  var CHARACTER_SHEET_ACTIVE_LISTENERS = "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners";
  function isPlayedActor(actor) {
    return actor && !actor.pack && actor.id && game.actors.has(actor.id);
  }
  __name(isPlayedActor, "isPlayedActor");
  function registerCharacterSheetExtraTab(options) {
    if (!registered.wrapperIds.length) {
      registered.wrapperIds = [
        registerWrapper(CHARACTER_SHEET_INNER_RENDER, characterSheetInnerRender),
        registerWrapper(
          CHARACTER_SHEET_ACTIVE_LISTENERS,
          characterSheetActiveListeners
        )
      ];
    }
    registered.tabs.set(options.tabName, options);
  }
  __name(registerCharacterSheetExtraTab, "registerCharacterSheetExtraTab");
  function unregisterCharacterSheetExtraTab(tabName) {
    registered.tabs.delete(tabName);
    if (registered.wrapperIds.length && !registered.tabs.size) {
      for (const wrapperId of registered.wrapperIds) {
        unregisterWrapper(wrapperId);
      }
      registered.wrapperIds = [];
    }
  }
  __name(unregisterCharacterSheetExtraTab, "unregisterCharacterSheetExtraTab");
  async function characterSheetInnerRender(wrapped, data) {
    const inner = await wrapped(data);
    const actor = this.actor;
    if (!registered.tabs.size || !isPlayedActor(actor)) {
      return inner;
    }
    const element = this.element;
    for (const {
      tabName,
      getData: getData3,
      templateFolder,
      onRender: onRender3
    } of registered.tabs) {
      const innerTab = getCharacterSheetTab(inner, tabName);
      const tabData = await getData3(
        actor,
        this,
        getCharacterSheetTab(element, tabName)
      );
      const template = await renderTemplate(
        templatePath(templateFolder),
        tabData
      );
      if (onRender3) {
        await onRender3(actor, this, inner);
      }
      if (getInMemory(this, `${tabName}.toggled`)) {
        innerTab.addClass("toggled");
      }
      innerTab.children(":first").after(template);
    }
    return inner;
  }
  __name(characterSheetInnerRender, "characterSheetInnerRender");
  function characterSheetActiveListeners(wrapped, inner) {
    wrapped(inner);
    const actor = this.actor;
    if (!registered.tabs.size || !isPlayedActor(actor)) {
      return;
    }
    for (const { tabName, addEvents: addEvents4 } of registered.tabs) {
      inner.find(`nav.sheet-navigation .item[data-tab=${tabName}]`).on(
        "click",
        (event) => onCharacterSheetTabBtnToggle(event, inner, this, tabName)
      );
      const tab = getCharacterSheetTab(inner, tabName);
      addEvents4(tab.find("> .alternate"), this, actor, inner);
    }
  }
  __name(characterSheetActiveListeners, "characterSheetActiveListeners");
  function getCharacterSheetTab(html, tabName) {
    return html.find(
      `section.sheet-body .sheet-content > .tab[data-tab=${tabName}]`
    );
  }
  __name(getCharacterSheetTab, "getCharacterSheetTab");
  function onCharacterSheetTabBtnToggle(event, html, sheet, tabName) {
    event.preventDefault();
    const tab = getCharacterSheetTab(html, tabName);
    if (tab.hasClass("active")) {
      tab.toggleClass("toggled");
      tab.scrollTop(0);
      setInMemory(sheet, `${tabName}.toggled`, tab.hasClass("toggled"));
    }
  }
  __name(onCharacterSheetTabBtnToggle, "onCharacterSheetTabBtnToggle");

  // src/shared/flags.js
  function getFlag(doc, key, fallback) {
    return doc.getFlag(MODULE_ID, key) ?? fallback;
  }
  __name(getFlag, "getFlag");
  function setFlag(doc, key, value) {
    return doc.setFlag(MODULE_ID, key, value);
  }
  __name(setFlag, "setFlag");
  function unsetFlag(doc, key) {
    return doc.unsetFlag(MODULE_ID, key);
  }
  __name(unsetFlag, "unsetFlag");
  function updateSourceFlag(doc, key, value) {
    return doc.updateSource({
      [`flags.${MODULE_ID}.${key}`]: value
    });
  }
  __name(updateSourceFlag, "updateSourceFlag");
  function moduleFlagUpdate(update, key, value) {
    update[`flags.${MODULE_ID}.${key}`] = value;
  }
  __name(moduleFlagUpdate, "moduleFlagUpdate");

  // src/shared/chat.js
  function getChatMessageClass() {
    return CONFIG.ChatMessage.documentClass;
  }
  __name(getChatMessageClass, "getChatMessageClass");
  function* latestChatMessages(nb, fromMessage) {
    const messages = game.messages.contents;
    const start = (fromMessage ? messages.findLastIndex((m) => m === fromMessage) : messages.length) - 1;
    for (let i = start; i >= start - nb; i--) {
      const message = messages[i];
      if (!message)
        return;
      yield message;
    }
  }
  __name(latestChatMessages, "latestChatMessages");
  function chatUUID(uuid, label, fake = false) {
    if (fake) {
      return `<span style="background: #DDD; padding: 1px 4px; border: 1px solid var(--color-border-dark-tertiary);
border-radius: 2px; white-space: nowrap; word-break: break-all;">${label}</span>`;
    }
    if (label)
      return `@UUID[${uuid}]{${label}}`;
    return `@UUID[${uuid}]`;
  }
  __name(chatUUID, "chatUUID");
  function bindOnPreCreateSpellDamageChatMessage(originalMessage) {
    const messageId = originalMessage.id;
    const save = getFlag(originalMessage, "target.save");
    if (!save)
      return;
    Hooks.once("preCreateChatMessage", (message) => {
      updateSourceFlag(message, "target.messageId", messageId);
      updateSourceFlag(message, "target.save", save);
    });
  }
  __name(bindOnPreCreateSpellDamageChatMessage, "bindOnPreCreateSpellDamageChatMessage");

  // src/shared/socket.js
  function socketOn(callback) {
    game.socket.on(`module.${MODULE_ID}`, callback);
  }
  __name(socketOn, "socketOn");
  function socketOff(callback) {
    game.socket.off(`module.${MODULE_ID}`, callback);
  }
  __name(socketOff, "socketOff");
  function socketEmit(packet) {
    game.socket.emit(`module.${MODULE_ID}`, packet);
  }
  __name(socketEmit, "socketEmit");

  // src/shared/user.js
  function isActiveGM() {
    return game.user === game.users.activeGM;
  }
  __name(isActiveGM, "isActiveGM");
  function isUserGM() {
    const user = game.data.users.find((x) => x._id === game.data.userId);
    return user && user.role >= CONST.USER_ROLES.GAMEMASTER;
  }
  __name(isUserGM, "isUserGM");
  function isGMOnline() {
    return game.users.some((user) => user.active && user.isGM);
  }
  __name(isGMOnline, "isGMOnline");
  function getCharacterOwner(actor, connected = false) {
    if (connected)
      return game.users.find((x) => x.active && x.character === actor);
    return game.users.find((x) => x.character === actor);
  }
  __name(getCharacterOwner, "getCharacterOwner");
  function getActiveOwner(doc) {
    const activeOwners = game.users.filter(
      (user) => user.active && !user.isGM && doc.testUserPermission(user, "OWNER")
    );
    activeOwners.sort((a, b) => a.id > b.id ? 1 : -1);
    return activeOwners[0] || null;
  }
  __name(getActiveOwner, "getActiveOwner");
  function isActiveOwner(doc) {
    return getActiveOwner(doc) === game.user;
  }
  __name(isActiveOwner, "isActiveOwner");
  function getOwner(doc, connected = false) {
    if (connected)
      return game.users.find(
        (x) => x.active && doc.testUserPermission(x, "OWNER")
      );
    return game.users.find((x) => doc.testUserPermission(x, "OWNER"));
  }
  __name(getOwner, "getOwner");

  // src/features/giveth.js
  var enabled = false;
  var CANVAS_HOOK = null;
  function registerGiveth() {
    return {
      settings: [
        {
          name: "giveth",
          type: String,
          default: "disabled",
          choices: ["disabled", "enabled", "no-message"],
          onChange: setup2
        }
      ],
      conflicts: ["pf2e-giveth"],
      ready: (isGM) => {
        if (getSetting("giveth") !== "disabled")
          setup2(true);
      }
    };
  }
  __name(registerGiveth, "registerGiveth");
  function setup2(value) {
    const isGM = game.user.isGM;
    if (value === "disabled" && enabled) {
      if (isGM)
        socketOff(onSocket);
      else if (CANVAS_HOOK) {
        Hooks.off("dropCanvasData", CANVAS_HOOK);
        CANVAS_HOOK = null;
      }
      enabled = false;
    } else if (value !== "disabled" && !enabled) {
      if (isGM)
        socketOn(onSocket);
      else if (!CANVAS_HOOK)
        CANVAS_HOOK = registerUpstreamHook("dropCanvasData", onDropCanvasData);
      enabled = true;
    }
  }
  __name(setup2, "setup");
  function onSocket(packet) {
    if (!isActiveGM())
      return;
    if (packet.type === "giveth-condition")
      takethCondition(packet);
    else if (packet.type === "giveth-effect")
      takethEffect(packet);
    else
      takethPhysical(packet);
  }
  __name(onSocket, "onSocket");
  function onDropCanvasData(canvas2, data) {
    if (!isGMOnline())
      return true;
    const details = getDetailsFromData(data);
    if (!details)
      return true;
    const target = canvas2.tokens.placeables.slice().filter((token) => {
      if (!token.document.actorLink)
        return false;
      const target2 = token.actor;
      if (!isValidActor2(target2, data.actorId) || target2.isOwner)
        return false;
      const maximumX = token.x + (token.hitArea?.right ?? 0);
      const maximumY = token.y + (token.hitArea?.bottom ?? 0);
      return data.x >= token.x && data.y >= token.y && data.x <= maximumX && data.y <= maximumY;
    }).sort((a, b) => b.document.sort - a.document.sort).at(0)?.actor;
    if (!target)
      return true;
    giveth(details.actor, target, details.item, details.value);
    return false;
  }
  __name(onDropCanvasData, "onDropCanvasData");
  function giveth(origin, target, item, value) {
    const ownerId = origin.id;
    const targetId = target.id;
    const isIndex = !(item instanceof Item);
    if (!isIndex && item.isOfType("physical")) {
      const qty = item.quantity;
      if (qty < 1)
        return warn("giveth.notification.zero");
      if (qty === 1)
        return sendPhysicalRequest(ownerId, targetId, item.id, 1, false);
      new MoveLootPopup(
        origin,
        { maxQuantity: qty, lockStack: false, isPurchase: false },
        (qty2, stack) => {
          sendPhysicalRequest(ownerId, targetId, item.id, qty2, stack);
        }
      ).render(true);
    } else {
      const uuid = isIndex ? `Compendium.${item.pack}.${item._id}` : item.uuid;
      if (item.type === "condition") {
        socketEmit({
          type: "giveth-condition",
          targetId,
          value: value ?? 1,
          uuid
        });
      } else {
        socketEmit({
          type: "giveth-effect",
          targetId,
          uuid
        });
      }
    }
  }
  __name(giveth, "giveth");
  function sendPhysicalRequest(ownerId, targetId, itemId, qty, stack) {
    socketEmit({
      type: "giveth-physical",
      ownerId,
      targetId,
      itemId,
      qty,
      stack
    });
  }
  __name(sendPhysicalRequest, "sendPhysicalRequest");
  function isValidActor2(actor, id) {
    if (!isPlayedActor(actor) || id && actor.id === id)
      return false;
    return actor.hasPlayerOwner && !actor.isToken && actor.isOfType("character", "npc", "vehicle");
  }
  __name(isValidActor2, "isValidActor");
  function getDetailsFromData(data) {
    if (data.tokenId || data.type !== "Item" || !data.uuid)
      return;
    const item = fromUuidSync(data.uuid);
    if (!item)
      return;
    let actor = item.actor;
    if (!actor) {
      const actorUUID = data.context?.origin.actor;
      actor = actorUUID ? fromUuidSync(actorUUID) : null;
    }
    if (!isValidActor2(actor) || !actor.isOwner)
      return;
    const isIndex = !(item instanceof Item);
    if (isIndex && item.pack && ["effect", "condition"].includes(item.type))
      return { actor, item, value: data.value };
    if (!isIndex && item.isOfType("physical", "effect"))
      return { actor, item, value: data.value };
  }
  __name(getDetailsFromData, "getDetailsFromData");
  async function takethCondition({ targetId, uuid, value }) {
    const target = game.actors.get(targetId);
    if (!target)
      return;
    const item = await fromUuid(uuid);
    if (!item)
      return;
    target.increaseCondition(item.slug, { min: value });
  }
  __name(takethCondition, "takethCondition");
  async function takethEffect({ targetId, uuid }) {
    const target = game.actors.get(targetId);
    if (!target)
      return;
    const item = await fromUuid(uuid);
    if (!item)
      return;
    const source = item.clone({ "system.tokenIcon.show": true, "system.unidentified": false }).toObject();
    target.createEmbeddedDocuments("Item", [source]);
  }
  __name(takethEffect, "takethEffect");
  async function takethPhysical({ itemId, ownerId, qty, stack, targetId }) {
    const owner = game.actors.get(ownerId);
    const target = game.actors.get(targetId);
    if (!owner || !target)
      return;
    const item = owner.items.get(itemId);
    if (!item)
      return;
    qty = Math.min(qty, item.quantity);
    const newQty = item.quantity - qty;
    const source = item.toObject();
    source.system.quantity = qty;
    source.system.equipped.carryType = "worn";
    if (item.isOfType("physical") && "invested" in source.system.equipped) {
      source.system.equipped.invested = item.traits.has("invested") ? false : null;
    }
    const newItem = await target.addToInventory(source, void 0, stack);
    if (!newItem)
      return;
    if (newQty < 1)
      item.delete();
    else
      item.update({ "system.quantity": newQty });
    if (getSetting("giveth") === "no-message")
      return;
    let content = chatUUID(newItem.uuid, newItem.name, !newItem.isIdentified);
    if (qty > 1)
      content += ` x${qty}`;
    const giveth2 = localize("giveth.giveth", {
      target: target.name
    });
    ChatMessage.create({
      flavor: `<h4 class="action">${giveth2}</h4>`,
      content,
      speaker: ChatMessage.getSpeaker({ actor: owner })
    });
  }
  __name(takethPhysical, "takethPhysical");

  // src/apps/hero/trade.js
  var localize2 = subLocalize("hero.templates.trade");
  var Trade = class extends Application {
    static {
      __name(this, "Trade");
    }
    constructor(actor) {
      super({ id: `pf2e-hero-actions-trade-${actor.id}` });
      this._actor = actor;
    }
    static get defaultOptions() {
      return mergeObject(Application.defaultOptions, {
        title: localize2("title"),
        template: templatePath("hero/trade"),
        width: 600,
        height: "auto"
      });
    }
    get actor() {
      return this._actor;
    }
    get target() {
      return this._target;
    }
    set target(value) {
      if (!value) {
        localize2.error("no-target");
        return;
      }
      if (value === this._target)
        return;
      delete this.target?.apps?.[this.appId];
      this._target = value;
      this.render();
    }
    getData(options) {
      return mergeObject(super.getData(), {
        actor: this.actor,
        target: this.target,
        targets: game.actors.filter(
          (x) => x.type === "character" && x.id !== this.actor.id && x.hasPlayerOwner
        ),
        actions: getHeroActions(this.actor),
        targetActions: this.target ? getHeroActions(this.target) : [],
        i18n: localize2
      });
    }
    activateListeners(html) {
      super.activateListeners(html);
      html.find('select[name="target"]').on("change", this.#onChangeTarget.bind(this));
      html.find('[data-action="description"]').on("click", this.#onDescription.bind(this));
      html.find('[data-action="trade"]').on("click", this.#onSendTrade.bind(this));
      html.find('[data-action="cancel"]').on("click", () => this.close());
    }
    render(force, options) {
      this.actor.apps[this.appId] = this;
      if (this.target)
        this.target.apps[this.appId] = this;
      return super.render(force, options);
    }
    async close(options) {
      await super.close(options);
      delete this.actor.apps?.[this.appId];
      delete this.target?.apps?.[this.appId];
    }
    #onSendTrade() {
      if (!this.target) {
        localize2.warn("no-target");
        return;
      }
      const action = this.element.find('[name="action"]:checked').val();
      const target = this.element.find('[name="targetAction"]:checked').val();
      if (typeof action !== "string" || typeof target !== "string") {
        localize2.warn("no-select");
        return;
      }
      const user = getCharacterOwner(this.target, true) ?? getOwner(this.target, true) ?? game.users.activeGM;
      if (!user) {
        localize2.warn("no-user");
        return;
      }
      sendTradeRequest({
        sender: {
          id: game.user.id,
          cid: this.actor.id,
          uuid: action
        },
        receiver: {
          id: user.id,
          cid: this.target.id,
          uuid: target
        }
      });
      this.close();
    }
    async #onDescription(event) {
      const uuid = $(event.currentTarget).siblings("input").val();
      const entry = await fromUuid(uuid);
      entry?.sheet.render(true);
    }
    #onChangeTarget(event) {
      const id = event.currentTarget.value;
      this.target = game.actors.get(id);
    }
  };

  // src/features/hero.js
  var MODULE_ID2 = "pf2e-hero-actions";
  var setHook2 = createHook(
    "renderCharacterSheetPF2e",
    renderCharacterSheetPF2e,
    setupSocket
  );
  var JOURNAL_UUID = "Compendium.pf2e.journals.JournalEntry.BSp4LUSaOmUyjBko";
  var TABLE_UUID = "Compendium.pf2e.rollable-tables.RollTable.zgZoI7h0XjjJrrNK";
  var TABLE_ICON = "systems/pf2e/icons/features/feats/heroic-recovery.webp";
  var SOCKET = false;
  function registerHeroActions() {
    return {
      name: "heroActions",
      settings: [
        {
          name: "hero",
          type: Boolean,
          default: false,
          onChange: (value) => setHook2(value)
        },
        {
          name: "hero-table",
          type: String,
          default: ""
        },
        {
          name: "hero-trade",
          type: Boolean,
          default: false,
          onChange: () => refreshCharacterSheets()
        },
        {
          name: "hero-private",
          type: Boolean,
          default: false
        }
      ],
      conflicts: [MODULE_ID2],
      api: {
        createTable,
        removeHeroActions,
        getHeroActions,
        useHeroAction,
        getHeroActionDetails,
        drawHeroAction,
        drawHeroActions,
        sendActionToChat,
        discardHeroActions,
        tradeHeroAction,
        getDeckTable,
        giveHeroActions,
        createChatMessage
      },
      ready: () => {
        setHook2(false, "hero");
      }
    };
  }
  __name(registerHeroActions, "registerHeroActions");
  function setupSocket(value) {
    if (value && !SOCKET) {
      socketOn(onSocket2);
      SOCKET = true;
    } else if (!value && SOCKET) {
      socketOff(onSocket2);
      SOCKET = false;
    }
  }
  __name(setupSocket, "setupSocket");
  function onSocket2(packet) {
    switch (packet.type) {
      case "hero.trade-reject":
        if (packet.sender.id !== game.user.id)
          return;
        onTradeRejected(packet);
        break;
      case "hero.trade-accept":
        if (!isActiveGM())
          return;
        onTradeAccepted(packet);
        break;
      case "hero.trade-request":
        if (packet.receiver.id !== game.user.id)
          return;
        onTradeRequest(packet);
        break;
      case "hero.trade-error":
        if (!packet.users.includes(game.user.id))
          return;
        onTradeError(packet.error);
        break;
    }
  }
  __name(onSocket2, "onSocket");
  async function renderCharacterSheetPF2e(sheet, html) {
    const actor = sheet.actor;
    if (!isPlayedActor(actor))
      return;
    await addActionsToSheet(html, actor);
    addSheetEvents(html, actor);
  }
  __name(renderCharacterSheetPF2e, "renderCharacterSheetPF2e");
  async function addActionsToSheet(html, actor) {
    const actions = getHeroActions(actor);
    const diff = actor.heroPoints.value - actions.length;
    const isOwner = actor.isOwner;
    const localize6 = subLocalize("hero.templates.heroActions");
    const template = await renderTemplate(templatePath("hero/sheet"), {
      owner: isOwner,
      list: actions,
      canUse: diff >= 0 && isOwner,
      canDraw: diff > 0 && isOwner,
      canTrade: getSetting("hero-trade"),
      mustDiscard: diff < 0,
      diff: Math.abs(diff),
      i18n: (key, { hash }) => localize6(key, hash)
    });
    html.find(
      ".sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter] > .strikes-list:not(.skill-action-list)"
    ).first().after(template);
  }
  __name(addActionsToSheet, "addActionsToSheet");
  function addSheetEvents(html, actor) {
    const list = html.find(".tab.actions .heroActions-list");
    list.find("[data-action=draw]").on("click", (event) => onClickHeroActionsDraw(actor, event));
    list.find("[data-action=expand]").on("click", onClickHeroActionExpand);
    list.find("[data-action=use]").on("click", (event) => onClickHeroActionUse(actor, event));
    list.find("[data-action=display]").on("click", (event) => onClickHeroActionDisplay(actor, event));
    list.find("[data-action=discard]").on("click", onClickHeroActionDiscard);
    list.find("[data-action=discard-selected]").on("click", () => onClickHeroActionsDiscard(actor, html));
    html.find("[data-action=hero-actions-trade]").on("click", () => tradeHeroAction(actor));
  }
  __name(addSheetEvents, "addSheetEvents");
  async function onClickHeroActionsDiscard(actor, html) {
    const discarded = html.find(
      ".tab.actions .heroActions-list .action.discarded"
    );
    const uuids = discarded.toArray().map((x) => x.dataset.uuid);
    discardHeroActions(actor, uuids);
  }
  __name(onClickHeroActionsDiscard, "onClickHeroActionsDiscard");
  function onClickHeroActionDiscard(event) {
    event.preventDefault();
    const action = $(event.currentTarget).closest(".action");
    const list = action.closest(".heroActions-list");
    action.toggleClass("discarded");
    const toDiscard = Number(list.attr("data-discard") ?? "0");
    const $discarded = list.find(".action.discarded");
    list.toggleClass("discardable", $discarded.length === toDiscard);
  }
  __name(onClickHeroActionDiscard, "onClickHeroActionDiscard");
  async function onClickHeroActionDisplay(actor, event) {
    event.preventDefault();
    const uuid = $(event.currentTarget).closest(".action").attr("data-uuid");
    sendActionToChat(actor, uuid);
  }
  __name(onClickHeroActionDisplay, "onClickHeroActionDisplay");
  async function onClickHeroActionUse(actor, event) {
    event.preventDefault();
    const uuid = $(event.currentTarget).closest(".action").attr("data-uuid");
    useHeroAction(actor, uuid);
  }
  __name(onClickHeroActionUse, "onClickHeroActionUse");
  async function onClickHeroActionsDraw(actor, event) {
    event.preventDefault();
    drawHeroActions(actor);
  }
  __name(onClickHeroActionsDraw, "onClickHeroActionsDraw");
  function getHeroActions(actor) {
    return getProperty(actor, `flags.${MODULE_ID2}.heroActions`) ?? [];
  }
  __name(getHeroActions, "getHeroActions");
  async function setHeroActions(actor, actions) {
    return actor.update({ [`flags.${MODULE_ID2}.heroActions`]: actions });
  }
  __name(setHeroActions, "setHeroActions");
  async function onClickHeroActionExpand(event) {
    event.preventDefault();
    const action = $(event.currentTarget).closest(".action");
    const summary = action.find(".item-summary");
    if (!summary.hasClass("loaded")) {
      const uuid = action.attr("data-uuid");
      const details = await getHeroActionDetails(uuid);
      if (!details)
        return;
      const text = await TextEditor.enrichHTML(details.description, {
        async: true
      });
      summary.find(".item-description").html(text);
      summary.addClass("loaded");
    }
    action.toggleClass("expanded");
  }
  __name(onClickHeroActionExpand, "onClickHeroActionExpand");
  async function getHeroActionDetails(uuid) {
    const document2 = await fromUuid(uuid);
    if (!document2)
      return void 0;
    const parent = document2 instanceof JournalEntry ? document2 : document2.parent;
    const page = document2 instanceof JournalEntry ? document2.pages.contents[0] : document2;
    let text = page?.text.content;
    if (!text)
      return void 0;
    if (parent.uuid === JOURNAL_UUID)
      text = text.replace(/^<p>/, "<p><strong>Trigger</strong> ");
    return { name: page.name, description: text };
  }
  __name(getHeroActionDetails, "getHeroActionDetails");
  async function drawHeroActions(actor) {
    if (!actor?.isOfType("character")) {
      warn("hero.onlyCharacter");
      return;
    }
    const actions = getHeroActions(actor);
    const nb = actor.heroPoints.value - actions.length;
    const drawn = [];
    for (let i = 0; i < nb; i++) {
      const action = await drawHeroAction();
      if (action === void 0)
        continue;
      if (action === null)
        return;
      actions.push(action);
      drawn.push(action);
    }
    if (!drawn.length)
      return;
    setHeroActions(actor, actions);
    createChatMessage({
      actor,
      actions: drawn,
      label: (nb2) => localize("hero.actions-draw.header", { nb: nb2 }),
      secret: true
    });
  }
  __name(drawHeroActions, "drawHeroActions");
  function createChatMessage({ actor, actions, label, secret = false }) {
    const { content, size } = chatActions(actions);
    label = typeof label === "function" ? label(size) : label;
    const data = {
      flavor: `<h4 class="action">${label}</h4>`,
      content,
      speaker: ChatMessage.getSpeaker({ actor })
    };
    if (secret && getSetting("hero-private")) {
      data.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
      data.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
    }
    ChatMessage.create(data);
  }
  __name(createChatMessage, "createChatMessage");
  function chatActions(actions) {
    const links = actions.map(({ uuid, name }) => chatUUID(uuid, name));
    return {
      content: links.map((x) => `<div style="line-height: 1.6;">${x}</div>`).join(""),
      size: links.length
    };
  }
  __name(chatActions, "chatActions");
  function tradeHeroAction(actor) {
    if (!actor?.isOfType("character")) {
      warn("hero.onlyCharacter");
      return;
    }
    const actions = getHeroActions(actor);
    if (!actions || !actions.length) {
      warn("hero.no-action");
      return;
    }
    const diff = actions.length - actor.heroPoints.value;
    if (diff > 0) {
      warn("hero.no-points", { nb: diff.toString() });
      return;
    }
    new Trade(actor).render(true);
  }
  __name(tradeHeroAction, "tradeHeroAction");
  async function drawHeroAction() {
    const table = await getDeckTable();
    const localize6 = subLocalize("hero.table");
    if (!table) {
      localize6.error("drawError", true);
      return null;
    }
    if (!table.formula) {
      if (game.user.isGM) {
        if (table.compendium) {
          localize6.error("noFormulaCompendium", true);
          return null;
        }
        await table.normalize();
      } else {
        localize6.error("noFormula", true);
        return null;
      }
    }
    if (table.replacement === false) {
      const notDrawn = table.results.some((r) => !r.drawn);
      if (!notDrawn)
        await table.resetResults();
    }
    const draw = (await table.draw({ displayChat: false })).results[0];
    if (!draw)
      return;
    const uuid = documentUuidFromTableResult(draw);
    if (uuid)
      return { uuid, name: await getLabelfromTableResult(draw, uuid) };
  }
  __name(drawHeroAction, "drawHeroAction");
  async function useHeroAction(actor, uuid) {
    if (!actor?.isOfType("character")) {
      warn("hero.onlyCharacter");
      return;
    }
    const points = actor.heroPoints.value;
    if (points < 1)
      return warn("hero.use.noPoints");
    const actions = getHeroActions(actor);
    const index = actions.findIndex((x) => x.uuid === uuid);
    if (index === -1)
      return;
    const details = await getHeroActionDetails(uuid);
    if (!details)
      error("hero.use.noDetails");
    actions.splice(index, 1);
    if (details) {
      actor.update({
        "system.resources.heroPoints.value": points - 1,
        [`flags.${MODULE_ID2}.heroActions`]: actions
      });
      ChatMessage.create({
        flavor: `<h4 class="action">${localize("hero.actions-use.header")}</h4>`,
        content: `<h2>${details.name}</h2>${details.description}`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    } else {
      setHeroActions(actor, actions);
    }
  }
  __name(useHeroAction, "useHeroAction");
  async function discardHeroActions(actor, actionsUUIDS) {
    if (!actor?.isOfType("character")) {
      warn("hero.onlyCharacter");
      return;
    }
    const uuids = typeof actionsUUIDS === "string" ? [actionsUUIDS] : actionsUUIDS;
    const actions = getHeroActions(actor);
    const removed = [];
    for (const uuid of uuids) {
      const index = actions.findIndex((x) => x.uuid === uuid);
      if (index === -1)
        continue;
      removed.push(actions[index]);
      actions.splice(index, 1);
    }
    setHeroActions(actor, actions);
    createChatMessage({
      actor,
      actions: removed,
      label: (nb) => localize("hero.actions-discard.header", { nb })
    });
  }
  __name(discardHeroActions, "discardHeroActions");
  async function getLabelfromTableResult(result, uuid) {
    if (result.type !== CONST.TABLE_RESULT_TYPES.TEXT)
      return result.text;
    const label = /@UUID\[[\w\.]+\]{([\w -]+)}/.exec(result.text)?.[1];
    return label ?? (uuid && (await fromUuid(uuid))?.name);
  }
  __name(getLabelfromTableResult, "getLabelfromTableResult");
  async function getTableFromUuid(uuid) {
    if (!uuid)
      return void 0;
    const table = await fromUuid(uuid);
    return table && table instanceof RollTable ? table : void 0;
  }
  __name(getTableFromUuid, "getTableFromUuid");
  async function getDefaultCompendiumTable() {
    return getTableFromUuid(TABLE_UUID);
  }
  __name(getDefaultCompendiumTable, "getDefaultCompendiumTable");
  function getDefaultWorldTable() {
    return game.tables.find((x) => x.getFlag("core", "sourceId") === TABLE_UUID);
  }
  __name(getDefaultWorldTable, "getDefaultWorldTable");
  async function getCustomTable() {
    return getTableFromUuid(getSetting("hero-table"));
  }
  __name(getCustomTable, "getCustomTable");
  async function getDeckTable() {
    return await getCustomTable() ?? getDefaultWorldTable() ?? await getDefaultCompendiumTable();
  }
  __name(getDeckTable, "getDeckTable");
  async function sendActionToChat(actor, uuid) {
    const details = await getHeroActionDetails(uuid);
    if (!details)
      return error("hero.details.missing");
    ChatMessage.create({
      content: `<h2>${details.name}</h2>${details.description}`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }
  __name(sendActionToChat, "sendActionToChat");
  function sendTradeRequest(trade) {
    if (trade.receiver.id === game.user.id) {
      acceptRequest(trade);
      return;
    }
    socketEmit({
      ...trade,
      type: "hero.trade-request"
    });
  }
  __name(sendTradeRequest, "sendTradeRequest");
  function acceptRequest(trade) {
    if (game.user.isGM) {
      onTradeAccepted(trade);
      return;
    }
    socketEmit({
      ...trade,
      type: "hero.trade-accept"
    });
  }
  __name(acceptRequest, "acceptRequest");
  async function onTradeAccepted(trade) {
    const { sender, receiver } = trade;
    const senderActor = game.actors.get(sender.cid);
    const receiverActor = game.actors.get(receiver.cid);
    if (!senderActor || !receiverActor) {
      sendTradeError(trade);
      return;
    }
    const senderActions = getHeroActions(senderActor);
    const receiverActions = getHeroActions(receiverActor);
    const senderActionIndex = senderActions.findIndex(
      (x) => x.uuid === sender.uuid
    );
    const receiverActionIndex = receiverActions.findIndex(
      (x) => x.uuid === receiver.uuid
    );
    if (senderActionIndex === -1 || receiverActionIndex === -1) {
      sendTradeError(trade);
      return;
    }
    const senderAction = senderActions.splice(senderActionIndex, 1)[0];
    const receiverAction = receiverActions.splice(receiverActionIndex, 1)[0];
    senderActions.push(receiverAction);
    receiverActions.push(senderAction);
    setHeroActions(senderActor, senderActions);
    setHeroActions(receiverActor, receiverActions);
    const sentLink = chatUUID(senderAction.uuid);
    const receivedLink = chatUUID(receiverAction.uuid);
    const localize6 = subLocalize("hero.trade-success");
    let content = `<div style="line-height: 1.6">${localize6("offer", {
      offer: sentLink
    })}</div>`;
    content += `<div style="line-height: 1.6">${localize6("receive", {
      receive: receivedLink
    })}</div>`;
    ChatMessage.create({
      flavor: `<h4 class="action">${localize6("header", {
        name: receiverActor.name
      })}</h4>`,
      content,
      speaker: ChatMessage.getSpeaker({ actor: senderActor })
    });
  }
  __name(onTradeAccepted, "onTradeAccepted");
  function sendTradeError({ sender, receiver }, error2 = "trade-error") {
    const users = /* @__PURE__ */ new Set([sender.id, receiver.id]);
    if (users.has(game.user.id)) {
      users.delete(game.user.id);
      onTradeError(error2);
    }
    if (!users.size)
      return;
    socketEmit({
      type: "hero.trade-error",
      users: Array.from(users),
      error: error2
    });
  }
  __name(sendTradeError, "sendTradeError");
  function onTradeError(err) {
    error("hero.trade-error");
  }
  __name(onTradeError, "onTradeError");
  async function onTradeRequest(trade) {
    const { sender, receiver } = trade;
    const senderActor = game.actors.get(sender.cid);
    const receiverActor = game.actors.get(receiver.cid);
    if (!senderActor || !receiverActor) {
      sendTradeError(trade);
      return;
    }
    const localize6 = subLocalize("hero.trade-request");
    let content = `<p>${localize6("header", {
      sender: senderActor.name,
      receiver: receiverActor.name
    })}</p>`;
    content += `<p>${localize6("give", { give: chatUUID(sender.uuid) })}</p>`;
    content += `<p>${localize6("want", { want: chatUUID(receiver.uuid) })}</p>`;
    content += `<p style="margin-bottom: 1em;">${localize6("accept")}</p>`;
    const accept = await Dialog.confirm({
      title: localize6("title"),
      content: await TextEditor.enrichHTML(content, { async: true })
    });
    if (accept)
      acceptRequest(trade);
    else
      rejectRequest(trade);
  }
  __name(onTradeRequest, "onTradeRequest");
  function rejectRequest(trade) {
    if (trade.sender.id === game.user.id) {
      onTradeRejected(trade);
      return;
    }
    socketEmit({
      ...trade,
      type: "hero.trade-reject"
    });
  }
  __name(rejectRequest, "rejectRequest");
  async function onTradeRejected({ receiver }) {
    const actor = game.actors.get(receiver.cid);
    warn("hero.trade-rejected", { name: actor.name }, true);
  }
  __name(onTradeRejected, "onTradeRejected");
  async function createTable() {
    if (!game.user.isGM) {
      warn("hero.notGM");
      return;
    }
    const localize6 = subLocalize("hero.templates.createTable.choice");
    const template = templatePath("hero/dialogs/create-table");
    const buttons = {
      yes: {
        label: localize6("create"),
        icon: '<i class="fas fa-border-all"></i>',
        callback: (html) => {
          const type = html.find('.window-content input[name="type"]:checked').val();
          const unique = html.find('.window-content input[name="draw"]:checked').val() === "unique";
          return { type, unique };
        }
      },
      no: {
        label: localize6("cancel"),
        icon: '<i class="fas fa-times"></i>',
        callback: () => null
      }
    };
    const data = {
      content: await renderTemplate(template, { i18n: localize6 }),
      title: localize6("title"),
      buttons,
      default: "yes",
      close: () => null
    };
    const result = await Dialog.wait(data, void 0, {
      id: "pf2e-hero-actions-create-table"
    });
    if (!result)
      return;
    if (result.type === "default")
      createDefaultTable(result.unique);
    else
      createCustomTable(result.unique);
  }
  __name(createTable, "createTable");
  async function createCustomTable(unique) {
    const table = await createCustomActionsTable(unique);
    await setTable(table);
    table.sheet?.render(true);
  }
  __name(createCustomTable, "createCustomTable");
  function createCustomActionsTable(unique = true) {
    const source = getTableSource(unique);
    return RollTable.create(source, { temporary: false });
  }
  __name(createCustomActionsTable, "createCustomActionsTable");
  async function createDefaultTable(unique) {
    const localize6 = subLocalize("templates.createTable.default.confirm");
    let table = await getDefaultWorldTable();
    if (table) {
      const override = await Dialog.confirm({
        title: localize6("title"),
        content: localize6("content")
      });
      if (override) {
        const update = getTableSource(unique);
        await table.update(update);
        return setTable(table, true);
      }
    }
    table = await createDefautActionsTable(unique);
    await setTable(table);
  }
  __name(createDefaultTable, "createDefaultTable");
  async function createDefautActionsTable(unique = true) {
    const table = await fromUuid(TABLE_UUID);
    const source = getTableSource(unique, table);
    return RollTable.create(source, { temporary: false });
  }
  __name(createDefautActionsTable, "createDefautActionsTable");
  async function setTable(table, normalize = false) {
    if (normalize)
      await table.normalize();
    await setSetting("hero-table", table.uuid);
  }
  __name(setTable, "setTable");
  function getTableSource(unique, table) {
    const source = {
      name: localize("hero.table.name"),
      replacement: !(unique ?? true),
      img: TABLE_ICON,
      description: localize("hero.table.description"),
      flags: {
        core: {
          sourceId: TABLE_UUID
        }
      }
    };
    if (!table)
      return source;
    return mergeObject(deepClone(table._source), source);
  }
  __name(getTableSource, "getTableSource");
  async function removeHeroActions() {
    if (!game.user.isGM) {
      warn("hero.notGM");
      return;
    }
    const localize6 = subLocalize("hero.templates.removeActions");
    const template = templatePath("hero/dialogs/remove-actions");
    const buttons = {
      yes: {
        label: localize6("remove"),
        icon: '<i class="fas fa-trash"></i>',
        callback: (html) => html.find('input[name="actor"]:checked').toArray().map((x) => game.actors.get(x.value)).filter((x) => x)
      },
      no: {
        label: localize6("cancel"),
        icon: '<i class="fas fa-times"></i>',
        callback: () => null
      }
    };
    const data = {
      content: await renderTemplate(template, {
        actors: game.actors.filter((x) => x.type === "character"),
        i18n: localize6
      }),
      title: localize6("title"),
      buttons,
      default: "yes",
      render: (html) => {
        html.on(
          "change",
          'input[name="all"]',
          () => removeActionsToggleAll(html)
        );
        html.on(
          "change",
          'input[name="actor"]',
          () => removeActionsToggleActor(html)
        );
      },
      close: () => null
    };
    const actors = await Dialog.wait(data, void 0, {
      id: "pf2e-hero-actions-remove-actions"
    });
    if (!actors)
      return;
    if (!actors.length) {
      localize6.warn("noSelection");
      return;
    }
    for (const actor of actors) {
      setHeroActions(actor, []);
    }
    localize6.info("removed");
  }
  __name(removeHeroActions, "removeHeroActions");
  function removeActionsToggleAll(html) {
    const state = html.find('input[name="all"]')[0].checked;
    html.find('input[name="actor"]').prop("checked", state);
  }
  __name(removeActionsToggleAll, "removeActionsToggleAll");
  function removeActionsToggleActor(html) {
    const actors = html.find('input[name="actor"]');
    const checked = actors.filter(":checked");
    const all = html.find('input[name="all"]');
    if (actors.length === checked.length) {
      all.prop("checked", true).prop("indeterminate", false);
      actors.prop("checked", true);
    } else if (!checked.length) {
      all.prop("checked", false).prop("indeterminate", false);
      actors.prop("checked", false);
    } else {
      all.prop("checked", false).prop("indeterminate", true);
    }
  }
  __name(removeActionsToggleActor, "removeActionsToggleActor");
  function documentUuidFromTableResult(result) {
    if (result.type === CONST.TABLE_RESULT_TYPES.TEXT)
      return /@UUID\[([\w\.]+)\]/.exec(result.text)?.[1];
    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT)
      return `${result.documentCollection}.${result.documentId}`;
    if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM)
      return `Compendium.${result.documentCollection}.${result.documentId}`;
    return void 0;
  }
  __name(documentUuidFromTableResult, "documentUuidFromTableResult");
  async function giveHeroActions(actor) {
    if (!game.user.isGM) {
      warn("hero.notGM");
      return;
    }
    const templateLocalize = subLocalize("hero.templates.giveAction");
    if (!actor?.isOfType("character")) {
      templateLocalize.warn("noCharacter");
      return null;
    }
    const table = await getDeckTable();
    if (!table) {
      error("hero.table.drawError", true);
      return null;
    }
    const isUnique = table.replacement === false;
    const actionsList = (await Promise.all(
      table.results.map(async (result2) => {
        const uuid = documentUuidFromTableResult(result2);
        if (!uuid)
          return;
        return {
          key: result2.id,
          uuid,
          name: await getLabelfromTableResult(result2, uuid),
          drawn: result2.drawn
        };
      })
    )).filter(Boolean);
    const template = templatePath("hero/dialogs/give-action");
    const content = await renderTemplate(template, {
      actions: actionsList,
      isUnique,
      i18n: templateLocalize
    });
    const buttons = {
      yes: {
        label: templateLocalize("give"),
        icon: '<i class="fa-solid fa-gift"></i>',
        callback: (html) => ({
          selected: html.find("[name=action]:checked").closest(".action").toArray().map((el) => el.dataset),
          asDrawn: html.find("[name=drawn]").prop("checked") ?? false,
          withMessage: html.find("[name=message]").prop("checked")
        })
      },
      no: {
        label: templateLocalize("cancel"),
        icon: '<i class="fas fa-times"></i>',
        callback: () => null
      }
    };
    const data = {
      title: templateLocalize("title"),
      content,
      buttons,
      render: (html) => {
        html.find("[data-action=expand]").on("click", onClickHeroActionExpand);
      },
      close: () => null
    };
    const result = await Dialog.wait(data, void 0, {
      id: "pf2e-hero-actions-give-action"
    });
    if (!result)
      return;
    const { selected, asDrawn, withMessage } = result;
    const actions = getHeroActions(actor);
    const tableUpdates = [];
    for (const { uuid, name, key } of selected) {
      actions.push({ uuid, name });
      if (!asDrawn)
        continue;
      const result2 = table.results.get(key);
      if (result2 && !result2.drawn)
        tableUpdates.push(key);
    }
    if (tableUpdates.length) {
      await table.updateEmbeddedDocuments(
        "TableResult",
        tableUpdates.map((key) => ({ _id: key, drawn: true }))
      );
    }
    setHeroActions(actor, actions);
    if (withMessage) {
      createChatMessage({
        actor,
        actions: selected,
        label: (nb) => localize("hero.actions-give.header", { nb }),
        secret: true
      });
    }
  }
  __name(giveHeroActions, "giveHeroActions");

  // src/shared/draggable.js
  var dragData = null;
  var DRAG_ID = 0;
  function cleanOptions(options, filters) {
    for (const [type, keys] of Object.entries(filters)) {
      for (const key of keys) {
        const option = options[key];
        if (!option || typeof option === type)
          continue;
        options[option] = void 0;
      }
    }
  }
  __name(cleanOptions, "cleanOptions");
  function makeDraggable(options) {
    if (!(options.element instanceof HTMLElement))
      return;
    cleanOptions(options, {
      string: ["draggedClass", "group", "selector", "filter", "identifier"],
      number: ["triggerDistance"],
      boolean: ["cancelOnRightClick"],
      function: ["onCancel", "onDragEnd", "onDragStart"]
    });
    options.triggerDistance ??= 6;
    options.cancelOnRightClick ??= true;
    options.cursorImage ??= {};
    options.cursorImage.id = typeof options.cursorImage.id === "string" ? options.cursorImage.id : "";
    options.cursorImage.img = typeof options.cursorImage.img === "function" ? options.cursorImage.img : void 0;
    options.droppables ??= [];
    for (let i = options.droppables.length - 1; i >= 0; i--) {
      const droppable = options.droppables[i];
      if (!(droppable.element instanceof HTMLElement)) {
        options.droppables.splice(i, 1);
        continue;
      }
      cleanOptions(droppable, {
        string: ["selector", "overClass", "filter"],
        boolean: ["purgeOnLeave"],
        function: ["onDragEnter", "onDragLeave", "onDragOver", "onDrop"]
      });
    }
    options.element.addEventListener(
      "mousedown",
      (event) => onMouseDown(event, options)
    );
  }
  __name(makeDraggable, "makeDraggable");
  async function onDragCancel(event) {
    if (!dragData)
      return;
    dragData.canceled = true;
    if (dragData.dragging && dragData.draggable.ghost) {
      dragData.draggable.ghost.reset();
    }
    if (dragData.dragging && dragData.options.onCancel) {
      await dragData.options.onCancel(event, dragData.draggable);
    }
    cleanUp();
    await onDragEnd(event);
  }
  __name(onDragCancel, "onDragCancel");
  async function onDragEnd(event) {
    if (!dragData)
      return;
    if (dragData.dragging && dragData.options.onDragEnd) {
      await dragData.options.onDragEnd(event, dragData.draggable, {
        canceled: dragData.canceled,
        dropped: dragData.dropped
      });
    }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    dragData = null;
  }
  __name(onDragEnd, "onDragEnd");
  function cleanUp() {
    if (!dragData)
      return;
    dragData.draggable.classList.purge();
    dragData.draggable.ghost?.classList.purge();
    dragData.cursorElement?.remove();
    for (const { classList } of Object.values(dragData.hovered)) {
      classList.purge();
    }
  }
  __name(cleanUp, "cleanUp");
  function onMouseDown(event, options) {
    if (event.button === 2 && dragData?.dragging && dragData.options.cancelOnRightClick) {
      onDragCancel(event);
      return;
    }
    if (event.button)
      return;
    const target = closestInside(event.target, options.element, options);
    if (!target)
      return;
    let _ghost;
    const targetIndex = getElementIndex(target);
    const targetParent = target.parentElement;
    const targetClassList = newClassList(target);
    dragData = {
      canceled: false,
      dragging: false,
      dropped: false,
      options,
      group: options.group,
      draggable: {
        identifier: options.identifier,
        element: target,
        triggeringElement: event.target,
        x: event.clientX,
        y: event.clientY,
        parent: targetParent,
        index: targetIndex,
        classList: targetClassList,
        get ghost() {
          if (_ghost) {
            if (options.ghostClass) {
              _ghost.classList.add(options.ghostClass);
            }
            return _ghost;
          }
          const { element = target.cloneNode(true), index = Infinity } = options.createGhost?.(target, targetIndex) ?? {};
          const classList = newClassList(element);
          if (options.draggedClass && element !== target) {
            element.classList.remove(options.draggedClass);
          }
          if (options.ghostClass) {
            classList.add(options.ghostClass);
          }
          _ghost = {
            element,
            classList,
            index,
            reset: () => {
              element.remove();
              if (element === target) {
                const child = targetParent.children[targetIndex];
                targetParent.insertBefore(target, child);
                _ghost.index = targetIndex;
                if (options.ghostClass) {
                  classList.remove(options.ghostClass);
                }
              } else {
                _ghost.index = Infinity;
              }
            }
          };
          return _ghost;
        },
        resetPosition: () => {
          target.remove();
          targetParent.children[targetIndex].before(target);
        }
      },
      droppables: options.droppables.map((droppable) => ({
        ...droppable,
        id: DRAG_ID++
      })),
      hovered: {}
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }
  __name(onMouseDown, "onMouseDown");
  async function onMouseMove(event) {
    if (!dragData)
      return;
    if (dragData.dragging) {
      onDragMove(event);
      return;
    }
    const { clientX, clientY } = event;
    const { draggable } = dragData;
    const distance = calculateDistanceBetweenPoints(
      draggable.x,
      draggable.y,
      clientX,
      clientY
    );
    if (distance > dragData.options.triggerDistance) {
      await onDragStart(event);
    }
  }
  __name(onMouseMove, "onMouseMove");
  async function onMouseUp(event) {
    if (event.button || !dragData)
      return;
    if (dragData.dragging) {
      let dropped = false;
      cleanUp();
      await Promise.all(
        Object.values(dragData.hovered).map(async (hovered) => {
          if (!hovered.droppable.onDrop)
            return;
          const hasDropped = await hovered.droppable.onDrop(
            event,
            dragData.draggable,
            {
              classList: hovered.classList,
              element: hovered.element,
              triggeringElement: hovered.triggeringElement
            }
          );
          if (hasDropped)
            dropped = true;
        })
      );
      dragData.dropped = dropped;
    }
    await onDragEnd(event);
  }
  __name(onMouseUp, "onMouseUp");
  async function onDragStart(event) {
    if (dragData.dragging)
      return;
    dragData.dragging = true;
    if (dragData.options.cursorImage.img) {
      const img = dragData.options.cursorImage.img(dragData.draggable.element);
      if (img instanceof HTMLElement) {
        dragData.cursorElement = img;
      } else {
        dragData.cursorElement = new Image();
        dragData.cursorElement.src = typeof img === "string" ? img : "";
      }
    } else {
      dragData.cursorElement = dragData.draggable.element.cloneNode(true);
    }
    dragData.cursorElement.id = dragData.options.cursorImage.id;
    if (dragData.options.draggedClass) {
      dragData.draggable.classList.add(dragData.options.draggedClass);
    }
    document.body.appendChild(dragData.cursorElement);
    await dragData.options.onDragStart?.(event, dragData.draggable);
  }
  __name(onDragStart, "onDragStart");
  async function onDragMove(event) {
    if (!dragData)
      return;
    const { clientX, clientY } = event;
    const cursorElement = dragData.cursorElement;
    const offsetX = cursorElement.offsetWidth / 2;
    const offsetY = cursorElement.offsetHeight / 2;
    cursorElement.style.left = `${clientX - offsetX}px`;
    cursorElement.style.top = `${clientY - offsetY}px`;
    await Promise.all(
      dragData.droppables.map(async (droppable) => {
        const target = closestInside(event.target, droppable.element, {
          selector: droppable.selector,
          filter: droppable.filter
        });
        const hovered = dragData.hovered[droppable.id];
        if (hovered && (!target || hovered.element !== target)) {
          const left = await droppable.onDragLeave?.(event, dragData.draggable, {
            classList: hovered.classList,
            element: hovered.element,
            triggeringElement: event.target
          });
          if (left !== false) {
            delete dragData.hovered[droppable.id];
            if (droppable.purgeOnLeave) {
              hovered.classList.purge();
            } else if (droppable.overClass) {
              hovered.classList.remove(droppable.overClass);
            }
          }
        }
        if (!target)
          return;
        if (!hovered) {
          const classList = newClassList(target);
          const entered = await droppable.onDragEnter?.(
            event,
            dragData.draggable,
            {
              classList,
              element: target,
              triggeringElement: event.target
            }
          );
          if (entered !== false) {
            if (droppable.overClass)
              classList.add(droppable.overClass);
            dragData.hovered[droppable.id] = {
              id: droppable.id,
              classList,
              droppable,
              element: target,
              triggeringElement: event.target
            };
          }
        } else if (droppable.onDragOver) {
          await droppable.onDragOver(event, dragData.draggable, {
            classList: hovered.classList,
            element: hovered.element,
            triggeringElement: event.target
          });
        }
      })
    );
  }
  __name(onDragMove, "onDragMove");
  function newClassList(target) {
    return new class extends Set {
      add(value) {
        target.classList.add(value);
        super.add(value);
      }
      remove(value) {
        target.classList.remove(value);
        super.delete(value);
      }
      toggle(value, enabled2) {
        const toggled = enabled2 ?? !target.classList.contains(value);
        if (toggled)
          this.add(value);
        else
          this.remove(value);
      }
      contains(value) {
        return this.has(value);
      }
      purge() {
        target.classList.remove(...this);
      }
    }();
  }
  __name(newClassList, "newClassList");
  function closestInside(target, parent, { selector, filter } = {}) {
    if (!parent.contains(target))
      return;
    if (!selector && !filter)
      return parent;
    let element;
    let cursor = target;
    while (true) {
      if (filter && cursor.matches(filter))
        return;
      if (!element && selector && cursor.matches(selector)) {
        element = cursor;
      }
      if (cursor === parent)
        break;
      cursor = cursor.parentElement;
    }
    return !selector ? parent : element;
  }
  __name(closestInside, "closestInside");

  // src/features/inventory.js
  var closeHook = createHook(
    "closeCharacterSheetPF2e",
    closeCharacterSheetPF2e
  );
  var dragging = false;
  function registerInventory() {
    return {
      settings: [
        {
          name: "inventory",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setup3(value)
        }
      ],
      ready: (isGm) => {
        setup3();
      }
    };
  }
  __name(registerInventory, "registerInventory");
  var dragIdentifier;
  var COINS = [
    "platinum-pieces",
    "gold-pieces",
    "silver-pieces",
    "copper-pieces"
  ];
  function setup3(value) {
    const enabled2 = value ?? getSetting("inventory");
    if (enabled2) {
      registerCharacterSheetExtraTab({
        tabName: "inventory",
        templateFolder: "inventory/sheet",
        getData,
        addEvents,
        onRender: onRender2
      });
    } else {
      unregisterCharacterSheetExtraTab("inventory");
    }
    closeHook(enabled2);
  }
  __name(setup3, "setup");
  function closeCharacterSheetPF2e(sheet, html) {
    const actor = sheet.actor;
    if (!isPlayedActor(actor))
      return;
    if (!getInMemory(sheet, "inventory.requireSave"))
      return;
    const tab = getCharacterSheetTab(html, "inventory")[0];
    const data = getCurrentData(tab);
    if (!data)
      return;
    setFlag(actor, "inventory", data);
  }
  __name(closeCharacterSheetPF2e, "closeCharacterSheetPF2e");
  function onRender2(actor, sheet, inner) {
    const sidebar = inner.find("> aside");
    sidebar.css("position", "relative");
    sidebar.append(
      "<div id='pf2e-toobelt-inventory-item-details' class='hidden'></div>"
    );
  }
  __name(onRender2, "onRender");
  function getCurrentData(tabElement) {
    if (!tabElement)
      return;
    const alternate = tabElement.querySelector(":scope > .alternate");
    const equipped = alternate.querySelector("[data-area='equipped']");
    const equippedItemId = /* @__PURE__ */ __name((slot) => {
      const el = equipped.querySelector(`[data-equipped-slot='${slot}']`);
      const item = el.querySelector("[data-item-id]");
      return item?.dataset.itemId ?? null;
    }, "equippedItemId");
    const itemIds = /* @__PURE__ */ __name((parent) => {
      const ids = {};
      const items = parent.querySelectorAll(":scope > [data-item-id]");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        ids[item.dataset.itemId] = i;
      }
      return ids;
    }, "itemIds");
    const tabs = {};
    for (const tab of alternate.querySelectorAll("[data-area='items-grid']")) {
      const tabId = tab.dataset.tabId;
      tabs[tabId] = itemIds(tab);
    }
    return {
      equipped: {
        hands: [equippedItemId("left-hand"), equippedItemId("right-hand")],
        armor: [equippedItemId("armor")],
        others: itemIds(equipped)
      },
      tabs
    };
  }
  __name(getCurrentData, "getCurrentData");
  async function getData(actor, sheet, tabElement) {
    const flags = getFlag(actor, "inventory");
    const data = getCurrentData(tabElement[0]) ?? flags ?? {
      equipped: {
        hands: [null, null],
        armor: [null],
        others: {}
      },
      tabs: {}
    };
    if (!flags) {
      setInMemory(sheet, "inventory.requireSave", true);
    }
    const tabs = new Collection();
    const orphans = {};
    const containers = /* @__PURE__ */ new Set();
    const equipped = {
      hands: [null, null],
      armor: [null],
      others: []
    };
    function getTab(item) {
      const tabId = item?.id;
      let tab = tabs.get(tabId);
      if (tab)
        return tab;
      tab = {
        id: tabId,
        item,
        parent: item?.container,
        containers: [],
        matrix: [],
        parents: []
      };
      tabs.set(tabId, tab);
      return tab;
    }
    __name(getTab, "getTab");
    for (const item of actor.inventory) {
      if (item.isOfType("treasure") && item.system.stackGroup === "coins" && COINS.includes(item.slug)) {
        continue;
      }
      const itemId = item.id;
      const parent = item.container;
      const tab = getTab(parent);
      const addOrphan = /* @__PURE__ */ __name((item2) => {
        orphans[tab.id] ??= [];
        orphans[tab.id].push(item2);
      }, "addOrphan");
      if (item.isOfType("backpack")) {
        tab.containers.push(item);
        containers.add(item);
        getTab(item);
        continue;
      }
      const handsHeld = item.handsHeld;
      const equippedHands = equipped.hands.filter(Boolean).length;
      if (handsHeld === 2 && equippedHands === 0) {
        if (data.equipped.hands[0] === itemId) {
          equipped.hands = [item, item];
        } else {
          addOrphan(item);
        }
        continue;
      }
      if (handsHeld === 1 && equippedHands <= 1) {
        const handIndex = data.equipped.hands.indexOf(itemId);
        if (indexIsValid(handIndex)) {
          equipped.hands[handIndex] = item;
        } else {
          addOrphan(item);
        }
        continue;
      }
      if (!equipped.armor[0] && item.isOfType("armor") && item.isEquipped) {
        if (data.equipped.armor[0] === itemId) {
          equipped.armor[0] = item;
        } else {
          addOrphan(item);
        }
        continue;
      }
      if ((item.isOfType("equipment") || isHandwrapsOfMightyBlows(item)) && isInvestedOrWornAs(item)) {
        const equippedIndex = data.equipped.others[itemId];
        if (indexIsValid(equippedIndex)) {
          equipped.others[equippedIndex] = item;
        } else {
          addOrphan(item);
        }
        continue;
      }
      const index = data.tabs[tab.id]?.[itemId];
      if (indexIsValid(index)) {
        tab.matrix[index] = item;
        continue;
      }
      addOrphan(item);
    }
    for (const tab of tabs) {
      const tabOrphans = orphans[tab.id];
      if (!tabOrphans)
        continue;
      for (const item of tabOrphans) {
        const handsHeld = item.handsHeld;
        const equippedHands = equipped.hands.filter(Boolean).length;
        if (equippedHands === 0 && handsHeld === 2) {
          equipped.hands = [item, item];
          continue;
        }
        if (equippedHands <= 1 && handsHeld === 1) {
          const otherIndex = equipped.hands[0] ? 1 : 0;
          equipped.hands[otherIndex] = item;
          continue;
        }
        if (!equipped.armor[0] && item.isOfType("armor") && item.isEquipped) {
          equipped.armor[0] = item;
          continue;
        }
        if ((item.isOfType("equipment") || isHandwrapsOfMightyBlows(item)) && isInvestedOrWornAs(item)) {
          equipped.others.push(item);
          continue;
        }
        tab.matrix.push(item);
      }
      tab.matrix = tab.matrix.filter(Boolean);
    }
    for (const tab of tabs) {
      let parent = tab.parent;
      while (parent) {
        tab.parents.push(parent);
        parent = parent.container;
      }
      tab.parents.reverse();
      const grouped = [tab.containers, tab.parents, tab.item].flat();
      tab.trailings = containers.filter((item) => !grouped.includes(item));
    }
    if (!tabs.size)
      getTab(void 0);
    equipped.others = equipped.others.filter(Boolean);
    const activeTabId = getInMemory(sheet, "inventory.activeTab");
    return {
      tabs: Array.from(tabs.values()),
      equipped,
      actor,
      selectedTab: tabs.get(activeTabId)?.id,
      containerBulk: (container) => {
        const capacity = container.capacity;
        return `${capacity.value.toString()} / ${capacity.max.toString()}`;
      }
    };
  }
  __name(getData, "getData");
  function addEvents(tab, sheet, actor, inner) {
    const containerTabs = tab.find("[data-tab-id]");
    for (const container of tab.find("[data-container-id]")) {
      container.addEventListener("click", (event) => {
        const tabId = container.dataset.containerId;
        containerTabs.removeClass("active");
        containerTabs.filter(`[data-tab-id=${tabId}]`).addClass("active");
        setInMemory(sheet, "inventory.activeTab", tabId);
      });
    }
    const sidebar = inner.find("#pf2e-toobelt-inventory-item-details")[0];
    const itemElements = tab.find("[data-item-id], [data-container-id]");
    for (const itemElement of itemElements) {
      itemElement.addEventListener(
        "mouseenter",
        (event) => onItemDetails(event, actor, itemElement, sidebar)
      );
      itemElement.addEventListener("mouseleave", (event) => {
        sidebar.classList.add("hidden");
      });
    }
    if (!actor.isOwner)
      return;
    dragIdentifier = randomID();
    makeDraggable({
      element: tab[0],
      selector: "[data-item-id]",
      filter: "input",
      draggedClass: "dragged",
      ghostClass: "ghost",
      identifier: dragIdentifier,
      cursorImage: {
        id: "pf2e-toolbelt-inventory-cursor-image",
        img: (target) => target.dataset.itemImg
      },
      createGhost,
      onDragStart: () => onDragStart2(sidebar),
      onDragEnd: (event, draggable, options) => onDragEnd2(sheet, options),
      droppables: [
        containersDroppable(tab, sheet),
        otherEquipmentDroppable(tab, sheet),
        largeEquipmentDroppable(tab, sheet),
        itemsListDroppable(tab, sheet),
        itemsGridDroppable(tab, sheet)
      ]
    });
  }
  __name(addEvents, "addEvents");
  async function onItemDetails(event, actor, itemElement, sidebar) {
    if (dragging)
      return;
    let details = itemElement.dataset.details;
    if (!details) {
      const item = getItemFromElement(actor, itemElement);
      if (!item)
        return;
      details = await renderTemplate(templatePath("inventory/details"), { item });
      itemElement.dataset.details = details;
    }
    sidebar.innerHTML = details;
    sidebar.classList.remove("hidden");
  }
  __name(onItemDetails, "onItemDetails");
  function onDragStart2(sidebar) {
    dragging = true;
    sidebar.classList.add("hidden");
  }
  __name(onDragStart2, "onDragStart");
  function onDragEnd2(sheet, { dropped, canceled }) {
    dragging = false;
    if (canceled || !dropped)
      return;
    setInMemory(sheet, "inventory.requireSave", true);
  }
  __name(onDragEnd2, "onDragEnd");
  function createGhost(dragged, draggedIndex) {
    return dragged.parentElement.dataset.area === "items-grid" ? { element: dragged, index: draggedIndex } : void 0;
  }
  __name(createGhost, "createGhost");
  function checkIdentifier(draggable) {
    if (draggable.identifier === dragIdentifier)
      return true;
    error("inventory.identifier.error");
    return false;
  }
  __name(checkIdentifier, "checkIdentifier");
  function itemsGridDroppable(html, sheet) {
    function onDragEnter(event, draggable, droppable) {
      if (droppable.element === draggable.element || droppable.element === draggable.ghost) {
        return;
      }
      const ghost = draggable.ghost;
      const index = getElementIndex(droppable.element);
      const target = ghost.index >= index ? droppable.element : droppable.element.nextElementSibling;
      droppable.element.parentElement.insertBefore(ghost.element, target);
      ghost.index = index;
    }
    __name(onDragEnter, "onDragEnter");
    function onDragLeave(event, draggable, droppable) {
      const parentGrid = droppable.element.parentElement;
      if (!parentGrid)
        return;
      const isItem = closestInside(droppable.triggeringElement, parentGrid, {
        selector: "[data-item-id]"
      });
      if (isItem)
        return;
      const parentList = parentGrid.parentElement;
      if (!parentList.contains(droppable.triggeringElement))
        return;
      parentGrid.appendChild(draggable.ghost.element);
      draggable.ghost.index = Infinity;
    }
    __name(onDragLeave, "onDragLeave");
    return {
      element: html[0],
      selector: "[data-area='items-grid'] [data-item-id]",
      onDragEnter,
      onDragLeave
    };
  }
  __name(itemsGridDroppable, "itemsGridDroppable");
  function itemsListDroppable(html, sheet) {
    const actor = sheet.actor;
    function onDragEnter(event, draggable, droppable) {
      const isItem = closestInside(
        droppable.triggeringElement,
        droppable.element,
        {
          selector: "[data-item-id]"
        }
      );
      if (isItem)
        return;
      droppable.element.querySelector("[data-area='items-grid']").appendChild(draggable.ghost.element);
    }
    __name(onDragEnter, "onDragEnter");
    function onDragLeave(event, draggable, droppable) {
      draggable.ghost.reset();
    }
    __name(onDragLeave, "onDragLeave");
    async function onDrop(event, draggable, droppable) {
      if (!checkIdentifier(draggable))
        return false;
      const item = getItemFromElement(actor, draggable);
      if (!item)
        return false;
      const updates = [];
      if (draggable.element === draggable.ghost.element) {
        draggable.ghost.classList.purge();
        cleanContainerItem(draggable.element);
      } else {
        moveItemToContainer({
          html,
          updates,
          item,
          ...draggable,
          target: draggable.ghost.element
        });
        checkForTwoHandedSlots(html, actor);
        draggable.ghost.reset();
      }
      await actor.updateEmbeddedDocuments("Item", updates);
      return true;
    }
    __name(onDrop, "onDrop");
    return {
      element: html[0],
      selector: "[data-area='items-list']",
      onDragEnter,
      onDragLeave,
      onDrop
    };
  }
  __name(itemsListDroppable, "itemsListDroppable");
  function largeEquipmentDroppable(html, sheet) {
    const actor = sheet.actor;
    const rightHand = html.find("[data-equipped-slot=right-hand]")[0];
    function getData3(draggable, droppable) {
      const slot = droppable.element.dataset.equippedSlot;
      if (slot === draggable.parent.dataset.equippedSlot || droppable.element.querySelector("[data-two-hands]")) {
        return { canDrop: void 0 };
      }
      const item = getItemFromElement(actor, draggable);
      if (!item) {
        return { canDrop: false };
      }
      const canDrop = slot === "armor" ? item.isOfType("armor") : true;
      return {
        item,
        slot,
        canDrop
      };
    }
    __name(getData3, "getData");
    function moveItemToSlot({
      updates,
      item,
      element,
      drop,
      noTwoHand = false,
      noUpdate = false
    }) {
      const dropSlot = drop instanceof HTMLElement ? drop : drop.element;
      const slot = dropSlot.dataset.equippedSlot;
      const movable = element instanceof HTMLElement ? element : element.element;
      const isOneHand = isOneHanded(item);
      const isTwoHand = isTwoHanded(item);
      const canInvest = canBeInvested(item);
      dropSlot.appendChild(movable);
      const move = /* @__PURE__ */ __name((carryType, handsHeld, inSlot, invested) => {
        if (!noUpdate) {
          updates.push(
            itemCarryUpdate(item, {
              carryType,
              handsHeld,
              inSlot,
              invested,
              containerId: null
            })
          );
        }
        movable.classList.toggle("invested", canInvest && invested);
      }, "move");
      if (slot === "armor") {
        move("worn", 0, true, true);
        return;
      }
      if (slot === "right-hand") {
        move("held", 1, false, isOneHand);
        return;
      }
      move(
        "held",
        isTwoHand && !noTwoHand ? 2 : 1,
        false,
        isHeld(item) && (!isTwoHand || !noTwoHand)
      );
    }
    __name(moveItemToSlot, "moveItemToSlot");
    function getSlottedItem(slot) {
      const slotElement = slot instanceof HTMLElement ? slot : slot.element;
      const element = slotElement.querySelector("[data-item-id]");
      const item = getItemFromElement(actor, element);
      return { element, item };
    }
    __name(getSlottedItem, "getSlottedItem");
    function onDragEnter(event, draggable, droppable) {
      const { canDrop } = getData3(draggable, droppable);
      if (canDrop !== void 0) {
        droppable.classList.toggle("valid", canDrop);
        droppable.classList.toggle("invalid", !canDrop);
      }
    }
    __name(onDragEnter, "onDragEnter");
    async function onDrop(event, draggable, droppable) {
      if (!checkIdentifier(draggable))
        return false;
      const { item, canDrop, slot } = getData3(draggable, droppable);
      if (!canDrop)
        return false;
      const updates = [];
      const slotted = getSlottedItem(droppable);
      const dragArea = draggable.parent.dataset.area;
      const dragSlot = draggable.parent.dataset.equippedSlot;
      const isTwoHand = isTwoHanded(item);
      let noUpdate = false;
      if (dragArea === "equipped") {
        if (slotted.item) {
          moveItemToContainer({ html, updates, ...slotted });
        }
      } else if (dragArea === "items-grid") {
        if (slot === "left-hand" && isTwoHand) {
          const otherSlotted = getSlottedItem(rightHand);
          if (otherSlotted.item) {
            moveItemToContainer({ html, updates, ...otherSlotted });
          }
        }
        if (slotted.item) {
          moveItemToContainer({
            html,
            updates,
            ...slotted,
            target: draggable.element
          });
        }
      } else if (slot === "armor") {
        if (slotted.item) {
          moveItemToSlot({
            updates,
            ...slotted,
            drop: draggable.parent
          });
        }
      } else if (dragSlot === "armor") {
        if (slotted.item) {
          if (slotted.item.isOfType("armor")) {
            moveItemToSlot({
              updates,
              ...slotted,
              drop: draggable.parent
            });
          } else {
            moveItemToContainer({
              html,
              updates,
              ...slotted
            });
          }
        }
      } else if (slot === "right-hand") {
        noUpdate = true;
        if (slotted.item) {
          moveItemToSlot({
            updates,
            ...slotted,
            drop: draggable.parent,
            noUpdate: true,
            noTwoHand: true
          });
        }
      } else if (slotted.item) {
        if (isTwoHand) {
          moveItemToContainer({
            html,
            updates,
            ...slotted
          });
        } else {
          moveItemToSlot({
            updates,
            ...slotted,
            drop: draggable.parent,
            noUpdate: true
          });
          noUpdate = true;
        }
      }
      moveItemToSlot({
        updates,
        item,
        element: draggable,
        drop: droppable,
        noUpdate
      });
      if (slot === "left-hand" || dragSlot === "left-hand") {
        checkForTwoHandedSlots(html, actor);
      }
      await actor.updateEmbeddedDocuments("Item", updates);
      return true;
    }
    __name(onDrop, "onDrop");
    return {
      element: html.find("[data-area=equipped] .main-items")[0],
      selector: "[data-equipped-slot]",
      purgeOnLeave: true,
      onDragEnter,
      onDrop
    };
  }
  __name(largeEquipmentDroppable, "largeEquipmentDroppable");
  function otherEquipmentDroppable(html, sheet) {
    const actor = sheet.actor;
    function getData3(draggable, droppable) {
      if (draggable.parent === droppable.element) {
        return { canDrop: void 0 };
      }
      const item = getItemFromElement(actor, draggable);
      if (!item.isIdentified || !(item.isOfType("equipment") || isHandwrapsOfMightyBlows(item))) {
        return { canDrop: false };
      }
      const canInvest = canBeInvested(item);
      const canEquip = hasWornSlot(item);
      if (!canInvest && !canEquip) {
        return { canDrop: false };
      }
      return { canDrop: true, item, canInvest };
    }
    __name(getData3, "getData");
    function onDragEnter(event, draggable, droppable) {
      const { canDrop, canInvest } = getData3(draggable, droppable);
      if (canDrop === void 0)
        return;
      droppable.classList.add("show");
      droppable.classList.toggle("add-forbidden", !canDrop);
      droppable.classList.toggle("add-invest", canDrop && canInvest);
      droppable.classList.toggle("add-equip", canDrop && !canInvest);
    }
    __name(onDragEnter, "onDragEnter");
    async function onDrop(event, draggable, droppable) {
      if (!checkIdentifier(draggable))
        return false;
      const { canDrop, canInvest, item } = getData3(draggable, droppable);
      if (!canDrop)
        return false;
      droppable.element.appendChild(draggable.element);
      draggable.element.classList.toggle("invested", canInvest);
      await actor.updateEmbeddedDocuments("Item", [
        itemCarryUpdate(item, {
          containerId: null,
          inSlot: true,
          invested: true
        })
      ]);
      return true;
    }
    __name(onDrop, "onDrop");
    return {
      element: html.find("[data-area=equipped]")[0],
      filter: ".main-items",
      purgeOnLeave: true,
      onDragEnter,
      onDrop
    };
  }
  __name(otherEquipmentDroppable, "otherEquipmentDroppable");
  function containersDroppable(html, sheet) {
    const actor = sheet.actor;
    function getData3(draggable, droppable) {
      const item = getItemFromElement(actor, draggable);
      if (!item)
        return { canDrop: false };
      const containerId = droppable.element.dataset.containerId;
      if (containerId === "undefined")
        return { item, canDrop: true };
      const container = actor.items.get(containerId);
      if (!container)
        return { canDrop: false };
      const capacity = container.capacity;
      const remaining = capacity.max.minus(capacity.value);
      return {
        item,
        container,
        canDrop: remaining.value >= item.bulk.value
      };
    }
    __name(getData3, "getData");
    function onDragEnter(event, draggable, droppable) {
      const { canDrop } = getData3(draggable, droppable);
      droppable.classList.toggle("valid", canDrop);
      droppable.classList.toggle("invalid", !canDrop);
    }
    __name(onDragEnter, "onDragEnter");
    async function onDrop(event, draggable, droppable) {
      if (!checkIdentifier(draggable))
        return false;
      const { canDrop, item, container } = getData3(draggable, droppable);
      if (!canDrop)
        return false;
      const updates = moveItemToContainer({
        html,
        updates: [],
        item,
        element: draggable,
        target: container
      });
      if (draggable.parent.dataset.equippedSlot === "left-hand") {
        checkForTwoHandedSlots(html, actor);
      }
      await actor.updateEmbeddedDocuments("Item", updates);
      return true;
    }
    __name(onDrop, "onDrop");
    return {
      element: html[0],
      selector: "[data-container-id]",
      filter: ".back",
      purgeOnLeave: true,
      onDragEnter,
      onDrop
    };
  }
  __name(containersDroppable, "containersDroppable");
  function cleanContainerItem(item) {
    item.classList.remove("invested");
    item.querySelector(".vignette.hands")?.remove();
  }
  __name(cleanContainerItem, "cleanContainerItem");
  function moveItemToContainer({ html, updates, item, element, target }) {
    const targetIsElement = target instanceof HTMLElement;
    const movable = element instanceof HTMLElement ? element : element.element;
    let containerId = targetIsElement ? target.closest("[data-tab-id]").dataset.tabId : target instanceof Item ? target.id : target;
    cleanContainerItem(movable);
    if (targetIsElement) {
      target.before(movable);
    } else {
      html.find(`.container-tab[data-tab-id=${containerId}] [data-area=items-grid]`).append(movable);
    }
    containerId = [void 0, "undefined"].includes(containerId) ? null : containerId;
    updates.push(
      itemCarryUpdate(item, {
        containerId,
        inSlot: false,
        invested: false,
        carryType: containerId ? "stowed" : "worn",
        handsHeld: 0
      })
    );
    return updates;
  }
  __name(moveItemToContainer, "moveItemToContainer");
  function checkForTwoHandedSlots(html, actor) {
    const equipped = html.find("[data-area='equipped'] .main-items")[0];
    const leftHand = equipped.querySelector("[data-equipped-slot='left-hand']");
    const rightHand = equipped.querySelector("[data-equipped-slot='right-hand']");
    const leftSlotted = leftHand.querySelector("[data-item-id]");
    const rightSlotted = rightHand.querySelector(".item:not(.fake)");
    const item = getItemFromElement(actor, leftSlotted);
    const isTwoHand = !!item && isTwoHanded(item);
    if (!isTwoHand && rightSlotted?.dataset.twoHands) {
      rightSlotted.remove();
    } else if (isTwoHand && !rightSlotted) {
      const clone = leftSlotted.cloneNode(true);
      clone.dataset.twoHands = "true";
      rightHand.appendChild(clone);
    }
  }
  __name(checkForTwoHandedSlots, "checkForTwoHandedSlots");
  function getItemFromElement(actor, element) {
    if (!element)
      return;
    const el = element instanceof HTMLElement ? element : element.element;
    const { itemId, containerId } = el.dataset;
    const id = itemId ?? containerId;
    if (id)
      return actor.items.get(id);
  }
  __name(getItemFromElement, "getItemFromElement");

  // src/apps/knowledges/lores.js
  var localize3 = subLocalize("knowledges.editLore");
  var EditLores = class extends FormApplication {
    static {
      __name(this, "EditLores");
    }
    get actor() {
      return this.object;
    }
    get id() {
      return `npc-edit-lores-${this.actor.id}`;
    }
    get title() {
      return localize3("title", this.actor);
    }
    get template() {
      return templatePath("knowledges/lores");
    }
    getData(options) {
      const actor = this.actor;
      return mergeObject(super.getData(options), {
        unspecified: getFlag(actor, "knowledges.unspecified") ?? "",
        specific: getFlag(actor, "knowledges.specific") ?? "",
        i18n: localize3
      });
    }
    async _updateObject(event, { unspecified, specific }) {
      const actor = this.object;
      setFlag(actor, "knowledges.unspecified", unspecified.trim());
      setFlag(actor, "knowledges.specific", specific.trim());
    }
    activateListeners(html) {
      html.find("button.cancel").on("click", this.#onCancel.bind(this));
    }
    #onCancel(event) {
      event.preventDefault();
      this.close();
    }
  };

  // src/features/knowledges.js
  var setHook3 = createHook("renderNPCSheetPF2e", renderNPCSheetPF2e);
  function registerKnowledges() {
    return {
      settings: [
        {
          name: "knowledges",
          type: Boolean,
          default: false,
          onChange: (value) => setHook3(value)
        }
      ],
      conflicts: ["pf2e-npc-knowledges"],
      ready: (isGM) => {
        if (isGM && getSetting("knowledges"))
          setHook3(true);
      }
    };
  }
  __name(registerKnowledges, "registerKnowledges");
  function renderNPCSheetPF2e(sheet, $html) {
    const actor = sheet.actor;
    if (!isPlayedActor(actor))
      return;
    replaceLores(actor, $html);
    addEditButton($html);
    addEvents2(actor, $html);
  }
  __name(renderNPCSheetPF2e, "renderNPCSheetPF2e");
  function knowledgeSelector(html, section, selector) {
    return html.find(
      `[data-tab="main"] .recall-knowledge ${section === "header" ? ".section-header" : ".section-body"} ${selector}`
    );
  }
  __name(knowledgeSelector, "knowledgeSelector");
  function editLores(actor) {
    new EditLores(actor).render(true);
  }
  __name(editLores, "editLores");
  function replaceLores(actor, html) {
    const unspecifics = getFlag(actor, "knowledges.unspecified");
    const specifics = getFlag(actor, "knowledges.specific");
    if (!unspecifics && !specifics)
      return;
    const lores = actor.identificationDCs.lore;
    const body = knowledgeSelector(html, "body", "");
    body.find(".identification-skills").last().remove();
    function tag(skills, dc, adjustment) {
      const content = game.i18n.format(
        "PF2E.Actor.NPC.Identification.Skills.Label",
        { skills, dc, adjustment }
      );
      return `<div class="tag-legacy identification-skills tooltipstered">${content}</div>`;
    }
    __name(tag, "tag");
    function addTags(lores2, { dc, start }) {
      const tags = lores2.split(",").filter((lore) => lore.trim()).map((lore) => tag(lore, dc, start)).join("");
      body.append(tags);
    }
    __name(addTags, "addTags");
    addTags(unspecifics || "Unspecific", lores[0]);
    addTags(specifics || "Specific", lores[1]);
  }
  __name(replaceLores, "replaceLores");
  function addEvents2(actor, html) {
    const edit = knowledgeSelector(html, "header", "button.edit");
    edit.on("click", () => editLores(actor));
  }
  __name(addEvents2, "addEvents");
  function addEditButton(html) {
    const attempts = knowledgeSelector(html, "header", "button");
    const edit = '<button type="button" class="breakdown edit">Edit</button>';
    attempts.before(edit);
  }
  __name(addEditButton, "addEditButton");

  // src/apps/merge/multi.js
  var localize4 = subLocalize("merge.multi");
  var MultiCast = class extends Application {
    static {
      __name(this, "MultiCast");
    }
    #message;
    #event;
    constructor(event, message, options) {
      super(options);
      this.#event = event;
      this.#message = message;
    }
    get title() {
      return localize4("title", this.spell);
    }
    get template() {
      return templatePath("merge/multi");
    }
    getData(options) {
      return mergeObject(super.getData(options), {
        i18n: localize4
      });
    }
    activateListeners(html) {
      html.find("[data-action=cast]").on("click", this.#onCast.bind(this));
      html.find("[data-action=cancel]").on("click", this.#onCancel.bind(this));
    }
    async #onCast(event) {
      event.preventDefault();
      const nb = this.element.find("[name=multi]").val();
      if (nb < 1) {
        localize4.error("zero");
        this.close();
        return;
      }
      const message = this.#message;
      if (!message)
        return;
      const spell = message.item;
      const actor = message.actor;
      if (!actor || !spell)
        return;
      const updateSource = /* @__PURE__ */ __name((damages, heightening) => {
        for (const [id, damage] of Object.entries(damages)) {
          for (let i = 0; i < nb - 1; i++) {
            const newId = randomID();
            damages[newId] = damage;
            if (heightening.type === "interval") {
              const damage2 = heightening.damage[id];
              if (damage2)
                heightening.damage[newId] = damage2;
            } else if (heightening.type === "fixed") {
              for (const data of Object.values(heightening.levels)) {
                const damage2 = data.damage[id];
                if (!damage2)
                  continue;
                data.damage[newId] = damage2;
              }
            }
          }
        }
      }, "updateSource");
      const embeddedSource = deepClone(message.flags.pf2e.casting?.embeddedSpell);
      if (embeddedSource) {
        const damages = embeddedSource.system.damage;
        embeddedSource.system.heightening ??= {};
        const heightening = embeddedSource.system.heightening;
        updateSource(damages, heightening);
        const newSpell = new Item.implementation(embeddedSource, {
          parent: actor
        });
        newSpell.trickMagicEntry = spell.trickMagicEntry;
        const overlayIds = message.getFlag("pf2e", "origin.variant.overlays");
        const castRank = message.getFlag("pf2e", "origin.castRank") ?? spell.rank;
        const modifiedSpell = newSpell.loadVariant({ overlayIds, castRank });
        const castSpell = modifiedSpell ?? newSpell;
        castSpell.rollDamage(this.#event);
      } else {
        const spellSource = spell.toObject();
        const damages = spellSource.system.damage;
        const heightening = spellSource.system.heightening ?? {};
        updateSource(damages, heightening);
        const newSpell = spell.clone({
          "system.damage": damages,
          "system.heightening": heightening
        });
        newSpell.rollDamage(this.#event);
      }
      if (spell.damageKinds.size) {
        bindOnPreCreateSpellDamageChatMessage(message);
      }
      this.close();
    }
    #onCancel(event) {
      event.preventDefault();
      this.close();
    }
  };

  // src/shared/pf2e/classes.js
  function getDamageRollClass() {
    return CONFIG.Dice.rolls.find((Roll2) => Roll2.name === "DamageRoll");
  }
  __name(getDamageRollClass, "getDamageRollClass");

  // src/features/merge.js
  var setHook4 = createHook(
    "renderChatMessage",
    renderChatMessage,
    updateMessages
  );
  function registerMerge() {
    return {
      settings: [
        {
          name: "merge-damage",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setHook4(value, "multi-cast")
        },
        {
          name: "multi-cast",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setHook4(value, "merge-damage")
        }
      ],
      init: (isGm) => {
        setHook4(false, ["multi-cast", "merge-damage"], true);
      }
    };
  }
  __name(registerMerge, "registerMerge");
  function updateMessages() {
    const chat = ui.chat?.element;
    if (!chat)
      return;
    for (const message of latestChatMessages(10)) {
      const html = chat.find(`[data-message-id=${message.id}]`);
      if (!html.length)
        continue;
      html.find("[data-action=multi-cast]").remove();
      html.find("[data-action=merge-damage]").remove();
      renderChatMessage(message, html);
    }
  }
  __name(updateMessages, "updateMessages");
  function renderChatMessage(message, html) {
    if (!game.user.isGM && !message.isAuthor)
      return;
    if (getSetting("merge-damage") && isDamageRoll(message))
      renderDamage(message, html);
    else if (getSetting("multi-cast") && message.getFlag("pf2e", "origin.type") === "spell")
      renderSpell(message, html);
  }
  __name(renderChatMessage, "renderChatMessage");
  function renderSpell(message, html) {
    const item = message.item;
    if (!item)
      return;
    const spellBtn = html.find(
      ".message-content .chat-card .owner-buttons .spell-button"
    );
    spellBtn.find("[data-action=spell-damage]").after(
      `<button data-action="multi-cast">${localize(
        "merge.spell.button"
      )}</button>`
    );
    spellBtn.find("[data-action=multi-cast]").on("click", (event) => {
      new MultiCast(event, message).render(true);
    });
  }
  __name(renderSpell, "renderSpell");
  function renderDamage(message, html) {
    let buttons = '<span class="pf2e-toolbelt-merge">';
    if (getFlag(message, "merge.merged")) {
      const tooltip2 = localize("merge.damage.split-tooltip");
      buttons += `<button data-action="split-damage" title="${tooltip2}">`;
      buttons += '<i class="fa-duotone fa-split"></i>';
    }
    const tooltip = localize("merge.damage.tooltip");
    buttons += `<button data-action="merge-damage" title="${tooltip}">`;
    buttons += '<i class="fa-duotone fa-merge"></i></button>';
    buttons += "</span>";
    const actorUUID = getActorUUID(message);
    const targetUUIDs = getTargetUUIDs(message);
    html.find(".dice-result .dice-total").append(buttons);
    html.find(".pf2e-toolbelt-merge [data-action=merge-damage]").on("click", (event) => {
      event.stopPropagation();
      for (const otherMessage of latestChatMessages(5, message)) {
        const otherTargetsUUIDS = getTargetUUIDs(otherMessage);
        if (!isDamageRoll(otherMessage) || getActorUUID(otherMessage) !== actorUUID || !compareArrays(
          targetUUIDs?.map((t) => t.actor).filter(Boolean),
          otherTargetsUUIDS?.map((t) => t.actor).filter(Boolean)
        ))
          continue;
        mergeDamages(event, message, otherMessage, { actorUUID, targetUUIDs });
        return;
      }
      warn("merge.damage.none");
    });
    html.find(".pf2e-toolbelt-merge [data-action=split-damage]").on("click", (event) => {
      event.stopPropagation();
      splitDamages(event, message);
    });
  }
  __name(renderDamage, "renderDamage");
  async function splitDamages(event, message) {
    const sources = getFlag(message, "merge.data").flatMap((data) => data.source);
    await removeChatMessages(message.id);
    await getChatMessageClass().createDocuments(sources);
  }
  __name(splitDamages, "splitDamages");
  async function mergeDamages(event, origin, other, { actorUUID, targetUUIDs }) {
    const dataGroups = {};
    const data = getMessageData(other).concat(getMessageData(origin));
    for (const { name, notes, outcome, modifiers, tags } of data) {
      dataGroups[name] ??= {
        name,
        tags,
        notes: /* @__PURE__ */ new Set(),
        results: []
      };
      for (const note of notes) {
        dataGroups[name].notes.add(note);
      }
      const exists = dataGroups[name].results.some(
        (result) => result.outcome === outcome && compareArrays(result.modifiers, modifiers)
      );
      if (!exists)
        dataGroups[name].results.push({ outcome, modifiers });
    }
    const groups = Object.values(dataGroups).map((group) => {
      group.label = group.name;
      for (const result of group.results) {
        if (!result.outcome)
          continue;
        result.label = game.i18n.localize(
          `PF2E.Check.Result.Degree.Attack.${result.outcome}`
        );
      }
      return group;
    });
    groups.at(-1).isLastGroup = true;
    const flavor = await renderTemplate(templatePath("merge/merged"), {
      groups,
      hasMultipleGroups: groups.length > 1
    });
    const originRolls = getMessageRolls(origin);
    const otherRolls = getMessageRolls(other);
    const groupedRolls = [];
    for (const roll2 of [].concat(otherRolls, originRolls)) {
      const { options, total, terms } = roll2;
      const term = terms[0];
      const formula = roll2.formula.replaceAll(/(\[[\w,-]+\])/g, "").replace(/^\(/, "").replace(/\)$/, "");
      const group = groupedRolls.find(
        ({ options: { flavor: flavor2, critRule } }) => flavor2 === options.flavor && critRule === options.critRule
      );
      if (group) {
        group.terms.push(term);
        group.total += total;
        group.formulas.push(formula);
      } else {
        groupedRolls.push({
          options,
          formulas: [formula],
          total,
          terms: [term]
        });
      }
    }
    const DamageRoll = getDamageRollClass();
    for (const group of groupedRolls) {
      if (group.options.flavor.includes("persistent")) {
        const { index } = group.formulas.reduce(
          (prev, curr, index2) => {
            const value = new DamageRoll(curr).expectedValue;
            if (value <= prev.value)
              return prev;
            return { value, index: index2 };
          },
          { value: 0, index: -1 }
        );
        group.formulas = [group.formulas[index]];
        group.terms = [group.terms[index]];
      }
      group.formula = `(${group.formulas.join(" + ")})[${group.options.flavor}]`;
      group.term = group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms);
    }
    const roll = {
      class: "DamageRoll",
      options: {},
      dice: [],
      formula: `{${groupedRolls.map(({ formula }) => formula).join(", ")}}`,
      total: groupedRolls.reduce((acc, { total }) => acc + total, 0),
      evaluated: true,
      terms: [
        {
          class: "InstancePool",
          options: {},
          evaluated: true,
          terms: groupedRolls.map(({ formula }) => formula),
          modifiers: [],
          rolls: groupedRolls.map(({ options, formula, total, term }) => ({
            class: "DamageInstance",
            options,
            dice: [],
            formula,
            total,
            terms: [term],
            evaluated: true
          })),
          results: groupedRolls.map(({ total }) => ({
            result: total,
            active: true
          }))
        }
      ]
    };
    if (game.modules.get("dice-so-nice")?.active) {
      const setHidden = /* @__PURE__ */ __name((term) => {
        if ("results" in term) {
          for (const result of term.results) {
            result.hidden = true;
          }
        } else {
          const operands = (term.term ?? term).operands ?? [];
          for (const operand of operands) {
            setHidden(operand);
          }
        }
      }, "setHidden");
      for (const r of roll.terms[0].rolls) {
        for (const term of r.terms) {
          setHidden(term);
        }
      }
    }
    await removeChatMessages(origin.id, other.id);
    await getChatMessageClass().create({
      flavor,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      speaker: origin.speaker,
      flags: {
        [MODULE_ID]: {
          merge: {
            actor: actorUUID,
            targets: targetUUIDs,
            merged: true,
            type: "damage-roll",
            data
          },
          target: {
            targets: targetUUIDs
          }
        },
        pf2e: {
          context: {
            options: Array.from(
              new Set(data.flatMap((entry) => entry.itemTraits))
            )
          }
        }
      },
      rolls: [roll]
    });
  }
  __name(mergeDamages, "mergeDamages");
  function getMessageData(message) {
    const flags = getFlag(message, "merge.data");
    if (flags)
      return flags;
    const source = message.toObject();
    delete source._id;
    delete source.timestamp;
    const html = $(`<div>${message.flavor}</div>`);
    const tags = html.find("h4.action + .tags").prop("outerHTML");
    const modifiers = [];
    html.find(".tag.tag_transparent").each(function() {
      modifiers.push(this.innerHTML);
    });
    const notes = source.flags.pf2e.context.notes.map(
      ({ title, text }) => `<strong>${game.i18n.localize(title)}</strong> ${game.i18n.localize(
        text
      )}`
    );
    return [
      {
        source,
        name: source.flags.pf2e.strike?.name ?? message.item.name,
        outcome: source.flags.pf2e.context.outcome,
        itemTraits: source.flags.pf2e.context.options.filter(
          (option) => option.startsWith("item:")
        ),
        modifiers,
        tags,
        notes
      }
    ];
  }
  __name(getMessageData, "getMessageData");
  function removeChatMessages(...ids) {
    const joinedIds = ids.map((id) => `[data-message-id=${id}]`).join(", ");
    ui.chat.element.find(joinedIds).remove();
    return ChatMessage.deleteDocuments(ids);
  }
  __name(removeChatMessages, "removeChatMessages");
  function createTermGroup(terms) {
    const options = deepClone(terms[0].options);
    for (const term of terms) {
      term.options = {};
    }
    return {
      class: "Grouping",
      options,
      evaluated: true,
      term: {
        class: "ArithmeticExpression",
        options: {},
        evaluated: true,
        operator: "+",
        operands: [
          terms.shift(),
          terms.length > 1 ? createTermGroup(terms) : terms[0]
        ]
      }
    };
  }
  __name(createTermGroup, "createTermGroup");
  function getMessageRolls(message) {
    return getFlag(message, "merge.rolls") ?? JSON.parse(message._source.rolls[0]).terms[0].rolls;
  }
  __name(getMessageRolls, "getMessageRolls");
  function getActorUUID(message) {
    return getFlag(message, "merge.actor") ?? message.actor?.uuid;
  }
  __name(getActorUUID, "getActorUUID");
  function getTargetUUIDs(message) {
    const targetTargets = getFlag(message, "target.targets");
    if (targetTargets)
      return targetTargets;
    const mergeTargets = getFlag(message, "merge.targets") ?? message.getFlag("pf2e", "target");
    if (Array.isArray(mergeTargets))
      return mergeTargets;
    return mergeTargets ? [mergeTargets] : [];
  }
  __name(getTargetUUIDs, "getTargetUUIDs");
  function isDamageRoll(message) {
    return getFlag(message, "merge.type") === "damage-roll" || message.getFlag("pf2e", "context.type") === "damage-roll";
  }
  __name(isDamageRoll, "isDamageRoll");

  // src/features/modifiers.js
  var setHook5 = createChoicesHook(
    "renderChatMessage",
    renderChatMessage2,
    updateMessages2
  );
  function registerHideModifiers() {
    return {
      settings: [
        {
          name: "modifiers",
          type: String,
          default: "disabled",
          choices: ["disabled", "enabled", "traits"],
          onChange: (value) => setHook5(value)
        }
      ],
      init: (isGM) => {
        if (!isGM && getSetting("modifiers") !== "disabled")
          setHook5(true, true);
      }
    };
  }
  __name(registerHideModifiers, "registerHideModifiers");
  function updateMessages2() {
    if (game.user.isGM)
      return;
    const chat = ui.chat?.element;
    if (!chat)
      return;
    for (const message of latestChatMessages(20)) {
      const html = chat.find(`[data-message-id=${message.id}]`);
      if (!html.length)
        continue;
      html.find(".message-header").removeClass("pf2e-toolbelt-modifiers pf2e-toolbelt-modifiers-traits");
      renderChatMessage2(message, html);
    }
  }
  __name(updateMessages2, "updateMessages");
  function renderChatMessage2(message, html) {
    const speaker = message.speaker;
    const actor = ChatMessage.getSpeakerActor(speaker);
    if (!actor || actor.hasPlayerOwner)
      return;
    const header = html.find(".message-header");
    if (getSetting("modifiers") === "traits") {
      header.addClass("pf2e-toolbelt-modifiers-traits");
    }
    if (getSetting("modifiers") !== "disabled") {
      header.addClass("pf2e-toolbelt-modifiers");
    }
  }
  __name(renderChatMessage2, "renderChatMessage");

  // src/features/nobulk.js
  var ACTOR_PREPARE_EMBEDDED_DOCUMENTS = "CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments";
  var TREASURE_PREPARE_BASE_DATA = "CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData";
  function registerNobulk() {
    return {
      settings: [
        {
          name: "nobulk",
          type: Boolean,
          default: false,
          requiresReload: true
        },
        {
          name: "nobulk-coins",
          type: Boolean,
          default: false,
          requiresReload: true
        }
      ],
      init: () => {
        if (getSetting("nobulk"))
          registerWrapper(
            ACTOR_PREPARE_EMBEDDED_DOCUMENTS,
            actorPrepareEmbeddedDocuments,
            "WRAPPER"
          );
        if (getSetting("nobulk-coins"))
          registerWrapper(
            TREASURE_PREPARE_BASE_DATA,
            treasurePrepareBaseData,
            "WRAPPER"
          );
      }
    };
  }
  __name(registerNobulk, "registerNobulk");
  function treasurePrepareBaseData(wrapped) {
    wrapped();
    try {
      if (this.isCoinage)
        this.system.bulk.value = 0;
    } catch {
      wrapperError("nobulk", TREASURE_PREPARE_BASE_DATA);
    }
  }
  __name(treasurePrepareBaseData, "treasurePrepareBaseData");
  function actorPrepareEmbeddedDocuments(wrapped, ...args) {
    wrapped(...args);
    try {
      const InventoryBulk = this.inventory.bulk.constructor;
      let _value = null;
      Object.defineProperty(this.inventory.bulk, "value", {
        get() {
          if (_value)
            return _value;
          _value = InventoryBulk.computeTotalBulk(
            this.actor.inventory.filter(
              (item) => !item.isInContainer && item.system.equipped.carryType !== "dropped"
            ),
            this.actor.size
          );
          return _value;
        }
      });
    } catch {
      wrapperError("nobulk", ACTOR_PREPARE_EMBEDDED_DOCUMENTS);
    }
  }
  __name(actorPrepareEmbeddedDocuments, "actorPrepareEmbeddedDocuments");

  // src/features/share.js
  var ACTOR_PREPARE_DATA = "CONFIG.Actor.documentClass.prototype.prepareData";
  var DOCUMENT_SHEET_RENDER_INNER = "DocumentSheet.prototype._renderInner";
  function registerShare() {
    return {
      settings: [
        {
          name: "share",
          type: String,
          default: "disabled",
          choices: ["disabled", "enabled", "force"],
          requiresReload: true
        }
      ],
      init: () => {
        const share = getSetting("share");
        if (share === "disabled")
          return;
        registerWrapper(ACTOR_PREPARE_DATA, prepareData, "WRAPPER");
        registerWrapper(
          DOCUMENT_SHEET_RENDER_INNER,
          documentSheetRenderInner,
          "WRAPPER"
        );
        Hooks.on("preUpdateActor", preUpdateActor);
        Hooks.on("deleteActor", deleteActor);
        Hooks.on("updateActor", updateActor);
      }
    };
  }
  __name(registerShare, "registerShare");
  async function documentSheetRenderInner(wrapped, ...args) {
    const inner = await wrapped(...args);
    if (!isInstanceOf(this, "CreatureConfig"))
      return inner;
    const actor = this.actor;
    if (!isPlayedActor(actor) || !actor.isOfType("character", "npc") || getSlaves(actor).size)
      return inner;
    const masters = game.actors.filter((a) => a.id !== actor.id && a.isOwner && isValidMaster(a)).map((actor2) => ({
      key: actor2.id,
      label: actor2.name
    }));
    const group = await renderTemplate(templatePath("share/master"), {
      masters,
      master: getFlag(actor, "share.master"),
      selectPath: `flags.${MODULE_ID}.share.master`,
      i18n: subLocalize("share.templates.master")
    });
    inner.children().last().before(group);
    return inner;
  }
  __name(documentSheetRenderInner, "documentSheetRenderInner");
  function deleteActor(actor) {
    removeSlaveFromMaster(actor);
    const slaves = getSlaves(actor);
    Promise.all(
      slaves.map(async (slave) => {
        unsetMaster(slave);
        await unsetFlag(slave, "share.master");
      })
    );
  }
  __name(deleteActor, "deleteActor");
  function preUpdateActor(actor, updates) {
    const shareFlag = getProperty(updates, `flags.${MODULE_ID}.share`);
    if (shareFlag?.master) {
      const master = game.actors.get(shareFlag.master);
      if (isValidMaster(master)) {
        const hpSource = deepClone(master._source.system.attributes.hp);
        setProperty(updates, "system.attributes.hp", hpSource);
      }
    } else {
      const master = getMaster(actor);
      const hpUpdate = getProperty(updates, "system.attributes.hp");
      if (master && hpUpdate) {
        master.update(
          { system: { attributes: { hp: hpUpdate } } },
          { noHook: true }
        );
        delete updates.system.attributes.hp;
      }
    }
  }
  __name(preUpdateActor, "preUpdateActor");
  function updateActor(actor, updates, options, userId) {
    const isOriginalUser = game.user.id === userId;
    const shareFlag = getShareFlag(updates);
    if (shareFlag?.master !== void 0) {
      const slave = actor;
      removeSlaveFromMaster(slave);
      if (shareFlag.master) {
        const master = game.actors.get(shareFlag.master);
        if (isValidMaster(master)) {
          setMaster(slave, master);
          addSlaveToMaster(master, slave);
        }
      } else {
        unsetMaster(slave);
      }
    }
    if (!isOriginalUser)
      return;
    const slaves = getSlaves(actor);
    if (slaves.size) {
      const hpUpdate = getProperty(updates, "system.attributes.hp");
      if (hpUpdate) {
        const data = { system: { attributes: { hp: hpUpdate } } };
        Promise.all(
          slaves.map(async (slave) => await slave.update(data, { noHook: true }))
        );
      } else {
        Promise.all(
          slaves.map(async (slave) => await refreshActor(slave, updates))
        );
      }
    }
  }
  __name(updateActor, "updateActor");
  async function refreshActor(actor, data) {
    const share = getSetting("share");
    if (share === "force") {
      await setFlag(actor, "toggle", !getFlag(actor, "toggle"));
    } else {
      actor.render(false, { action: "update" });
      actor._updateDependentTokens(data);
    }
  }
  __name(refreshActor, "refreshActor");
  function prepareData(wrapped) {
    wrapped();
    const masterId = getFlag(this, "share.master");
    const master = masterId ? game.actors.get(masterId) : void 0;
    if (!isValidMaster(master))
      return;
    if (!getMaster(this)) {
      setMaster(this, master);
      addSlaveToMaster(master, this);
    }
    const hp = this.system.attributes.hp;
    Object.defineProperty(this.system.attributes, "hp", {
      get() {
        const masterHp = master.system.attributes.hp;
        transfertHpData(masterHp, hp);
        return hp;
      },
      enumerable: true
    });
  }
  __name(prepareData, "prepareData");
  function transfertHpData(from, to) {
    to.breakdown = from.breakdown;
    to.max = from.max;
    to.sp = deepClone(from.sp);
    to.temp = from.temp;
    to.totalModifier = from.totalModifier;
    to.value = from.value;
    to._modifiers = from._modifiers.slice();
  }
  __name(transfertHpData, "transfertHpData");
  function getShareFlag(doc) {
    return getProperty(doc, `flags.${MODULE_ID}.share`);
  }
  __name(getShareFlag, "getShareFlag");
  function getSlaves(actor) {
    return getModuleProperty(actor, "slaves") ?? new Collection();
  }
  __name(getSlaves, "getSlaves");
  function setMaster(actor, master) {
    setModuleProperty(actor, "master", master);
  }
  __name(setMaster, "setMaster");
  function unsetMaster(actor) {
    deleteModuleProperty(actor, "master");
  }
  __name(unsetMaster, "unsetMaster");
  function getMaster(actor) {
    return getModuleProperty(actor, "master");
  }
  __name(getMaster, "getMaster");
  function isValidMaster(actor) {
    return actor && actor.type === "character" && !getMaster(actor);
  }
  __name(isValidMaster, "isValidMaster");
  function getModuleProperty(doc, path) {
    return getProperty(doc, `modules.${MODULE_ID}.share.${path}`);
  }
  __name(getModuleProperty, "getModuleProperty");
  function setModuleProperty(doc, path, value) {
    setProperty(doc, `modules.${MODULE_ID}.share.${path}`, value);
  }
  __name(setModuleProperty, "setModuleProperty");
  function deleteModuleProperty(doc, path) {
    delete doc.modules?.[MODULE_ID]?.share?.[path];
  }
  __name(deleteModuleProperty, "deleteModuleProperty");
  function addSlaveToMaster(master, slave) {
    const slaves = getSlaves(master);
    setModuleProperty(master, "slaves", slaves.set(slave.id, slave));
  }
  __name(addSlaveToMaster, "addSlaveToMaster");
  function removeSlaveFromMaster(slave) {
    const master = getMaster(slave);
    if (!master)
      return;
    const slaves = getSlaves(master);
    slaves.delete(slave.id);
  }
  __name(removeSlaveFromMaster, "removeSlaveFromMaster");

  // src/shared/item.js
  function getSourceId(doc) {
    return doc.getFlag("core", "sourceId");
  }
  __name(getSourceId, "getSourceId");
  function includesSourceId(doc, list) {
    const sourceId = getSourceId(doc);
    return sourceId ? list.includes(sourceId) : false;
  }
  __name(includesSourceId, "includesSourceId");
  function getItemSourceIdCondition(sourceId) {
    return Array.isArray(sourceId) ? (item) => includesSourceId(item, sourceId) : (item) => getSourceId(item) === sourceId;
  }
  __name(getItemSourceIdCondition, "getItemSourceIdCondition");
  function getItems(actor, itemTypes = []) {
    const types = typeof itemTypes === "string" ? [itemTypes] : itemTypes;
    return types.length ? types.flatMap((type) => actor.itemTypes[type]) : actor.items;
  }
  __name(getItems, "getItems");
  function hasItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).some(getItemSourceIdCondition(sourceId));
  }
  __name(hasItemWithSourceId, "hasItemWithSourceId");
  function getItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).find(getItemSourceIdCondition(sourceId));
  }
  __name(getItemWithSourceId, "getItemWithSourceId");

  // src/features/stances.js
  var setSheetHook = createHook(
    "renderCharacterSheetPF2e",
    renderCharacterSheetPF2e2
  );
  var setDeleteCombatHook = createHook("deleteCombat", deleteCombat);
  var setDeleteCombatantHook = createHook("deleteCombatant", deleteCombatant);
  var setCreateCombatantHook = createHook("createCombatant", createCombatant);
  var STANCE_SAVANT = [
    "Compendium.pf2e.feats-srd.Item.yeSyGnYDkl2GUNmu",
    "Compendium.pf2e.feats-srd.Item.LI9VtCaL5ZRk0Wo8"
  ];
  var REPLACERS = /* @__PURE__ */ new Map([
    [
      "Compendium.pf2e.feats-srd.Item.nRjyyDulHnP5OewA",
      // gorilla pound
      {
        replace: "Compendium.pf2e.feats-srd.Item.DqD7htz8Sd1dh3BT",
        // gorilla stance
        effect: "Compendium.pf2e.feat-effects.Item.UZKIKLuwpQu47feK"
      }
    ]
  ]);
  var EXTRAS = /* @__PURE__ */ new Map([
    [
      "Compendium.pf2e.classfeatures.Item.09iL38CZZEa0q0Mt",
      // arcane cascade
      {
        effect: "Compendium.pf2e.feat-effects.Item.fsjO5oTKttsbpaKl",
        action: "Compendium.pf2e.actionspf2e.Item.HbejhIywqIufrmVM"
      }
    ],
    [
      "Compendium.pf2e.feats-srd.Item.xQuNswWB3eg1UM28",
      // cobra envenom
      {
        effect: "Compendium.pf2e.feat-effects.Item.2Qpt0CHuOMeL48rN"
      }
    ],
    [
      "Compendium.pf2e.feats-srd.Item.R7c4PyTNkZb0yvoT",
      // dread marshal
      {
        effect: "Compendium.pf2e.feat-effects.Item.qX62wJzDYtNxDbFv"
        // the stance aura
      }
    ],
    [
      "Compendium.pf2e.feats-srd.Item.bvOsJNeI0ewvQsFa",
      // inspiring marshal
      {
        effect: "Compendium.pf2e.feat-effects.Item.er5tvDNvpbcnlbHQ"
        // the stance aura
      }
    ]
  ]);
  function registerStances() {
    return {
      name: "stances",
      settings: [
        {
          name: "stances",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: setup4
        },
        {
          name: "custom-stances",
          type: String,
          default: ""
        }
      ],
      conflicts: ["pf2e-stances"],
      api: {
        getStances,
        toggleStance,
        isValidStance
      },
      ready: (isGm) => {
        if (getSetting("stances"))
          setup4(true);
      }
    };
  }
  __name(registerStances, "registerStances");
  function setup4(value) {
    setSheetHook(value);
    setDeleteCombatHook(value);
    setDeleteCombatantHook(value);
    setCreateCombatantHook(value);
  }
  __name(setup4, "setup");
  function isValidStance(stance) {
    return stance?.system.traits.value.includes("stance") && stance.system.selfEffect?.uuid;
  }
  __name(isValidStance, "isValidStance");
  function getStances(actor) {
    const stances = [];
    const replaced = /* @__PURE__ */ new Set();
    for (const {
      replace,
      sourceId,
      effectUUID,
      effect,
      img,
      name,
      itemName,
      action
    } of actorStances(actor)) {
      if (replace)
        replaced.add(replace);
      const foundAction = action ? getItemWithSourceId(actor, action, "action") : getItemWithSourceId(actor, sourceId, "feat");
      stances.push({
        name,
        itemName,
        uuid: sourceId,
        img,
        effectUUID,
        effectID: effect?.id,
        actionUUID: foundAction.sourceId,
        actionID: foundAction.id
      });
    }
    return stances.filter(({ uuid }) => !replaced.has(uuid));
  }
  __name(getStances, "getStances");
  async function renderCharacterSheetPF2e2(sheet, html) {
    const actor = sheet.actor;
    if (!isPlayedActor(actor))
      return;
    const stances = getStances(actor);
    if (!stances.length)
      return;
    const inCombat = actor.getActiveTokens(true, true).some((token) => token.inCombat);
    const tab = html.find(
      ".sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter]"
    );
    const options = tab.find(".actions-options");
    const template = await renderTemplate(templatePath("stances/sheet"), {
      stances,
      canUseStances: inCombat && !actor.isDead,
      i18n: subLocalize("stances")
    });
    if (options.length)
      options.after(template);
    else
      tab.prepend(template);
    html.find(
      ".sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter] .pf2e-stances .pf2e-stances__stance"
    ).on("click", (event) => onToggleStance(event, actor));
  }
  __name(renderCharacterSheetPF2e2, "renderCharacterSheetPF2e");
  function onToggleStance(event, actor) {
    const target = event.currentTarget;
    const canUseStances = target.closest(".pf2e-stances")?.classList.contains("can-use-stances");
    if (!event.ctrlKey && !canUseStances)
      return;
    const effectUUID = target.dataset.effectUuid;
    toggleStance(actor, effectUUID);
  }
  __name(onToggleStance, "onToggleStance");
  function* actorStances(actor) {
    for (const feat of actor.itemTypes.feat) {
      const sourceId = feat.sourceId;
      const replacer = REPLACERS.get(sourceId);
      const extra = EXTRAS.get(sourceId);
      if (!replacer && !extra && !isValidStance(feat))
        continue;
      const effectUUID = replacer?.effect ?? extra?.effect ?? feat.system.selfEffect.uuid;
      const effect = fromUuidSync(effectUUID);
      if (!effect)
        continue;
      yield {
        name: (replacer && fromUuidSync(replacer.replace)?.name) ?? feat.name,
        itemName: feat.name,
        replace: replacer?.replace,
        extra,
        sourceId,
        effectUUID,
        effect: getItemWithSourceId(actor, effectUUID, "effect"),
        action: extra?.action,
        img: effect.img
      };
    }
  }
  __name(actorStances, "actorStances");
  function getStancesEffects(actor) {
    const effects = [];
    for (const { effect } of actorStances(actor)) {
      if (!effect)
        continue;
      effects.push({
        uuid: effect.sourceId,
        id: effect.id
      });
    }
    return effects;
  }
  __name(getStancesEffects, "getStancesEffects");
  async function toggleStance(actor, effectUUID) {
    const effects = getStancesEffects(actor);
    const already = effects.findIndex((effect) => effect.uuid === effectUUID);
    let create = false;
    if (already === -1) {
      create = true;
    } else {
      const other = effects.filter((effect) => effect.uuid !== effectUUID).length;
      const more = effects.filter((effect) => effect.uuid === effectUUID).length > 1;
      if (other || more)
        effects.splice(already, 1);
    }
    if (effects.length) {
      await actor.deleteEmbeddedDocuments(
        "Item",
        effects.map((x) => x.id)
      );
    }
    if (create)
      addStance(actor, effectUUID);
  }
  __name(toggleStance, "toggleStance");
  async function addStance(actor, uuid) {
    const effect = await fromUuid(uuid);
    if (effect) {
      const obj = effect.toObject();
      if (!getProperty(obj, "flags.core.sourceId"))
        setProperty(obj, "flags.core.sourceId", effect.uuid);
      const items = await actor.createEmbeddedDocuments("Item", [obj]);
      items[0]?.toMessage();
      return true;
    }
    return false;
  }
  __name(addStance, "addStance");
  function deleteCombat(combat) {
    for (const combatant of combat.combatants) {
      deleteCombatant(combatant);
    }
  }
  __name(deleteCombat, "deleteCombat");
  function deleteCombatant(combatant) {
    const actor = getActorFromCombatant(combatant);
    if (!actor)
      return;
    if (!game.user.isGM && isActiveOwner(actor)) {
      const effects = getStancesEffects(actor).map((effect) => effect.id);
      if (effects.length)
        actor.deleteEmbeddedDocuments("Item", effects);
    }
    refreshCharacterSheets(actor);
  }
  __name(deleteCombatant, "deleteCombatant");
  function createCombatant(combatant) {
    const actor = getActorFromCombatant(combatant);
    if (!actor)
      return;
    if (!game.user.isGM && isActiveOwner(actor))
      checkForSavant(actor);
    refreshCharacterSheets(actor);
  }
  __name(createCombatant, "createCombatant");
  function getActorFromCombatant(combatant) {
    const actor = combatant.actor;
    if (actor && !actor.isToken && actor.isOfType("character"))
      return actor;
  }
  __name(getActorFromCombatant, "getActorFromCombatant");
  async function checkForSavant(actor) {
    const stances = getStances(actor);
    if (!stances.length)
      return;
    const hasStancesEffects = stances.filter(({ effectID }) => effectID).length;
    if (hasStancesEffects)
      return;
    const hasSavantFeat = hasItemWithSourceId(actor, STANCE_SAVANT, ["feat"]);
    if (!hasSavantFeat)
      return;
    if (stances.length === 1) {
      const stance = stances[0];
      if (await addStance(actor, stance.effectUUID))
        info("stances.useStance", { stance: stance.name });
    } else {
      openStancesMenu(actor, stances);
    }
  }
  __name(checkForSavant, "checkForSavant");
  async function openStancesMenu(actor, stances) {
    const localize6 = subLocalize("stances.menu");
    new Dialog({
      title: localize6("title"),
      content: await renderTemplate(templatePath("stances/menu"), {
        stances,
        i18n: localize6
      }),
      buttons: {
        yes: {
          icon: '<i class="fa-solid fa-people-arrows"></i>',
          label: localize6("accept"),
          callback: (html) => addStance(actor, html.find("[name=stance]:checked").val())
        },
        no: {
          icon: '<i class="fa-solid fa-xmark"></i>',
          label: localize6("cancel")
        }
      }
    }).render(true);
  }
  __name(openStancesMenu, "openStancesMenu");

  // src/shared/pf2e/misc.js
  function ErrorPF2e(message) {
    return Error(`PF2e System | ${message}`);
  }
  __name(ErrorPF2e, "ErrorPF2e");
  var intlNumberFormat;
  function signedInteger(value, { emptyStringZero = false, zeroIsNegative = false } = {}) {
    if (value === 0 && emptyStringZero)
      return "";
    intlNumberFormat ??= new Intl.NumberFormat(game.i18n.lang, {
      maximumFractionDigits: 0,
      signDisplay: "always"
    });
    const maybeNegativeZero = zeroIsNegative && value === 0 ? -0 : value;
    return intlNumberFormat.format(maybeNegativeZero);
  }
  __name(signedInteger, "signedInteger");
  function spellSlotGroupIdToNumber(groupId) {
    if (groupId === "cantrips")
      return 0;
    const numericValue = Number(groupId ?? NaN);
    return numericValue.between(0, 10) ? numericValue : null;
  }
  __name(spellSlotGroupIdToNumber, "spellSlotGroupIdToNumber");

  // src/features/summary.js
  function registerSpellsSummary() {
    return {
      settings: [
        {
          name: "summary",
          type: String,
          default: "disabled",
          scope: "client",
          choices: ["disabled", "enabled", "sort"],
          onChange: (value) => setup5(value)
        }
      ],
      conflicts: ["pf2e-spells-summary"],
      ready: (isGm) => {
        setup5();
      }
    };
  }
  __name(registerSpellsSummary, "registerSpellsSummary");
  function setup5(value) {
    const enabled2 = (value ?? getSetting("summary")) !== "disabled";
    if (enabled2) {
      registerCharacterSheetExtraTab({
        tabName: "spellcasting",
        templateFolder: "summary/sheet",
        getData: getData2,
        addEvents: addEvents3
      });
    } else {
      unregisterCharacterSheetExtraTab("spellcasting");
    }
  }
  __name(setup5, "setup");
  function addEvents3(html, sheet, actor) {
    const inputs = html.find(".spell-type .uses .spell-slots-input input");
    inputs.on("change", (event) => onUsesInputChange(event, actor));
    inputs.on("focus", onUsesInputFocus);
    inputs.on("blur", onUsesInputBlur);
    html.find(".focus-pips").on("click contextmenu", (event) => onToggleFocusPool(event, actor));
    html.find(".spell-slots-increment-reset").on("click", (event) => onSlotsReset(event, sheet, actor));
    html.find(".item-image").on("click", (event) => onItemToChat(event, actor));
  }
  __name(addEvents3, "addEvents");
  async function onUsesInputChange(event, actor) {
    event.preventDefault();
    const { inputPath, entryId } = $(event.currentTarget).data();
    const value = event.currentTarget.valueAsNumber;
    actor.updateEmbeddedDocuments("Item", [{ _id: entryId, [inputPath]: value }]);
  }
  __name(onUsesInputChange, "onUsesInputChange");
  function onUsesInputFocus(event) {
    event.preventDefault();
    event.currentTarget.closest(".item")?.classList.add("hover");
  }
  __name(onUsesInputFocus, "onUsesInputFocus");
  function onUsesInputBlur(event) {
    event.preventDefault();
    event.currentTarget.closest(".item")?.classList.remove("hover");
  }
  __name(onUsesInputBlur, "onUsesInputBlur");
  function onToggleFocusPool(event, actor) {
    event.preventDefault();
    const change = event.type === "click" ? 1 : -1;
    const points = (actor.system.resources.focus?.value ?? 0) + change;
    actor.update({ "system.resources.focus.value": points });
  }
  __name(onToggleFocusPool, "onToggleFocusPool");
  function onChargesReset(sheet, actor, entryId) {
    if (game.modules.get("pf2e-staves")?.active) {
      const original = getSpellcastingTab(sheet.element).find(
        ".directory-list.spellcastingEntry-list"
      );
      const entry2 = original.find(
        `.item-container.spellcasting-entry[data-item-id=${entryId}]`
      );
      const btn = entry2.find(
        ".spell-ability-data .statistic-values a.pf2e-staves-charge"
      );
      btn[0]?.click();
      return;
    }
    const dailies = game.modules.get("pf2e-dailies");
    if (!dailies?.active)
      return;
    const entry = actor.spellcasting.get(entryId);
    dailies.api.updateEntryCharges(entry, 9999);
  }
  __name(onChargesReset, "onChargesReset");
  function onSlotsReset(event, sheet, actor) {
    event.preventDefault();
    const { itemId, rank, isCharge } = $(event.currentTarget).data();
    if (!itemId)
      return;
    if (isCharge) {
      onChargesReset(sheet, actor, itemId);
      return;
    }
    const item = actor.items.get(itemId);
    if (!item)
      return;
    if (item.isOfType("spellcastingEntry")) {
      const slotLevel = rank >= 0 && rank <= 11 ? `slot${rank}` : "slot0";
      const slot = item.system.slots?.[slotLevel];
      if (slot)
        item.update({ [`system.slots.${slotLevel}.value`]: slot.max });
    } else if (item.isOfType("spell")) {
      const max = item.system.location.uses?.max;
      if (max)
        item.update({ "system.location.uses.value": max });
    }
  }
  __name(onSlotsReset, "onSlotsReset");
  async function onItemToChat(event, actor) {
    const itemId = $(event.currentTarget).closest(".item").attr("data-item-id");
    const item = actor.items.get(itemId);
    item.toMessage(event);
  }
  __name(onItemToChat, "onItemToChat");
  function getSpellcastingTab(html) {
    return html.find(
      "section.sheet-body .sheet-content > .tab[data-tab=spellcasting]"
    );
  }
  __name(getSpellcastingTab, "getSpellcastingTab");
  async function getData2(actor) {
    const focusPool = actor.system.resources.focus ?? { value: 0, max: 0 };
    const pf2eStavesActive = game.modules.get("pf2e-staves")?.active;
    const pf2eDailies = game.modules.get("pf2e-dailies");
    const pf2eDailiesActive = pf2eDailies?.active;
    const stavesActive = pf2eStavesActive || pf2eDailiesActive && isNewerVersion(pf2eDailies.version, "2.14.0");
    const chargesPath = pf2eStavesActive ? "flags.pf2e-staves.charges" : pf2eDailiesActive ? "flags.pf2e-dailies.staff.charges" : "";
    const spells = [];
    const focuses = [];
    let hasFocusCantrips = false;
    await Promise.all(
      actor.spellcasting.regular.map(async (entry) => {
        const entryId = entry.id;
        const entryDc = entry.statistic.dc.value;
        const entryName = entry.name;
        const data = await entry.getSheetData();
        const isFocus = data.isFocusPool;
        const isCharge = entry.system?.prepared?.value === "charge";
        const isScroll = entry.system?.prepared?.value === "scroll";
        const isWand = entry.system?.prepared?.value === "wand";
        const charges = (() => {
          if (!isCharge)
            return;
          const dailiesData = pf2eDailiesActive && pf2eDailies.api.getSpellcastingEntryStaffData(entry);
          const { charges: charges2, max, canPayCost } = dailiesData ?? getProperty(entry, "flags.pf2e-staves.charges") ?? {
            charges: 0,
            max: 0
          };
          return {
            value: charges2,
            max,
            noMax: true,
            canPayCost: canPayCost ?? (() => true)
          };
        })();
        for (const group of data.groups) {
          if (!group.active.length || group.uses?.max === 0)
            continue;
          const slotSpells = [];
          const isCantrip = group.id === "cantrips";
          const groupNumber = spellSlotGroupIdToNumber(group.id);
          const isBroken = !isCantrip && isCharge && !stavesActive;
          for (let slotId = 0; slotId < group.active.length; slotId++) {
            const active = group.active[slotId];
            if (!active || active.uses?.max === 0)
              continue;
            const { spell, expended, virtual, uses, castRank } = active;
            slotSpells.push({
              name: spell.name,
              img: spell.img,
              range: spell.system.range.value || "-",
              castRank: castRank ?? spell.rank,
              slotId,
              entryId,
              entryDc,
              entryName,
              itemId: spell.id,
              inputId: data.isInnate ? spell.id : data.id,
              inputPath: isCharge ? chargesPath : data.isInnate ? "system.location.uses.value" : `system.slots.slot${groupNumber}.value`,
              isCharge,
              isActiveCharge: isCharge && stavesActive,
              isBroken,
              isVirtual: virtual,
              isInnate: data.isInnate,
              isCantrip,
              isFocus,
              isPrepared: data.isPrepared,
              isSpontaneous: data.isSpontaneous || data.isFlexible,
              groupId: group.id,
              uses: uses ?? (isCharge ? charges : group.uses),
              expended: isCharge && !isCantrip ? !charges.canPayCost(groupNumber) : expended ?? (isFocus && !isCantrip ? focusPool.value <= 0 : false),
              action: spell.system.time.value,
              type: isCharge ? `${MODULE_ID}.summary.staff` : data.isInnate ? "PF2E.PreparationTypeInnate" : data.isSpontaneous ? "PF2E.PreparationTypeSpontaneous" : data.isFlexible ? "PF2E.SpellFlexibleLabel" : isFocus ? "PF2E.TraitFocus" : isScroll ? "Scroll" : isWand ? "Wand" : "PF2E.SpellPreparedLabel",
              order: isCharge ? 0 : data.isPrepared ? 1 : isFocus ? 2 : data.isInnate ? 3 : data.isSpontaneous ? 4 : 5,
              noHover: data.isPrepared || isCantrip || isBroken || isFocus
            });
          }
          if (slotSpells.length) {
            if (isFocus) {
              if (isCantrip)
                hasFocusCantrips = true;
              else {
                focuses.push(...slotSpells);
                continue;
              }
            }
            spells[groupNumber] ??= [];
            spells[groupNumber].push(...slotSpells);
          }
        }
      })
    );
    if (spells.length) {
      const sort = getSetting("summary") === "sort" ? (a, b) => a.order === b.order ? localeCompare(a.name, b.name) : a.order - b.order : (a, b) => localeCompare(a.name, b.name);
      for (const entry of spells) {
        if (!entry)
          continue;
        entry.sort(sort);
      }
    }
    if (focuses.length) {
      focuses.sort((a, b) => localeCompare(a.name, b.name));
      spells[12] = focuses;
      hasFocusCantrips = false;
    }
    const ritualData = await actor.spellcasting.ritual?.getSheetData();
    const rituals = ritualData?.groups.flatMap(
      (slot, slotId) => slot.active.map(({ spell }) => ({
        name: spell.name,
        img: spell.img,
        slotId,
        itemId: spell.id,
        rank: spell.rank,
        time: spell.system.time.value
      })).filter(Boolean)
    );
    return {
      spells,
      rituals,
      focusPool,
      hasFocusCantrips,
      isOwner: actor.isOwner,
      entryRank: (rank) => game.i18n.format("PF2E.Item.Spell.Rank.Ordinal", {
        rank: ordinalString(rank)
      })
    };
  }
  __name(getData2, "getData");

  // src/shared/dicesonice.js
  async function roll3dDice(roll, { user = game.user, synchronize = true } = {}) {
    if (!game.modules.get("dice-so-nice")?.active)
      return;
    return game.dice3d.showForRoll(roll, user, synchronize);
  }
  __name(roll3dDice, "roll3dDice");

  // src/shared/pf2e/actor.js
  function applyStackingRules(modifiers) {
    let total = 0;
    const highestBonus = {};
    const lowestPenalty = {};
    const abilityModifiers = modifiers.filter(
      (m) => m.type === "ability" && !m.ignored
    );
    const bestAbility = abilityModifiers.reduce((best, modifier) => {
      if (best === null) {
        return modifier;
      }
      return modifier.force ? modifier : best.force ? best : modifier.modifier > best.modifier ? modifier : best;
    }, null);
    for (const modifier of abilityModifiers) {
      modifier.ignored = modifier !== bestAbility;
    }
    for (const modifier of modifiers) {
      if (modifier.ignored) {
        modifier.enabled = false;
        continue;
      }
      if (modifier.type === "untyped") {
        modifier.enabled = true;
        total += modifier.modifier;
        continue;
      }
      if (modifier.modifier < 0) {
        total += applyStacking(lowestPenalty, modifier, LOWER_PENALTY);
      } else {
        total += applyStacking(highestBonus, modifier, HIGHER_BONUS);
      }
    }
    return total;
  }
  __name(applyStackingRules, "applyStackingRules");
  function applyStacking(best, modifier, isBetter) {
    const existing = best[modifier.type];
    if (existing === void 0) {
      modifier.enabled = true;
      best[modifier.type] = modifier;
      return modifier.modifier;
    }
    if (isBetter(modifier, existing)) {
      existing.enabled = false;
      modifier.enabled = true;
      best[modifier.type] = modifier;
      return modifier.modifier - existing.modifier;
    }
    modifier.enabled = false;
    return 0;
  }
  __name(applyStacking, "applyStacking");

  // src/shared/pf2e/dom.js
  function htmlQuery(parent, selectors) {
    if (!(parent instanceof Element || parent instanceof Document))
      return null;
    return parent.querySelector(selectors);
  }
  __name(htmlQuery, "htmlQuery");

  // src/shared/pf2e/rules.js
  async function extractEphemeralEffects({
    affects,
    origin,
    target,
    item,
    domains,
    options
  }) {
    if (!(origin && target))
      return [];
    const [effectsFrom, effectsTo] = affects === "target" ? [origin, target] : [target, origin];
    const fullOptions = [
      ...options,
      effectsFrom.getRollOptions(domains),
      effectsTo.getSelfRollOptions(affects)
    ].flat();
    const resolvables = item ? item.isOfType("spell") ? { spell: item } : { weapon: item } : {};
    return (await Promise.all(
      domains.flatMap(
        (s) => effectsFrom.synthetics.ephemeralEffects[s]?.[affects] ?? []
      ).map((d) => d({ test: fullOptions, resolvables }))
    )).flatMap((e) => e ?? []);
  }
  __name(extractEphemeralEffects, "extractEphemeralEffects");
  function extractNotes(rollNotes, selectors) {
    return selectors.flatMap((s) => (rollNotes[s] ?? []).map((n) => n.clone()));
  }
  __name(extractNotes, "extractNotes");
  function extractDamageDice(deferredDice, selectors, options) {
    return selectors.flatMap((s) => deferredDice[s] ?? []).flatMap((d) => d(options) ?? []);
  }
  __name(extractDamageDice, "extractDamageDice");
  function extractModifiers(synthetics, selectors, options) {
    const { modifierAdjustments, modifiers: syntheticModifiers } = synthetics;
    const modifiers = Array.from(new Set(selectors)).flatMap((s) => syntheticModifiers[s] ?? []).flatMap((d) => d(options) ?? []);
    for (const modifier of modifiers) {
      modifier.adjustments = extractModifierAdjustments(
        modifierAdjustments,
        selectors,
        modifier.slug
      );
    }
    return modifiers;
  }
  __name(extractModifiers, "extractModifiers");
  function extractModifierAdjustments(adjustmentsRecord, selectors, slug) {
    const adjustments = Array.from(
      new Set(selectors.flatMap((s) => adjustmentsRecord[s] ?? []))
    );
    return adjustments.filter((a) => [slug, null].includes(a.slug));
  }
  __name(extractModifierAdjustments, "extractModifierAdjustments");

  // src/shared/pf2e/chat.js
  async function applyDamageFromMessage(token, {
    message,
    multiplier = 1,
    addend = 0,
    promptModifier = false,
    rollIndex = 0
  }) {
    if (promptModifier)
      return shiftAdjustDamage(token, { message, multiplier, rollIndex });
    const shieldBlockRequest = CONFIG.PF2E.chatDamageButtonShieldToggle;
    const roll = message.rolls.at(rollIndex);
    if (!isInstanceOf(roll, "DamageRoll"))
      throw ErrorPF2e("Unexpected error retrieving damage roll");
    let damage = multiplier < 0 ? multiplier * roll.total + addend : roll.alter(multiplier, addend);
    const messageRollOptions = [...message.flags.pf2e.context?.options ?? []];
    const originRollOptions = messageRollOptions.filter((o) => o.startsWith("self:")).map((o) => o.replace(/^self/, "origin"));
    const messageItem = message.item;
    if (!token.actor)
      return;
    if (!messageRollOptions.some((o) => o.startsWith("target"))) {
      messageRollOptions.push(...token.actor.getSelfRollOptions("target"));
    }
    const domain = multiplier > 0 ? "damage-received" : "healing-received";
    const ephemeralEffects = multiplier > 0 ? await extractEphemeralEffects({
      affects: "target",
      origin: message.actor,
      target: token.actor,
      item: message.item,
      domains: [domain],
      options: messageRollOptions
    }) : [];
    const contextClone = token.actor.getContextualClone(
      originRollOptions,
      ephemeralEffects
    );
    const applicationRollOptions = /* @__PURE__ */ new Set([
      ...messageRollOptions.filter((o) => !/^(?:self|target):/.test(o)),
      ...originRollOptions,
      ...contextClone.getSelfRollOptions()
    ]);
    const outcome = message.flags.pf2e.context?.outcome;
    const breakdown = [];
    const rolls = [];
    if (typeof damage === "number" && damage < 0) {
      const critical = outcome === "criticalSuccess";
      const resolvables = (() => {
        if (messageItem?.isOfType("spell"))
          return { spell: messageItem };
        if (messageItem?.isOfType("weapon"))
          return { weapon: messageItem };
        return {};
      })();
      const damageDice = extractDamageDice(
        contextClone.synthetics.damageDice,
        [domain],
        {
          resolvables,
          test: applicationRollOptions
        }
      ).filter(
        (d) => (d.critical === null || d.critical === critical) && d.predicate.test(applicationRollOptions)
      );
      for (const dice of damageDice) {
        const formula = `${dice.diceNumber}${dice.dieSize}[${dice.label}]`;
        const roll2 = await new Roll(formula).evaluate({ async: true });
        roll2._formula = `${dice.diceNumber}${dice.dieSize}`;
        await roll2.toMessage({
          flags: { pf2e: { suppressDamageButtons: true } },
          flavor: dice.label,
          speaker: ChatMessage.getSpeaker({ token })
        });
        breakdown.push(`${dice.label} ${dice.diceNumber}${dice.dieSize}`);
        rolls.push(roll2);
      }
      if (rolls.length) {
        damage -= rolls.map((roll2) => roll2.total).reduce((previous, current) => previous + current);
      }
      const modifiers = extractModifiers(contextClone.synthetics, [domain], {
        resolvables
      }).filter(
        (m) => (m.critical === null || m.critical === critical) && m.predicate.test(applicationRollOptions)
      );
      damage -= applyStackingRules(modifiers ?? []);
      breakdown.push(
        ...modifiers.filter((m) => m.enabled).map((m) => `${m.label} ${signedInteger(m.modifier)}`)
      );
    }
    const hasDamage = typeof damage === "number" ? damage !== 0 : damage.total !== 0;
    const notes = (() => {
      if (!hasDamage)
        return [];
      return extractNotes(contextClone.synthetics.rollNotes, [domain]).filter(
        (n) => (!outcome || n.outcome.length === 0 || n.outcome.includes(outcome)) && n.predicate.test(applicationRollOptions)
      ).map((note) => note.text);
    })();
    await contextClone.applyDamage({
      damage,
      token,
      item: message.item,
      skipIWR: multiplier <= 0,
      rollOptions: applicationRollOptions,
      shieldBlockRequest,
      breakdown,
      notes
    });
    toggleOffShieldBlock(message.id);
    onDamageApplied(message, token.id, rollIndex);
  }
  __name(applyDamageFromMessage, "applyDamageFromMessage");
  function onClickShieldBlock(target, shieldButton, messageEl) {
    const getTokens = /* @__PURE__ */ __name(() => {
      return [target];
    }, "getTokens");
    const getNonBrokenShields = /* @__PURE__ */ __name((tokens) => {
      const actor = tokens[0]?.actor;
      return actor?.itemTypes.shield.filter(
        (s) => s.isEquipped && !s.isBroken && !s.isDestroyed
      ) ?? [];
    }, "getNonBrokenShields");
    if (!shieldButton.classList.contains("tooltipstered")) {
      $(shieldButton).tooltipster({
        animation: "fade",
        trigger: "click",
        arrow: false,
        content: $(messageEl).find("div.hover-content"),
        contentAsHTML: true,
        contentCloning: true,
        debug: false,
        interactive: true,
        side: ["top"],
        theme: "crb-hover",
        functionBefore: () => {
          const tokens = getTokens();
          if (!tokens.length)
            return false;
          const nonBrokenShields = getNonBrokenShields(tokens);
          const hasMultipleShields = tokens.length === 1 && nonBrokenShields.length > 1;
          const shieldActivated = shieldButton.classList.contains("shield-activated");
          if (hasMultipleShields && !shieldActivated) {
            return true;
          }
          if (hasMultipleShields && shieldButton.dataset.shieldId) {
            shieldButton.attributes.removeNamedItem("data-shield-id");
            shieldButton.classList.remove("shield-activated");
            CONFIG.PF2E.chatDamageButtonShieldToggle = false;
            return true;
          }
          shieldButton.classList.toggle("shield-activated");
          CONFIG.PF2E.chatDamageButtonShieldToggle = !CONFIG.PF2E.chatDamageButtonShieldToggle;
          return false;
        },
        functionFormat: (instance, _helper, $content) => {
          const tokens = getTokens();
          const nonBrokenShields = getNonBrokenShields(tokens);
          const multipleShields = tokens.length === 1 && nonBrokenShields.length > 1;
          const shieldActivated = shieldButton.classList.contains("shield-activated");
          if (multipleShields && !shieldActivated) {
            const content = $content[0];
            const listEl = htmlQuery(content, "ul.shield-options");
            if (!listEl)
              return $content;
            const shieldList = [];
            for (const shield of nonBrokenShields) {
              const input = document.createElement("input");
              input.classList.add("data");
              input.type = "radio";
              input.name = "shield-id";
              input.value = shield.id;
              input.addEventListener("click", () => {
                shieldButton.dataset.shieldId = input.value;
                shieldButton.classList.add("shield-activated");
                CONFIG.PF2E.chatDamageButtonShieldToggle = true;
                instance.close();
              });
              const shieldName = document.createElement("span");
              shieldName.classList.add("label");
              shieldName.innerHTML = shield.name;
              const hardness = document.createElement("span");
              hardness.classList.add("tag");
              const hardnessLabel = game.i18n.localize("PF2E.HardnessLabel");
              hardness.innerHTML = `${hardnessLabel}: ${shield.hardness}`;
              const itemLi = document.createElement("li");
              itemLi.classList.add("item");
              itemLi.append(input, shieldName, hardness);
              shieldList.push(itemLi);
            }
            listEl.replaceChildren(...shieldList);
          }
          return $content;
        }
      }).tooltipster("open");
    }
  }
  __name(onClickShieldBlock, "onClickShieldBlock");
  function toggleOffShieldBlock(messageId) {
    for (const app of ["#chat-log", "#chat-popout"]) {
      const selector = `${app} > li.chat-message[data-message-id="${messageId}"] button[data-action=shield-block]`;
      const button = htmlQuery(document.body, selector);
      button?.classList.remove("shield-activated");
    }
    CONFIG.PF2E.chatDamageButtonShieldToggle = false;
  }
  __name(toggleOffShieldBlock, "toggleOffShieldBlock");
  async function shiftAdjustDamage(token, { message, multiplier, rollIndex }) {
    const content = await renderTemplate(
      "systems/pf2e/templates/chat/damage/adjustment-dialog.hbs"
    );
    const AdjustmentDialog = class extends Dialog {
      static {
        __name(this, "AdjustmentDialog");
      }
      activateListeners($html) {
        super.activateListeners($html);
        $html[0].querySelector("input")?.focus();
      }
    };
    const isHealing = multiplier < 0;
    new AdjustmentDialog({
      title: game.i18n.localize(
        isHealing ? "PF2E.UI.shiftModifyHealingTitle" : "PF2E.UI.shiftModifyDamageTitle"
      ),
      content,
      buttons: {
        ok: {
          label: game.i18n.localize("PF2E.OK"),
          callback: async ($dialog) => {
            const adjustment = (Number($dialog[0].querySelector("input")?.value) || 0) * Math.sign(multiplier);
            applyDamageFromMessage(token, {
              message,
              multiplier,
              addend: adjustment,
              promptModifier: false,
              rollIndex
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "ok",
      close: () => {
        toggleOffShieldBlock(message.id);
      }
    }).render(true);
  }
  __name(shiftAdjustDamage, "shiftAdjustDamage");

  // src/shared/pf2e/success.js
  var DEGREE_ADJUSTMENT_AMOUNTS = {
    LOWER_BY_TWO: -2,
    LOWER: -1,
    INCREASE: 1,
    INCREASE_BY_TWO: 2,
    TO_CRITICAL_FAILURE: "criticalFailure",
    TO_FAILURE: "failure",
    TO_SUCCESS: "success",
    TO_CRITICAL_SUCCESS: "criticalSuccess"
  };
  var DEGREE_OF_SUCCESS_STRINGS = [
    "criticalFailure",
    "failure",
    "success",
    "criticalSuccess"
  ];
  var DegreeOfSuccess = class _DegreeOfSuccess {
    static {
      __name(this, "DegreeOfSuccess");
    }
    constructor(roll, dc, dosAdjustments = null) {
      if (roll instanceof Roll) {
        this.dieResult = (roll.isDeterministic ? roll.terms.find((t) => t instanceof NumericTerm) : roll.dice.find((d) => d instanceof Die && d.faces === 20))?.total ?? 1;
        this.rollTotal = roll.total;
      } else {
        this.dieResult = roll.dieValue;
        this.rollTotal = roll.dieValue + roll.modifier;
      }
      this.dc = typeof dc === "number" ? { value: dc } : dc;
      this.unadjusted = this.#calculateDegreeOfSuccess();
      this.adjustment = this.#getDegreeAdjustment(
        this.unadjusted,
        dosAdjustments
      );
      this.value = this.adjustment ? this.#adjustDegreeOfSuccess(this.adjustment.amount, this.unadjusted) : this.unadjusted;
    }
    static CRITICAL_FAILURE = 0;
    static FAILURE = 1;
    static SUCCESS = 2;
    static CRITICAL_SUCCESS = 3;
    #getDegreeAdjustment(degree, adjustments) {
      if (!adjustments)
        return null;
      for (const outcome of ["all", ...DEGREE_OF_SUCCESS_STRINGS]) {
        const { label, amount } = adjustments[outcome] ?? {};
        if (amount && label && !(degree === _DegreeOfSuccess.CRITICAL_SUCCESS && amount === DEGREE_ADJUSTMENT_AMOUNTS.INCREASE) && !(degree === _DegreeOfSuccess.CRITICAL_FAILURE && amount === DEGREE_ADJUSTMENT_AMOUNTS.LOWER) && (outcome === "all" || DEGREE_OF_SUCCESS_STRINGS.indexOf(outcome) === degree)) {
          return { label, amount };
        }
      }
      return null;
    }
    #adjustDegreeOfSuccess(amount, degreeOfSuccess) {
      switch (amount) {
        case "criticalFailure":
          return 0;
        case "failure":
          return 1;
        case "success":
          return 2;
        case "criticalSuccess":
          return 3;
        default:
          return Math.clamped(degreeOfSuccess + amount, 0, 3);
      }
    }
    /**
     * @param degree The current success value
     * @return The new success value
     */
    #adjustDegreeByDieValue(degree) {
      if (this.dieResult === 20) {
        return this.#adjustDegreeOfSuccess(
          DEGREE_ADJUSTMENT_AMOUNTS.INCREASE,
          degree
        );
      }
      if (this.dieResult === 1) {
        return this.#adjustDegreeOfSuccess(
          DEGREE_ADJUSTMENT_AMOUNTS.LOWER,
          degree
        );
      }
      return degree;
    }
    #calculateDegreeOfSuccess() {
      const dc = this.dc.value;
      if (this.rollTotal - dc >= 10) {
        return this.#adjustDegreeByDieValue(_DegreeOfSuccess.CRITICAL_SUCCESS);
      }
      if (dc - this.rollTotal >= 10) {
        return this.#adjustDegreeByDieValue(_DegreeOfSuccess.CRITICAL_FAILURE);
      }
      if (this.rollTotal >= dc) {
        return this.#adjustDegreeByDieValue(_DegreeOfSuccess.SUCCESS);
      }
      return this.#adjustDegreeByDieValue(_DegreeOfSuccess.FAILURE);
    }
  };

  // src/shared/template.js
  function getTemplateTokens(measuredTemplate, { collisionOrigin, collisionType = "move" } = {}) {
    const template = measuredTemplate instanceof MeasuredTemplateDocument ? measuredTemplate.object : measuredTemplate;
    if (!canvas.scene)
      return [];
    const { grid, dimensions } = canvas;
    if (!(grid && dimensions))
      return [];
    if (!template?.highlightId)
      return [];
    const gridHighlight = grid.getHighlightLayer(template.highlightId);
    if (!gridHighlight || grid.type !== CONST.GRID_TYPES.SQUARE)
      return [];
    const origin = collisionOrigin ?? template.center;
    const tokens = canvas.tokens.quadtree.getObjects(
      gridHighlight.getLocalBounds(void 0, true)
    );
    const gridSize = grid.size;
    const containedTokens = [];
    for (const token of tokens) {
      const tokenDoc = token.document;
      const tokenPositions = [];
      for (let h = 0; h < tokenDoc.height; h++) {
        const tokenX = Math.floor(token.x / gridSize) * gridSize;
        const tokenY = Math.floor(token.y / gridSize) * gridSize;
        const y = tokenY + h * gridSize;
        tokenPositions.push(`${tokenX}.${y}`);
        if (tokenDoc.width > 1) {
          for (let w = 1; w < tokenDoc.width; w++) {
            tokenPositions.push(`${tokenX + w * gridSize}.${y}`);
          }
        }
      }
      for (const position of tokenPositions) {
        if (!gridHighlight.positions.has(position)) {
          continue;
        }
        const [gx, gy] = position.split(".").map((s) => Number(s));
        const destination = {
          x: gx + dimensions.size * 0.5,
          y: gy + dimensions.size * 0.5
        };
        if (destination.x < 0 || destination.y < 0)
          continue;
        const hasCollision = canvas.ready && collisionType && CONFIG.Canvas.polygonBackends[collisionType].testCollision(
          origin,
          destination,
          {
            type: collisionType,
            mode: "any"
          }
        );
        if (!hasCollision) {
          containedTokens.push(token);
          break;
        }
      }
    }
    return containedTokens;
  }
  __name(getTemplateTokens, "getTemplateTokens");

  // src/features/target.js
  var SAVES = {
    fortitude: { icon: "fa-solid fa-chess-rook", label: "PF2E.SavesFortitude" },
    reflex: { icon: "fa-solid fa-person-running", label: "PF2E.SavesReflex" },
    will: { icon: "fa-solid fa-brain", label: "PF2E.SavesWill" }
  };
  var REROLL = {
    hero: {
      icon: "fa-solid fa-hospital-symbol",
      reroll: "PF2E.RerollMenu.HeroPoint",
      rerolled: "PF2E.RerollMenu.MessageHeroPoint"
    },
    new: {
      icon: "fa-solid fa-dice",
      reroll: "PF2E.RerollMenu.KeepNew",
      rerolled: "PF2E.RerollMenu.MessageKeep.new"
    },
    lower: {
      icon: "fa-solid fa-dice-one",
      reroll: "PF2E.RerollMenu.KeepLower",
      rerolled: "PF2E.RerollMenu.MessageKeep.lower"
    },
    higher: {
      icon: "fa-solid fa-dice-six",
      reroll: "PF2E.RerollMenu.KeepHigher",
      rerolled: "PF2E.RerollMenu.MessageKeep.higher"
    }
  };
  var DEGREE_OF_SUCCESS = [
    "criticalFailure",
    "failure",
    "success",
    "criticalSuccess"
  ];
  var setPrecreateMessageHook = createHook(
    "preCreateChatMessage",
    preCreateChatMessage
  );
  var setRenderMessageHook = createChoicesHook(
    "renderChatMessage",
    renderChatMessage3
  );
  var setCreateTemplateHook = createHook(
    "createMeasuredTemplate",
    createMeasuredTemplate
  );
  var SOCKET2 = false;
  function registerTargetTokenHelper() {
    return {
      settings: [
        {
          name: "target",
          type: Boolean,
          default: false,
          onChange: setHooks
        },
        {
          name: "target-client",
          type: String,
          default: "disabled",
          choices: ["disabled", "small", "big"],
          scope: "client",
          onChange: (value) => setRenderMessageHook(value && getSetting("target"))
        },
        {
          name: "target-template",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: (value) => setCreateTemplateHook(value && getSetting("target"))
        }
      ],
      conflicts: [],
      init: () => {
        if (getSetting("target"))
          setHooks(true);
      }
    };
  }
  __name(registerTargetTokenHelper, "registerTargetTokenHelper");
  function setHooks(value) {
    setPrecreateMessageHook(value);
    setRenderMessageHook(value);
    setCreateTemplateHook(value && getSetting("target-template"));
    if (isUserGM()) {
      if (value && !SOCKET2) {
        socketOn(onSocket3);
        SOCKET2 = true;
      } else if (!value && SOCKET2) {
        socketOff(onSocket3);
        SOCKET2 = false;
      }
    }
  }
  __name(setHooks, "setHooks");
  function onSocket3(packet) {
    if (!isActiveGM())
      return;
    switch (packet.type) {
      case "target.update-save":
        updateMessageSave(packet);
        break;
      case "target.update-applied":
        updateMessageApplied(packet);
        break;
    }
  }
  __name(onSocket3, "onSocket");
  async function createMeasuredTemplate(template, _, userId) {
    const user = game.user;
    if (user.id !== userId)
      return;
    const localize6 = subLocalize("target.menu");
    const item = template.item;
    const actor = item?.actor;
    const self = !actor ? void 0 : actor.token ?? actor.getActiveTokens()[0];
    const data = {
      title: item?.name || localize6("title"),
      content: await renderTemplate(templatePath("target/template-menu"), {
        i18n: localize6,
        noSelf: !self
      }),
      buttons: {
        select: {
          icon: '<i class="fa-solid fa-bullseye-arrow"></i>',
          label: localize6("target"),
          callback: (html) => ({
            targets: html.find("[name=targets]:checked").val(),
            self: html.find("[name=self]").prop("checked"),
            neutral: html.find("[name=neutral]").prop("checked")
          })
        }
      },
      close: () => null
    };
    const result = await Dialog.wait(data, void 0, {
      id: "pf2e-toolbelt-target-template",
      width: 260
    });
    if (!result)
      return;
    const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
    const opposition = alliance === "party" ? "opposition" : alliance === "opposition" ? "party" : null;
    const tokens = getTemplateTokens(template);
    const targets = tokens.filter((token) => {
      const validActor = token.actor?.isOfType("creature", "hazard", "vehicle");
      if (!validActor)
        return false;
      if (token.document.hidden)
        return false;
      if (self && token === self)
        return result.self;
      const targetAlliance = token.actor ? token.actor.alliance : token.alliance;
      if (targetAlliance === null)
        return result.neutral;
      return result.targets === "all" || result.targets === "allies" && targetAlliance === alliance || result.targets === "enemies" && targetAlliance === opposition;
    });
    const targetsIds = targets.map((token) => token.id);
    user.updateTokenTargets(targetsIds);
    user.broadcastActivity({ targets: targetsIds });
  }
  __name(createMeasuredTemplate, "createMeasuredTemplate");
  var HEALINGS_REGEX;
  function isRegenMessage(message) {
    HEALINGS_REGEX ??= (() => {
      const healings = [
        game.i18n.localize(
          "PF2E.Encounter.Broadcast.FastHealing.fast-healing.ReceivedMessage"
        ),
        game.i18n.localize(
          "PF2E.Encounter.Broadcast.FastHealing.regeneration.ReceivedMessage"
        )
      ];
      return new RegExp(`^<div>(${healings.join("|")})</div>`);
    })();
    return HEALINGS_REGEX.test(message.flavor);
  }
  __name(isRegenMessage, "isRegenMessage");
  function isValidDamageMessage(message) {
    return !message.rolls[0].options.evaluatePersistent;
  }
  __name(isValidDamageMessage, "isValidDamageMessage");
  function preCreateChatMessage(message) {
    const isDamageRoll2 = message.isDamageRoll;
    const updates = [];
    if (isDamageRoll2 && !isValidDamageMessage(message))
      return;
    if (isDamageRoll2 && !getFlag(message, "target")) {
      const token = message.token;
      const actor = token?.actor;
      const isRegen = isRegenMessage(message);
      const targets = isRegen ? actor ? [{ token: token.uuid, actor: actor.uuid }] : [] : Array.from(
        game.user.targets.map((target) => ({
          token: target.document.uuid,
          actor: target.actor.uuid
        }))
      );
      updates.push(["targets", targets]);
      if (isRegen)
        updates.push(["isRegen", true]);
      if (message.rolls.length === 2) {
        const rolls = message.rolls.filter((roll) => roll.options);
        const splashRollIndex = rolls.findIndex(
          (roll) => roll.options.splashOnly
        );
        const regularRollIndex = rolls.findIndex(
          (roll) => !roll.options.splashOnly && roll.options.damage?.modifiers.some(
            (modifier) => modifier.damageCategory === "splash"
          )
        );
        if (splashRollIndex !== -1 && regularRollIndex !== -1) {
          updates.push(["splashIndex", splashRollIndex]);
        }
      }
    }
    if (isDamageRoll2 || message.getFlag("pf2e", "context.type") === "spell-cast") {
      const item = message.item;
      const save = item && item.type === "spell" && item.system.defense?.save;
      if (save) {
        const dc = (() => {
          if (!item.trickMagicEntry)
            return item.spellcasting?.statistic.dc.value;
          return $(message.content).find("[data-action=spell-save]").data()?.dc;
        })();
        if (typeof dc === "number")
          updates.push(["save", { ...save, dc }]);
      }
    }
    if (!updates.length)
      return;
    updateSourceFlag(
      message,
      "target",
      updates.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {})
    );
  }
  __name(preCreateChatMessage, "preCreateChatMessage");
  async function renderChatMessage3(message, html) {
    const clientEnabled = choiceSettingIsEnabled("target-client");
    if (clientEnabled && message.isDamageRoll) {
      if (!isValidDamageMessage(message))
        return;
      await renderDamageChatMessage(message, html);
      refreshMessage(message);
      return;
    }
    const item = message.item;
    if (!item || item.type !== "spell")
      return;
    if (clientEnabled && !item.damageKinds.size) {
      await renderSpellChatMessage(message, html, item);
      refreshMessage(message);
      return;
    }
    if (item.trickMagicEntry && item.system.defense?.save) {
      html.find("[data-action=spell-damage]").on("click", () => {
        bindOnPreCreateSpellDamageChatMessage(message);
      });
    }
  }
  __name(renderChatMessage3, "renderChatMessage");
  function refreshMessage(message) {
    Promise.all(
      [ui.chat, ui.chat._popout].map(async (chat) => {
        const el = chat?.element[0]?.querySelector("#chat-log");
        if (!el || !chat.isAtBottom && message.user._id !== game.user._id)
          return;
        await chat._waitForImages();
        el.scrollTop = el.scrollHeight;
      })
    );
    for (const app of Object.values(message.apps)) {
      if (!(app instanceof ChatPopout))
        continue;
      if (!app.rendered)
        continue;
      app.setPosition();
    }
  }
  __name(refreshMessage, "refreshMessage");
  async function renderSpellChatMessage(message, html, spell) {
    const data = await getMessageData2(message);
    if (!data)
      return;
    const { targets, save } = data;
    const msgContent = html.find(".message-content");
    const cardBtns = msgContent.find(".card-buttons");
    if (game.user.isGM || message.isAuthor) {
      const saveBtn = cardBtns.find("[data-action=spell-save]");
      const wrapper = $('<div class="pf2e-toolbelt-target-wrapper"></div>');
      const targetsTooltip = localize("target.chat.targets.tooltip");
      const targetsBtn = $(`<button class="pf2e-toolbelt-target-targets" title="${targetsTooltip}">
    <i class="fa-solid fa-bullseye-arrow"></i>
</button>`);
      targetsBtn.on("click", (event) => addTargets(event, message));
      wrapper.append(targetsBtn);
      wrapper.append(saveBtn);
      cardBtns.prepend(wrapper);
    }
    if (spell?.area && !spell.traits.has("aura")) {
      const template = canvas.scene?.templates.some(
        (template2) => template2.message === message && template2.isOwner
      );
      if (template)
        cardBtns.find(".owner-buttons .hidden.small").removeClass("hidden");
    }
    if (!targets.length)
      return;
    const rowsTemplate = $('<div class="pf2e-toolbelt-target-spell"></div>');
    for (const { template } of targets) {
      rowsTemplate.append("<hr>");
      rowsTemplate.append(template);
    }
    msgContent.after(rowsTemplate);
    addHeaderListeners(message, rowsTemplate, save);
  }
  __name(renderSpellChatMessage, "renderSpellChatMessage");
  function addTargets(event, message) {
    event.stopPropagation();
    const targets = game.user.targets;
    setFlag(
      message,
      "target.targets",
      Array.from(
        targets.map((target) => ({
          token: target.document.uuid,
          actor: target.actor.uuid
        }))
      )
    );
  }
  __name(addTargets, "addTargets");
  async function renderDamageChatMessage(message, html) {
    const data = await getMessageData2(message);
    const msgContent = html.find(".message-content");
    const damageRows = msgContent.find(".damage-application");
    const clonedRows = damageRows.clone();
    const buttons = $('<div class="pf2e-toolbelt-target-buttons"></div>');
    if (data?.targets.length && damageRows.length) {
      const toggleDamageRow = /* @__PURE__ */ __name(() => {
        const expanded = !!getInMemory(message, "target.expanded");
        toggleBtn.toggleClass("collapse", expanded);
        damageRows.toggleClass("hidden", !expanded);
      }, "toggleDamageRow");
      const toggleTooltip = localize("target.chat.toggle.tooltip");
      const toggleBtn = $(`<button class="toggle" title="${toggleTooltip}">
    <i class="fa-solid fa-plus expand"></i>
    <i class="fa-solid fa-minus collapse"></i>
</button>`);
      toggleDamageRow();
      toggleBtn.on("click", (event) => {
        event.stopPropagation();
        setInMemory(
          message,
          "target.expanded",
          !getInMemory(message, "target.expanded")
        );
        toggleDamageRow();
      });
      buttons.append(toggleBtn);
    }
    if (data?.isRegen !== true && (game.user.isGM || message.isAuthor)) {
      const targetsTooltip = localize("target.chat.targets.tooltip");
      const targetsBtn = $(`<button class="targets" title="${targetsTooltip}">
    <i class="fa-solid fa-bullseye-arrow"></i>
</button>`);
      targetsBtn.on("click", (event) => addTargets(event, message));
      buttons.append(targetsBtn);
    }
    html.find(".dice-result .dice-total").append(buttons);
    if (!data?.targets.length)
      return;
    const { targets, save } = data;
    if (!clonedRows.length)
      return;
    clonedRows.removeClass("damage-application").addClass("target-damage-application");
    if (getSetting("target-client") !== "big")
      clonedRows.find("button").addClass("small");
    clonedRows.find("[data-action]").each(function() {
      const action = this.dataset.action;
      this.dataset.action = `target-${action}`;
    });
    const rowsTemplate = $('<div class="pf2e-toolbelt-target-damage"></div>');
    for (const { uuid, template, save: save2, applied = {} } of targets) {
      const isBasicSave = !!(save2?.result && save2.basic);
      const clones = clonedRows.clone();
      rowsTemplate.append("<hr>");
      rowsTemplate.append(template);
      clones.each((index, el) => {
        el.dataset.rollIndex = index;
        el.dataset.targetUuid = uuid;
        el.classList.toggle(
          "applied",
          !!applied[index] || isBasicSave && save2.result.success === "criticalSuccess"
        );
        if (isBasicSave)
          el.classList.add(save2.result.success);
      });
      rowsTemplate.append(clones);
    }
    msgContent.after(rowsTemplate);
    addHeaderListeners(message, rowsTemplate, save);
    rowsTemplate.find("button[data-action^=target-]").on("click", (event) => onTargetButton(event, message));
  }
  __name(renderDamageChatMessage, "renderDamageChatMessage");
  function addHeaderListeners(message, html, save) {
    html.find("[data-action=ping-target]").on("click", pingTarget);
    html.find("[data-action=open-target-sheet]").on("click", openTargetSheet);
    html.find("[data-action=roll-save]").on("click", (event) => rollSave(event, message, save));
    html.find("[data-action=reroll-save]").on("click", (event) => rerollSave(event, message, save));
  }
  __name(addHeaderListeners, "addHeaderListeners");
  async function getMessageData2(message) {
    const targetsFlag = getFlag(message, "target.targets") ?? [];
    const showDC = game.user.isGM || game.settings.get("pf2e", "metagame_showDC");
    const save = (() => {
      const flag = getFlag(message, "target.save");
      if (!flag)
        return;
      return {
        ...flag,
        ...SAVES[flag.statistic]
      };
    })();
    if (!targetsFlag.length && !save)
      return;
    if (save) {
      const saveLabel = game.i18n.format("PF2E.SavingThrowWithName", {
        saveName: game.i18n.localize(save.label)
      });
      const saveDC = showDC ? localize("target.chat.save.dcWithValue", { dc: save.dc }) : "";
      save.tooltipLabel = `${saveLabel} ${saveDC}`;
      save.tooltip = await renderTemplate(templatePath("target/save-tooltip"), {
        check: save.tooltipLabel
      });
    }
    const targets = (await Promise.all(
      targetsFlag.map(async ({ token }) => {
        const target = await fromUuid(token);
        if (!target?.isOwner)
          return;
        const targetId = target.id;
        const actor = target.actor;
        const hasSave = save && !!actor?.saves[save.statistic];
        const targetSave = await (async () => {
          if (!hasSave)
            return;
          const flag = getFlag(message, `target.saves.${targetId}`);
          if (!flag)
            return;
          const rerolled = flag.rerolled;
          const canReroll = hasSave && !rerolled;
          const successLabel = game.i18n.localize(
            `PF2E.Check.Result.Degree.Check.${flag.success}`
          );
          const offset = flag.value - save.dc;
          return {
            ...flag,
            canReroll,
            tooltip: await renderTemplate(templatePath("target/save-tooltip"), {
              i18n: subLocalize("target.chat.save"),
              check: save.tooltipLabel,
              result: localize(
                `target.chat.save.result.${showDC ? "withOffset" : "withoutOffset"}`,
                {
                  success: successLabel,
                  offset: offset >= 0 ? `+${offset}` : offset,
                  die: `<i class="fa-solid fa-dice-d20"></i> ${flag.die}`
                }
              ),
              modifiers: flag.modifiers,
              canReroll,
              rerolled: REROLL[rerolled]
            })
          };
        })();
        const templateSave = save && {
          ...save,
          result: targetSave
        };
        return {
          uuid: token,
          target,
          save: templateSave,
          applied: getFlag(message, `target.applied.${targetId}`),
          template: await renderTemplate(templatePath("target/row-header"), {
            name: target.name,
            uuid: token,
            save: hasSave && templateSave,
            canReroll: targetSave?.canReroll,
            rerolled: REROLL[targetSave?.rerolled],
            i18n: subLocalize("target.chat.row")
          })
        };
      })
    )).filter(Boolean);
    return { targets, save, isRegen: getFlag(message, "target.isRegen") };
  }
  __name(getMessageData2, "getMessageData");
  async function getTargetFromEvent(event) {
    const { targetUuid } = event.currentTarget.closest("[data-target-uuid]").dataset;
    return fromUuid(targetUuid);
  }
  __name(getTargetFromEvent, "getTargetFromEvent");
  function isRollingSave(message, target) {
    return getInMemory(message, `target.save.${target.id}`);
  }
  __name(isRollingSave, "isRollingSave");
  function setRollingSave(message, target) {
    setInMemory(message, `target.save.${target.id}`, true);
  }
  __name(setRollingSave, "setRollingSave");
  async function rerollSave(event, message, { dc }) {
    const target = await getTargetFromEvent(event);
    const actor = target?.actor;
    if (!actor)
      return;
    if (isRollingSave(message, target))
      return;
    const flag = getFlag(message, `target.saves.${target.id}`);
    if (!flag?.roll || flag.rerolled)
      return;
    const heroPoints = actor.isOfType("character") ? actor.heroPoints.value : 0;
    const template = Object.entries(REROLL).map(([type, { icon, reroll: reroll2 }]) => {
      if (type === "hero" && !heroPoints)
        return;
      const label = game.i18n.localize(reroll2);
      return `<label><input type="radio" name="reroll" value="${type}"><i class="${icon}"></i> ${label}</label>`;
    }).filter(Boolean).join("");
    const buttons = {
      yes: {
        icon: '<i class="fa-solid fa-rotate rotate"></i>',
        label: "reroll",
        callback: (html) => html.find("[name=reroll]:checked").val() ?? null
      },
      no: {
        icon: '<i class="fa-solid fa-xmark"></i>',
        label: "cancel",
        callback: () => null
      }
    };
    const reroll = await Dialog.wait(
      {
        title: `${target.name} - ${localize(
          "target.chat.save.reroll.confirm.title"
        )}`,
        content: template,
        buttons,
        close: () => null
      },
      {
        id: `pf2e-toolbelt-target-save-reroll-dialog-${target.id}`
      }
    );
    if (!reroll)
      return;
    const isHeroReroll = reroll === "hero";
    const keep = isHeroReroll ? "new" : reroll;
    if (isHeroReroll) {
      const { value, max } = actor.heroPoints;
      if (value < 1) {
        warn("target.chat.save.reroll.noPoints");
        return;
      }
      await actor.update({
        "system.resources.heroPoints.value": Math.clamped(value - 1, 0, max)
      });
    }
    setRollingSave(message, target);
    const oldRoll = Roll.fromJSON(flag.roll);
    const unevaluatedNewRoll = oldRoll.clone();
    unevaluatedNewRoll.options.isReroll = true;
    Hooks.callAll(
      "pf2e.preReroll",
      Roll.fromJSON(flag.roll),
      unevaluatedNewRoll,
      isHeroReroll,
      keep
    );
    const newRoll = await unevaluatedNewRoll.evaluate({ async: true });
    await roll3dDice(newRoll);
    Hooks.callAll(
      "pf2e.reroll",
      Roll.fromJSON(flag.roll),
      newRoll,
      isHeroReroll,
      keep
    );
    const keptRoll = keep === "higher" && oldRoll.total > newRoll.total || keep === "lower" && oldRoll.total < newRoll.total ? oldRoll : newRoll;
    if (keptRoll === newRoll) {
      const success = new DegreeOfSuccess(newRoll, dc, flag.dosAdjustments);
      keptRoll.options.degreeOfSuccess = success.value;
    }
    const packet = {
      type: "target.update-save",
      target: target.id,
      data: {
        value: keptRoll.total,
        die: keptRoll.dice[0].total,
        success: keptRoll.degreeOfSuccess,
        roll: JSON.stringify(keptRoll.toJSON()),
        dosAdjustments: deepClone(flag.dosAdjustments),
        modifiers: deepClone(flag.modifiers),
        rerolled: reroll
      }
    };
    if (keptRoll.options.keeleyAdd10) {
      packet.data.modifiers.push({
        label: localize("target.chat.save.reroll.keeley"),
        modifier: 10
      });
    }
    if (game.user.isGM || message.isAuthor) {
      packet.message = message;
      updateMessageSave(packet);
    } else {
      packet.message = message.id;
      socketEmit(packet);
    }
  }
  __name(rerollSave, "rerollSave");
  async function rollSave(event, message, { dc, statistic }) {
    const target = await getTargetFromEvent(event);
    const actor = target?.actor;
    if (!actor)
      return;
    if (isRollingSave(message, target))
      return;
    const save = actor.saves[statistic];
    if (!save)
      return;
    setRollingSave(message, target);
    const item = (() => {
      const item2 = message.item;
      if (item2)
        return item2;
      const messageId = getFlag(message, "target.messageId");
      if (!messageId)
        return;
      const otherMessage = game.messages.get(messageId);
      if (!otherMessage)
        return;
      return otherMessage.item;
    })();
    const skipDefault = !game.user.settings.showCheckDialogs;
    const packet = {
      type: "target.update-save",
      target: target.id
    };
    save.check.roll({
      dc: { value: dc },
      item,
      origin: actor,
      skipDialog: event.shiftKey ? !skipDefault : skipDefault,
      createMessage: false,
      callback: async (roll, __, msg) => {
        await roll3dDice(roll);
        packet.data = {
          value: roll.total,
          die: roll.dice[0].total,
          success: roll.degreeOfSuccess,
          roll: JSON.stringify(roll.toJSON()),
          dosAdjustments: msg.getFlag("pf2e", "context.dosAdjustments"),
          modifiers: msg.getFlag("pf2e", "modifiers").filter((modifier) => modifier.enabled).map(({ label, modifier }) => ({ label, modifier }))
        };
        if (game.user.isGM || message.isAuthor) {
          packet.message = message;
          updateMessageSave(packet);
        } else {
          packet.message = message.id;
          socketEmit(packet);
        }
      }
    });
  }
  __name(rollSave, "rollSave");
  async function updateMessageSave({ message, target, data }) {
    if (typeof message === "string") {
      message = game.messages.get(message);
      if (!message)
        return;
    }
    if (typeof data.success === "number") {
      data.success = DEGREE_OF_SUCCESS[data.success];
    }
    await setFlag(message, `target.saves.${target}`, deepClone(data));
    deleteInMemory(message, `target.save.${target}`);
  }
  __name(updateMessageSave, "updateMessageSave");
  async function openTargetSheet(event) {
    const target = await getTargetFromEvent(event);
    if (!target)
      return;
    target.actor?.sheet.render(true);
  }
  __name(openTargetSheet, "openTargetSheet");
  async function pingTarget(event) {
    if (!canvas.ready)
      return;
    const target = await getTargetFromEvent(event);
    if (!target)
      return;
    canvas.ping(target.center);
  }
  __name(pingTarget, "pingTarget");
  async function onTargetButton(event, message) {
    const btn = event.currentTarget;
    const { rollIndex, targetUuid } = btn.closest("[data-target-uuid]").dataset;
    const target = await fromUuid(targetUuid);
    if (!target)
      return;
    const type = btn.dataset.action;
    if (type === "target-shield-block") {
      onClickShieldBlock(target, btn, message.element);
      return;
    }
    const multiplier = type === "target-apply-healing" ? -1 : type === "target-half-damage" ? 0.5 : type === "target-apply-damage" ? 1 : type === "target-double-damage" ? 2 : 3;
    applyDamageFromMessage(target, {
      message,
      multiplier,
      addend: 0,
      promptModifier: event.shiftKey,
      rollIndex: Number(rollIndex)
    });
  }
  __name(onTargetButton, "onTargetButton");
  function onDamageApplied(message, tokenId, rollIndex) {
    const updates = {};
    moduleFlagUpdate(updates, `target.applied.${tokenId}.${rollIndex}`, true);
    const splashRollIndex = getFlag(message, "target.splashIndex");
    if (splashRollIndex !== void 0) {
      const regularRollIndex = splashRollIndex === 0 ? 1 : 0;
      if (rollIndex === splashRollIndex) {
        moduleFlagUpdate(
          updates,
          `target.applied.${tokenId}.${regularRollIndex}`,
          true
        );
      } else {
        moduleFlagUpdate(
          updates,
          `target.applied.${tokenId}.${splashRollIndex}`,
          true
        );
        const targetsFlag = getFlag(message, "target.targets") ?? [];
        for (const target of targetsFlag) {
          const targetId = target.token?.split(".").at(-1);
          if (targetId === tokenId)
            continue;
          moduleFlagUpdate(
            updates,
            `target.applied.${targetId}.${regularRollIndex}`,
            true
          );
        }
      }
    }
    if (game.user.isGM || message.isAuthor) {
      updateMessageApplied({ message, updates });
    } else {
      socketEmit({
        type: "target.update-applied",
        message: message.id,
        updates
      });
    }
  }
  __name(onDamageApplied, "onDamageApplied");
  function updateMessageApplied({ message, updates }) {
    if (typeof message === "string") {
      message = game.messages.get(message);
      if (!message)
        return;
    }
    message.update(updates);
  }
  __name(updateMessageApplied, "updateMessageApplied");

  // src/features/unided.js
  var CREATE_HOOK = null;
  var UPDATE_HOOK = null;
  function registerUnided() {
    return {
      settings: [
        {
          name: "unided",
          type: String,
          default: "disabled",
          choices: ["disabled", "create", "all"],
          onChange: setHooks2
        }
      ],
      conflicts: ["pf2e-unided"],
      init: () => {
        setHooks2();
      }
    };
  }
  __name(registerUnided, "registerUnided");
  function setHooks2(value) {
    const settingValue = value ?? getSetting("unided");
    if (settingValue === "disabled") {
      if (CREATE_HOOK) {
        Hooks.off("preCreateItem", CREATE_HOOK);
        CREATE_HOOK = null;
      }
      if (UPDATE_HOOK) {
        Hooks.off("preUpdateItem", UPDATE_HOOK);
        UPDATE_HOOK = null;
      }
    } else {
      if (!CREATE_HOOK) {
        CREATE_HOOK = Hooks.on("preCreateItem", preCreateItem);
      }
      if (settingValue === "all" && !UPDATE_HOOK) {
        UPDATE_HOOK = Hooks.on("preUpdateItem", preUpdateItem);
      } else if (settingValue !== "all" && UPDATE_HOOK) {
        Hooks.off("preUpdateItem", UPDATE_HOOK);
        UPDATE_HOOK = null;
      }
    }
  }
  __name(setHooks2, "setHooks");
  function preCreateItem(item) {
    if (!item.img || !item.isOfType("physical"))
      return;
    item._source.system.identification.unidentified.img = item.img;
  }
  __name(preCreateItem, "preCreateItem");
  function preUpdateItem(item, changes) {
    if (!item.isOfType("physical") || !("img" in changes))
      return;
    setProperty(changes, "system.identification.unidentified.img", changes.img);
  }
  __name(preUpdateItem, "preUpdateItem");

  // src/features/untarget.js
  var setHook6 = createHook("updateCombat", updateCombat);
  function registerUntarget() {
    return {
      settings: [
        {
          name: "force-untarget",
          type: Boolean,
          default: false,
          onChange: setup6
        },
        {
          name: "untarget",
          type: Boolean,
          default: false,
          scope: "client",
          onChange: setup6
        }
      ],
      init: () => {
        setup6();
      }
    };
  }
  __name(registerUntarget, "registerUntarget");
  function setup6() {
    setHook6(getSetting("force-untarget") || getSetting("untarget"));
  }
  __name(setup6, "setup");
  function updateCombat(_, data) {
    if (!("turn" in data) && !("round" in data))
      return;
    const user = game.user;
    user.updateTokenTargets();
    user.broadcastActivity({ targets: [] });
  }
  __name(updateCombat, "updateCombat");

  // src/macros/condition.js
  var localize5 = subLocalize("macros.condition");
  async function permaConditionEffect(actor) {
    const callback = /* @__PURE__ */ __name((html, type) => {
      const condition = html.find("[name=condition]");
      const { name, slug, img } = condition.find(":selected").data();
      return {
        type,
        slug,
        img,
        name: html.find("[name=name]").val().trim() || localize5("effect-name", { condition: name }),
        uuid: condition.val(),
        badge: Number(html.find("[name=badge]").val() || 1),
        unidentified: html.find("[name=unidentified]").prop("checked")
      };
    }, "callback");
    const buttons = {
      generate: {
        icon: '<i class="fas fa-suitcase"></i>',
        label: localize5("generate"),
        callback: (html) => callback(html, "generate")
      },
      add: {
        icon: '<i class="fa-solid fa-user"></i>',
        label: localize5("add"),
        callback: (html) => callback(html, "add")
      }
    };
    const conditions = Array.from(game.pf2e.ConditionManager.conditions.values());
    const withBadge = new Set(
      conditions.filter((condition) => !!condition.badge).map((condition) => condition.slug)
    );
    const content = await renderTemplate(templatePath("macros/condition"), {
      i18n: localize5,
      conditions: Array.from(
        new Set(conditions.sort((a, b) => a.name.localeCompare(b.name)))
      )
    });
    const setInputs = /* @__PURE__ */ __name((html) => {
      const { name, slug } = html.find("[name=condition] :selected").data();
      html.find("[name=name]").prop("placeholder", localize5("effect-name", { condition: name }));
      const hasBadge = withBadge.has(slug);
      const badge = html.find("[name=badge]");
      badge.prop("disabled", !hasBadge);
      if (!hasBadge)
        badge.val(1);
    }, "setInputs");
    const result = await Dialog.wait(
      {
        buttons,
        content,
        title: localize5("title"),
        close: () => null,
        render: (html) => {
          setInputs(html);
          html.find("[name=condition]").on("change", () => setInputs(html));
        }
      },
      {
        id: "pf2e-toolbelt-macros-condition",
        width: 320
      }
    );
    if (!result)
      return;
    const rule = {
      inMemoryOnly: true,
      key: "GrantItem",
      uuid: result.uuid
    };
    if (result.badge > 1 && withBadge.has(result.slug)) {
      rule.alterations = [
        {
          mode: "override",
          property: "badge-value",
          value: result.badge
        }
      ];
    }
    const source = {
      name: result.name,
      type: "effect",
      img: result.img,
      system: {
        rules: [rule],
        unidentified: result.unidentified
      }
    };
    if (result.type === "generate" || !actor)
      await Item.create(source);
    else
      await actor.createEmbeddedDocuments("Item", [source]);
  }
  __name(permaConditionEffect, "permaConditionEffect");

  // src/main.js
  var FEATURES = [
    registerArp(),
    registerNobulk(),
    registerGiveth(),
    registerKnowledges(),
    registerUnided(),
    registerMerge(),
    registerEffectsPanelHelper(),
    registerSpellsSummary(),
    registerStances(),
    registerHeroActions(),
    registerHideModifiers(),
    registerShare(),
    registerTargetTokenHelper(),
    registerUntarget(),
    registerInventory(),
    registerDebug()
  ];
  var CONFLICTS = /* @__PURE__ */ new Set();
  var firstClientSetting = null;
  Hooks.once("init", () => {
    const isGM = isUserGM();
    const settings = FEATURES.flatMap(
      ({ settings: settings2 = [] }) => settings2.map((setting) => {
        const key = setting.name;
        if (setting.choices) {
          setting.choices = setting.choices.reduce((choices, choice) => {
            choices[choice] = settingPath(key, `choices.${choice}`);
            return choices;
          }, {});
        }
        setting.key = key;
        setting.scope ??= "world";
        setting.config ??= true;
        setting.name = settingPath(key, "name");
        setting.hint = settingPath(key, "hint");
        return setting;
      })
    );
    const [worldSettings, clientSettings] = ["world", "client"].map(
      (scope) => settings.filter((settings2) => settings2.scope === scope)
    );
    for (const setting of [worldSettings, clientSettings].flat()) {
      game.settings.register(MODULE_ID, setting.key, setting);
    }
    if (isGM) {
      firstClientSetting = clientSettings[0].key;
      Hooks.on("renderSettingsConfig", renderSettingsConfig);
    }
    const module = game.modules.get(MODULE_ID);
    module.api = {
      macros: {
        permaConditionEffect
      }
    };
    for (const feature of FEATURES) {
      const { init, conflicts = [], api, name } = feature;
      if (isGM) {
        for (const id of conflicts) {
          const conflictingModule = game.modules.get(id);
          if (conflictingModule?.active) {
            feature.conflicting = true;
            CONFLICTS.add(conflictingModule.title);
          }
        }
      }
      if (api && name)
        module.api[name] = api;
      if (!feature.conflicting && init)
        init(isGM);
    }
  });
  Hooks.once("ready", () => {
    const isGM = game.user.isGM;
    for (const { conflicting, ready } of FEATURES) {
      if (!conflicting && ready)
        ready(isGM);
    }
    if (isGM) {
      for (const conflict of CONFLICTS) {
        warn("module-conflict", { name: conflict }, true);
      }
    }
  });
  function settingPath(setting, key) {
    return `${MODULE_ID}.settings.${setting}.${key}`;
  }
  __name(settingPath, "settingPath");
  function renderSettingsConfig(_, html) {
    if (!firstClientSetting)
      return;
    const group = html.find(
      `.tab[data-tab=${MODULE_ID}] [data-setting-id="${MODULE_ID}.${firstClientSetting}"]`
    );
    group.before(`<h3>${localize("settings.client")}</h3>`);
  }
  __name(renderSettingsConfig, "renderSettingsConfig");
})();
