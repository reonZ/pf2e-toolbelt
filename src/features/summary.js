import { MODULE_ID } from "../module";
import {
  registerCharacterSheetExtraTab,
  unregisterCharacterSheetExtraTab,
} from "../shared/actor";
import { localeCompare, ordinalString } from "../shared/misc";
import { spellSlotGroupIdToNumber } from "../shared/pf2e/misc";
import { getSetting } from "../shared/settings";

export function registerSpellsSummary() {
  return {
    settings: [
      {
        name: "summary",
        type: String,
        default: "disabled",
        scope: "client",
        choices: ["disabled", "enabled", "sort"],
        onChange: (value) => setup(value),
      },
    ],
    conflicts: ["pf2e-spells-summary"],
    ready: (isGm) => {
      setup();
    },
  };
}

function setup(value) {
  const enabled = (value ?? getSetting("summary")) !== "disabled";
  if (enabled) {
    registerCharacterSheetExtraTab({
      tabName: "spellcasting",
      templateFolder: "summary/sheet",
      getData,
      addEvents,
    });
  } else {
    unregisterCharacterSheetExtraTab("spellcasting");
  }
}

function addEvents(html, sheet, actor) {
  const inputs = html.find(".spell-type .uses .spell-slots-input input");
  inputs.on("change", (event) => onUsesInputChange(event, actor));
  inputs.on("focus", onUsesInputFocus);
  inputs.on("blur", onUsesInputBlur);

  html
    .find(".focus-pips")
    .on("click contextmenu", (event) => onToggleFocusPool(event, actor));

  html
    .find(".spell-slots-increment-reset")
    .on("click", (event) => onSlotsReset(event, sheet, actor));

  html.find(".item-image").on("click", (event) => onItemToChat(event, actor));
}

async function onUsesInputChange(event, actor) {
  event.preventDefault();

  const { inputPath, entryId } = $(event.currentTarget).data();
  const value = event.currentTarget.valueAsNumber;
  actor.updateEmbeddedDocuments("Item", [{ _id: entryId, [inputPath]: value }]);
}

function onUsesInputFocus(event) {
  event.preventDefault();
  event.currentTarget.closest(".item")?.classList.add("hover");
}

function onUsesInputBlur(event) {
  event.preventDefault();
  event.currentTarget.closest(".item")?.classList.remove("hover");
}

function onToggleFocusPool(event, actor) {
  event.preventDefault();
  const change = event.type === "click" ? 1 : -1;
  const points = (actor.system.resources.focus?.value ?? 0) + change;
  actor.update({ "system.resources.focus.value": points });
}

function onChargesReset(sheet, actor, entryId) {
  if (game.modules.get("pf2e-staves")?.active) {
    const original = getSpellcastingTab(sheet.element).find(
      ".directory-list.spellcastingEntry-list"
    );
    const entry = original.find(
      `.item-container.spellcasting-entry[data-item-id=${entryId}]`
    );
    const btn = entry.find(
      ".spell-ability-data .statistic-values a.pf2e-staves-charge"
    );
    btn[0]?.click();
    return;
  }

  const dailies = game.modules.get("pf2e-dailies");
  if (!dailies?.active) return;

  const entry = actor.spellcasting.get(entryId);
  dailies.api.updateEntryCharges(entry, 9999);
}

function onSlotsReset(event, sheet, actor) {
  event.preventDefault();

  const { itemId, rank, isCharge } = $(event.currentTarget).data();
  if (!itemId) return;

  if (isCharge) {
    onChargesReset(sheet, actor, itemId);
    return;
  }

  const item = actor.items.get(itemId);
  if (!item) return;

  if (item.isOfType("spellcastingEntry")) {
    const slotLevel = rank >= 0 && rank <= 11 ? `slot${rank}` : "slot0";
    const slot = item.system.slots?.[slotLevel];
    if (slot) item.update({ [`system.slots.${slotLevel}.value`]: slot.max });
  } else if (item.isOfType("spell")) {
    const max = item.system.location.uses?.max;
    if (max) item.update({ "system.location.uses.value": max });
  }
}

async function onItemToChat(event, actor) {
  const itemId = $(event.currentTarget).closest(".item").attr("data-item-id");
  const item = actor.items.get(itemId);
  item.toMessage(event);
}

function getSpellcastingTab(html) {
  return html.find(
    "section.sheet-body .sheet-content > .tab[data-tab=spellcasting]"
  );
}

