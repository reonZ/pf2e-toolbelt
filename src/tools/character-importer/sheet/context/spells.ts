import {
    addListenerAll,
    BaseSpellcastingEntry,
    CharacterPF2e,
    confirmDialog,
    createSpellcastingSource,
    getActorMaxRank,
    htmlClosest,
    isInstanceOf,
    R,
    SlotKey,
    SpellcastingEntrySlots,
    SpellSource,
} from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    getCurrentItem,
    getEntrySelection,
    ImportDataEntry,
    ImportedSpellcastingEntry,
    ImportedSpellEntry,
    prepareEntry,
} from "tools";

async function prepareSpellsTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataSpellsContext> {
    const level = actor.level;

    const spellcasting = R.pipe(
        data.spellcasting,
        R.map((spellcastingEntry, entryIndex): ImportDataSpellcastingSection | undefined => {
            const entries = actor.spellcasting.filter((entry) => isMatchingSpellcasting(entry, spellcastingEntry));

            const selected = spellcastingEntry.selected
                ? entries.find((entry) => entry.id === spellcastingEntry.selected)
                : entries.at(0);

            const selectedId = selected?.id;

            const spells: ImportDataSpell[] = R.pipe(
                data.spells,
                R.map((spellEntry, spellIndex): ImportDataSpell | undefined => {
                    if (spellEntry.rank > level || spellEntry.parent !== spellcastingEntry.identifier) return;

                    const current = getCurrentItem(actor, selected?.spells, spellEntry);

                    return {
                        ...prepareEntry.call(this, "spell", spellEntry, current ?? null, 0, !selected),
                        index: spellIndex,
                        level: spellEntry.rank,
                        parent: selectedId,
                    };
                }),
                R.filter(R.isTruthy),
            );

            if (spells.length === 0) return;

            return {
                hasMissingSpells: !!selected && spells.some((spell) => !spell.current),
                hasSlotsToRefresh: !!selected && R.isIncludedIn(selected.category, ["prepared", "spontaneous"]),
                index: entryIndex,
                label: spellcastingEntry.name,
                selected: selectedId,
                selections: R.map(entries, (entry) => {
                    return { label: entry.name, value: entry.id };
                }),
                spells: R.sortBy(spells, R.prop("level")),
            };
        }),
        R.filter(R.isTruthy),
    );

    const actorRituals = actor.spellcasting.ritual;
    const rituals = R.pipe(
        data.spells,
        R.map((entry, index): ImportDataSpell | undefined => {
            if (entry.parent !== "rituals") return;

            const selection = getEntrySelection(entry);
            if (selection && selection.rank > level) return;

            const current = getCurrentItem(actor, actorRituals?.spells, entry as ImportedSpellEntry);

            return {
                ...prepareEntry.call(this, "spell", entry, current ?? null, 0, !actorRituals),
                index: index,
                level: selection?.rank ?? 0,
                parent: entry.parent,
            };
        }),
        R.filter(R.isTruthy),
    );

    return {
        rituals: rituals.length
            ? { hasMissingSpells: rituals.some((spell) => !spell.current), spells: rituals }
            : undefined,
        spellcasting,
    };
}

function addSpellsEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    const getSpellcastingIndex = (el: HTMLElement): number => {
        return Number(htmlClosest(el, "[data-index]")?.dataset.index);
    };

    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;
        const index = getSpellcastingIndex(el);

        switch (action) {
            case "add-spellcasting": {
                return addSpellcasting.call(this, actor, index);
            }

            case "fill-rituals": {
                return fillRituals.call(this, actor);
            }

            case "fill-spellcasting": {
                return fillSpellcasting.call(this, actor, index);
            }

            case "refresh-spellcasting": {
                return refreshSpellcasting.call(this, actor, index);
            }
        }
    });

    addListenerAll(html, `[name="spellcasting-selection"]`, "change", async (el: HTMLSelectElement) => {
        const data = await this.getImportData(actor);
        if (!data) return;

        const index = getSpellcastingIndex(el);
        const spellcasting = data.spellcasting.at(index);
        if (!spellcasting) return;

        spellcasting.selected = el.value;
        await this.setImportData(actor, data);
    });
}

async function refreshSpellcasting(this: CharacterImporterTool, actor: CharacterPF2e, index: number) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const spellcastingEntry = data.spellcasting.at(index);
    const spellcasting = getSelectedSpellcasting(actor, spellcastingEntry);
    if (
        !spellcastingEntry ||
        !isInstanceOf(spellcasting, "SpellcastingEntryPF2e") ||
        !R.isIncludedIn(spellcasting.category, ["prepared", "spontaneous"])
    )
        return;

    const spellcastingSlots = spellcasting.system?.slots;
    if (!spellcastingSlots) return;

    const maxRank = getActorMaxRank(actor);
    const isPrepared = spellcastingEntry.type === "prepared";
    const updates = {} as SpellcastingEntrySlots;

    for (let slot = 0; slot < 11; slot++) {
        const slotKey = `slot${slot}` as SlotKey;

        if (slot > maxRank) {
            updates[slotKey] = { max: 0, prepared: [], value: 0 };
            continue;
        }

        const value = spellcastingEntry.slots.at(slot) ?? 0;
        const spellcastingSlot = spellcastingSlots[slotKey];

        updates[slotKey] = {
            max: value,
            prepared: isPrepared ? spellcastingSlot.prepared.slice(0, value) : [],
            value: isPrepared ? 0 : Math.min(spellcastingSlot.value, value),
        };
    }

    await spellcasting.update({ "system.slots": updates });
    this.localize.info("sheet.data.spellcasting.refresh.set");
}

