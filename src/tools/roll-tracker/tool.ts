import {
    ActorUUID,
    ChatContextFlag,
    ChatMessagePF2e,
    CheckContextChatFlag,
    createToggleHook,
    degreeOfSuccessString,
    EncounterPF2e,
    getUserSetting,
    MODULE,
    R,
    SceneControl,
    settingPath,
    setUserSetting,
    SYSTEM,
    timestampToLocalTime,
    toggleHooksAndWrappers,
    tupleHasValue,
    waitDialog,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { RollTracker, UserRoll, UserRollSource, zTimedEvents, zUserRoll } from ".";

class RollTrackerTool extends ModuleTool<RollTrackerSettings> {
    #application?: RollTracker;

    #hooks = [
        createToggleHook("createChatMessage", this.#onCreateChatMessage.bind(this)),
        createToggleHook("pf2e-toolbelt.rollSave", ({ rollMessage }: toolbelt.targetHelper.RollSaveHook) => {
            this.#onCreateChatMessage(rollMessage, {}, game.userId);
        }),
        createToggleHook("pf2e-toolbelt.rerollSave", this.#onRerollSave.bind(this)),
    ];

    get key(): "rollTracker" {
        return "rollTracker";
    }

    get application(): RollTracker {
        return (this.#application ??= new RollTracker(this));
    }

    get settingsSchema(): ToolSettingsList<RollTrackerSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "encounters",
                type: Object as any,
                default: {},
                scope: "world",
                config: false,
            },
            {
                key: "paused",
                type: Boolean,
                default: false,
                scope: "world",
                config: false,
                onChange: (value) => {
                    const enabled = this.settings.enabled;

                    toggleHooksAndWrappers(this.#hooks, enabled && !value);

                    if (enabled) {
                        this.application.render();
                    }
                },
            },
            {
                key: "session",
                type: String,
                default: undefined,
                scope: "world",
                config: false,
                onChange: () => {
                    if (this.settings.enabled) {
                        this.application.render();
                    }
                },
            },
            {
                key: "sessions",
                type: Object as any,
                default: {},
                scope: "world",
                config: false,
            },
            {
                key: "userRolls",
                type: Array,
                default: [],
                scope: "user",
                config: false,
                broadcast: true,
                onChange: () => {
                    if (this.settings.enabled) {
                        this.application.render();
                    }
                },
            },
        ];
    }

    get api(): Record<string, any> {
        return {
            deleteRecords: this.deleteRecords.bind(this),
            endSession: this.endSession.bind(this),
            openTracker: () => this.application.render(true),
            startSession: this.startSession.bind(this),
            togglePause: this.togglePause.bind(this),
        };
    }

    get encounters(): TimedEvents {
        return zTimedEvents.safeParse(this.settings.encounters).data ?? {};
    }

    get sessions(): TimedEvents {
        return zTimedEvents.safeParse(this.settings.sessions).data ?? {};
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        if (isGM) {
            Hooks.on("combatStart", this.#onCombatStart.bind(this));
        }

        toggleHooksAndWrappers(this.#hooks, !this.settings.paused);

        Hooks.on("getSceneControlButtons", this.#onGetSceneControlButtons.bind(this));
    }

    addRoll(roll: UserRoll) {
        const rolls = this.settings.userRolls.slice();
        rolls.push(roll);
        this.settings.userRolls = rolls;
    }

    canRecord(): boolean {
        return MODULE.isDebug || game.users.filter((user) => user.active).length > 1;
    }

    getUserRolls(userid: string): UserRoll[] {
        return R.pipe(
            getUserSetting<UserRollSource[]>(this.getSettingKey("userRolls"), userid)?.value ?? [],
            R.map((data) => zUserRoll.safeParse(data).data),
            R.filter(R.isTruthy),
        );
    }

    async togglePause(paused?: boolean) {
        if (!game.user.isGM) return;
        await this.setSetting("paused", paused ?? !this.settings.paused);
        this.localize.info("confirm", paused ? "pause" : "play");
    }

    async startSession() {
        if (!game.user.isGM) return;

        const id = foundry.utils.randomID();
        const sessions = this.sessions;

        sessions[id] = Date.now();

        await this.setSetting("sessions", sessions);
        await this.setSetting("session", id);

        this.localize.info("confirm.start", { time: timestampToLocalTime(sessions[id]) });
    }

    async endSession() {
        if (!game.user.isGM) return;

        const id = this.settings.session;

        await this.setSetting("session", undefined);

        if (id) {
            const time = this.sessions[id];
            this.localize.info("confirm.end", { time: timestampToLocalTime(time) });
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
            const hint = this.localize("clear.hint");

            const result = await waitDialog({
                content: `<div class="hint">${hint}</div><input type="date" name="date" value="${date}">`,
                i18n: `${this.key}.clear`,
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
                    return setUserSetting(user, `${this.key}.userRolls`, []);
                }),
            );

            return this.localize.info("confirm.delete.all");
        }

        const [encounters, sessions] = R.pipe(
            [this.encounters, this.sessions],
            R.map((entries) => R.omitBy(entries, (entryTime) => entryTime < time)),
        );

        await this.endSession();
        await this.setSetting("sessions", sessions);
        await this.setSetting("encounters", encounters);

        await Promise.all(
            game.users.map((user) => {
                const currentRolls = this.getUserRolls(user.id);
                if (currentRolls.length === 0) return;

                const rolls = currentRolls.filter((roll) => roll.time >= time);
                return setUserSetting(user, this.getSettingKey("userRolls"), rolls);
            }),
        );

        this.localize.info("confirm.delete.before", { time: timestampToLocalTime(time) });
    }

    #onCombatStart(combat: EncounterPF2e) {
        const encounters = this.encounters;
        encounters[combat.id] = Date.now();
        this.settings.encounters = encounters;
    }

    #onGetSceneControlButtons(controls: Record<string, SceneControl>) {
        const tokenTools = controls.tokens?.tools;
        if (!tokenTools) return;

        tokenTools.rollTracker = {
            button: true,
            icon: "fa-sharp-duotone fa-solid fa-dice-d20",
            name: "rollTracker",
            order: Object.keys(tokenTools).length,
            title: settingPath("rollTracker.title"),
            visible: true,
            onChange: () => {
                if (this.application.rendered) {
                    this.application.close();
                } else {
                    this.application.render(true);
                }
            },
        };
    }

    #onCreateChatMessage(message: ChatMessagePF2e, _data: object, userId: string) {
        if (userId !== game.userId || !this.canRecord()) return;

        const die = message.rolls[0]?.dice[0];
        const value = die?.total;
        if (!die || die.faces !== 20 || !R.isNumber(value)) return;

        const user = game.user;
        const context = message.flags[SYSTEM.id].context;

        if (context && isCheckContextFlag(context)) {
            if (!user.isGM && context.rollMode === "selfroll") return;

            this.addRoll({
                value,
                time: Date.now(),
                type: context.type,
                isPrivate: !tupleHasValue(["publicroll", "roll"], context.rollMode),
                encounter: game.combat?.id,
                actor: (context.actor ?? null) as Maybe<ActorUUID>,
                outcome: context.outcome,
                session: this.settings.session,
                isReroll: context.isReroll,
                modifier: message.flags[SYSTEM.id].modifierName as string | undefined,
            });
        } else if (context?.type === "damage-roll") {
        } else if (message.rolls.length === 1 && message.rolls[0].dice.length === 1) {
            if (!user.isGM && !message.blind && message.whisper.length === 1 && message.whisper[0] === user.id) return;

            this.addRoll({
                value,
                time: Date.now(),
                type: "roll",
                isPrivate: message.blind || message.whisper.length > 0,
                encounter: game.combat?.id,
                actor: (message.actor?.id ?? null) as Maybe<ActorUUID>,
                session: this.settings.session,
                isReroll: false,
            });
        }
    }

    #onRerollSave({ newRoll, data, target }: toolbelt.targetHelper.RerollSaveHook) {
        if (!this.canRecord()) return;

        const value = newRoll.dice[0]?.total;
        if (!R.isNumber(value)) return;

        const success = newRoll.degreeOfSuccess;

        this.addRoll({
            value,
            time: Date.now(),
            type: newRoll.type,
            isPrivate: data.private,
            encounter: game.combat?.id,
            actor: (target.actor?.id ?? null) as Maybe<ActorUUID>,
            outcome: R.isNumber(success) ? degreeOfSuccessString(success) : undefined,
            session: this.settings.session,
            isReroll: true,
            modifier: data.statistic,
        });
    }
}

function isCheckContextFlag(context?: ChatContextFlag): context is CheckContextChatFlag {
    return !!context && !tupleHasValue(["damage-roll", "spell-cast", "self-effect", "damage-taken"], context.type);
}

function createEndOfDayDate() {
    const date = new Date();

    date.setHours(23);
    date.setMinutes(59);
    date.setSeconds(59);
    date.setMilliseconds(0);

    return date;
}

type RollTrackerSettings = {
    enabled: boolean;
    encounters: TimedEvents;
    paused: boolean;
    session: string | undefined;
    sessions: TimedEvents;
    userRolls: UserRoll[];
};

type TimedEvents = Record<string, number>;

export { RollTrackerTool };
