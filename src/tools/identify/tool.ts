import {
    confirmDialog,
    createHTMLElement,
    Emitable,
    htmlClosest,
    htmlQuery,
    isMerchant,
    renderActorSheets,
    ToggleableHook,
    userIsGM,
} from "foundry-helpers";
import { ActorPF2e, ActorSheetPF2e, ItemPF2e, PhysicalItemPF2e } from "foundry-pf2e";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { IdentifyTracker } from ".";

export class IdentifyTool extends ModuleTool<IdentifySettings> {
    #actorSheetHook = new ToggleableHook("renderActorSheetPF2e", this.#onRenderActorSheetPF2e.bind(this));
    #requestEmitable = new Emitable(this.key, this.#onRequestIdentify.bind(this));

    get key(): "identify" {
        return "identify";
    }

    get settingsSchema(): ToolSettingsList<IdentifySettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value: boolean) => {
                    this.configurate();

                    if (value) {
                        this.application?.render();
                    } else {
                        this.application?.close();
                    }
                },
            },
            {
                key: "delay",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: () => {
                    this.application?.render();
                },
            },
            {
                key: "identifyPartials",
                type: Boolean,
                default: true,
                scope: "world",
            },
            {
                key: "playerRequest",
                type: Boolean,
                default: true,
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
        ];
    }

    get api(): toolbelt.Api["identify"] {
        return {
            openTracker: this.openTracker.bind(this),
            requestIdentify: this.requestIdentify.bind(this),
        };
    }

    get application(): IdentifyTracker | undefined {
        return foundry.applications.instances.get(IdentifyTracker.ID) as IdentifyTracker | undefined;
    }

    async openTracker(item?: ItemPF2e) {
        if (!game.user.isGM || (item && !item.isOfType("physical"))) return;

        const application = this.application;

        if (application) {
            application.unlockItem(item);
        } else {
            new IdentifyTracker(item, this).render({ force: true });
        }
    }

    isValidItem(item: Maybe<ItemPF2e>): item is PhysicalItemPF2e<ActorPF2e> {
        return item instanceof Item && item.isOfType("physical") && !!item.actor;
    }

    _configurate(): void {
        const enabled = this.settings.enabled;
        const playerRequest = this.settings.playerRequest;

        this.#actorSheetHook.toggle(enabled && (playerRequest || userIsGM()));
        this.#requestEmitable.toggle(enabled && playerRequest);

        renderActorSheets();
    }

    init(): void {
        this._configurate();
    }

    requestIdentify(item: Maybe<ItemPF2e>, skipNotify?: boolean) {
        if (!this.isValidItem(item)) return;

        if (!skipNotify) {
            this.notify.info("request.sent");
        }

        this.#requestEmitable.emit({ item });
    }

    #onRenderActorSheetPF2e(sheet: ActorSheetPF2e<ActorPF2e>) {
        const user = game.user;
        const isGM = user.isGM;
        const actor = sheet.actor;

        if (!isGM && isMerchant(actor)) return;
        if (!(actor as Actor).canUserModify(user, "update")) return;

        const listElement = htmlQuery(sheet.element[0], ".inventory-list");
        if (!listElement) return;

        const itemsElements = listElement.querySelectorAll<HTMLLIElement>("li[data-item-id],li[data-subitem-id]");

        for (const itemElement of itemsElements) {
            const { itemId, subitemId } = itemElement.dataset;
            const realItemId = subitemId ? htmlClosest(itemElement, "[data-item-id]")?.dataset.itemId : itemId;
            const realItem = (actor as ActorPF2e).inventory.get(realItemId, { strict: true });
            const item = subitemId ? realItem.subitems.get(subitemId, { strict: true }) : realItem;

            if (item.isIdentified) continue;

            if (isGM) {
                const systemToggle = htmlQuery(itemElement, "[data-action='toggle-identified']");
                systemToggle?.remove();
            }

            const toggleElement = createHTMLElement("a", {
                dataset: {
                    action: "pf2e-toobelt-identify",
                    tooltip: "PF2E.identification.Identify",
                },
                content: "<i class='fa-solid fa-question-circle fa-fw'></i>",
            });

            const dataElement = htmlQuery(itemElement, ".data");
            if (!dataElement) return;

            const controlsElement = htmlQuery(dataElement, ".item-controls");
            const siblingElement = htmlQuery(controlsElement, `[data-action="${isGM ? "edit-item" : "delete-item"}"]`);

            if (siblingElement) {
                siblingElement.before(toggleElement);
            } else if (controlsElement) {
                controlsElement.appendChild(toggleElement);
            } else {
                const imgElement = htmlQuery(dataElement, ".item-image");
                imgElement?.after(toggleElement);
            }

            toggleElement.addEventListener("click", () => {
                if (game.user.isGM) {
                    this.openTracker(item);
                } else {
                    this.requestIdentify(item);
                }
            });
        }
    }

    async #onRequestIdentify({ item }: RequestOptions, userId: string) {
        const user = game.users.get(userId);
        if (!user || !item?.isOfType("physical")) return;

        const confirm = await confirmDialog(this.templatePath("request"), {
            classes: ["pf2e-toolbelt-identify-request"],
            data: { item: item.system.identification.identified },
            title: user.name,
        });

        if (confirm) {
            this.openTracker(item);
        }
    }
}

type RequestOptions = {
    item: PhysicalItemPF2e<ActorPF2e>;
};

type IdentifySettings = {
    delay: boolean;
    enabled: boolean;
    identifyPartials: boolean;
    playerRequest: boolean;
};
