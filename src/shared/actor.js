export function isPlayedActor(actor) {
    return actor && !actor.pack && actor.id && game.actors.has(actor.id)
}
