import { CharacterPF2e, R, waitDialog } from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    fromPathbuilder,
    ImportedFeatSource,
    ImportedSpellcastingSource,
    isCharacterCategory,
} from "..";

async function importData(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e, fromFile: boolean) {
    const codeOrFile = fromFile ? await importFromFile.call(this) : await importFromJSON.call(this);
    if (!codeOrFile) return;

    this.addLoader(html);

    const code = R.isString(codeOrFile) ? codeOrFile : await foundry.utils.readTextFromFile(codeOrFile);

    try {
        const parsed = JSON.parse(code) as unknown;
        const currentSource = await this.getImportData(actor, true);
        const importedSource = await fromPathbuilder(parsed);

        if (importedSource.feats?.length && currentSource?.feats?.length) {
            const currentFeats = currentSource.feats;

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

        if (importedSource.containers?.length && currentSource?.containers?.length) {
            for (const container of importedSource.containers) {
                const current = currentSource.containers.find((current) => {
                    return current.identifier === container.identifier;
                });

                if (current?.override) {
                    container.override = current.override;
                }
            }
        }

        if (importedSource.equipments?.length && currentSource?.equipments?.length) {
            for (const equipment of importedSource.equipments) {
                const current = currentSource.equipments.find((current) => {
                    return (
                        current.container === equipment.container &&
                        current.match === equipment.match &&
                        current.type === equipment.type &&
                        current.value === equipment.value
                    );
                });

                if (current?.override) {
                    equipment.override = current.override;
                }
            }
        }

        const spellcastingEntriesEqual = (a: ImportedSpellcastingSource, b: ImportedSpellcastingSource): boolean => {
            return a.attribute === b.attribute && a.name === b.name && a.tradition === b.tradition && a.type === b.type;
        };

        if (importedSource.spellcasting?.length && currentSource?.spellcasting?.length) {
            for (const entry of importedSource.spellcasting) {
                const current = currentSource.spellcasting.find((current) => {
                    return spellcastingEntriesEqual(current, entry);
                });

                if (current?.selected) {
                    entry.selected = current.selected;
                }
            }
        }

        if (importedSource.spells?.length && currentSource?.spells?.length) {
            for (const spell of importedSource.spells) {
                const current = currentSource.spells.find((current) => {
                    if (current.match !== spell.match || current.rank !== spell.rank || current.value !== spell.value)
                        return false;

                    const currentParent = currentSource.spellcasting?.find((entry) => {
                        return entry.identifier === current.parent;
                    });

                    const parent = importedSource.spellcasting?.find((entry) => {
                        return entry.identifier === spell.parent;
                    });

                    return currentParent && parent && spellcastingEntriesEqual(currentParent, parent);
                });

                if (current?.override) {
                    spell.override = current.override;
                }
            }
        }

        const mergedSource = foundry.utils.mergeObject(currentSource ?? {}, importedSource);
        const merged = await CharacterImport.fromSource(mergedSource, true);

        await this.setImportData(actor, merged);
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

async function importFromFile(this: CharacterImporterTool): Promise<File | null> {
    const result = await waitDialog<{ file: File }>({
        i18n: this.path("import.file"),
        content: `<input type="file" name="file" accept=".json">`,
    });

    return result ? result.file : null;
}

export { importData };
