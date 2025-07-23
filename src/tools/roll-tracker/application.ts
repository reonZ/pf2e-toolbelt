import {
    ActorPF2e,
    addListenerAll,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    DEGREE_STRINGS,
    getUserSetting,
    htmlQuery,
    localize,
    R,
    setUserSetting,
    UserPF2e,
    waitDialog,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { RollTrackerTool, RollType, UserRoll } from ".";

const FILTERS = ["all", "time", "session", "encounter"] as const;

class RollTracker extends ModuleToolApplication<RollTrackerTool> {
    #combat: string;
    #filter: FilterType;
    #filters?: RollFilter[];
    #list: HTMLElement | null = null;
    #mode: ModeType;
    #modes?: RollsMode[];
    #selections: string[];
    #session: string;
    #time!: ModeTime;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-roll-tracker",
        position: {
            width: 1200,
            height: 750,
        },
    };

    constructor(tool: RollTrackerTool, options: DeepPartial<ApplicationConfiguration> = {}) {
        super(tool, options);

        const { encounters, sessions } = this.#getTimedEventArrays();

        this.#combat = encounters[0]?.id;
        this.#filter = "all";
        this.#mode = "all";
        this.#session = sessions[0]?.id;
        this.#selections = [`user-${game.userId}`];

        this.#resetTime();
    }

    get key(): string {
        return "tracker";
    }

    get title(): string {
        return localize(`settings.${this.toolKey}.title`);
    }

    get filters(): RollFilter[] {
        return (this.#filters ??= FILTERS.map((value) => ({
            value,
            label: this.localize("filter", value),
        })));
    }

    get modes(): RollsMode[] {
        if (this.#modes) {
            return this.#modes;
        }

        const modes: RawRollMode[] = [];
        const checkOutcomes = DEGREE_STRINGS.map((x) =>
            game.i18n.localize(`PF2E.Check.Result.Degree.Check.${x}`)
        );

        modes.push(
            createRollMode("all"),
            createRollMode("attack-roll"),
            {
                type: "attack-roll-outcome",
                entries: DEGREE_STRINGS.map((x) =>
                    game.i18n.localize(`PF2E.Check.Result.Degree.Attack.${x}`)
                ),
                rolls: (rolls) => {
                    return rolls.filter((roll) => roll.type === "attack-roll" && !!roll.outcome);
                },
                values: (rolls) => {
                    return R.pipe(
                        R.range(0, 4),
                        R.map((i) => {
                            const outcome = DEGREE_STRINGS[i];
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
                                    const outcome = DEGREE_STRINGS[i];
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
            ...(["1", "2"] as const).map((index): RawRollMode => {
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

        return (this.#modes = modes.map(({ entries, rolls, type, values }) => {
            const labels = (
                this.localizeIfExist("mode", type, "bottom") ?? this.localize("bottom")
            ).split("|");

            return {
                type,
                entries: entries.map((value, index, entries) => {
                    return {
                        value,
                        marker: !!index && index % (entries.length / labels.length) === 0,
                    };
                }),
                label: this.localize("mode", type, "label"),
                labels,
                rolls,
                values,
            };
        }));
    }

    async togglePause(paused?: boolean) {
        if (!game.user.isGM) return;
        await this.setSetting("paused", paused ?? !this.settings.paused);
        this.tool.info("confirm", paused ? "pause" : "play");
    }

    getUserRolls(userid: string): UserRoll[] {
        const rolls = getUserSetting<UserRoll[]>(userid, `${this.toolKey}.userRolls`)?.value ?? [];

        if (this.#filter === "encounter") {
            return this.#combat ? rolls.filter((roll) => roll.encounter === this.#combat) : [];
        }

        if (this.#filter === "session") {
            return this.#session ? rolls.filter((roll) => roll.session === this.#session) : [];
        }

        if (this.#filter === "time") {
            return rolls.filter(
                (roll) => roll.time >= this.#time.from && roll.time <= this.#time.to
            );
        }

        return rolls;
    }

    async startSession() {
        if (!game.user.isGM) return;

        const id = foundry.utils.randomID();
        const sessions = this.settings.sessions;

        sessions[id] = Date.now();

        await this.setSetting("sessions", sessions);
        await this.setSetting("session", id);

        this.tool.info("confirm.start", { time: timestampToLocalTime(sessions[id]) });
    }

    async endSession() {
        if (!game.user.isGM) return;

        const id = this.settings.session;

        await this.setSetting("session", undefined);

        if (id) {
            const time = this.settings.sessions[id];
            this.tool.info("confirm.end", { time: timestampToLocalTime(time) });
        }
    }

    async deleteRecords(days?: number) {
        if (!game.user.isGM) return;

        let time: number = 0;

        if (R.isNumber(days)) {
            const date = createEndOfDayDate();
            date.setDate(date.getDate() - days);
            time = date.getTime();
        } else {
            const date = new Date().toDateInputString();
            const hint = this.tool.localize("clear.hint");

            const result = await waitDialog({
                content: `<div class="hint">${hint}</div><input type="date" name="date" value="${date}">`,
                i18n: `${this.toolKey}.clear`,
                yes: {
                    icon: "fa-solid fa-trash",
                },
            });

            if (!result) return;

            time = new Date(result.date + "T23:59:59").getTime();
        }

        if (createEndOfDayDate().getTime() === time) {
            await this.endSession();
            await this.setSetting("sessions", {});
            await this.setSetting("encounters", {});

            await Promise.all(
                game.users.map((user) => {
                    return setUserSetting(user, `${this.toolKey}.userRolls`, []);
                })
            );

            return this.tool.info("confirm.delete.all");
        }

        const [encounters, sessions] = R.pipe(
            [this.settings.encounters, this.settings.sessions],
            R.map((entries) => R.omitBy(entries, (entryTime) => entryTime < time))
        );

        await this.endSession();
        await this.setSetting("sessions", sessions);
        await this.setSetting("encounters", encounters);

        await Promise.all(
            game.users.map((user) => {
                const currentRolls = this.getUserRolls(user.id).slice();
                if (currentRolls.length === 0) return;

                const rolls = currentRolls.filter((roll) => roll.time >= time);
                return setUserSetting(user, `${this.toolKey}.userRolls`, rolls);
            })
        );

        this.tool.info("confirm.delete.before", { time: timestampToLocalTime(time) });
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<RollTrackerContext> {
        const { encounters, sessions } = this.#getTimedEventArrays();
        const mode = this.modes.find((mode) => mode.type === this.#mode) ?? this.modes[0];

        if (this.#filter !== "encounter") {
            this.#combat = encounters[0]?.id;
        }

        if (this.#filter !== "session") {
            this.#session = sessions[0]?.id;
        }

        const list: ListUser[] = [];
        const selected: RollsSelected[] = [];

        const excludes = R.pipe(
            game.users.contents,
            R.filter((user) => user.isGM),
            R.map((user) => user.id),
            R.concat(["default"])
        );

        const actors = game.actors.filter((actor) => {
            return (
                !!actor?.prototypeToken.actorLink &&
                actor.isOfType("creature") &&
                (actor.ownership.default ?? 3) < 3 &&
                R.pipe(actor.ownership, R.omit(excludes), R.keys()).length < 2
            );
        });

        for (const user of game.users) {
            const userIndex = `user-${user.id}`;
            const selectIndex = this.#selections.indexOf(userIndex);
            const rolls = this.getUserRolls(user.id);

            if (selectIndex >= 0) {
                selected[selectIndex] = {
                    user,
                    rolls: mode.rolls(rolls),
                };
            }

            const userActors: ListSelection[] = [];

            for (const actor of user.isGM ? [] : actors) {
                if (!actor.testUserPermission(user, "OWNER")) continue;

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
                R.takeWhile(([_, count]) => count === maxCount),
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

        const values = selected.map(({ rolls }) => mode.values(rolls));
        const valuesMax = R.firstBy(values.flat(), [R.identity(), "desc"]) ?? 0;
        const maxValue = Math.max(6 * Math.ceil(valuesMax / 6), 6);

        const groups: ContextGroupEntry[][] = mode.entries.map((_, i) => {
            return values.map((__, j): ContextGroupEntry => {
                const value = values[j][i];

                return {
                    value,
                    ratio: (value / maxValue) * 100,
                };
            });
        });

        return {
            encounter: this.#combat,
            encounters: encounters.map(formatTimedEventOption),
            inSession: !!this.settings.session,
            isGM: game.user.isGM,
            isPaused: this.settings.paused,
            filter: this.#filter,
            filters: this.filters,
            groups,
            left: R.times(6, (x) => ((x + 1) * maxValue) / 6).reverse(),
            list,
            mode,
            modes: this.modes,
            selected: selected.length,
            session: this.#session,
            sessions: sessions.map(formatTimedEventOption),
            stats,
            time: {
                from: new Date(this.#time.from).toDateInputString(),
                to: new Date(this.#time.to).toDateInputString(),
            },
        };
    }

    protected _replaceHTML(
        result: string,
        content: HTMLElement,
        options: ApplicationRenderOptions
    ): void {
        const scrollPosition = this.#list?.scrollTop;

        content.innerHTML = result;

        this.#list = htmlQuery(content, ".sidebar .list");

        if (scrollPosition && this.#list) {
            this.#list.scrollTop = scrollPosition;
        }

        this._activateListeners(content);
    }

    protected _onClickAction(event: PointerEvent, target: HTMLElement): void {
        type EventAction = "play" | "delete" | "end" | "pause" | "select" | "start";

        const action = target.dataset.action as EventAction;

        if (action === "delete") {
            this.deleteRecords();
        } else if (action === "end") {
            this.endSession();
        } else if (action === "pause") {
            this.togglePause(true);
        } else if (action === "play") {
            this.togglePause(false);
        } else if (action === "select") {
            this.#select(event, target);
        } else if (action === "start") {
            this.startSession();
        }
    }

    #select(event: PointerEvent, target: HTMLElement) {
        const id = target.dataset.id as string;

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
    }

    #getTimedEventArrays(): { encounters: TimedEventEntry[]; sessions: TimedEventEntry[] } {
        const [encounters, sessions] = R.pipe(
            [this.settings.encounters, this.settings.sessions],
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

    #resetTime() {
        const date = new Date().toDateInputString();
        this.#time = {
            from: new Date(`${date}T00:00:00`).getTime(),
            to: new Date(`${date}T23:59:59`).getTime(),
        };
    }

    protected _activateListeners(html: HTMLElement) {
        addListenerAll(html, ".sidebar .options select", "change", (el: HTMLSelectElement) => {
            type SelectName = "mode" | "encounter" | "filter" | "session";

            const select = el.name as SelectName;

            if (select === "encounter") {
                this.#combat = el.value;
            } else if (select === "filter") {
                if (this.#filter === "time") {
                    this.#resetTime();
                }
                this.#filter = el.value as FilterType;
            } else if (select === "mode") {
                this.#mode = el.value as ModeType;
            } else if (select === "session") {
                this.#session = el.value;
            }

            this.render();
        });

        addListenerAll(
            html,
            ".sidebar .options input[type='date']",
            "change",
            (el: HTMLInputElement) => {
                const input = el.name as "time-from" | "time-to";

                if (input === "time-from") {
                    this.#time.from = new Date(`${el.value}T00:00:00`).getTime();
                } else if (input === "time-to") {
                    this.#time.to = new Date(`${el.value}T23:59:59`).getTime();
                }

                this.render();
            }
        );
    }
}

function createEndOfDayDate() {
    const date = new Date();

    date.setHours(23);
    date.setMinutes(59);
    date.setSeconds(59);
    date.setMilliseconds(0);

    return date;
}

function formatTimedEventOption({ id, time }: TimedEventEntry): SelectOption {
    return { value: id, label: timestampToLocalTime(time) };
}

function timestampToLocalTime(time: number) {
    return new Date(time).toLocaleString();
}

function createRollMode<T extends RollType | "all">(type: T): RawRollMode {
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
    };
}

type RollTrackerContext = {
    encounter: string;
    encounters: SelectOption<string>[];
    inSession: boolean;
    isGM: boolean;
    isPaused: boolean;
    filter: FilterType;
    filters: RollFilter[];
    groups: ContextGroupEntry[][];
    left: number[];
    list: ListUser[];
    mode: RollsMode;
    modes: RollsMode[];
    selected: number;
    session: string;
    sessions: SelectOption<string>[];
    stats: RollStats[];
    time: {
        from: string;
        to: string;
    };
};

type RollFilter = {
    value: FilterType;
    label: string;
};

type ContextGroupEntry = {
    value: number;
    ratio: number;
};

type ModeType =
    | RollType
    | "all"
    | "attack-roll-outcome"
    | "saving-throw-outcome"
    | `skill-check-${1 | 2}`;

type FilterType = (typeof FILTERS)[number];

type RawRollMode = {
    type: ModeType;
    entries: string[];
    rolls: (rolls: UserRoll[]) => UserRoll[];
    values: (rolls: UserRoll[]) => number[];
};

type RollsMode = Omit<RawRollMode, "entries"> & {
    entries: {
        value: string;
        marker: boolean;
    }[];
    label: string;
    labels: string[];
};

type ListUser = ListSelection & {
    actors: ListSelection[];
};

type ListSelection = {
    id: string;
    name: string;
    select: string;
};

type RollsSelected = {
    user: UserPF2e;
    actor?: ActorPF2e;
    rolls: UserRoll[];
};

type TimedEventEntry = {
    id: string;
    time: number;
};

type ModeTime = {
    from: number;
    to: number;
};

type RollStats = {
    name: string;
    total: number;
    mean: number;
    median: number;
    mode: string;
};

export { RollTracker };
