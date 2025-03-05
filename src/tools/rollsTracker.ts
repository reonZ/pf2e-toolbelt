import {
    ActorPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    ChatContextFlag,
    ChatMessagePF2e,
    CheckType,
    DEGREE_OF_SUCCESS_STRINGS,
    DegreeOfSuccessString,
    EncounterPF2e,
    MODULE,
    R,
    TemplateLocalize,
    UserPF2e,
    UserSourcePF2e,
    addListenerAll,
    createHTMLElement,
    createHook,
    htmlQuery,
    isCheckContextFlag,
    settingPath,
    tupleHasValue,
} from "module-helpers";
import { createTool } from "../tool";
import { RerollSaveHook, RollSaveHook } from "./targetHelper";

const FILTERS = ["all", "time", "session", "encounter"] as const;

const MODES: RollsMode[] = [];

function prepareModes() {
    const checkOutcomes = DEGREE_OF_SUCCESS_STRINGS.map((x) =>
        game.i18n.localize(`PF2E.Check.Result.Degree.Check.${x}`)
    );

    MODES.push(
        createRollMode("all"),
        createRollMode("attack-roll"),
        {
            type: "attack-roll-outcome",
            entries: DEGREE_OF_SUCCESS_STRINGS.map((x) =>
                game.i18n.localize(`PF2E.Check.Result.Degree.Attack.${x}`)
            ),
            rolls: (rolls) => {
                return rolls.filter((roll) => roll.type === "attack-roll" && !!roll.outcome);
            },
            values: (rolls) => {
                return R.pipe(
                    R.range(0, 4),
                    R.map((i) => {
                        const outcome = DEGREE_OF_SUCCESS_STRINGS[i];
                        return rolls.filter((roll) => {
                            return roll.outcome === outcome;
                        }).length;
                    })
                );
            },
        },
        createRollMode("saving-throw"),
        {
            type: "saving-throw-outcome",
            entries: R.times(3, () => checkOutcomes).flat(),
            rolls: (rolls) => {
                return rolls.filter(
                    (roll) => roll.type === "saving-throw" && !!roll.modifier && !!roll.outcome
                );
            },
            values: (rolls) => {
                return R.pipe(
                    ["fortitude", "reflex", "will"] as const,
                    R.flatMap((save) => {
                        return R.pipe(
                            R.range(0, 4),
                            R.map((i) => {
                                const outcome = DEGREE_OF_SUCCESS_STRINGS[i];
                                return rolls.filter((roll) => {
                                    return roll.modifier === save && roll.outcome === outcome;
                                }).length;
                            })
                        );
                    })
                );
            },
        },
        createRollMode("skill-check"),
        ...(["1", "2"] as const).map((index): RollsMode => {
            const skills = (() => {
                const skills = R.entries(CONFIG.PF2E.skills);
                const half = Math.ceil(skills.length / 2);
                return index === "1"
                    ? R.take(skills, half)
                    : R.takeLast(skills, skills.length - half);
            })();

            const slugs = skills.map(([slug]) => slug) as string[];

            return {
                type: `skill-check-${index}`,
                entries: skills.map(([_, { label }]) => game.i18n.localize(label)),
                rolls: (rolls) => {
                    return rolls.filter((roll) => {
                        return (
                            roll.type === "skill-check" &&
                            roll.modifier &&
                            slugs.includes(roll.modifier)
                        );
                    });
                },
                values: (rolls) => {
                    return R.pipe(
                        slugs,
                        R.flatMap((slug) => {
                            return rolls.filter((roll) => roll.modifier === slug).length;
                        })
                    );
                },
            };
        }),
        createRollMode("perception-check"),
        createRollMode("initiative"),
        createRollMode("flat-check")
    );
}

