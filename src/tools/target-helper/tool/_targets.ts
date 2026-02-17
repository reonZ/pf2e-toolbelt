import {
    addListener,
    addListenerAll,
    ChatMessagePF2e,
    createHTMLElement,
    DegreeOfSuccessString,
    emitTokenHover,
    getActiveModule,
    getDocumentFromUUID,
    panToToken,
    pingToken,
    R,
    RollNotePF2e,
    SaveType,
    TokenDocumentPF2e,
} from "foundry-helpers";
import { RerollDetails, REROLLS, rerollSave, rollSaves, TargetHelperTool } from ".";
import { TargetHelper } from "..";

const SAVES_DETAILS: Record<SaveType, { icon: string; label: string }> = {
    fortitude: { icon: "fa-solid fa-chess-rook", label: "PF2E.SavesFortitude" },
    reflex: { icon: "fa-solid fa-person-running", label: "PF2E.SavesReflex" },
    will: { icon: "fa-solid fa-brain", label: "PF2E.SavesWill" },
};

async function addTargetsHeaders(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    targetHelper: TargetHelper,
    parent: HTMLElement,
    classes: string[] = [],
) {
    if (!targetHelper.hasTargets && !targetHelper.hasSplashTargets) return;

    const rowsWrapper = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-target-targetRows", ...classes],
    });

    for (const { row } of await createTargetsRows.call(this, message, targetHelper, false)) {
        rowsWrapper.append(row);
    }

    parent.append(rowsWrapper);
}

async function createTargetsRows(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    targetHelper: TargetHelper,
    all: boolean,
): Promise<TargetRowData[]> {
    const targetGroups: [TargetsType, TokenDocumentPF2e[]][] = [["targets", targetHelper.targets]];

    if (all) {
        targetGroups.push(["splashTargets", targetHelper.splashTargets]);
    }

    const isGM = game.user.isGM;
    const originActor = message.actor;
    const author = await getDocumentFromUUID("Actor", targetHelper.author);
    const showBreakdowns = isGM || game.pf2e.settings.metagame.breakdowns;
    const showSignificant =
        showBreakdowns || !!getActiveModule("pf2e-modifiers-matter")?.getSetting("always-show-highlights-to-everyone");

    const cached: TargetRowDataCached = {
        isGM,
        isOriginFriendly: !originActor || originActor.isOwner || originActor.hasPlayerOwner,
        showBreakdowns,
        showDC: isGM || game.pf2e.settings.metagame.dcs || !!author?.hasPlayerOwner,
        showResults: isGM || game.pf2e.settings.metagame.results,
        showSignificant,
        tokenNameVisibility: game.pf2e.settings.tokens.nameVisibility,
    };

    type GroupedTarget = { target: TokenDocumentPF2e; type: TargetsType };

    const targets = R.pipe(
        targetGroups,
        R.flatMap(([type, targets]): GroupedTarget[] => {
            return targets.map((target): GroupedTarget => ({ target, type }));
        }),
    );

    const sortedTargets = isGM
        ? R.sortBy(
              targets,
              ({ target }) => target.hasPlayerOwner,
              ({ target }) => target.name,
          )
        : R.sortBy(
              targets,
              [({ target }) => target.isOwner, "desc"],
              [({ target }) => target.hasPlayerOwner, "desc"],
              ({ target }) => target.name,
          );

    const rowsPromise = sortedTargets.map(async ({ type, target }) => {
        const rowData = await getTargetRowData.call(this, target, targetHelper, cached);
        if (!rowData) return;

        const row = createHTMLElement("div", {
            classes: ["target-row"],
            content: rowData.template,
        });

        row.addEventListener("mouseenter", async (event) => {
            emitTokenHover(event, target, true);
        });

        row.addEventListener("mouseleave", async (event) => {
            emitTokenHover(event, target, false);
        });

        row.addEventListener("dragenter", (event) => {
            row.classList.add("drag-over");
            emitTokenHover(event, target, true);
        });

        row.addEventListener("dragleave", (event) => {
            const relatedTarget = event.relatedTarget as HTMLElement | null;
            if (relatedTarget && row.contains(relatedTarget)) return;

            row.classList.remove("drag-over");
            emitTokenHover(event, target, false);
        });

        row.addEventListener("drop", (event) => {
            row.classList.remove("drag-over");
            target.actor?.sheet._onDrop(event);
        });

        addListener(row, ".name", () => {
            panToToken(target, true);
        });

        addListener(row, ".name", "dblclick", () => {
            target.actor?.sheet.render(true);
        });

        addListenerAll(row, "[data-action]", (el, event) => {
            type EventAction = "ping-target" | "roll-save" | "reroll-save";

            event.stopPropagation();

            const action = el.dataset.action as EventAction;

            if (action === "ping-target") {
                pingToken(target);
            } else if (action === "roll-save") {
                rollSaves.call(this, event, message, targetHelper, [target]);
            } else if (action === "reroll-save") {
                rerollSave.call(this, message, targetHelper, target);
            }
        });

        return { ...rowData, row, target, type } satisfies TargetRowData;
    });

    const rows = await Promise.all(rowsPromise);
    return rows.filter(R.isTruthy);
}