async function getData(actor) {
  const focusPool = actor.system.resources.focus ?? { value: 0, max: 0 };
  const pf2eStavesActive = game.modules.get("pf2e-staves")?.active;
  const pf2eDailies = game.modules.get("pf2e-dailies");
  const pf2eDailiesActive = pf2eDailies?.active;
  const stavesActive =
    pf2eStavesActive ||
    (pf2eDailiesActive && isNewerVersion(pf2eDailies.version, "2.14.0"));
  const chargesPath = pf2eStavesActive
    ? "flags.pf2e-staves.charges"
    : pf2eDailiesActive
    ? "flags.pf2e-dailies.staff.charges"
    : "";

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
        if (!isCharge) return;

        const dailiesData =
          pf2eDailiesActive &&
          pf2eDailies.api.getSpellcastingEntryStaffData(entry);
        const { charges, max, canPayCost } = dailiesData ??
          getProperty(entry, "flags.pf2e-staves.charges") ?? {
            charges: 0,
            max: 0,
          };

        return {
          value: charges,
          max,
          noMax: true,
          canPayCost: canPayCost ?? (() => true),
        };
      })();

      for (const group of data.groups) {
        if (!group.active.length || group.uses?.max === 0) continue;

        const slotSpells = [];
        const isCantrip = group.id === "cantrips";
        const groupNumber = spellSlotGroupIdToNumber(group.id);
        const isBroken = !isCantrip && isCharge && !stavesActive;

        for (let slotId = 0; slotId < group.active.length; slotId++) {
          const active = group.active[slotId];
          if (!active || active.uses?.max === 0) continue;

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
            inputPath: isCharge
              ? chargesPath
              : data.isInnate
              ? "system.location.uses.value"
              : `system.slots.slot${groupNumber}.value`,
            isCharge,
            isActiveCharge: isCharge && stavesActive,
            isBroken,
            isVirtual: virtual,
            isInnate: data.isInnate,
            isCantrip: isCantrip,
            isFocus,
            isPrepared: data.isPrepared,
            isSpontaneous: data.isSpontaneous || data.isFlexible,
            groupId: group.id,
            uses: uses ?? (isCharge ? charges : group.uses),
            expended:
              isCharge && !isCantrip
                ? !charges.canPayCost(groupNumber)
                : expended ??
                  (isFocus && !isCantrip ? focusPool.value <= 0 : false),
            action: spell.system.time.value,
            type: isCharge
              ? `${MODULE_ID}.summary.staff`
              : data.isInnate
              ? "PF2E.PreparationTypeInnate"
              : data.isSpontaneous
              ? "PF2E.PreparationTypeSpontaneous"
              : data.isFlexible
              ? "PF2E.SpellFlexibleLabel"
              : isFocus
              ? "PF2E.TraitFocus"
              : isScroll
              ? `${MODULE_ID}.summary.scroll`
              : isWand
              ? `${MODULE_ID}.summary.wand`
              : "PF2E.SpellPreparedLabel",
            order: isCharge
              ? 0
              : data.isPrepared
              ? 1
              : isFocus
              ? 2
              : data.isInnate
              ? 3
              : data.isSpontaneous
              ? 4
              : 5,
            noHover: data.isPrepared || isCantrip || isBroken || isFocus,
          });
        }

        if (slotSpells.length) {
          if (isFocus) {
            if (isCantrip) hasFocusCantrips = true;
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
    const sort =
      getSetting("summary") === "sort"
        ? (a, b) =>
            a.order === b.order
              ? localeCompare(a.name, b.name)
              : a.order - b.order
        : (a, b) => localeCompare(a.name, b.name);

    for (const entry of spells) {
      if (!entry) continue;
      entry.sort(sort);
    }
  }

  if (focuses.length) {
    focuses.sort((a, b) => localeCompare(a.name, b.name));
    spells[12] = focuses;
    hasFocusCantrips = false;
  }

  const ritualData = await actor.spellcasting.ritual?.getSheetData();
  const rituals = ritualData?.groups.flatMap((slot, slotId) =>
    slot.active
      .map(({ spell }) => ({
        name: spell.name,
        img: spell.img,
        slotId,
        itemId: spell.id,
        rank: spell.rank,
        time: spell.system.time.value,
      }))
      .filter(Boolean)
  );

  return {
    spells,
    rituals,
    focusPool,
    hasFocusCantrips,
    isOwner: actor.isOwner,
    entryRank: (rank) =>
      game.i18n.format("PF2E.Item.Spell.Rank.Ordinal", {
        rank: ordinalString(rank),
      }),
  };
}
