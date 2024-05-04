import {
    addListener,
    appendHTMLFromString,
    closest,
    elementData,
    htmlElement,
    querySelector,
} from "pf2e-api";
import { createTool } from "../tool";

const debouncedSetup = debounce(setup, 1);

const { localize, config, settings, hook } = createTool({
    name: "effectsPanel",
    settings: [
        {
            key: "remove",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetup,
        },
        {
            key: "condition",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetup,
        },
    ],
    hooks: [
        {
            event: "renderEffectsPanel",
            listener: onRenderEffectsPanel,
        },
    ],
    init: debouncedSetup,
} as const);

function setup() {
    hook.toggle(settings.condition || settings.remove);
    game.pf2e.effectPanel?.render();
}

function onRenderEffectsPanel(panel: EffectsPanel, $html: JQuery) {
    const actor = panel.actor;
    if (!actor) return;

    const html = htmlElement($html);
    const effectsPanels = html.querySelectorAll(".effect-item[data-item-id]");
    const removeRow = `<div>${localize("remove")}</div>`;
    const editIcon = `<a data-action="edit" data-tooltip="PF2E.EditItemTitle">
        <i class="fa-solid fa-fw fa-pencil"></i>
    </a>`;

    for (const effectsPanel of effectsPanels) {
        const { itemId } = elementData(effectsPanel);
        const effect = actor.items.get<EffectPF2e>(itemId);
        if (!effect) continue;

        if (
            settings.remove &&
            !effect.isLocked &&
            effect.badge &&
            effect.badge.type === "counter"
        ) {
            appendHTMLFromString(
                querySelector(effectsPanel, ".effect-info .instructions"),
                removeRow
            );

            addListener(
                effectsPanel,
                ".icon",
                "contextmenu",
                (event, el) => onRemoveEffect(event, el, actor),
                true
            );
        }

        if (
            settings.condition &&
            effect.isOfType("condition") &&
            effect.slug !== "persistent-damage"
        ) {
            const h1 = querySelector(effectsPanel, ".effect-info > h1");

            appendHTMLFromString(h1, editIcon);
            addListener(h1, "[data-action='edit']", (event, el) =>
                onEditCondition(event, el, actor)
            );
        }
    }
}

function onRemoveEffect(event: MouseEvent, el: HTMLElement, actor: ActorPF2e) {
    if (!event.shiftKey) return;

    const effect = getEffect(el, actor);
    if (!effect?.badge || effect.isLocked || effect.badge.type !== "counter") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    effect.delete();
}

function onEditCondition(event: MouseEvent, el: HTMLElement, actor: ActorPF2e) {
    const effect = getEffect(el, actor);

    if (effect?.isOfType("condition")) {
        event.preventDefault();
        effect.sheet.render(true);
    }
}

function getEffect(target: HTMLElement, actor: ActorPF2e) {
    const effectEl = closest(target, ".effect-item[data-item-id]");
    const { itemId } = elementData(effectEl);
    return actor.items.get<EffectPF2e>(itemId);
}

export { config as effectsPanelTool };