async function getTargetRowData(
    this: TargetHelperTool,
    target: TokenDocumentPF2e,
    targetHelper: TargetHelper,
    {
        isGM,
        isOriginFriendly,
        showBreakdowns,
        showDC,
        showResults,
        showSignificant,
        tokenNameVisibility,
    }: TargetRowDataCached,
): Promise<BaseTargetRowData | undefined> {
    const isHidden = targetIsHidden(target);
    if (!isGM && isHidden) return;

    const isOwner = target.isOwner;
    const hasPlayerOwner = target.hasPlayerOwner;
    const isTargetFriendly = isOwner || hasPlayerOwner;
    const canSeeName = isOwner || !tokenNameVisibility || target.playersCanSeeName;

    const dataSave = targetHelper.saveVariant;
    const headerData: HeaderData = {
        hasPlayerOwner,
        isHidden,
        isOwner,
        showSuccess: showResults || isOriginFriendly,
        name: canSeeName ? target.name : this.localize("unnamed"),
    };

    const save = await (async () => {
        if (!dataSave) return;

        const { icon, label } = SAVES_DETAILS[dataSave.statistic];
        const targetSave = targetHelper.targetSave(target.id);
        const targetStatistic = target.actor?.getStatistic(dataSave.statistic);

        const isPrivate = targetSave?.private && !hasPlayerOwner;
        const canSeeResult = isGM || !isPrivate;
        const canReroll = targetSave && !targetSave.rerolled;

        const significantList = foundry.utils.deepClone(targetSave?.significantModifiers) ?? [];
        const significantModifier = (() => {
            if (!showSignificant && !isTargetFriendly) return;
            if (!significantList.length) return;

            return R.pipe(
                significantList,
                R.map(({ value, significance }) => {
                    return {
                        value: Math.abs(value),
                        css: `has-significant-modifiers ${significance}`,
                    };
                }),
                R.firstBy([R.prop("value"), "desc"]),
            )?.css;
        })();

        const rerolled = targetSave?.rerolled ? REROLLS[targetSave.rerolled] : undefined;

        const tooltip = await (async () => {
            if (!targetStatistic) return;

            const saveLabel = game.i18n.format("PF2E.SavingThrowWithName", {
                saveName: game.i18n.localize(label),
            });
            const saveDC = showDC ? this.localize("tooltip.dcWithValue", dataSave) : "";
            const tooltipLabel = `${saveLabel} ${saveDC}`;

            const adjustment = (() => {
                if (
                    (!isTargetFriendly && !showBreakdowns) ||
                    !targetSave?.unadjustedOutcome ||
                    !targetSave.dosAdjustments ||
                    targetSave.success === targetSave.unadjustedOutcome
                )
                    return;

                const adjustments = R.filter(
                    [
                        targetSave.dosAdjustments[targetSave.unadjustedOutcome]?.label,
                        targetSave.dosAdjustments.all?.label,
                    ],
                    R.isTruthy,
                );

                return adjustments.length ? adjustments.map((x) => game.i18n.localize(x)).join(", ") : undefined;
            })();

            const result = (() => {
                if (!canSeeResult || !targetSave) return;

                let tmp = "";
                const offset = targetSave.value - dataSave.dc;

                if (showBreakdowns || isTargetFriendly) {
                    tmp += `(<i class="fa-solid fa-dice-d20"></i> ${targetSave.die}) `;
                }

                if (showResults || isOriginFriendly) {
                    tmp += this.localize(`tooltip.result.${showDC ? "withOffset" : "withoutOffset"}`, {
                        success: game.i18n.localize(`PF2E.Check.Result.Degree.Check.${targetSave.success}`),
                        offset: offset >= 0 ? `+${offset}` : offset,
                    });
                }

                if (tmp) {
                    return this.localize("tooltip.result.format", { result: tmp });
                }
            })();

            const modifiers = (() => {
                if (!targetSave || (!showBreakdowns && !isTargetFriendly)) return [];

                const mods = targetSave.modifiers.map(
                    ({ excluded, label, modifier }): TooltipData["modifiers"][number] => {
                        const significant = significantList.findSplice(
                            ({ name, value }) => name === label && modifier === value,
                        );

                        const classes: string[] = [significant?.significance ?? "NONE"];

                        if (excluded) {
                            classes.push("excluded");
                        }

                        return {
                            name: label.replace(/(.+) \d+/, "$1"),
                            value: modifier,
                            css: classes.join(" "),
                        };
                    },
                );

                if (!significantList.length || (!showSignificant && !isTargetFriendly)) {
                    return mods;
                }

                const significant = significantList.map(({ name, significance, value }) => ({
                    name: name.replace(/(.+) \d+/, "$1"),
                    value,
                    css: significance,
                }));

                return mods.concat(significant);
            })();

            const tooltipData: TooltipData = {
                adjustment,
                canReroll,
                check: tooltipLabel,
                modifiers,
                rerolled,
                result,
            };

            return this.render("tooltip", tooltipData);
        })();

        const notes = (() => {
            if (!targetSave?.notes) return;

            const notesList = RollNotePF2e.notesToHTML(targetSave.notes.map((note) => new RollNotePF2e(note)));

            if (notesList) {
                notesList.classList.add("pf2e-toolbelt-target-notes");
                return notesList.outerHTML;
            }
        })();

        return (headerData.save = {
            ...(targetSave ?? dataSave),
            basic: dataSave.basic,
            canSeeResult,
            canReroll,
            visibility: isGM && isPrivate ? "data-visibility='gm'" : "",
            significantModifier,
            icon,
            notes,
            rerolled,
            tooltip,
        });
    })();

    return {
        isOwner,
        save,
        template: await this.render("header", headerData),
    };
}

