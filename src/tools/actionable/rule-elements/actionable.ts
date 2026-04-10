import {
    CharacterPF2e,
    itemIsEquipped,
    ItemPF2e,
    ItemSourcePF2e,
    ModelPropsFromRESchema,
    PhysicalItemPF2e,
    R,
    RuleElement,
    RuleElementOptions,
    RuleElementSource,
} from "foundry-helpers";
import { SourceFromSchema } from "foundry-helpers/src";
import { actionable } from "..";

function createActionableRuleElement() {
    const RuleElementCls = game.pf2e.RuleElement;

    class ActionableRuleElement extends RuleElementCls<ActionableSchema> {
        constructor(data: ActionableSource, options: RuleElementOptions) {
            data.priority ??= 99;
            data.requiresEquipped = false;
            data.requiresInvestment = false;

            super(data, options);

            if (!this.item.isOfType("physical")) {
                this.failValidation("parent item must be physical");
            }

            const uuid = this.resolveInjectedProperties(this.uuid);
            const type = fromUuidSync<ItemPF2e>(uuid)?.type;
            if (!R.isIncludedIn(type, ["action", "feat"])) {
                this.failValidation("uuid must be a valid encounter action source uuid");
            }
        }

        static override defineSchema(): ActionableSchema {
            const fields = foundry.data.fields;
            return {
                ...super.defineSchema(),
                data: new fields.ObjectField(),
                uuid: new fields.DocumentUUIDField({
                    required: true,
                    nullable: false,
                    label: "PF2E.UUID.Label",
                    type: "Item",
                }),
            };
        }

        override async preUpdateActor(): Promise<{ create: ItemSourcePF2e[]; delete: string[] }> {
            return { create: [], delete: [] };
        }

        override onApplyActiveEffects() {
            if (this.invalid || !this.actor.isOfType("character")) return;

            if (!this.data.id || this.data.sourceId !== this.uuid) {
                return this.#setData();
            }

            if (this.test()) {
                actionable.setInMemory<VirtualActionData>(this.actor, "virtual", this.data.id, {
                    data: this.data,
                    parent: this.item,
                    ruleIndex: this.sourceIndex as number,
                });
            }
        }

        test(rollOptions?: string[] | Set<string> | undefined): boolean {
            return super.test(rollOptions) && itemIsEquipped(this.item);
        }

        updateData(changes: ActionableUpdateDataArgs, sourceOnly: true): EmbeddedDocumentUpdateData | undefined;
        updateData(
            changes: ActionableUpdateDataArgs,
            sourceOnly?: boolean,
        ): Promise<ItemPF2e<CharacterPF2e> | undefined> | undefined;
        updateData(
            changes: ActionableUpdateDataArgs,
            sourceOnly?: boolean,
        ): EmbeddedDocumentUpdateData | Promise<ItemPF2e<CharacterPF2e> | undefined> | undefined {
            const item = this.item;
            const sourceIndex = this.sourceIndex ?? -1;
            const rules = foundry.utils.deepClone(item._source.system.rules);
            const rule = rules[sourceIndex] as DeepPartial<ActionableRuleSource> | undefined;
            if (!rule?.data) return;

            foundry.utils.mergeObject(rule.data, changes);

            if (sourceOnly) {
                const parentItem = item.parentItem;
                if (parentItem) {
                    const subitems = foundry.utils.deepClone(parentItem._source.system.subitems);
                    const subitem = subitems?.find((i) => i._id === item.id);

                    if (subitem) {
                        subitem.system.rules = rules;
                    }

                    return { _id: parentItem.id, "system.subitems": subitems };
                } else {
                    return { _id: item.id, "system.rules": rules };
                }
            } else {
                return item.update({ "system.rules": rules });
            }
        }

        async #setData() {
            const sourceIndex = this.sourceIndex ?? -1;
            if (sourceIndex < 0) return;

            const rules = foundry.utils.deepClone(this.item._source.system.rules);
            const rule = rules[sourceIndex] as DeepPartial<ActionableRuleSource> | undefined;
            if (!rule) return;

            const action = await fromUuid<ItemPF2e>(this.uuid);
            if (!action?.isOfType("action", "feat")) return;

            rule.data ??= {};

            // the uuid has changed since last update so we remove specific data
            if (rule.data.sourceId !== this.uuid) {
                rule.data = {
                    id: rule.data.id,
                    sourceId: this.uuid,
                };
            }

            // we add a persistent id if none already exist
            rule.data.id ??= foundry.utils.randomID();

            if (action.frequency) {
                rule.data.frequency ??= action.frequency.max;
            }

            await this.item.update({ "system.rules": rules });
        }
    }

    interface ActionableRuleElement extends RuleElement<ActionableSchema>, ModelPropsFromRESchema<ActionableSchema> {
        get actor(): CharacterPF2e;
        get item(): PhysicalItemPF2e<CharacterPF2e>;
    }

    return ActionableRuleElement;
}

interface ActionableSource extends RuleElementSource {
    data?: unknown;
    uuid?: unknown;
}

type ActionableRuleSource = SourceFromSchema<ActionableSchema>;
type ActionableSchema = toolbelt.actionable.ActionableSchema;
type ActionableData = toolbelt.actionable.ActionableData;
type VirtualActionData = toolbelt.actionable.VirtualActionData;
type ActionableRuleElement = toolbelt.actionable.ActionableRuleElement;
type ActionableUpdateDataArgs = toolbelt.actionable.ActionableRuleElement;

export { createActionableRuleElement };
export type { ActionableData, ActionableRuleElement, ActionableRuleSource, VirtualActionData };
