import { CharacterPF2e, R, waitDialog } from "foundry-helpers";
import { CharacterImporterTool, fromPathbuilder, ImportedFeatSource, isCharacterCategory, zCharacterImport } from "..";

async function importData(this: CharacterImporterTool, actor: CharacterPF2e, fromFile: boolean) {
    const code = await (fromFile ? importFromFile : importFromJSON).call(this);
    if (!R.isString(code)) return;

    try {
        const parsed = JSON.parse(code) as unknown;
        const currentSource = await this.getImportData(actor, true);
        const importedSource = await fromPathbuilder(parsed);

        if (importedSource.feats) {
            const currentFeats = currentSource?.feats ?? [];

            const featEntriesEqual = (a: ImportedFeatSource, b: ImportedFeatSource): boolean => {
                return (
                    a.category === b.category &&
                    a.level === b.level &&
                    a.match === b.match &&
                    a.value === b.value &&
                    // make sure that both have a parent or neither
                    !!a.parent === !!b.parent
                );
            };

            for (const feat of importedSource.feats) {
                const current = currentFeats.find((current) => {
                    if (!featEntriesEqual(feat, current)) return false;
                    // they both don't have parent
                    if (!current.parent) return true;

                    if (isCharacterCategory(current.parent) || isCharacterCategory(feat.parent)) {
                        return current.parent === feat.parent;
                    }

                    const currentParent = currentFeats[Number(current.parent)];
                    const importedParent = importedSource.feats![Number(feat.parent)];

                    return featEntriesEqual(currentParent, importedParent);
                });

                if (current?.override) {
                    feat.override = current.override;
                }
            }
        }

        const mergedSource = foundry.utils.mergeObject(currentSource ?? {}, importedSource);
        const mergedData = await zCharacterImport().parseAsync(mergedSource);

        await this.setImportData(actor, mergedData);
        this.localize.info("import.success");
    } catch (error) {
        console.error(error);
    }
}

async function importFromJSON(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ code: string }>({
        i18n: this.path("import.code"),
        content: `<textarea name="code"></textarea>`,
    });

    return result ? result.code : null;
}

async function importFromFile(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ file: File }>({
        i18n: this.path("import.file"),
        content: `<input type="file" name="file" accept=".json">`,
    });

    return result && result.file ? foundry.utils.readTextFromFile(result.file) : null;
}

export { importData };
