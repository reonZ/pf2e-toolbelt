import { ChatMessagePF2e, createHTMLElement, R } from "module-helpers";
import { getCurrentTargets, rollSaves, TargetHelperTool, TargetsType } from ".";
import { TargetsData } from "..";

function createSetTargetsBtn(
    this: TargetHelperTool,
    data: TargetsData,
    splash?: boolean
): HTMLElement {
    const type: TargetsType = splash ? "splashTargets" : "targets";
    const btn = createHTMLElement(data.isAction ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-setTargets", type],
        dataset: { action: "set-targets" },
        content:
            type === "targets"
                ? "<i class='fa-solid fa-bullseye-arrow'></i>"
                : "<i class='fa-solid fa-burst'></i>",
    });

    btn.title = this.localize("setTargets", type);
    addSetTargetsListener.call(this, btn, data, type);

    return btn;
}

function addSetTargetsListener(
    this: TargetHelperTool,
    btn: HTMLElement,
    data: TargetsData,
    type: TargetsType
) {
    btn.addEventListener("click", async (event) => {
        event.stopPropagation();

        const targets = getCurrentTargets();
        const otherType: TargetsType = type === "targets" ? "splashTargets" : "targets";
        const otherTargets = R.pipe(
            data[otherType],
            R.map((token) => token.uuid),
            R.difference(targets)
        );

        data.update({
            [type]: targets,
            [otherType]: otherTargets,
        });

        data.setFlag();
    });
}

function createRollNPCSavesBtn(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    data: TargetsData
): HTMLElement | undefined {
    if (!data.canRollSaveNPCs.length) return;

    const btn = createHTMLElement(data.isAction ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-rollSaves"],
        content: "<i class='fa-duotone fa-solid fa-dice-d20'></i>",
    });

    btn.title = this.localize("rollSaves");
    addRollSavesListener.call(this, btn, message, data);

    return btn;
}

function addRollSavesListener(
    this: TargetHelperTool,
    btn: HTMLElement,
    message: ChatMessagePF2e,
    data: TargetsData
) {
    btn.addEventListener("click", async (event) => {
        event.stopPropagation();

        const targets = data.canRollSaveNPCs;

        if (targets.length) {
            rollSaves.call(this, event, message, data, targets);
        }
    });
}

export { createRollNPCSavesBtn, createSetTargetsBtn };
