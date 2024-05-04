import { htmlElement, isPlayedActor, libWrapper } from "pf2e-api";
import { createSharedWrapper } from "./sharedWrapper";

const CHARACTER_SHEET_RENDER =
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._render";
const CHARACTER_SHEET_RENDER_INNER =
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner";
const CHARACTER_SHEET_ACTIVATE_LISTENERS =
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners";

const characterSheetWrappers = {
    [CHARACTER_SHEET_RENDER]: createSharedWrapper(CHARACTER_SHEET_RENDER, characterSheetPF2eRender),
    [CHARACTER_SHEET_RENDER_INNER]: createSharedWrapper(
        CHARACTER_SHEET_RENDER_INNER,
        characterSheetPF2eRenderInner
    ),
    [CHARACTER_SHEET_ACTIVATE_LISTENERS]: createSharedWrapper(
        CHARACTER_SHEET_ACTIVATE_LISTENERS,
        characterSheetPF2eActivateListeners
    ),
};

async function characterSheetPF2eRender(
    this: CharacterSheetPF2e,
    listeners: ((event: "before" | "after", ...args: any[]) => Promise<void>)[],
    wrapped: libWrapper.RegisterCallback,
    ...args: any[]
) {
    if (!hasValidCharacter(this)) return wrapped(...args);

    for (const listener of listeners) {
        await listener.call(this, "before", ...args);
    }

    await wrapped(...args);

    for (const listener of listeners) {
        await listener.call(this, "after", ...args);
    }
}

async function characterSheetPF2eRenderInner(
    this: CharacterSheetPF2e,
    listeners: ((html: HTMLElement, data: CharacterSheetData) => Promise<void>)[],
    wrapped: libWrapper.RegisterCallback,
    data: CharacterSheetData
) {
    const $html = await wrapped(data);
    const html = htmlElement($html);

    if (!hasValidCharacter(this)) return $html;

    for (const listener of listeners) {
        await listener.call(this, html, data);
    }

    return $html;
}

function characterSheetPF2eActivateListeners(
    this: CharacterSheetPF2e,
    listeners: ((html: HTMLElement) => void)[],
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    if (!hasValidCharacter(this)) return;

    const html = htmlElement($html);

    for (const listener of listeners) {
        listener.call(this, html);
    }
}

function hasValidCharacter(sheet: CharacterSheetPF2e) {
    const actor = sheet.actor;
    return isPlayedActor(actor) && actor.permission > CONST.DOCUMENT_PERMISSION_LEVELS.LIMITED;
}

export {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER,
    CHARACTER_SHEET_RENDER_INNER,
    characterSheetWrappers,
};