const {
    config,
    settings,
    hooks,
    localize,
    setSetting,
    getFlag,
    setFlag,
    unsetFlag,
    render,
    getFlagProperty,
    waitDialog,
} = createTool({
    name: "rollsTracker",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "world",
            requiresReload: true,
        },
        {
            key: "paused",
            type: Boolean,
            default: false,
            scope: "world",
            config: false,
            onChange: (value: boolean) => {
                hooks.toggleAll(!value);
                RollsTracker.instance?.render();
            },
        },
        {
            key: "session",
            type: String,
            default: undefined,
            scope: "world",
            config: false,
            onChange: () => {
                RollsTracker.instance?.render();
            },
        },
        {
            key: "sessions",
            type: Object,
            default: {},
            scope: "world",
            config: false,
        },
        {
            key: "encounters",
            type: Object,
            default: {},
            scope: "world",
            config: false,
        },
    ],
    hooks: [
        {
            event: "createChatMessage",
            listener: onCreateMessage,
        },
        {
            event: "pf2e-toolbelt.rollSave",
            listener: onToolbeltSave,
        },
        {
            event: "pf2e-toolbelt.rerollSave",
            listener: onToolbeltRerollSave,
        },
    ],
    api: {
        startSession,
        endSession,
        togglePause,
        deleteRecords,
    },
    init: (isGM) => {
        if (!settings.enabled) return;

        hooks.toggleAll(!settings.paused);

        Hooks.on("getSceneControlButtons", onGetSceneControlButtons);

        if (isGM) {
            Hooks.on("combatStart", onCombatStart);
        }
    },
    ready: () => {
        prepareModes();
    },
} as const);

class RollsTracker extends foundry.applications.api.ApplicationV2 {
    static #instance: RollsTracker | undefined;

    #mode: ModeType = "all";
    #filter: ModeFilter = "all";
    #list: HTMLElement | null = null;
    #selections: string[];
    #combat: string | undefined;
    #session: string | undefined;
    #time!: ModeTime;

