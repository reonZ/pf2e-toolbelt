import { CharacterPF2e, MODULE, R, waitDialog } from "module-helpers";
import { CharacterImporterTool, fromPathbuilder, ImportDataModel, ImportFeatEntry } from "..";

async function importData(this: CharacterImporterTool, actor: CharacterPF2e, fromFile: boolean) {
    const code = await (fromFile ? importFromFile : importFromJSON).call(this);
    if (!R.isString(code)) return;

    try {
        const parsed = JSON.parse(code) as unknown;
        const current = this.getImportData(actor)?.toObject();
        const imported = await fromPathbuilder(parsed);

        if (imported.feats) {
            const currentFeats = current?.feats ?? [];

            const featEntriesEqual = (a: ImportFeatEntry, b: ImportFeatEntry): boolean => {
                return (
                    a.category === b.category &&
                    a.level === b.level &&
                    a.match === b.match &&
                    a.value === b.value &&
                    // make sure that both have a parent or neither
                    !!a.parent === !!b.parent
                );
            };

            for (const feat of imported.feats) {
                const current = currentFeats.find((current) => {
                    if (!featEntriesEqual(feat, current)) return false;
                    // they both don't have parent
                    if (!current.parent) return true;

                    if (
                        ImportDataModel.isCoreEntry(current.parent) ||
                        ImportDataModel.isCoreEntry(feat.parent)
                    ) {
                        return current.parent === feat.parent;
                    }

                    const currentParent = currentFeats[Number(current.parent)];
                    const importedParent = imported.feats![Number(feat.parent)];

                    return featEntriesEqual(currentParent, importedParent);
                });

                if (current?.override) {
                    feat.override = current.override;
                }
            }
        }

        const data = new ImportDataModel(foundry.utils.mergeObject(current ?? {}, imported));

        if (data.invalid) {
            throw MODULE.Error("an error occured when parsing pathbuilder JSON data.");
        }

        await this.setFlag(actor, "data", data);
        this.info("import.success");
    } catch (error) {
        console.error(error);
    }
}

async function importFromJSON(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ code: string }>({
        i18n: this.localizeKey("import.code"),
        content: `<textarea name="code"></textarea>`,
        focus: "code",
    });

    return result ? result.code : null;
}

async function importFromFile(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ file: File }>({
        i18n: this.localizeKey("import.file"),
        content: `<input type="file" name="file" accept=".json">`,
        focus: "code",
    });

    return result && result.file ? foundry.utils.readTextFromFile(result.file) : null;
}

export { importData };
