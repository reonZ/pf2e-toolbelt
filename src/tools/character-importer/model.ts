import { ItemPF2e, R, ZodDocument } from "foundry-helpers";
import {
    CharacterCategory,
    CharacterImportData,
    CharacterImportSource,
    ImportedEntry,
    ImportItemType,
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

    updateEntryOverride(itemType: string | undefined, value: ItemPF2e | null, index: number): boolean {
        if (itemType === "feat" && R.isNumber(index)) {
            return this.updateFeatOverride(index, value);
        } else if (isCharacterCategory(itemType)) {
            return this.updateCoreOverride(itemType, value);
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

    updateFeatOverride(index: number, value: ItemPF2e | null): boolean {
        const feats = this.feats.slice();
        const entry = feats.at(Number(index));
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

export { CharacterImport };