    #userUpdateHook = createHook("updateUser", this.#onUpdateUser.bind(this));

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-rolls-tracker",
        position: {
            width: 1200,
            height: 750,
        },
    };

    static get instance(): RollsTracker {
        return (this.#instance ??= new RollsTracker());
    }

    constructor(options: DeepPartial<ApplicationConfiguration> = {}) {
        options.window ??= {};
        options.window.title = localize("tracker.title");

        super(options);

        const { encounters, sessions } = getTimedEventArrays();

        this.#combat = encounters[0]?.id;
        this.#session = sessions[0]?.id;
        this.#selections = [`user-${game.userId}`];
        this.#resetTime();
    }

    protected _onClose(options: ApplicationClosingOptions): void {
        this.#userUpdateHook.disable();
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<RollsTrackerContext> {
        const { encounters, sessions } = getTimedEventArrays();
        const mode = MODES.find((mode) => mode.type === this.#mode) ?? MODES[0];

        if (this.#filter !== "encounter") {
            this.#combat = encounters[0]?.id;
        }

        if (this.#filter !== "session") {
            this.#session = sessions[0]?.id;
        }

        const list: ListUser[] = [];
        const selected: RollsSelected[] = [];

        for (const user of game.users) {
            const userIndex = `user-${user.id}`;
            const selectIndex = this.#selections.indexOf(userIndex);
            const rolls = this.getUserRolls(user);

            if (selectIndex >= 0) {
                selected[selectIndex] = {
                    user,
                    rolls: mode.rolls(rolls),
                };
            }

            const actors = R.filter(
                user.isGM
                    ? [user.character]
                    : game.actors.filter(
                          (actor) =>
                              !actor.isToken &&
                              actor.isOfType("creature") &&
                              actor.testUserPermission(user, "OWNER")
                      ),
                R.isTruthy
            );

            const userActors: ListSelection[] = [];

            for (const actor of actors) {
                const actorId = actor.id;
                const actorIndex = `${userIndex}-actor-${actorId}`;
                const selectIndex = this.#selections.indexOf(actorIndex);

                userActors.push({
                    id: actorId,
                    name: actor.name,
                    select: selectIndex >= 0 ? ` selected select-${selectIndex}` : "",
                });

                if (selectIndex >= 0) {
                    selected[selectIndex] = {
                        user,
                        actor,
                        rolls: mode.rolls(rolls.filter((roll) => roll.actor === actorId)),
                    };
                }
            }

            list.push({
                id: user.id,
                name: user.name,
                select: selectIndex >= 0 ? ` selected select-${selectIndex}` : "",
                actors: userActors,
            });
        }

        const labels = (
            localize.ifExist("tracker.mode", mode.type, "bottom") ?? localize("tracker.bottom")
        ).split("|");

        const entries = mode.entries.map((value, index, entries) => {
            return {
                value,
                marker: !!index && index % (entries.length / labels.length) === 0,
            };
        });

        const values = selected.map(({ rolls }) => mode.values(rolls));
        const valuesMax = R.firstBy(values.flat(), [R.identity(), "desc"]) ?? 0;
        const max = Math.max(6 * Math.ceil(valuesMax / 6), 6);

        const groups: ContextGroupEntry[][] = [];

        for (let i = 0; i < entries.length; i++) {
            const group: ContextGroupEntry[] = (groups[i] = []);

            for (let j = 0; j < values.length; j++) {
                const value = values[j][i];

                group[j] = {
                    value,
                    ratio: (value / max) * 100,
                };
            }
        }

        const stats: RollStats[] = selected.map(({ rolls, actor, user }): RollStats => {
            const values = rolls.map(({ value }) => value);

            const modeEntries = R.pipe(
                values,
                R.countBy(R.identity()),
                R.entries(),
                R.sortBy([([_, count]) => count, "desc"])
            );

            const maxCount = modeEntries[0]?.[1] ?? 0;
            const modes = R.pipe(
                modeEntries,
                R.takeWhile(([value, count]) => count === maxCount),
                R.map(([value]) => value)
            );

            return {
                name: actor?.name ?? user.name,
                total: rolls.length,
                mean: R.round(R.mean(values) ?? 0, 2),
                median: R.median(values) ?? 0,
                mode: modes.join(", ") || "—",
            };
        });

        return {
            list,
            inSession: !!settings.session,
            isPaused: settings.paused,
            isGM: game.user.isGM,
            mode: mode.type,
            filter: this.#filter,
            modes: MODES.map(({ type }) => ({
                value: type,
                label: localize("tracker.mode", type, "label"),
            })),
            filters: FILTERS.map((value) => ({
                value,
                label: localize("tracker.filter", value),
            })),
            bottom: { labels, entries },
            left: R.times(6, (x) => ((x + 1) * max) / 6).reverse(),
            stats,
            groups,
            selected: selected.length,
            time: {
                from: new Date(this.#time.from).toDateInputString(),
                to: new Date(this.#time.to).toDateInputString(),
            },
            session: this.#session,
            encounter: this.#combat,
            encounters: encounters.map(formatTimedEventOption),
            sessions: sessions.map(formatTimedEventOption),
            i18n: localize.i18n,
        };
    }

    protected async _renderHTML(
        context: RollsTrackerContext,
        options: ApplicationRenderOptions
    ): Promise<HTMLElement> {
        return createHTMLElement("div", {
            innerHTML: await render("tracker", context),
        });
    }

    protected _onFirstRender(
        context: RollsTrackerContext,
        options: ApplicationRenderOptions
    ): void {
        this.#userUpdateHook.activate();
    }

    protected _replaceHTML(
        result: HTMLElement,
        content: HTMLElement,
        options: ApplicationRenderOptions
    ): void {
        const scrollPosition = this.#list?.scrollTop;

        content.replaceChildren(...result.children);

        this.#list = htmlQuery(content, ".sidebar .list");

        if (scrollPosition && this.#list) {
            this.#list.scrollTop = scrollPosition;
        }

        this.#activateListeners(content, options);
    }

    getUserRolls(user: UserPF2e) {
        // if (!game.pf2e.settings.metagame.breakdowns && user.isGM && !game.user.isGM) {
        //     return [];
        // }

        const rolls = (() => {
            const rolls = getUserRolls(user);

            if (game.user.isGM) {
                return rolls;
            }

            const currentSession = settings.session;

            if (!currentSession) {
                return rolls;
            }

            return rolls.filter((roll) => roll.session !== currentSession);
        })();

        switch (this.#filter as ModeFilter) {
            case "time": {
                return rolls.filter(
                    (roll) => roll.time >= this.#time.from && roll.time <= this.#time.to
                );
            }

            case "session": {
                return this.#session ? rolls.filter((roll) => roll.session === this.#session) : [];
            }

            case "encounter": {
                return this.#combat ? rolls.filter((roll) => roll.encounter === this.#combat) : [];
            }

            default: {
                return rolls;
            }
        }
    }

    #resetTime() {
        const date = new Date().toDateInputString();
        this.#time = {
            from: new Date(`${date}T00:00:00`).getTime(),
            to: new Date(`${date}T23:59:59`).getTime(),
        };
    }

    #onUpdateUser(user: UserPF2e, updates: Partial<UserSourcePF2e>) {
        if (getFlagProperty<DeepPartial<RollsUserSettings>>(updates)) {
            this.render();
        }
    }

    #activateListeners(html: HTMLElement, options: ApplicationRenderOptions) {
        addListenerAll(html, "[data-id]", (event, el) => {
            const id = el.dataset.id!;

            if (event.shiftKey) {
                const exist = this.#selections.findSplice((x) => x === id);

                if (exist) {
                    if (this.#selections.length === 0) {
                        this.#selections = [id];
                    } else {
                        this.render();
                    }
                } else if (this.#selections.length < 5) {
                    this.#selections.push(id);
                    this.render();
                }
            } else if (this.#selections.length !== 1 || this.#selections[0] !== id) {
                this.#selections = [id];
                this.render();
            }
        });

        addListenerAll(
            html,
            ".sidebar .options select",
            "change",
            (event, el: HTMLSelectElement) => {
                switch (el.name as OptionSelectName) {
                    case "mode": {
                        this.#mode = el.value as ModeType;
                        break;
                    }

                    case "filter": {
                        if (this.#filter === "time") {
                            this.#resetTime();
                        }

                        this.#filter = el.value as ModeFilter;
                        break;
                    }

                    case "session": {
                        this.#session = el.value;
                        break;
                    }

                    case "encounter": {
                        this.#combat = el.value;
                        break;
                    }
                }

                this.render();
            }
        );

        addListenerAll(
            html,
            ".sidebar .options input[type='date']",
            "change",
            (event, el: HTMLInputElement) => {
                switch (el.name as OptionDateName) {
                    case "time-from": {
                        this.#time.from = new Date(`${el.value}T00:00:00`).getTime();
                        break;
                    }

                    case "time-to": {
                        this.#time.to = new Date(`${el.value}T23:59:59`).getTime();
                        break;
                    }
                }

                this.render();
            }
        );

        addListenerAll(html, ".controls [data-action]", (event, el) => {
            switch (el.dataset.action as ControlAction) {
                case "play": {
                    togglePause(false);
                    break;
                }

                case "pause": {
                    togglePause(true);
                    break;
                }

                case "end": {
                    endSession();
                    break;
                }

                case "start": {
                    startSession();
                    break;
                }

                case "delete": {
                    deleteRecords();
                    break;
                }
            }
        });
    }
}