async function fillRituals(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const spellcasting = actor.spellcasting.ritual;
    if (!spellcasting) return;

    const level = actor.level;
    const sources: SpellSource[] = R.pipe(
        data.spells,
        R.map((entry): SpellSource | undefined => {
            if (entry.parent !== "rituals" || getCurrentItem(actor, spellcasting.spells, entry)) return;

            const selection = getEntrySelection(entry);
            if (!selection || selection.rank > level) return;

            const source = selection.toObject();

            foundry.utils.setProperty(source, "system.location.value", spellcasting.id);

            return source;
        }),
        R.filter(R.isTruthy),
    );

    if (!sources.length) return;

    const confirm = await confirmDialog(this.path("sheet.data.spellcasting.fill"));

    if (confirm) {
        await actor.createEmbeddedDocuments("Item", sources);
    }
}

async function fillSpellcasting(this: CharacterImporterTool, actor: CharacterPF2e, index: number) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const spellcastingEntry = data.spellcasting.at(index);
    const spellcasting = getSelectedSpellcasting(actor, spellcastingEntry);
    if (!spellcastingEntry || !spellcasting) return;

    const level = actor.level;
    const sources: SpellSource[] = R.pipe(
        data.spells,
        R.map((entry): SpellSource | undefined => {
            if (entry.rank > level || entry.parent !== spellcastingEntry.identifier) return;
            if (getCurrentItem(actor, spellcasting.spells, entry)) return;

            const selection = getEntrySelection(entry);
            if (!selection) return;

            const source = selection.toObject();

            foundry.utils.setProperty(source, "system.location.value", spellcasting.id);

            if (entry.rank > selection.rank) {
                foundry.utils.setProperty(source, "system.location.heightenedLevel", entry.rank);
            }

            return source;
        }),
        R.filter(R.isTruthy),
    );

    if (!sources.length) return;

    const confirm = await confirmDialog(this.path("sheet.data.spellcasting.fill"));

    if (confirm) {
        await actor.createEmbeddedDocuments("Item", sources);
    }
}

async function addSpellcasting(this: CharacterImporterTool, actor: CharacterPF2e, index: number) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const spellcasting = data.spellcasting.at(index);
    if (!spellcasting) return;

    const confirm = await confirmDialog(this.path("sheet.data.spellcasting.add"));

    if (!confirm) return;

    const isPreparedOrSpontaneous = R.isIncludedIn(spellcasting.type, ["prepared", "spontaneous"]);

    const source = createSpellcastingSource({
        name: spellcasting.name,
        attribute: spellcasting.attribute,
        category: spellcasting.type,
        tradition: spellcasting.tradition,
        showSlotlessRanks: isPreparedOrSpontaneous,
    });

    if (isPreparedOrSpontaneous) {
        const maxRank = getActorMaxRank(actor);
        const slots = R.take(spellcasting.slots, Math.max(maxRank + 1, 2));

        source.system.slots ??= {};

        for (let i = 0; i < slots.length; i++) {
            const slotKey = `slot${i}` as SlotKey;
            source.system.slots[slotKey] = { max: slots[i] };
        }
    }

    const [entry] = await actor.createEmbeddedDocuments("Item", [source], { render: false });
    spellcasting.selected = entry.id;
    await this.setImportData(actor, data);
}

function getSelectedSpellcasting(
    actor: CharacterPF2e,
    spellcastingEntry: Maybe<ImportedSpellcastingEntry>,
): Maybe<BaseSpellcastingEntry> {
    if (!spellcastingEntry) return;
    return (
        (spellcastingEntry.selected && actor.spellcasting.get(spellcastingEntry.selected)) ||
        actor.spellcasting.find((entry) => isMatchingSpellcasting(entry, spellcastingEntry))
    );
}

function isMatchingSpellcasting(entry: BaseSpellcastingEntry, spellcastingEntry: ImportedSpellcastingEntry): boolean {
    return (
        entry.tradition === spellcastingEntry.tradition &&
        entry.attribute === spellcastingEntry.attribute &&
        entry.category === spellcastingEntry.type
    );
}

type EventAction = "add-spellcasting" | "fill-rituals" | "fill-spellcasting" | "refresh-spellcasting";

type ImportDataSpell = ImportDataEntry & {
    index: number;
    level: number;
    parent: string | undefined;
};

type ImportDataSpellcastingSection = {
    hasMissingSpells: boolean;
    hasSlotsToRefresh: boolean;
    index: number;
    label: string;
    selected: string | undefined;
    selections: { label: string; value: string }[];
    spells: ImportDataSpell[];
};

type ImportDataRitualsSection = {
    hasMissingSpells: boolean;
    spells: ImportDataSpell[];
};

type ImportDataSpellsContext = {
    rituals: ImportDataRitualsSection | undefined;
    spellcasting: ImportDataSpellcastingSection[];
};

export { addSpellsEventListeners, prepareSpellsTab };
