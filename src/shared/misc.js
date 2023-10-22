export function localeCompare(a, b) {
    return a.localeCompare(b, game.i18n.lang)
}

export function refreshCharacterSheets(actor) {
    for (const win of Object.values(ui.windows)) {
        const winActor = win.actor
        if (!(win instanceof ActorSheet) || !winActor.isOfType('character')) continue
        if (!actor || actor === winActor) win.render()
    }
}

export function compareArrays(arr1, arr2) {
    if (arr1.length !== arr2.length) return false

    const clonedArr2 = arr2.slice()

    for (const arr1Value of arr1) {
        const index = clonedArr2.findIndex(arr2Value => arr1Value === arr2Value)
        if (index === -1) return false
        clonedArr2.splice(index, 1)
    }

    return true
}
