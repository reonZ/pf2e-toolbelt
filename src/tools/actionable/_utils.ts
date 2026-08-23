import {
    AbilityItemPF2e,
    AbilityViewData,
    getActionGlyph,
    R,
    traitSlugToObject,
    ImageFilePath,
    CharacterSheetData,
    FeatPF2e,
    ActorGroupUpdate,
    ActorPF2e,
} from "foundry-helpers";
import { getActionIcon } from "foundry-helpers/dist";

/** https://github.com/foundryvtt/pf2e/blob/e215ebfbb287190d313fe0441e0362439766786d/src/module/actor/sheet/helpers.ts#L67-L79 */
function createAbilityViewData(item: AbilityItemPF2e | FeatPF2e): AbilityViewData {
    return {
        ...R.pick(item, ["id", "uuid", "img", "name", "actionCost", "frequency"]),
        glyph: getActionGlyph(item.actionCost),
        usable: !!item.system.selfEffect || !!item.system?.frequency || !!item.crafting,
        traits: item.system.traits.value.map((t) => traitSlugToObject(t, CONFIG.PF2E.actionTraits)),
        has: {
            aura: item.traits.has("aura") || item.system.rules.some((r) => r.key === "Aura"),
            deathNote: item.isOfType("action") && item.system.deathNote,
            selfEffect: !!item.system.selfEffect,
        },
    };
}

/** https://github.com/foundryvtt/pf2e/blob/e215ebfbb287190d313fe0441e0362439766786d/src/module/actor/character/sheet.ts#L434 */
function getActionSheetData(item: AbilityItemPF2e | FeatPF2e): CharacterAbilityViewData {
    const baseData = createAbilityViewData(item);

    return {
        ...baseData,
        img: ((): ImageFilePath => {
            const actionIcon = getActionIcon(item.actionCost);
            const defaultIcon = getDocumentClass("Item").getDefaultArtwork(item._source).img;
            const commonFeatIcon = "icons/sundries/books/book-red-exclamation.webp";
            const isDefaultImage = [actionIcon, defaultIcon, commonFeatIcon].includes(item.img);
            if (item.isOfType("action") && !isDefaultImage) {
                return item.img;
            }
            return item.system.selfEffect?.img ?? (baseData.usable && !isDefaultImage ? item.img : actionIcon);
        })(),
        feat: item.isOfType("feat") ? item : null,
        toggles: item.system.traits.toggles?.getSheetData() ?? [],
    };
}

/** https://github.com/foundryvtt/pf2e/src/module/actor/helpers.ts#L1011 */
async function applyActorGroupUpdate(
    actor: ActorPF2e,
    data: Partial<ActorGroupUpdate>,
    { render = true, keepId }: { render?: boolean; keepId?: boolean } = {},
): Promise<void> {
    const actorUpdates = data.actorUpdates && !R.isEmpty(data.actorUpdates) ? data.actorUpdates : null;
    const itemCreates = data.itemCreates ?? [];
    const itemUpdates = data.itemUpdates ?? [];
    const itemDeletes = data.itemDeletes ?? [];

    // Determine which one is last so that we cause the re-render then
    // If we manually re-render, other users will fail to re-render
    const lastRender = !render
        ? null
        : itemDeletes.length
          ? "delete"
          : itemUpdates.length
            ? "update"
            : itemCreates.length
              ? "create"
              : "actorUpdate";

    const operations: foundry.documents.DatabaseWriteOperation[] = [];

    if (actorUpdates) {
        operations.push({
            action: "update",
            documentName: "Actor",
            updates: [{ ...actorUpdates, _id: actor.id }],
            parent: actor.parent,
            render: lastRender === "actorUpdate",
        });
    }
    if (itemCreates.length > 0) {
        operations.push({
            action: "create",
            data: itemCreates,
            documentName: "Item",
            keepId,
            parent: actor,
            render: lastRender === "create",
        });
    }
    if (itemUpdates.length > 0) {
        operations.push({
            action: "update",
            documentName: "Item",
            updates: itemUpdates,
            parent: actor,
            render: lastRender === "update",
        });
    }
    if (itemDeletes.length > 0) {
        operations.push({
            action: "delete",
            documentName: "Item",
            ids: itemDeletes,
            parent: actor,
            render: lastRender === "delete",
        });
    }

    // we bundle all the operations into a single server query
    if (operations.length > 0) {
        await foundry.documents.modifyBatch(operations);
    }
}

type CharacterAbilityViewData = CharacterSheetData["actions"]["encounter"]["action"]["actions"][number];

export { applyActorGroupUpdate, getActionSheetData };
