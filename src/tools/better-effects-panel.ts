import {
    AbstractEffectPF2e,
    ActorPF2e,
    addListener,
    createHook,
    EffectsPanel,
    EffectsPanelViewData,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterEffectsPanelTool extends ModuleTool<ToolSettings> {
    #renderEffectsPanelHook = createHook(
        "renderEffectsPanel",
        this.#onRenderEffectsPanel.bind(this)
    );

    get key(): "betterEffectsPanel" {
        return "betterEffectsPanel";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "remove",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#renderEffectsPanelHook.toggle(value);
                },
            },
        ];
    }

    init(isGM: boolean): void {
        this.#renderEffectsPanelHook.toggle(this.settings.remove);
    }

    #onRenderEffectsPanel(panel: EffectsPanel, html: HTMLElement, data: EffectsPanelViewData) {
        const actor = data.actor;
        if (!actor) return;

        const effects = [...data.afflictions, ...data.conditions, ...data.effects].map(
            (effect) => effect.effect
        );

        for (const effect of effects) {
            if (effect.isLocked || !effect.badge || effect.badge.type !== "counter") continue;

            addListener(
                html,
                `.effect-item[data-item-id="${effect.id}"] .icon`,
                "contextmenu",
                (el, event) => this.#onRemoveEffect(event, effect),
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

type ToolSettings = {
    remove: boolean;
};

export { BetterEffectsPanelTool };