function onGetSceneControlButtons(controls: SceneControl[]) {
    controls[0].tools.push({
        title: settingPath("rollsTracker.title"),
        name: "pf2e-toolbelt-rolls-tracker",
        icon: "fa-sharp-duotone fa-solid fa-dice-d20",
        button: true,
        visible: true,
        onClick: () => {
            const app = RollsTracker.instance;

            if (app.rendered) {
                app.close();
            } else {
                app.render({ force: true, position: RollsTracker.DEFAULT_OPTIONS.position });
            }
        },
    });
}

function onToolbeltSave({ rollMessage }: RollSaveHook) {
    onCreateMessage(rollMessage, {}, game.userId);
}

function canRecord() {
    return MODULE.isDebug || game.users.filter((user) => user.active).length > 1;
}

function onToolbeltRerollSave({ newRoll, data, target }: RerollSaveHook) {
    if (!canRecord()) return;

    const value = newRoll.dice[0]?.total;
    if (!R.isNumber(value)) return;

    const user = game.user;
    const success = newRoll.degreeOfSuccess;

    addRoll(user, {
        value,
        time: Date.now(),
        type: newRoll.type,
        isPrivate: data.private,
        encounter: game.combat?.id,
        actor: target.actor?.id,
        outcome: success != null ? DEGREE_OF_SUCCESS_STRINGS[success] : undefined,
        session: settings.session ?? undefined,
        isReroll: true,
        modifier: data.statistic,
    });
}

