import { addListenerAll, CharacterPF2e, getItemSourceId, htmlClosest, R } from "foundry-helpers";
import { CharacterImport, CharacterImporterTool, getEntrySelection, ImportDataEntry, prepareEntry } from "tools";

async function prepareSpellsTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataSpellsContext> {
    const level = actor.level;

    const spellcasting = R.pipe(
        data.spellcasting,
        R.map((spellcasting, entryIndex): ImportDataSpellcastingSection | undefined => {
            const entries = actor.spellcasting.filter((entry) => {
                return (
                    entry.tradition === spellcasting.tradition &&
                    entry.attribute === spellcasting.attribute &&
                    entry.category === spellcasting.type
                );
            });

            const selected = entries.at(0);

            const spells: ImportDataSpell[] = R.pipe(
                data.spells,
                R.map((spell, spellIndex): ImportDataSpell | undefined => {
                    if (spell.rank > level || spell.parent !== spellcasting.identifier) return;

                    const selection = getEntrySelection(spell);
                    const current = selection && selected?.spells?.find((x) => getItemSourceId(x) === selection.uuid);

                    return {
                        ...prepareEntry.call(this, "spell", spell, current ?? null, 0, !selected),
                        index: spellIndex,
                        level: spell.rank,
                    };
                }),
                R.filter(R.isTruthy),
            );

            if (spells.length === 0) return;

            return {
                hasMissingSpells: !!selected && spells.some((spell) => !spell.current),
                index: entryIndex,
                label: spellcasting.name,
                selected: selected?.id,
                selections: R.map(entries, (entry) => {
                    return { label: entry.name, value: entry.id };
                }),
                spells: R.sortBy(spells, R.prop("level")),
            };
        }),
        R.filter(R.isTruthy),
    );

    return {
        spellcasting,
    };
}

function addSpellsEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;
        const index = Number(htmlClosest(el, "[data-index]")?.dataset.index)

        switch (action) {
            case "add-spellcasting": {
                return addSpellcasting.call(this, actor, index);
            }

            case "fill-spellcasting": {
                return;
            }
        }
    });
}

function addSpellcasting(this: CharacterImporterTool, actor: CharacterPF2e, index: number) {
    
}

type EventAction = "add-spellcasting" | "fill-spellcasting";

type ImportDataSpell = ImportDataEntry & {
    index: number;
    level: number;
};

type ImportDataSpellcastingSection = {
    hasMissingSpells: boolean;
    index: number;
    label: string;
    selected: string | undefined;
    selections: { label: string; value: string }[];
    spells: ImportDataSpell[];
};

type ImportDataSpellsContext = {
    spellcasting: ImportDataSpellcastingSection[];
};

export { addSpellsEventListeners, prepareSpellsTab };
