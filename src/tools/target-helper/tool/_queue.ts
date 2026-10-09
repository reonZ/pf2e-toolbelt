import { ChatMessagePF2e, createToggleHook, R, TokenDocumentPF2e, TokenDocumentUUID } from "foundry-helpers";
import type { TargetHelperTool } from ".";
import {
    AppliedDamagesSource,
    encodeTargetsData,
    getMessageSpell,
    SaveVariant,
    SaveVariantSource,
    TargetsAppliedDamagesSources,
    TargetSaveInstanceSource,
    TargetsData,
    TargetsDataSource,
    TargetsDataSourceKey,
    TargetsDataUpdates,
} from "..";

const dropOptionsKeys = ["author", "item", "options", "traits"] as const satisfies ReadonlyArray<
    keyof TargetsDataSource
>;

const rootUpdatesKeysByType = {
    "set-expended": ["expended"],
    "set-targets": ["splashTargets", "targets"],
} as const satisfies Record<string, TargetsDataSourceKey[]>;

class UpdateMessageQueue {
    #instances: Collection<string, UpdateMessageQueueInstance> = new Collection();
    #tool: TargetHelperTool;

    #deleteMessageHook = createToggleHook("deleteChatMessage", (message: ChatMessagePF2e) => {
        const instance = this.#instances.get(message.id);
        return instance && this.deleteInstance(instance);
    });

    constructor(tool: TargetHelperTool) {
        this.#tool = tool;
    }

    add(options: UpdateMessageQueueOption, userId: string) {
        const instance = this.getInstance(options.message);
        if (instance.deleted) return;

        const data = this.#tool.getMessageData(options.message);
        if (!data) return;

        if (options.type === "transfer-data") {
            if (instance.transferTo) return;
            instance.transferTo = options.target;
            return instance.toUpdate.length === 0 && this.#processInstance(instance);
        }

        if (options.type === "drop-save") {
            if (data.saveVariants.null) return;

            // filter out toUpdate that shouldn't be updated anymore
            instance.toUpdate = instance.toUpdate.filter(({ type }) => type === "roll-save");

            return this.addUpdate(instance, options.type, {
                ...R.pick(options, dropOptionsKeys),
                saveVariants: _replace({ null: options.nullVariant }),
            });
        }

        if (isRollSaveOptions(options)) {
            const author = game.users.get(userId);
            const skipDice = this.#tool.settings.skipDice;
            const currentSaveVariant = data.saveVariants[options.variantId];
            const currentSaves = R.pipe(
                instance.toUpdate,
                R.map((update) => update.type === options.type && update.options?.id),
                R.filter(R.isTruthy),
            );

            if (options.type === "roll-save") {
                currentSaves.push(...R.keys(currentSaveVariant.saves));
            }

            for (const [id, save] of R.entries(options.saves)) {
                if (R.isIncludedIn(id, currentSaves)) continue;

                currentSaves.push(id);

                const update: TargetsDataUpdates = {
                    saveVariants: {
                        [options.variantId]: {
                            saves: { [id]: save satisfies TargetSaveInstanceSource },
                        } as SaveVariantSource,
                    },
                };

                const updateOptions: ToUpdateOptions = { awaits: !!game.dice3d && !skipDice, id };
                this.addUpdate(instance, options.type, update, updateOptions);

                if (game.dice3d) {
                    const dieData = options.dice[id];
                    const die = new foundry.dice.terms.Die(dieData.source);
                    const token = fromUuidSync<TokenDocumentPF2e>(dieData.target);
                    const speaker = ChatMessage.getSpeaker({ token });
                    const messageMode = save.private || (token && !token.hasPlayerOwner) ? "blind" : "public";
                    const dice3d = game.dice3d.animateRoll({ dice: [die] }, { author, speaker }, { messageMode });

                    if (!skipDice) {
                        dice3d.then(() => this.clearAwaits(instance, id));
                    }
                }
            }

            return;
        }

        if (options.type === "set-applied") {
            const update = { applied: applyDamageUpdates(data, options) };
            return this.addUpdate(instance, options.type, update);
        }

        if (options.type in rootUpdatesKeysByType) {
            const type = options.type;
            const keys = rootUpdatesKeysByType[type];
            return this.addUpdate(instance, type, R.pick(options, keys) as TargetsDataUpdates);
        }
    }

    addInstance(message: ChatMessagePF2e): UpdateMessageQueueInstance {
        const instance: UpdateMessageQueueInstance = { message, toUpdate: [] };
        this.#instances.set(message.id, instance);
        this.#deleteMessageHook.activate();
        return instance;
    }

    getInstance(message: ChatMessagePF2e): UpdateMessageQueueInstance {
        return this.#instances.get(message.id) ?? this.addInstance(message);
    }

    deleteInstance(instance: UpdateMessageQueueInstance) {
        instance.deleted = true;
        instance.toUpdate.length = 0;
        instance.transferTo = undefined;

        this.#instances.delete(instance.message.id);

        if (this.#instances.size === 0) {
            this.#deleteMessageHook.disable();
        }
    }

    clearAwaits(instance: UpdateMessageQueueInstance, id: string) {
        const update = instance.toUpdate.find(
            (update): update is Required<QueueInstanceToUpdate> => !!update.options?.awaits && update.options.id === id,
        );
        if (update) {
            update.options.awaits = false;
            this.#processInstance(instance);
        }
    }

    addUpdate(
        instance: UpdateMessageQueueInstance,
        type: QueueOptionType,
        update: TargetsDataUpdates,
        options: ToUpdateOptions = {},
    ) {
        instance.toUpdate.push({ options, type, update });
        this.#processInstance(instance);
    }

    #processInstance = foundry.utils.throttle(this.#_processInstance.bind(this), 200);

    async #_processInstance(instance: UpdateMessageQueueInstance) {
        if (instance.processing || instance.deleted) return;

        const transferTo = instance.transferTo;
        const [readyUpdates, awaitingUpdates] = transferTo
            ? [instance.toUpdate, []] // when transfering data, we process everything without waiting
            : R.partition(instance.toUpdate, ({ options }) => !options?.awaits);

        // we put awaiting updates back now because toUpdate can be filled during async
        instance.toUpdate = awaitingUpdates;

        if (!readyUpdates.length && !transferTo) return;

        const message = instance.message;
        const data = this.#tool.getMessageData(message);
        if (!data) return;

        instance.processing = true;

        const updates = readyUpdates.map(({ update }) => update);

        if (transferTo) {
            instance.toUpdate.length = 0;
            instance.transferTo = undefined;

            if (data.type === "action") {
                const encoded = encodeTargetsData(data, ...updates, { saveVariants: _del });
                await this.#tool.setFlag(message, encoded);
            } else {
                await this.#tool.unsetFlag(message);
                this.deleteInstance(instance);
            }

            const encoded = encodeTargetsData(data, ...updates, { type: "damage" });

            if (data.type === "spell") {
                const spell = getMessageSpell(message);
                foundry.utils.mergeObject<TargetsDataSource, TargetsDataUpdates>(encoded, {
                    item: data.item ?? spell?.uuid,
                    saveVariants: _replace({ null: encoded.saveVariants?.[spell?.variantId ?? "null"] }),
                });
            }

            await this.#tool.setFlag(transferTo, encoded);
        } else {
            // toUpdate may still have awaiting updates or received new ones in the mean time
            if (!instance.toUpdate.length) {
                this.deleteInstance(instance);
            }

            const encoded = encodeTargetsData(data, ...updates);
            await this.#tool.setFlag(message, encoded);
        }

        instance.processing = false;
        this.#processInstance(instance);
    }
}

