import { ActorPF2e, CreaturePF2e, getFlag, getInMemory } from "module-helpers";
import { ShareDataModel } from ".";

function isValidActor(actor: unknown): actor is CreaturePF2e {
    return (
        actor instanceof Actor &&
        !actor.pack &&
        game.actors.has(actor.id) &&
        (actor as ActorPF2e).isOfType("character", "npc")
    );
}

function isValidSlave(actor: unknown): actor is CreaturePF2e<null> {
    return isValidActor(actor) && !getInMemory(actor, "slaves");
}

function isValidMaster(actor: unknown, id?: string): actor is CreaturePF2e<null> {
    if (!isValidActor(actor) || (id && actor.id === id) || getMasterInMemory(actor)) return false;

    const masterId = getMasterId(actor);
    return !masterId || !game.actors.get(masterId);
}

function getMasterId(actor: CreaturePF2e): string | undefined {
    return getFlag(actor, "shareData.data.master");
}

function getShareDataInMemory(actor: CreaturePF2e): ShareDataModel | undefined {
    return getInMemory<ShareDataModel>(actor, "shareData.data");
}

function getMasterInMemory(actor: CreaturePF2e): CreaturePF2e | undefined {
    return getInMemory<CreaturePF2e | undefined>(actor, "shareData.data.master");
}

function getSlavesInMemory(actor: CreaturePF2e, idOnly: false): CreaturePF2e[];
function getSlavesInMemory(actor: CreaturePF2e, idOnly?: true): Set<ActorUUID> | undefined;
function getSlavesInMemory(
    actor: CreaturePF2e,
    idOnly: boolean = true
): Set<ActorUUID> | CreaturePF2e[] | undefined {
    const uuids = getInMemory<Set<ActorUUID>>(actor, "shareData.slaves");
    if (idOnly) return uuids;

    const slaves: CreaturePF2e[] = [];

    for (const uuid of uuids ?? []) {
        const slave = fromUuidSync<CreaturePF2e>(uuid);

        if (isValidSlave(slave)) {
            slaves.push(slave);
        }
    }

    return slaves;
}

export {
    getMasterId,
    getMasterInMemory,
    getShareDataInMemory,
    getSlavesInMemory,
    isValidMaster,
    isValidSlave,
};
