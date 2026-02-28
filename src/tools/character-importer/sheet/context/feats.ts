import { CharacterPF2e, FeatOrFeatureCategory, R } from "foundry-helpers";
import { CharacterImport, CharacterImporterTool, ImportDataFeatEntry, prepareFeatEntries } from "tools";

async function prepareFeatsTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataFeatsContext> {
    const sections: FeatSection[] = R.pipe(
        prepareFeatEntries.call(this, actor, data, undefined, 0),
        R.groupByProp("category"),
        R.mapValues((entrys): FeatSection => {
            return {
                category: entrys[0].category,
                feats: entrys,
                label: entrys[0].label,
            };
        }),
        R.values(),
    );

    return {
        sections,
    };
}

function addFeatsEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {}

type FeatSection = { category: FeatOrFeatureCategory; feats: ImportDataFeatEntry[]; label: string };

type ImportDataFeatsContext = {
    sections: FeatSection[];
};

export { addFeatsEventListeners, prepareFeatsTab };
