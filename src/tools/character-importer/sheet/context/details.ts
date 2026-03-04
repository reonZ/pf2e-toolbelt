import { addListenerAll, CharacterPF2e, R } from "foundry-helpers";
import { CharacterImport, CharacterImporterTool } from "tools";

async function prepareDetailsTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataDetailsContext> {
    const actorDetails = actor.system.details;

    return {
        details: [
            {
                current: actor.name,
                expected: data.name,
                label: "name",
            },
            {
                current: actorDetails.age.value,
                expected: data.age,
                label: "age",
            },
            {
                current: actorDetails.gender.value,
                expected: data.gender,
                label: "gender",
            },
        ],
        languages: {
            current: localizeAndSort(actorDetails.languages.value),
            expected: localizeAndSort(data.languages),
        },
    };
}

function addDetailsEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;

        switch (action) {
            case "assign-details": {
                return assignDetails.call(this, actor);
            }

            case "assign-languages": {
                return assignLanguages.call(this, actor);
            }
        }
    });
}

function localizeAndSort(languages: string[]) {
    return R.pipe(
        languages,
        R.map((slug) => game.i18n.localize(CONFIG.PF2E.languages[slug])),
        R.sortBy(R.identity()),
    );
}

async function assignDetails(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    await actor.update({
        name: data.name,
        "prototypeToken.name": data.name,
        "system.details.age.value": data.age,
        "system.details.gender.value": data.gender,
    });
}

async function assignLanguages(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const languages = R.difference(
        data.languages,
        actor.system.build.languages.granted.map((x) => x.slug),
    );

    await actor.update({ "system.details.languages.value": languages });
}

type EventAction = "assign-details" | "assign-languages";

type ImportDataDetailsContext = {
    details: ImportDataEntry[];
    languages: {
        current: string[];
        expected: string[];
    };
};

type ImportDataEntry = {
    current: string;
    expected: string;
    label: string;
};

export { addDetailsEventListeners, prepareDetailsTab };
