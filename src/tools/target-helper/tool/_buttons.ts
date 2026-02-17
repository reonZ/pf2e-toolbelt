import { ChatMessagePF2e, createHTMLElement, R } from "foundry-helpers";
import { rollSaves, TargetHelperTool, TargetsType } from ".";
import { TargetHelper } from "..";

function createSetTargetsBtn(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    targetHelper: TargetHelper,
    splash?: boolean,
): HTMLElement {
    const type: TargetsType = splash ? "splashTargets" : "targets";
    const btn = createHTMLElement(targetHelper.isAction ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-setTargets", type],
        dataset: { action: "set-targets" },
        content:
            type === "targets" ? "<i class='fa-solid fa-bullseye-arrow'></i>" : "<i class='fa-solid fa-burst'></i>",
    });

    btn.title = this.localize("setTargets", type);
    addSetTargetsListener.call(this, btn, message, type);

    return btn;
}

function addSetTargetsListener(this: TargetHelperTool, btn: HTMLElement, message: ChatMessagePF2e, type: TargetsType) {
    btn.addEventListener("click", async (event) => {
        event.stopPropagation();

        const data = this.getMessageData(message);
        if (!data) return;

        const targets = this.getCurrentTargets();
        const otherType: TargetsType = type === "targets" ? "splashTargets" : "targets";
        const otherTargets = R.pipe(
            data[otherType],
            R.map((token) => token.uuid),
            R.difference(targets),
        );

        const updated = data.encode();

        updated[type] = targets;
        updated[otherType] = otherTargets;

        this.setMessageData(message, updated);
    });
}

function createRollNPCSavesBtn(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    targetHelper: TargetHelper,
): HTMLElement | undefined {
    if (!targetHelper.canRollNPCSaves) return;

    const btn = createHTMLElement(targetHelper.isAction ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-rollSaves"],
        content: "<i class='fa-duotone fa-solid fa-dice-d20'></i>",
    });

    btn.title = this.localize("rollSaves");
    addRollSavesListener.call(this, btn, message, targetHelper);

    return btn;
}

function addRollSavesListener(
    this: TargetHelperTool,
    btn: HTMLElement,
    message: ChatMessagePF2e,
    targetHelper: TargetHelper,
) {
    btn.addEventListener("click", async (event) => {
        event.stopPropagation();

        const targets = targetHelper.npcListToRoll;

        if (targets.length) {
            rollSaves.call(this, event, message, targetHelper, targets);
        }
    });
}

export { createSetTargetsBtn, createRollNPCSavesBtn };