function targetIsHidden(target: TokenDocumentPF2e): boolean {
    return target.hidden || !!target.actor?.hasCondition("unnoticed", "undetected");
}

type HeaderData = {
    hasPlayerOwner: boolean;
    isHidden: boolean;
    isOwner: boolean;
    name: string;
    save?: TargetRowSave;
    showSuccess: boolean;
};

type BaseTargetRowData = {
    isOwner: boolean;
    template: string;
    save: TargetRowSave | undefined;
};

type TargetRowSave = {
    basic: boolean | undefined;
    canReroll: boolean | undefined;
    canSeeResult: boolean;
    icon: string;
    notes: string | undefined;
    rerolled: RerollDetails | undefined;
    significantModifier: string | false | undefined;
    statistic: SaveType;
    success?: DegreeOfSuccessString | undefined;
    tooltip: string | undefined;
    unadjustedOutcome?: DegreeOfSuccessString | null;
    value?: number | undefined;
    visibility: string;
};

type TargetRowData = BaseTargetRowData & {
    row: HTMLElement;
    target: TokenDocumentPF2e;
    type: TargetsType;
};

type TargetRowDataCached = {
    isGM: boolean;
    isOriginFriendly: boolean;
    showBreakdowns: boolean;
    showDC: boolean;
    showResults: boolean;
    showSignificant: boolean;
    tokenNameVisibility: boolean;
};

type TooltipData = {
    adjustment: string | undefined;
    canReroll: boolean | undefined;
    check: string;
    modifiers: { name: string; value: number; css: string }[];
    rerolled: RerollDetails | undefined;
    result: string | undefined;
};

type TargetsType = "targets" | "splashTargets";

export { addTargetsHeaders, createTargetsRows };
export type { TargetsType };
