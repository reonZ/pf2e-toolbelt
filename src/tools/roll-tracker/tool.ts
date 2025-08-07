import {
    ChatContextFlag,
    ChatMessagePF2e,
    CheckContextChatFlag,
    createHook,
    DEGREE_STRINGS,
    EncounterPF2e,
    MODULE,
    R,
    settingPath,
    timestampToLocalTime,
    toggleHooksAndWrappers,
    tupleHasValue,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { RerollSaveHook, RollSaveHook } from "tools";
import { RollTracker, UserRoll } from ".";
import fields = foundry.data.fields;

class RollTrackerTool extends ModuleTool<RollTrackerSettings> {
    #application?: RollTracker;

    #hooks = [
        createHook("createChatMessage", this.#onCreateChatMessage.bind(this)),
        createHook("pf2e-toolbelt.rollSave", ({ rollMessage }: RollSaveHook) => {
            this.#onCreateChatMessage(rollMessage, {}, game.userId);
        }),
        createHook("pf2e-toolbelt.rerollSave", this.#onRerollSave.bind(this)),
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
                type: new fields.TypedObjectField(new fields.NumberField({ nullable: false })),
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
                type: new fields.TypedObjectField(new fields.NumberField({ nullable: false })),
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
            endSession: this.endSession.bind(this),
            openTracker: () => this.application.render(true),
            startSession: this.startSession.bind(this),
            togglePause: this.togglePause.bind(this),
        };
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

    async togglePause(paused?: boolean) {
        if (!game.user.isGM) return;
        await this.setSetting("paused", paused ?? !this.settings.paused);
        this.info("confirm", paused ? "pause" : "play");
    }

    async startSession() {
        if (!game.user.isGM) return;

        const id = foundry.utils.randomID();
        const sessions = this.settings.sessions;

        sessions[id] = Date.now();

        await this.setSetting("sessions", sessions);
        await this.setSetting("session", id);

        this.info("confirm.start", { time: timestampToLocalTime(sessions[id]) });
    }

    async endSession() {
        if (!game.user.isGM) return;

        const id = this.settings.session;

        await this.setSetting("session", undefined);

        if (id) {
            const time = this.settings.sessions[id];
            this.info("confirm.end", { time: timestampToLocalTime(time) });
        }
    }

    #onCombatStart(combat: EncounterPF2e) {
        const encounters = this.settings.encounters;
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

    #onCreateChatMessage(message: ChatMessagePF2e, data: object, userId: string) {
        if (userId !== game.userId || !this.canRecord()) return;

        const die = message.rolls[0]?.dice[0];
        const value = die?.total;
        if (!die || die.faces !== 20 || !R.isNumber(value)) return;

        const user = game.user;
        const context = message.getFlag("pf2e", "context") as Maybe<ChatContextFlag>;

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

    #onRerollSave({ newRoll, data, target }: RerollSaveHook) {
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
            outcome: success != null ? DEGREE_STRINGS[success] : undefined,
            session: this.settings.session,
            isReroll: true,
            modifier: data.statistic,
        });
    }
}

function isCheckContextFlag(flag?: ChatContextFlag): flag is CheckContextChatFlag {
    return (
        !!flag &&
        !tupleHasValue(["damage-roll", "spell-cast", "self-effect", "damage-taken"], flag.type)
    );
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
export type { RollTrackerSettings, TimedEvents };
