import { CharacterPF2e, MODULE, R, waitDialog } from "module-helpers";
import { CharacterImporterTool, fromPathbuilder, ImportDataModel } from "..";

async function importData(this: CharacterImporterTool, actor: CharacterPF2e, fromFile: boolean) {
    const code = await (fromFile ? importFromFile : importFromJSON).call(this);
    if (!R.isString(code)) return;

    try {
        const parsed = JSON.parse(code) as unknown;
        const current = this.getImportData(actor)?.toObject() ?? {};

        const data = new ImportDataModel(
            foundry.utils.mergeObject(current, await fromPathbuilder(parsed))
        );

        if (data.invalid) {
            throw MODULE.Error("an error occured when parsing pathbuilder JSON data.");
        }

        await this.setFlag(actor, "data", data);
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
