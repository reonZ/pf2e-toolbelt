import { addListenerAll, CharacterPF2e, LoreSource, R, SkillSlug, SYSTEM, ZeroToFour } from "foundry-helpers";
import { CharacterImport, CharacterImporterTool } from "tools";

async function prepareSkillsTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataSkillsContext> {
    const skills = R.map(R.keys(CONFIG.PF2E.skills), (slug): ImportSkill => {
        return {
            current: getSkillEntry(actor.getStatistic(slug).rank ?? 0),
            expected: getSkillEntry(data.skills[slug]),
            label: game.i18n.localize(CONFIG.PF2E.skills[slug].label),
        };
    });

    const lores = R.map(data.lores, ({ label, rank }): ImportSkill => {
        const slug = getLoreSlug(label);

        return {
            current: getSkillEntry(actor.getStatistic(slug)?.rank ?? 0),
            expected: getSkillEntry(rank),
            label,
        };
    });

    return {
        skills: R.sortBy([...skills, ...lores], R.prop("label")),
    };
}

function addSkillsEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;

        switch (action) {
            case "assign-skills": {
                return assignSkills.call(this, actor);
            }
        }
    });
}

async function assignSkills(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const skills: Partial<Record<SkillSlug, { rank: ZeroToFour }>> = {};
    const lores: PreCreate<LoreSource>[] = [];

    for (const [slug, rank] of R.entries(data.skills)) {
        const current = actor.getStatistic(slug).rank ?? 0;

        if (current < rank) {
            skills[slug] = { rank };
        }
    }

    for (const { label, rank } of data.lores) {
        const slug = getLoreSlug(label);
        const current = actor.getStatistic(slug)?.rank ?? 0;

        if (current < rank) {
            lores.push({
                name: label,
                system: {
                    proficient: { value: rank },
                },
                type: "lore",
            });
        }
    }

    if (!foundry.utils.isEmpty(skills)) {
        await actor.update({ "system.skills": skills });
    }

    if (lores.length) {
        await actor.createEmbeddedDocuments("Item", lores);
    }

    this.localize.info("sheet.data.skills.set");
}

function getSkillEntry(rank: ZeroToFour): ImportSkillEntry {
    return { label: CONFIG.PF2E.proficiencyLevels[rank], rank };
}

function getLoreSlug(label: string) {
    return `${SYSTEM.sluggify(label)}-lore`;
}

type EventAction = "assign-skills";

type ImportDataSkillsContext = {
    skills: ImportSkill[];
};

type ImportSkill = {
    current: ImportSkillEntry;
    expected: ImportSkillEntry;
    label: string;
};

type ImportSkillEntry = {
    label: string;
    rank: number;
};

export { addSkillsEventListeners, prepareSkillsTab };
export type { ImportDataSkillsContext };
