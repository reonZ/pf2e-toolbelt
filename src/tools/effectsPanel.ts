import {
    addListener,
    createHTMLElement,
    elementDataset,
    htmlClosest,
    htmlQuery,
} from "foundry-pf2e";
import { createTool } from "../tool";

const debouncedSetup = foundry.utils.debounce(setup, 1);

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
    init: setup,
} as const);

function setup() {
    hook.toggle(settings.condition || settings.remove);
    game.pf2e.effectPanel?.render();
}

function onRenderEffectsPanel(panel: EffectsPanel, $html: JQuery) {
    const actor = panel.actor;
    if (!actor) return;

    const html = $html[0];
    const removeLabel = localize("remove");
    const effectsPanels = html.querySelectorAll<HTMLElement>(".effect-item[data-item-id]");

    for (const effectsPanel of effectsPanels) {
        const { itemId } = elementDataset(effectsPanel);
        const effect = actor.items.get(itemId);
        if (!effect?.isOfType("effect", "condition")) continue;

        if (
            settings.remove &&
            !effect.isLocked &&
            effect.badge &&
            effect.badge.type === "counter"
        ) {
            const removeElement = createHTMLElement("div", { innerHTML: removeLabel });
            htmlQuery(effectsPanel, ".effect-info .instructions")?.append(removeElement);

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
            const h1 = htmlQuery(effectsPanel, ".effect-info > h1");
            if (!h1) continue;

            const editElement = createHTMLElement("a", {
                innerHTML: "<i class='fa-solid fa-fw fa-pencil'></i>",
                dataset: { tooltip: "PF2E.EditItemTitle" },
            });

            h1.append(editElement);

            editElement.addEventListener("click", (event) => {
                onEditCondition(event, editElement, actor);
            });
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
    const effectEl = htmlClosest(target, ".effect-item[data-item-id]");
    if (!effectEl) return;

    const { itemId } = elementDataset(effectEl);
    return actor.items.get<EffectPF2e<ActorPF2e>>(itemId);
}

export { config as effectsPanelTool };
