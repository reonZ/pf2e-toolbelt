import { getPhysicalItemTypes, ItemPF2e, PhysicalItemType, R, ZodDocument } from "foundry-helpers";
import {
    CharacterCategory,
    CharacterImportData,
    CharacterImportSource,
    ImportedEntry,
    isCharacterCategory,
    zCharacterImport,
} from ".";

class CharacterImport extends ZodDocument<ReturnType<typeof zCharacterImport>> {
    static async fromSource(source: CharacterImportSource, strict: true): Promise<CharacterImport>;
    static async fromSource(source: CharacterImportSource, strict?: boolean): Promise<CharacterImport | undefined>;
    static async fromSource(source: CharacterImportSource, strict = false) {
        const data = strict
            ? await zCharacterImport().decodeAsync(source)
            : (await zCharacterImport().safeDecodeAsync(source)).data;
        return data ? new CharacterImport(data) : undefined;
    }

    getImportedEntry(itemType: ImportItemType, index: number): ImportedEntry | undefined {
        return isCharacterCategory(itemType) ? this[itemType] : this.#getEntries(itemType).at(index);
    }

    updateEntryOverride(itemType: string, value: ItemPF2e | null, index: number): boolean {
        if (isCharacterCategory(itemType)) {
            return this.#updateCoreOverride(itemType, value);
        } else if (R.isIncludedIn(itemType, ["feat", "spell"] as const) || isPhysicalCategory(itemType)) {
            return this.#updateIndexedEntryOverride(itemType, index, value);
        }
        return false;
    }

    encode() {
        return super.encode(zCharacterImport());
    }

    #updateCoreOverride(key: CharacterCategory, value: ItemPF2e | null): boolean {
        if (value === null || this[key].match === value) {
            delete this[key].override;
        } else {
            this[key].override = value as any;
        }
        return true;
    }

    #updateIndexedEntryOverride(
        itemType: Exclude<ImportItemType, CharacterCategory>,
        index: number,
        value: ItemPF2e | null,
    ): boolean {
        const entries = this.#getEntries(itemType);
        const entry = entries.at(index);
        if (!entry) return false;

        if (value === null || entry.match?.uuid === value.uuid) {
            delete entry.override;
        } else {
            entry.override = value as any;
        }

        return true;
    }

    #getEntries(itemType: Exclude<ImportItemType, CharacterCategory>): ImportedEntry[] {
        switch (itemType) {
            case "container":
                return this.containers;
            case "feat":
                return this.feats;
            case "spell":
                return this.spells;
            default:
                return isPhysicalCategory(itemType) ? this.equipments : [];
        }
    }
}

interface CharacterImport extends CharacterImportData {}

function isPhysicalCategory(value: unknown): value is PhysicalItemType | "container" {
    const physicalTypes = getPhysicalItemTypes();
    return R.isIncludedIn(value, ["container", ...physicalTypes]);
}

type ImportItemType = CharacterCategory | PhysicalItemType | "container" | "feat" | "spell";

export { CharacterImport };
export type { ImportItemType };