function onCreateMessage(message: ChatMessagePF2e, data: object, userId: string) {
    if (game.userId !== userId || !canRecord()) return;

    const die = message.rolls[0]?.dice[0];
    const value = die?.total;
    if (!die || die.faces !== 20 || !R.isNumber(value)) return;

    const user = game.user;
    const context = message.getFlag("pf2e", "context") as Maybe<ChatContextFlag>;

    if (context && isCheckContextFlag(context)) {
        if (!user.isGM && context.rollMode === "selfroll") return;

        addRoll(user, {
            value,
            time: Date.now(),
            type: context.type,
            isPrivate: !tupleHasValue(["publicroll", "roll"], context.rollMode) || undefined,
            encounter: game.combat?.id,
            actor: context.actor ?? undefined,
            outcome: context.outcome ?? undefined,
            session: settings.session ?? undefined,
            isReroll: context.isReroll || undefined,
            modifier: message.getFlag("pf2e", "modifierName") as string | undefined,
        });
    } else if (context?.type === "damage-roll") {
    } else if (message.rolls.length === 1 && message.rolls[0].dice.length === 1) {
        if (
            !user.isGM &&
            !message.blind &&
            message.whisper.length === 1 &&
            message.whisper[0] === user.id
        )
            return;

        addRoll(user, {
            value,
            time: Date.now(),
            type: "roll",
            isPrivate: message.blind || message.whisper.length > 0,
            encounter: game.combat?.id,
            actor: message.actor?.id ?? undefined,
            outcome: undefined,
            session: settings.session ?? undefined,
            isReroll: undefined,
            modifier: undefined,
        });
    }
}

function onCombatStart(combat: EncounterPF2e) {
    const encounters = getEncounters(true);
    encounters[combat.id] = Date.now();
    setSetting("encounters", encounters);
}

function getUserRolls(user: UserPF2e) {
    return getFlag<UserRoll[]>(user, "rolls") ?? [];
}

function setUserRolls(user: UserPF2e, rolls: UserRoll[]) {
    return setFlag(user, "rolls", rolls);
}

function addRoll(user: UserPF2e, roll: UserRoll) {
    const rolls = getUserRolls(user).slice();
    rolls.push(roll);
    setUserRolls(user, rolls);
}

function getSessions(clone?: boolean): Record<string, number> {
    return clone ? fu.deepClone(settings.sessions) : settings.sessions;
}

function getEncounters(clone?: boolean): Record<string, number> {
    return clone ? fu.deepClone(settings.encounters) : settings.encounters;
}

function getTimedEventArrays(): { encounters: TimedEventEntry[]; sessions: TimedEventEntry[] } {
    const [encounters, sessions] = R.pipe(
        [getEncounters(), getSessions()],
        R.map((entries) => {
            return R.pipe(
                entries,
                R.entries(),
                R.map(([id, time]): TimedEventEntry => ({ id, time })),
                R.sortBy([R.prop("time"), "desc"])
            );
        })
    );

    return { encounters, sessions };
}

function formatTimedEventOption({ id, time }: TimedEventEntry): SelectOption {
    return { value: id, label: timestampToLocalTime(time) };
}

function timestampToLocalTime(time: number) {
    return new Date(time).toLocaleString();
}

async function startSession() {
    if (!game.user.isGM) return;

    const id = fu.randomID();
    const sessions = getSessions(true);

    sessions[id] = Date.now();

    await setSetting("sessions", sessions);
    await setSetting("session", id);

    localize.info("confirm.start", { time: timestampToLocalTime(sessions[id]) });
}

async function endSession() {
    if (!game.user.isGM) return;

    const id = settings.session;

    await setSetting("session", undefined);

    if (id) {
        const time = getSessions()[id];
        localize.info("confirm.end", { time: timestampToLocalTime(time) });
    }
}

async function togglePause(paused: boolean = !settings.paused) {
    if (!game.user.isGM) return;

    await setSetting("paused", paused);

    localize.info(`confirm.${paused ? "pause" : "play"}`);
}

