import {
    ChatMessagePF2e,
    createHTMLElement,
    R,
    selectTokens,
    TokenDocumentPF2e,
} from "module-helpers";
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
    if (!data.canRollNPCSaves) return;

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

        const targets = data.npcListToRoll;

        if (targets.length) {
            rollSaves.call(this, event, message, data, targets);
        }
    });
}

function addSaveBtnListener(
    this: TargetHelperTool,
    realBtn: HTMLButtonElement | HTMLAnchorElement,
    fakeBtn: HTMLButtonElement,
    message: ChatMessagePF2e,
    data: TargetsData
) {
    const allTargets = data.targets.map((target) => target.uuid);

    fakeBtn.addEventListener("click", (event) => {
        event.preventDefault();

        const selected = game.user.getActiveTokens();
        const targets: TokenDocumentPF2e[] = [];
        const remainSelected: TokenDocumentPF2e[] = [];

        for (const token of selected) {
            if (!data.targetSave(token.id) && allTargets.includes(token.uuid)) {
                targets.push(token);
            } else {
                remainSelected.push(token);
            }
        }

        if (remainSelected.length) {
            selectTokens(remainSelected);
        }

        if (remainSelected.length || !targets.length) {
            const clickEvent = new MouseEvent("click", event);
            realBtn.dispatchEvent(clickEvent);
        }

        if (targets.length) {
            rollSaves.call(this, event, message, data, targets);
        }
    });
}

export {
    addRollSavesListener,
    addSaveBtnListener,
    addSetTargetsListener,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
};
