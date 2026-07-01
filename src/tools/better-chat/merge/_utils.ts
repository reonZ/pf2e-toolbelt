import {
    ChatMessageFlagsPF2e,
    ChatMessagePF2e,
    ChatMessageSourcePF2e,
    createHTMLElement,
    DamageDamageContextFlag,
    DegreeOfSuccessString,
    htmlQueryAll,
    R,
    RollMode,
    SYSTEM,
} from "foundry-helpers";
import { targetHelperTool } from "tools";
import { MergeData, MergeDataSource, zMergeData } from ".";
import { BetterChatTool } from "..";

function getMessageMergeFlagData(this: BetterChatTool, message: ChatMessagePF2e): MergeData[] | undefined {
    const flag = this.getFlag<MergeDataSource[]>(message, "mergeDamage.data");
    if (!flag) return;

    return R.pipe(
        flag,
        R.map((data) => zMergeData.safeParse(data).data),
        R.filter(R.isTruthy),
    );
}

function getMessageMergeData(this: BetterChatTool, message: ChatMessagePF2e): MergeData[] {
    const data = getMessageMergeFlagData.call(this, message);
    if (data) return data;

    const source = message.toObject() as WithRequired<PreCreate<ChatMessageSourcePF2e>, "flags">;

    delete source._id;
    delete source.timestamp;
    this.deleteFlagProperty(source, "splitted");

    const sourceFlag = source.flags[SYSTEM.id] as ChatMessageFlagsPF2e["pf2e"] & {
        context: DamageDamageContextFlag | SpellCastContextFlag;
        strike?: {
            actor: string;
            index: number;
            damaging: boolean;
            name: string;
            altUsage: null;
        };
    };

    const flavor = createHTMLElement("div", { content: message.flavor });
    const tags = flavor.querySelector(":scope > h4.action + .tags")?.outerHTML.trim() ?? "";
    const modifiers = flavor.querySelector(":scope > .tags.modifiers")?.outerHTML.trim() ?? "";
    const options = sourceFlag.context.options.filter((option) => /^(item|self):/.test(option));
    const notes = htmlQueryAll(flavor, ":scope > .notes > .roll-note").map((x) => x.outerHTML.trim());

    return [
        zMergeData.parse({
            source,
            name:
                sourceFlag.strike?.name ??
                message.item?.name ??
                flavor.querySelector<HTMLHeadElement>(":scope > h4.action")?.innerText.trim() ??
                "unknown",
            outcome: sourceFlag.context.outcome ?? null,
            options,
            modifiers,
            notes,
            tags,
        }),
    ];
}

function setMessageMergeUpdateFlags(
    this: BetterChatTool,
    updates: Record<string, unknown>,
    message: ChatMessagePF2e,
    data: MergeData[],
) {
    const targets = this.getMessageTargets(message);
    targetHelperTool.setMessageFlagTargets(updates, targets);

    this.setFlagProperties(updates, "mergeDamage", {
        merged: true,
        data,
    });
}

interface SpellCastContextFlag {
    type: "spell-cast";
    domains: string[];
    options: string[];
    outcome?: DegreeOfSuccessString;
    /** The roll mode (i.e., 'roll', 'blindroll', etc) to use when rendering this roll. */
    rollMode?: RollMode;
}

export { getMessageMergeData, getMessageMergeFlagData, setMessageMergeUpdateFlags };