function applyDamageUpdates(
    data: TargetsData,
    { rollIndex, targetId }: UpdateMessageQueueAppliedOptions,
): TargetsAppliedDamagesSources {
    const splashIndex = data.splashIndex;

    const targetApplied: AppliedDamagesSource = {
        [rollIndex]: true,
    };

    const applied: TargetsAppliedDamagesSources = {
        [targetId]: targetApplied,
    };

    if (splashIndex !== -1) {
        const regularIndex = splashIndex === 0 ? 1 : 0;

        if (rollIndex === splashIndex) {
            targetApplied[regularIndex] = true;
        } else {
            targetApplied[splashIndex] = true;

            for (const otherTarget of data.targets) {
                const otherId = otherTarget.id;
                if (otherId === targetId) continue;

                applied[otherId] = { [regularIndex]: true };
            }
        }
    }

    return applied;
}

function isRollSaveOptions(options: UpdateMessageQueueOption): options is UpdateMessageQueueSaveOptions {
    return R.isIncludedIn(options.type, ["reroll-save", "roll-save"]);
}

type UpdateMessageQueueInstance = {
    deleted?: boolean;
    message: ChatMessagePF2e;
    processing?: boolean;
    toUpdate: QueueInstanceToUpdate[];
    transferTo?: ChatMessagePF2e;
};

type ToUpdateOptions = { id?: string; awaits?: boolean };

type QueueInstanceToUpdate = {
    options?: ToUpdateOptions;
    type: QueueOptionType;
    update: TargetsDataUpdates;
};

type UpdateMessageQueueOption =
    | UpdateMessageQueueAppliedOptions
    | UpdateMessageQueueDropOptions
    | UpdateMessageQueueExpendedOptions
    | UpdateMessageQueueSaveOptions
    | UpdateMessageQueueTargetsOptions
    | UpdateMessageQueueTransferOptions;

type QueueOptionType = UpdateMessageQueueOption["type"];

type DataDropOptionsKeys = (typeof dropOptionsKeys)[number];
type DataDropOptions = Pick<TargetsDataSource, DataDropOptionsKeys>;

type BaseUpdateMessageQueueOptions<T extends string> = {
    type: T;
    message: ChatMessagePF2e;
};

type UpdateMessageQueueAppliedOptions = BaseUpdateMessageQueueOptions<"set-applied"> & {
    rollIndex: number;
    targetId: string;
};

type UpdateMessageQueueDropOptions = BaseUpdateMessageQueueOptions<"drop-save"> &
    DataDropOptions & { nullVariant: SaveVariant | undefined };

type UpdateMessageQueueExpendedOptions = BaseUpdateMessageQueueOptions<"set-expended"> & {
    expended: number;
};

type UpdateMessageQueueSaveOptions = BaseUpdateMessageQueueOptions<"roll-save" | "reroll-save"> & {
    dice: Record<string, UpdateMessageDice>;
    saves: Record<string, TargetSaveInstanceSource>;
    variantId: string;
};

type UpdateMessageQueueTargetsOptions = BaseUpdateMessageQueueOptions<"set-targets"> & {
    splashTargets: TokenDocumentUUID[];
    targets: TokenDocumentUUID[];
};

type UpdateMessageQueueTransferOptions = BaseUpdateMessageQueueOptions<"transfer-data"> & {
    target: ChatMessagePF2e;
};

type UpdateMessageDice = {
    source: Partial<DieData>;
    id: string;
    target: TokenDocumentUUID;
};

export { UpdateMessageQueue };
export type { UpdateMessageDice, UpdateMessageQueueOption };
