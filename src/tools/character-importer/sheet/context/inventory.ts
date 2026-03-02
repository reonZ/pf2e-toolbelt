import {
    addListenerAll,
    CharacterPF2e,
    CoinDenomination,
    Currency,
    localeCompare,
    PhysicalItemType,
    R,
    TreasurePF2e,
    TreasureSource,
} from "foundry-helpers";
import { COIN_COMPENDIUM_UUIDS, COIN_DENOMINATIONS } from "foundry-helpers/dist";
import { CharacterImport, CharacterImporterTool, getCurrentItem, ImportDataEntry, prepareEntry } from "tools";

async function prepareInventoryTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataInventoryContext> {
    const currency = actor.inventory.currency;

    const currencies = R.map(COIN_DENOMINATIONS, (unit): ImportDataCurrency => {
        return {
            current: currency[unit],
            expected: data.currencies[unit],
            label: CONFIG.PF2E.currencies[unit],
            unit,
        };
    });

    const items = R.map(data.equipments, (entry, index): ImportDataEquipmentEntry => {
        const current = getCurrentItem(actor, entry.type, entry);

        return {
            ...prepareEntry.call(this, entry.type as PhysicalItemType, entry, current, 0),
            container: entry.container,
            index,
            quantity: {
                current: current?.quantity,
                selection: entry.quantity,
            },
        };
    });

    const containers = R.map(data.containers, (entry, index): ImportDataEquipmentEntry => {
        const current = getCurrentItem(actor, "backpack", entry);

        const children = R.pipe(
            items,
            R.filter((item) => item.container === entry.identifier),
            R.forEach((item) => {
                item.depth = 1;
                item.parent = current?.id;
            }),
        );

        return {
            ...prepareEntry.call(this, "backpack", entry, current, 0),
            children,
            index,
            itemType: "container",
            quantity: {
                current: current?.quantity,
                selection: entry.quantity,
            },
        };
    });

    const sections: ImportEquipmentSection[] = R.pipe(
        items,
        R.filter((item) => !item.container),
        R.groupBy(R.prop("itemType")),
        R.mapValues((entries): ImportEquipmentSection => {
            return {
                items: entries,
                label: entries[0].label,
                type: entries[0].itemType as PhysicalItemType,
            };
        }),
        R.values(),
    );

    const backpacks = sections.findSplice((section) => section.type === "backpack") ?? {
        items: [],
        label: game.i18n.localize("TYPES.Item.backpack"),
        type: "backpack",
    };

    if (containers.length) {
        backpacks.items.push(...containers);
    }

    sections.sort((a, b) => localeCompare(a.label, b.label));

    if (backpacks.items.length) {
        sections.push(backpacks);
    }

    return {
        currencies,
        sections,
    };
}

function addInventoryEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;

        switch (action) {
            case "assign-currencies": {
                return assignCurrencies.call(this, actor);
            }
        }
    });
}

async function assignCurrencies(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const denominations = COIN_DENOMINATIONS;
    const currentCurrencies = actor.itemTypes.treasure.filter(
        (item): item is TreasurePF2e<CharacterPF2e> & { unit: CoinDenomination } => {
            return item.isCurrency && R.isIncludedIn(item.unit, denominations);
        },
    );

    const toAdd: TreasureSource[] = [];
    const toDelete: string[] = [];
    const toUpdate: { _id: string; "system.quantity": number }[] = [];

    for (const current of currentCurrencies) {
        const unit = current.unit;
        const expected = data.currencies[unit];

        if (expected <= 0) {
            toDelete.push(current.id);
        } else if (expected !== current.quantity) {
            toUpdate.push({ _id: current.id, "system.quantity": expected });
        }
    }

    const missing = R.difference(
        denominations,
        currentCurrencies.map((item) => item.unit),
    );

    await Promise.all(
        missing.map(async (unit) => {
            const expected = data.currencies[unit];
            if (expected <= 0) return;

            const uuid = COIN_COMPENDIUM_UUIDS[unit];
            const source = (await fromUuid<TreasurePF2e>(uuid))?.toObject(true);
            if (source?.type !== "treasure") return;

            source.system.quantity = expected;
            toAdd.push(source);
        }),
    );

    if (toDelete.length) {
        await actor.deleteEmbeddedDocuments("Item", toDelete);
    }

    if (toUpdate.length) {
        await actor.updateEmbeddedDocuments("Item", toUpdate);
    }

    if (toAdd.length) {
        await actor.createEmbeddedDocuments("Item", toAdd);
    }

    this.localize.info("sheet.data.inventory.set");
}

type EventAction = "assign-currencies";

type ImportDataEquipmentEntry = ImportDataEntry & {
    container?: string;
    index: number;
    parent?: string;
    quantity: {
        current: number | undefined;
        selection: number;
    };
};

type ImportDataInventoryContext = {
    currencies: ImportDataCurrency[];
    sections: ImportEquipmentSection[];
};

type ImportEquipmentSection = {
    items: ImportDataEquipmentEntry[];
    label: string;
    type: PhysicalItemType;
};

type ImportDataCurrency = {
    current: number;
    expected: number;
    label: string;
    unit: Currency;
};

export { addInventoryEventListeners, prepareInventoryTab };
