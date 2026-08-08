import {
    AttributeString,
    CharacterPF2e,
    CompendiumIndexData,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    ImageFilePath,
    ItemPF2e,
    ItemUUID,
    MagicTradition,
    OneToTen,
    PhysicalItemPF2e,
    R,
    ROMAN_RANKS,
} from "foundry-helpers";
import { ModuleToolApplication } from "module-tool-application";
import {
    ActionableTool,
    generateItemCastRuleSource,
    ItemCastRuleElement,
    ItemCastRuleSource,
    ItemCastRuleSourceData,
} from "..";

const ITEM_CAST_REGEX =
    /<a class="content-link"(?=[^>]+data-type="Item")(?=[^>]+data-uuid="([a-z0-9\.-]+)").+?>.+?<\/a>(?:<\/em>)?/gim;
const ITEM_CAST_DC_REGEX = /^[^<]+dc (\d+)/im;
const ITEM_CAST_RANK_REGEX = /^[^<]+heightened to (\d+)/im;

class GenerateItemCast extends ModuleToolApplication<ActionableTool> {
    #data: Record<ItemUUID, ItemCastRuleSourceData> = {};
    #item: PhysicalItemPF2e<CharacterPF2e>;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-actionable-generate-cast"],
        // tag: "form",
    };

    constructor(
        item: PhysicalItemPF2e<CharacterPF2e>,
        tool: ActionableTool,
        options?: DeepPartial<fa.ApplicationConfiguration>,
    ) {
        super(tool, options);
        this.#item = item;
    }

    get key(): string {
        return "generate-cast";
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<GenerateItemCastContext> {
        const item = this.#item;
        const description = (await item.getDescription()).value;

        let match: RegExpExecArray | null = null;

        const spells: GenerateItemCastData[] = [];
        const existingUUIDs = R.pipe(
            item.rules,
            R.filter((rule): rule is ItemCastRuleElement => {
                return rule.key === "ItemCast" && R.isString((rule as ItemCastRuleElement).uuid);
            }),
            R.map(({ uuid }) => uuid),
        );

        while ((match = ITEM_CAST_REGEX.exec(description))) {
            const uuid = match[1] as ItemUUID;
            if (existingUUIDs.includes(uuid)) continue;

            const item = fromUuidSync<CompendiumIndexData>(uuid, { strict: false });
            if (item?.type !== "spell") continue;

            const index = match.index + match[0].length;
            const segment = description.slice(index);
            const savedData = this.#data[uuid];

            const data: GenerateItemCastData = {
                ...savedData,
                img: item.img,
                name: item.name,
                uuid,
            };

            if (!data.dc) {
                const dcRaw = ITEM_CAST_DC_REGEX.exec(segment)?.[1];
                data.dc = dcRaw ? Number(dcRaw) : undefined;
            }

            if (!data.rank) {
                const rankRaw = ITEM_CAST_RANK_REGEX.exec(segment)?.[1];
                data.rank = rankRaw ? (Number(rankRaw) as OneToTen) : undefined;
            }

            spells.push(data);
        }

        return {
            attributes: R.pick(CONFIG.PF2E.abilities, ["cha", "int", "wis"]),
            ranks: ROMAN_RANKS,
            spells,
            traditions: CONFIG.PF2E.magicTraditions,
        };
    }

    protected _onClickAction(_event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;
        const parent = htmlClosest(target, "[data-uuid]");
        if (!parent) return;

        switch (action) {
            case "add-rule":
                return this.#addRule(parent);
        }
    }

    generateRuleData(target: HTMLElement): ItemCastRuleSourceData {
        return {
            attribute: getValueFromSelect<AttributeString>(target, "attribute"),
            dc: getValueFromInputNumber(target, "dc"),
            max: getValueFromInputNumber(target, "max"),
            predicate: getPredicateFromInput(target),
            rank: (Number(getValueFromSelect(target, "rank")) || undefined) as OneToTen | undefined,
            recharge: htmlQuery<HTMLInputElement>(target, `[name="recharge"]`)?.checked,
            statistic: getValueFromInputText(target, "statistic"),
            tradition: getValueFromSelect<MagicTradition>(target, "tradition"),
        };
    }

    async #addRule(target: HTMLElement) {
        const uuid = target.dataset.uuid as ItemUUID;
        const item = await fromUuid<ItemPF2e>(uuid);
        if (!item?.isOfType("spell")) return;

        this.#data = R.pipe(
            htmlQueryAll(this.element, ".window-content .spell"),
            R.map((el) => [el.dataset.uuid as ItemUUID, this.generateRuleData(el)] as const),
            R.fromEntries(),
        ) as Record<ItemUUID, ItemCastRuleSourceData>;

        const rules = this.#item._source.system.rules.slice() as ItemCastRuleSource[];
        const rule = generateItemCastRuleSource(item, this.#data[uuid]);

        rules.push(rule);

        delete this.#data[uuid];

        await this.#item.update({ "system.rules": rules });
        this.render();
    }
}

function getPredicateFromInput(target: HTMLElement): readonly unknown[] {
    try {
        const rawPredicate = getValueFromInputText(target, "predicate");
        if (!rawPredicate) return [];

        const parsed = JSON.parse(rawPredicate);
        return R.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getValueFromInputText(target: HTMLElement, name: "predicate" | "statistic"): string | undefined {
    const input = htmlQuery<HTMLInputElement>(target, `[name="${name}"]`);
    return input?.value.trim() || undefined;
}

function getValueFromInputNumber(target: HTMLElement, name: "dc" | "max"): number | undefined {
    const input = htmlQuery<HTMLInputElement>(target, `[name="${name}"]`);
    return input?.valueAsNumber || undefined;
}

function getValueFromSelect<T extends string>(
    target: HTMLElement,
    name: "attribute" | "rank" | "statistic" | "tradition",
): Exclude<T, ""> | undefined {
    const select = htmlQuery<HTMLSelectElement>(target, `[name="${name}"]`);
    return (select?.value.trim() || undefined) as Exclude<T, ""> | undefined;
}

type EventAction = "add-rule";

type GenerateItemCastContext = fa.ApplicationRenderContext & {
    attributes: Pick<typeof CONFIG.PF2E.abilities, "cha" | "int" | "wis">;
    ranks: typeof ROMAN_RANKS;
    spells: GenerateItemCastData[];
    traditions: typeof CONFIG.PF2E.magicTraditions;
};

type GenerateItemCastData = Prettify<ItemCastRuleSourceData> & {
    img: ImageFilePath;
    name: string;
    uuid: ItemUUID;
};

export { GenerateItemCast };
