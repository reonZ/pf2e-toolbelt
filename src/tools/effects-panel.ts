import {
    AbstractEffectPF2e,
    ActorPF2e,
    addListener,
    createHook,
    EffectsPanel,
    EffectsPanelViewData,
    htmlQuery,
} from "module-helpers";
import { ModuleTool, ToolSettings } from "module-tool";

class EffectsPanelTool extends ModuleTool<Settings> {
    #renderEffectsPanelHook = createHook(
        "renderEffectsPanel",
        this.#onRenderEffectsPanel.bind(this)
    );

    get key(): "effectsPanel" {
        return "effectsPanel";
    }

    get settings(): ToolSettings<Settings> {
        return [
            {
                key: "remove",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    this.#renderEffectsPanelHook.toggle(value);
                },
            },
        ] as const;
    }

    init(isGM: boolean): void {
        this.#renderEffectsPanelHook.toggle(this.getSetting("remove"));
    }

    #onRenderEffectsPanel(panel: EffectsPanel, html: HTMLElement, data: EffectsPanelViewData) {
        const actor = data.actor;
        if (!actor) return;

        const effects = [...data.afflictions, ...data.conditions, ...data.effects].map(
            (effect) => effect.effect
        );

        for (const effect of effects) {
            if (effect.isLocked || !effect.badge || effect.badge.type !== "counter") continue;

            const effectEl = htmlQuery(html, `.effect-item[data-item-id="${effect.id}"]`);

            addListener(
                effectEl,
                ".icon",
                "contextmenu",
                (event, el) => this.#onRemoveEffect(event, effect),
                true
            );
        }
    }

    #onRemoveEffect(event: MouseEvent, effect: AbstractEffectPF2e<ActorPF2e>) {
        if (!event.shiftKey) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        effect.delete();
    }
}

type Settings = {
    remove: boolean;
};

export { EffectsPanelTool };
