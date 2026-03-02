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
        if (itemType === "feat") {
            return R.isNumber(index) ? this.feats.at(index) : undefined;
        }

        if (itemType === "container") {
            return R.isNumber(index) ? this.containers.at(index) : undefined;
        }

        // this is an equipment
        if (R.isNonNull(index)) {
            return R.isNumber(index) ? this.equipments.at(index) : undefined;
        }

        return isCharacterCategory(itemType) ? this[itemType] : undefined;
    }

    updateEntryOverride(itemType: string, value: ItemPF2e | null, index: number): boolean {
        if (isCharacterCategory(itemType)) {
            return this.updateCoreOverride(itemType, value);
        } else if (itemType === "feat" || isPhysicalCategory(itemType)) {
            return this.updateIndexedEntryOverride(itemType, index, value);
        }
        return false;
    }

    updateCoreOverride(key: CharacterCategory, value: ItemPF2e | null): boolean {
        if (value === null || this[key].match === value) {
            delete this[key].override;
        } else {
            this[key].override = value as any;
        }
        return true;
    }

    updateIndexedEntryOverride(
        itemType: PhysicalItemType | "container" | "feat",
        index: number,
        value: ItemPF2e | null,
    ): boolean {
        const entries = itemType === "feat" ? this.feats : itemType === "container" ? this.containers : this.equipments;
        const entry = entries.at(index);
        if (!entry) return false;

        if (value === null || entry.match?.uuid === value.uuid) {
            delete entry.override;
        } else {
            entry.override = value as any;
        }

        return true;
    }

    encode() {
        return super.encode(zCharacterImport());
    }
}

interface CharacterImport extends CharacterImportData {}

function isPhysicalCategory(value: unknown): value is PhysicalItemType | "container" {
    const physicalTypes = getPhysicalItemTypes();
    return R.isIncludedIn(value, ["container", ...physicalTypes]);
}

type ImportItemType = CharacterCategory | PhysicalItemType | "container" | "feat";

export { CharacterImport };
export type { ImportItemType };
