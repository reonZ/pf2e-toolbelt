import {
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    isPlayedActor,
} from "module-helpers";
import { createSharedWrapper } from "./sharedWrapper";

const CHARACTER_SHEET_RENDER_INNER =
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner";
const CHARACTER_SHEET_ACTIVATE_LISTENERS =
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners";

const characterSheetWrappers = {
    [CHARACTER_SHEET_RENDER_INNER]: createSharedWrapper(
        CHARACTER_SHEET_RENDER_INNER,
        characterSheetPF2eRenderInner
    ),
    [CHARACTER_SHEET_ACTIVATE_LISTENERS]: createSharedWrapper(
        CHARACTER_SHEET_ACTIVATE_LISTENERS,
        characterSheetPF2eActivateListeners
    ),
};

async function characterSheetPF2eRenderInner(
    this: CharacterSheetPF2e<CharacterPF2e>,
    wrapperError: (error: Error) => void,
    listeners: ((html: HTMLElement, data: CharacterSheetData) => Promise<void>)[],
    wrapped: libWrapper.RegisterCallback,
    data: CharacterSheetData
) {
    const $html = await wrapped(data);
    const html = $html[0];

    if (!hasValidCharacter(this)) return $html;

    try {
        for (const listener of listeners) {
            await listener.call(this, html, data);
        }
    } catch (error) {
        wrapperError(error);
    }

    return $html;
}

function characterSheetPF2eActivateListeners(
    this: CharacterSheetPF2e<CharacterPF2e>,
    wrapperError: (error: Error) => void,
    listeners: ((html: HTMLElement) => void)[],
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    if (!hasValidCharacter(this)) return;

    const html = $html[0];

    try {
        for (const listener of listeners) {
            listener.call(this, html);
        }
    } catch (error) {
        wrapperError(error);
    }
}

function hasValidCharacter(sheet: CharacterSheetPF2e<CharacterPF2e>) {
    const actor = sheet.actor;
    return isPlayedActor(actor) && actor.permission > CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
}

export { CHARACTER_SHEET_ACTIVATE_LISTENERS, CHARACTER_SHEET_RENDER_INNER, characterSheetWrappers };
