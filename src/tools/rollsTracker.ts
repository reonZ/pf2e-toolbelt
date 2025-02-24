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

const MODES = [
    {
        type: "d20",
        labels: ["bottom"],
        entries: R.times(20, (x) => x + 1),
        values: (selected) => {
            return R.pipe(
                R.range(0, 20),
                R.map((face) =>
                    selected.map(
                        ({ rolls }) => rolls.filter((d20) => d20.value === face + 1).length
                    )
                )
            );
        },
    },
] as const satisfies RollsMode[];

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
} as const);

class RollsTracker extends foundry.applications.api.ApplicationV2 {
    static #instance: RollsTracker | undefined;

    #mode: ModeType = "d20";
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
            const selectIndex = this.#selections.indexOf(`user-${user.id}`);
            const rolls = this.getUserRolls(user);

            if (selectIndex >= 0) {
                selected[selectIndex] = { user, rolls };
            }

            const actors = R.filter(
                user.isGM
                    ? [user.character]
                    : game.actors.filter(
                          (actor) => !actor.isToken && actor.testUserPermission(user, "OWNER")
                      ),
                R.isTruthy
            );

            const userActors: ListSelection[] = [];

            for (const actor of actors) {
                const actorId = actor.id;
                const selectIndex = this.#selections.indexOf(`actor-${actorId}`);

                userActors.push({
                    id: actorId,
                    name: actor.name,
                    select: selectIndex >= 0 ? ` selected select-${selectIndex}` : "",
                });

                if (selectIndex >= 0) {
                    selected[selectIndex] = {
                        user,
                        actor,
                        rolls: rolls.filter((roll) => roll.actor === actorId),
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

        const values = mode.values(selected);
        const valuesMax = R.firstBy(values.flat(), [R.identity(), "desc"]) ?? 0;
        const max = Math.max(6 * Math.ceil(valuesMax / 6), 6);

        const left: YAbsis = {
            label: localize("tracker", mode.type, "left"),
            entries: R.times(6, (x) => ((x + 1) * max) / 6).reverse(),
        };

        const bottom: XAbsis = {
            labels: mode.labels.map((label) => localize("tracker", mode.type, label)),
            entries: mode.entries,
        };

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

        const groups = values.map((entries) => {
            return entries.map((value) => {
                return {
                    value,
                    ratio: (value / max) * 100,
                };
            });
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
                label: localize("tracker.mode", type),
            })),
            filters: FILTERS.map((value) => ({
                value,
                label: localize("tracker.filter", value),
            })),
            bottom,
            left,
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

function onToolbeltRerollSave({ newRoll, data, target }: RerollSaveHook) {
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
    });
}

function onCreateMessage(message: ChatMessagePF2e, data: object, userId: string) {
    if (game.userId !== userId || (game.users.size === 1 && !MODULE.isDebug)) return;

    const value = message.rolls[0]?.dice[0]?.total;
    if (!R.isNumber(value)) return;

    const context = message.getFlag("pf2e", "context") as Maybe<ChatContextFlag>;
    if (!context) return;

    const user = game.user;

    if (isCheckContextFlag(context)) {
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
        });
    } else if (context.type === "damage-roll") {
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

type OptionSelectName = "mode" | "filter" | "session" | "encounter";
type OptionDateName = "time-from" | "time-to";
type ControlAction = "play" | "pause" | "end" | "start" | "delete";

type ModeType = (typeof MODES)[number]["type"];
type ModeFilter = (typeof FILTERS)[number];
type ModeTime = { from: number; to: number };

type TimedEventEntry = {
    id: string;
    time: number;
};

type RollsSelected = { user: UserPF2e; actor?: ActorPF2e; rolls: UserRoll[] };

type RollsMode = {
    type: string;
    labels: string[];
    entries: number[];
    values: (selected: RollsSelected[]) => number[][];
};

type UserRoll = {
    time: number;
    actor?: string;
    value: number;
    type: CheckType;
    isPrivate?: boolean;
    isReroll?: boolean;
    outcome?: DegreeOfSuccessString;
    encounter?: string;
    session?: string;
};

type ListSelection = {
    id: string;
    name: string;
    select: string;
};

type ListUser = ListSelection & {
    actors: ListSelection[];
};

type YAbsis = {
    entries: number[];
    label: string;
};

type XAbsis = {
    entries: number[];
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

type RollsTrackerContext = {
    isGM: boolean;
    isPaused: boolean;
    inSession: boolean;
    mode: ModeType;
    filter: ModeFilter;
    modes: SelectOptions<ModeType>;
    filters: SelectOptions<ModeFilter>;
    list: ListUser[];
    bottom: XAbsis;
    left: YAbsis;
    groups: { value: number; ratio: number }[][];
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