async function deleteRecords(days?: number) {
    if (!game.user.isGM) return;

    let time: number = 0;

    if (R.isNumber(days)) {
        const date = createEndOfDayDate();

        date.setDate(date.getDate() - days);

        time = date.getTime();
    } else {
        const date = new Date().toDateInputString();
        const content = `${localize("clear.hint")}<br>
                        <input type="date" name="date" value="${date}">`;

        const result = await waitDialog<{ date: string }>("clear", {
            content,
            yes: "fa-solid fa-trash",
        });

        if (!result) return;

        time = new Date(result.date + "T23:59:59").getTime();
    }

    if (createEndOfDayDate().getTime() === time) {
        await endSession();
        await setSetting("sessions", {});
        await setSetting("encounters", {});

        await Promise.all(game.users.map((user) => unsetFlag(user, "rolls")));

        return localize.info("confirm.delete.all");
    }

    const [sessions, encounters] = R.pipe(
        [getSessions(), getEncounters()],
        R.map((entries) => R.omitBy(entries, (entryTime) => entryTime < time))
    );

    await endSession();
    await setSetting("sessions", sessions);
    await setSetting("encounters", encounters);

    await Promise.all(
        game.users.map((user) => {
            const currentRolls = getUserRolls(user);
            if (currentRolls.length === 0) return;

            const rolls = currentRolls.filter((roll) => roll.time >= time);
            return setFlag(user, "rolls", rolls);
        })
    );

    localize.info("confirm.delete.before", { time: timestampToLocalTime(time) });
}

function createEndOfDayDate() {
    const date = new Date();

    date.setHours(23);
    date.setMinutes(59);
    date.setSeconds(59);
    date.setMilliseconds(0);

    return date;
}

function createRollMode<T extends CheckType | "all">(type: T) {
    return {
        type,
        entries: R.times(20, (x) => String(x + 1)),
        rolls: (rolls) => {
            return type === "all" ? rolls : rolls.filter((roll) => roll.type === type);
        },
        values: (rolls) => {
            return R.pipe(
                R.range(0, 20),
                R.map((face) => {
                    return rolls.filter((roll) => roll.value === face + 1).length;
                })
            );
        },
    } as const satisfies RollsMode;
}

type OptionSelectName = "mode" | "filter" | "session" | "encounter";
type OptionDateName = "time-from" | "time-to";
type ControlAction = "play" | "pause" | "end" | "start" | "delete";

type ModeType = string | "all";
type ModeFilter = string | "all";
type ModeTime = { from: number; to: number };

type TimedEventEntry = {
    id: string;
    time: number;
};

type RollsSelected = { user: UserPF2e; actor?: ActorPF2e; rolls: UserRoll[] };

type RollsMode = {
    type: string;
    entries: string[];
    rolls: (rolls: UserRoll[]) => UserRoll[];
    values: (rolls: UserRoll[]) => number[];
};

type UserRoll = {
    time: number;
    actor: string | undefined;
    value: number;
    type: CheckType | "roll";
    isPrivate: boolean | undefined;
    isReroll: boolean | undefined;
    outcome: DegreeOfSuccessString | undefined;
    encounter: string | undefined;
    session: string | undefined;
    modifier: string | undefined;
};

type ListSelection = {
    id: string;
    name: string;
    select: string;
};

type ListUser = ListSelection & {
    actors: ListSelection[];
};

type Absis = {
    entries: { value: string; marker: boolean }[];
    labels: string[];
};

type RollStats = {
    name: string;
    total: number;
    mean: number;
    median: number;
    mode: string;
};

type RollsUserSettings = {
    rolls: UserRoll[];
};

type ContextGroupEntry = { value: number; ratio: number };

type RollsTrackerContext = {
    isGM: boolean;
    isPaused: boolean;
    inSession: boolean;
    mode: ModeType;
    filter: ModeFilter;
    modes: SelectOptions<ModeType>;
    filters: SelectOptions<ModeFilter>;
    list: ListUser[];
    bottom: Absis;
    left: number[];
    groups: ContextGroupEntry[][];
    selected: number;
    stats: RollStats[];
    time: { from: string; to: string };
    session: string | undefined;
    encounter: string | undefined;
    sessions: SelectOptions;
    encounters: SelectOptions;
    i18n: TemplateLocalize;
};

export { config as rollsTrackerTool };
