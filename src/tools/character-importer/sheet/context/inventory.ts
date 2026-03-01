import {
    CharacterPF2e,
    CoinDenomination,
    Currency,
    R,
    TreasurePF2e,
    TreasureSource,
    addListenerAll,
} from "foundry-helpers";
import { COIN_COMPENDIUM_UUIDS, COIN_DENOMINATIONS } from "foundry-helpers/dist";
import { CharacterImport, CharacterImporterTool } from "tools";

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

    return {
        currencies,
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

type ImportDataInventoryContext = {
    currencies: ImportDataCurrency[];
};

type ImportDataCurrency = {
    current: number;
    expected: number;
    label: string;
    unit: Currency;
};

export { addInventoryEventListeners, prepareInventoryTab };
