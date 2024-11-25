import {
    ActorPF2e,
    EffectPF2e,
    EffectsPanel,
    addListener,
    elementDataset,
    htmlClosest,
} from "module-helpers";
import { createTool } from "../tool";

const { config, settings, hook } = createTool({
    name: "effectsPanel",
    settings: [
        {
            key: "remove",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value: boolean) => {
                hook.toggle(value);
                game.pf2e.effectPanel?.render();
            },
        },
    ],
    hooks: [
        {
            event: "renderEffectsPanel",
            listener: onRenderEffectsPanel,
        },
    ],
    init: () => {
        hook.toggle(settings.remove);
    },
} as const);

function onRenderEffectsPanel(panel: EffectsPanel, $html: JQuery) {
    // @ts-expect-error
    const actor = panel.actor;
    if (!actor) return;

    const html = $html[0];
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
            addListener(
                effectsPanel,
                ".icon",
                "contextmenu",
                (event, el) => onRemoveEffect(event, el, actor),
                true
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

function getEffect(target: HTMLElement, actor: ActorPF2e) {
    const effectEl = htmlClosest(target, ".effect-item[data-item-id]");
    if (!effectEl) return;

    const { itemId } = elementDataset(effectEl);
    return actor.items.get<EffectPF2e<ActorPF2e>>(itemId);
}

export { config as effectsPanelTool };
