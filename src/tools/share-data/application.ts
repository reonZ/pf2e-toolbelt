import {
    addListener,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    CreaturePF2e,
    FlagData,
    MODULE,
    R,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import {
    AUTO_SHARE,
    AutoDataType,
    BASE_SHARE_DATA,
    CHARACTER_MASTER_SHARE_DATA,
    CHARACTER_SHARE_DATA,
    getSlavesInMemory,
    isValidMaster,
    ShareDataModel,
    ShareDataTool,
    ShareDataType,
} from ".";

class ShareDataConfig extends ModuleToolApplication<ShareDataTool> {
    #actor: CreaturePF2e;
    #data: FlagData<ShareDataModel> | null;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-shareData-config"],
        tag: "form",
    };

    constructor(
        actor: CreaturePF2e,
        tool: ShareDataTool,
        options?: DeepPartial<ApplicationConfiguration>
    ) {
        super(tool, options);

        const slaves = getSlavesInMemory(actor)?.size || 0;
        const data = slaves ? null : tool.getDataFlag(actor, ShareDataModel, "data") ?? null;

        if (!slaves && !data) {
            throw MODULE.Error("an error occured when trying to instantiate 'ShareDataModel'");
        }

        this.#actor = actor;
        this.#data = data;
    }

    get key(): string {
        return "config";
    }

    get actor(): CreaturePF2e {
        return this.#actor;
    }

    get title(): string {
        return this.localize("title", this.actor);
    }

    async _prepareContext(_: ApplicationRenderOptions): Promise<ShareDataContext | {}> {
        if (this.#data === null) {
            return {};
        }

        const actor = this.actor;
        const actorId = actor.id;
        const master = this.#data?.master;
        const masterIsCharacter = !!master?.isOfType("character");
        const bothCharacters = masterIsCharacter && actor.isOfType("character");
        const masters = game.actors.filter((x): x is CreaturePF2e<null> =>
            isValidMaster(x, actorId)
        );

        type RawOption = {
            name: ShareDataType | AutoDataType;
            character: false | "both" | "master";
            auto?: boolean;
        };

        const rawOptions: RawOption[] = [
            ...AUTO_SHARE,
            ...BASE_SHARE_DATA.map((name): RawOption => {
                return { name, auto: false, character: false };
            }),
            ...CHARACTER_MASTER_SHARE_DATA.map((name): RawOption => {
                return { name, auto: false, character: "master" };
            }),
            ...CHARACTER_SHARE_DATA.map((name): RawOption => {
                return { name, auto: false, character: "both" };
            }),
        ];

        const options = R.pipe(
            rawOptions,
            R.map(({ name, auto = true, character }) => {
                const disabled =
                    !master ||
                    (character === "both" && !bothCharacters) ||
                    (character === "master" && !masterIsCharacter);

                return {
                    auto,
                    checked: !disabled && (auto || this.#data![name as ShareDataType]),
                    disabled,
                    name,
                };
            }),
            R.sortBy(R.prop("disabled"), R.prop("name"))
        );

        return {
            masterId: master?.id,
            masters,
            options,
        } satisfies ShareDataContext;
    }

    protected _onClickAction(event: PointerEvent, target: HTMLElement): void {
        const action = target.dataset.action as EventAction;

        if (action === "cancel") {
            this.close();
        } else if (action === "save") {
            this.#save();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addListener(html, `[name="master"]`, "change", (el: HTMLInputElement) => {
            this.#data?.updateSource({ master: el.value.trim() || null });
            this.render();
        });
    }

    #save() {
        const form = this.form;
        if (!form || !this.#data) return;

        const data = new foundry.applications.ux.FormDataExtended(form, { disabled: true }).object;

        this.#data.updateSource(data);
        this.#data.setFlag();
        this.close();
    }
}

type EventAction = "save" | "cancel";

type ShareDataContext = {
    masterId: string | undefined;
    masters: CreaturePF2e<null>[];
    options: ShareDataOption[];
};

type ShareDataOption = {
    auto: boolean;
    checked: boolean;
    disabled: boolean;
    name: ShareDataType | AutoDataType;
};

export { ShareDataConfig };
