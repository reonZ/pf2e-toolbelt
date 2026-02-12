import { addListener, createFormData, MODULE, R } from "foundry-helpers";
import { CreaturePF2e } from "foundry-pf2e";
import { ModuleToolApplication } from "module-tool-application";
import {
    BASE_SHARE_DATA,
    CHARACTER_MASTER_SHARE_DATA,
    CHARACTER_SHARE_DATA,
    ShareData,
    ShareDataSource,
    ShareDataTool,
    shareDataTool,
    ShareDataType,
    zShareMaster,
} from ".";

export class ShareDataConfig extends ModuleToolApplication<ShareDataTool> {
    #actor: CreaturePF2e;
    #data: ShareData | null;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-shareData-config"],
        tag: "form",
    };

    constructor(actor: CreaturePF2e, tool: ShareDataTool, options?: DeepPartial<fa.ApplicationConfiguration>) {
        super(tool, options);

        const slaves = shareDataTool.getSlavesInMemory(actor)?.size || 0;
        const data = slaves ? null : tool.getShareData(actor);

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

    async _prepareContext(): Promise<ShareDataContext | {}> {
        if (this.#data === null) {
            return {};
        }

        const actor = this.actor;
        const actorId = actor.id;
        const master = this.#data?.master;
        const masterIsCharacter = !!master?.isOfType("character");
        const bothCharacters = masterIsCharacter && actor.isOfType("character");
        const masters = game.actors.filter((actor): actor is CreaturePF2e<null> =>
            this.tool.isValidMaster(actor, actorId),
        );

        type RawOption = {
            name: ShareDataType;
            character: false | "both" | "master";
        };

        const rawOptions: RawOption[] = [
            ...BASE_SHARE_DATA.map((name): RawOption => {
                return { name, character: false };
            }),
            ...CHARACTER_MASTER_SHARE_DATA.map((name): RawOption => {
                return { name, character: "master" };
            }),
            ...CHARACTER_SHARE_DATA.map((name): RawOption => {
                return { name, character: "both" };
            }),
        ];

        const options = R.pipe(
            rawOptions,
            R.map(({ name, character }): ShareDataOption => {
                const disabled =
                    !master ||
                    (character === "both" && !bothCharacters) ||
                    (character === "master" && !masterIsCharacter);

                return {
                    checked: !disabled && this.#data![name],
                    disabled,
                    name,
                };
            }),
            R.sortBy(R.prop("disabled"), R.prop("name")),
        );

        return {
            masterId: master?.id,
            masters: R.sortBy(masters, R.prop("name")),
            options,
        } satisfies ShareDataContext;
    }

    protected _onClickAction(_event: PointerEvent, target: HTMLElement): void {
        const action = target.dataset.action as EventAction;

        if (action === "cancel") {
            this.close();
        } else if (action === "save") {
            this.#save();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        if (!this.#data) return;

        addListener(html, `[name="master"]`, "change", (el: HTMLInputElement) => {
            if (!this.#data) return;

            this.#data.master = zShareMaster.decode(el.value.trim() || null);
            this.render();
        });
    }

    #save() {
        const form = this.form;
        if (!form || !this.#data) return;

        const data = createFormData<ShareDataSource>(form);
        this.tool.setFlag(this.#actor, "data", data);
        this.close();
    }
}

type EventAction = "save" | "cancel";

type ShareDataContext = fa.ApplicationRenderContext & {
    masterId: string | undefined;
    masters: CreaturePF2e<null>[];
    options: ShareDataOption[];
};

type ShareDataOption = {
    checked: boolean;
    disabled: boolean;
    name: ShareDataType;
};
