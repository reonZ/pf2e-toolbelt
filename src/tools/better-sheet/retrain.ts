import {
    CharacterPF2e,
    ChoiceSetRuleElement,
    ChoiceSetSource,
    FeatFilters,
    FeatPF2e,
    FeatTrait,
    getDragEventData,
    getItemSourceId,
    openBrowserTab,
    R,
    RawPredicate,
    setStyleProperty,
    SYSTEM,
} from "foundry-helpers";
import { ModuleToolApplication } from "module-tool-application";
import { BetterSheetTool } from ".";

class FeatRetrainPopup extends ModuleToolApplication<BetterSheetTool> {
    #actor: CharacterPF2e;
    #category: string;
    #current: FeatPF2e<CharacterPF2e>;
    #featSlot: string | null;
    #filters: DeepPartial<FeatFilters> | undefined;
    #grantedBy: FeatPF2e<CharacterPF2e> | null;
    #retrainFeat: FeatPF2e | null = null;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-better-sheet-retrain"],
        window: {
            contentClasses: ["standard-form"],
        },
    };

    constructor(
        tool: BetterSheetTool,

        currentFeat: FeatPF2e<CharacterPF2e>,
        category: string,
        options?: DeepPartial<fa.ApplicationConfiguration>,
    ) {
        super(tool, options);

        this.#actor = currentFeat.actor;
        this.#category = category;
        this.#current = currentFeat;
        this.#grantedBy = currentFeat.grantedBy as FeatPF2e<CharacterPF2e> | null;

        const featSlot =
            !this.#grantedBy && this.#actor.feats.get(category)?.feats.find((slot) => slot.feat === currentFeat);

        this.#featSlot = featSlot && "id" in featSlot ? featSlot.id : null;
    }

    get key(): string {
        return "retrain";
    }

    async browse() {
        const browser = game.pf2e.compendiumBrowser;

        await browser.close();

        const filters = foundry.utils.mergeObject<FeatFilters, DeepPartial<FeatFilters>>(
            await browser.tabs.feat.getFilterData(),
            this.#getCustomFilters(),
        );

        openBrowserTab("feat", null, filters);
    }

    #getCustomFilters(): DeepPartial<FeatFilters> {
        if (this.#filters) {
            return this.#filters;
        }

        const level = this.#current.system.level;
        const filters: DeepPartial<FeatFilters> = {
            level: {
                changed: true,
                isExpanded: true,
                from: 0,
                to: level.taken ?? level.value,
            },
        };

        if (this.#featSlot) {
            filters.checkboxes = {
                category: {
                    selected: [this.#category],
                    options: {
                        [this.#category]: { selected: true },
                    },
                    isExpanded: true,
                },
            };
        } else if (this.#grantedBy) {
            const sourceId = getItemSourceId(this.#current);
            const rule = this.#grantedBy.rules.find((rule): rule is ChoiceSetRuleElement => {
                return rule.key === "ChoiceSet" && (rule as ChoiceSetRuleElement).selection === sourceId;
            });

            const choicesFilters =
                rule && R.isPlainObject(rule.choices) && "filter" in rule.choices && R.isArray(rule.choices.filter)
                    ? (rule.choices.filter as RawPredicate)
                    : [];

            const selectedTraits: { label: string; not?: boolean; value: FeatTrait }[] = [];

            const addTrait = (option: string, not?: boolean) => {
                const value = option.split(":")[2] as FeatTrait;
                const label = game.i18n.localize(CONFIG.PF2E.featTraits[value]);
                selectedTraits.push({ label, value, not });
            };

            const isTraitEntry = (entry: unknown): entry is string => {
                return R.isString(entry) && entry.startsWith("item:trait");
            };

            for (const entry of choicesFilters) {
                if (isTraitEntry(entry)) {
                    addTrait(entry);
                } else if (R.isPlainObject(entry) && "not" in entry && isTraitEntry(entry.not)) {
                    addTrait(entry.not, true);
                }
            }

            if (selectedTraits.length) {
                filters.traits = {
                    conjunction: "and",
                    selected: selectedTraits,
                };
            }
        }

        return (this.#filters = filters);
    }

    protected _onClose(_options: foundry.applications.ApplicationClosingOptions): void {
        game.pf2e.compendiumBrowser.close();
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<PopupContext> {
        return {
            retrain: this.#retrainFeat,
        };
    }

    async _onFirstRender(_context: object, _options: fa.ApplicationRenderOptions) {
        this.browse();
    }

    protected _onClickAction(_event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;

        switch (action) {
            case "browse": {
                return this.browse();
            }

            case "cancel": {
                return this.close();
            }

            case "retrain": {
                return this.#retrain();
            }
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        html.addEventListener("drop", async (event) => {
            const data = getDragEventData(event);

            if (data?.type !== "Item" || typeof data.uuid !== "string") {
                return this.localize.error("wrongDataType");
            }

            const item = await fromUuid<FeatPF2e>(data.uuid);
            if (!item?.isOfType("feat")) {
                return this.localize.error("wrongItemType");
            }

            this.#retrainFeat = item;
            this.render();
        });
    }

    setPosition(
        position?: Partial<foundry.applications.ApplicationPosition>,
    ): foundry.applications.ApplicationPosition {
        const element = this.element;
        const newPosition = super.setPosition(position);

        newPosition.top = window.innerHeight - element.clientHeight;
        setStyleProperty(element, "top", newPosition.top);

        return newPosition;
    }

    async #retrain() {
        this.close();
        if (!this.#retrainFeat) return;

        const currentId = this.#current.id;
        const source = this.#retrainFeat.toObject();

        // we have to generate it for the granter
        source._id = foundry.utils.randomID();

        foundry.utils.setProperty(source, "system.level.taken", this.#current.system.level.taken);

        if (this.#featSlot) {
            foundry.utils.setProperty(source, "system.location", this.#featSlot);
        } else if (this.#grantedBy) {
            foundry.utils.setProperty(source, `flags.${SYSTEM.id}.grantedBy`, this.#current.flags[SYSTEM.id].grantedBy);

            const granterUpdates: EmbeddedDocumentUpdateData = {
                _id: this.#grantedBy.id,
            };

            const itemGrants = R.pipe(
                this.#grantedBy.flags[SYSTEM.id].itemGrants,
                R.entries(),
                R.find(([_flag, value]) => value.id === currentId),
            );

            if (itemGrants) {
                granterUpdates[`flags.${SYSTEM.id}.itemGrants.${itemGrants[0]}.id`] = source._id;
            }

            const currentSourceId = getItemSourceId(this.#current);
            const granterRules = foundry.utils.deepClone(this.#grantedBy._source.system.rules);
            const choiceRule = granterRules.find((rule): rule is ChoiceSetSource => {
                return rule.key === "ChoiceSet" && (rule as ChoiceSetSource).selection === currentSourceId;
            });

            if (choiceRule) {
                choiceRule.selection = getItemSourceId(this.#retrainFeat);
                granterUpdates["system.rules"] = granterRules;
            }

            await this.#actor.updateEmbeddedDocuments("Item", [granterUpdates], { render: false });
        }

        await this.#actor.deleteEmbeddedDocuments("Item", [currentId], { render: false });
        await this.#actor.createEmbeddedDocuments("Item", [source], { keepId: true });
    }
}

type EventAction = "browse" | "cancel" | "retrain";

type PopupContext = fa.ApplicationRenderContext & {
    retrain: FeatPF2e | null;
};

export { FeatRetrainPopup };
