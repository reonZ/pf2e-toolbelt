import {
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationPosition,
    ApplicationRenderOptions,
    createHook,
    createHTMLElement,
    getUsersSetting,
    htmlClosest,
    htmlQuery,
    R,
    RenderTemplateData,
    waitDialog,
} from "module-helpers";
import { Resource, ResourceModel, ResourceTrackerTool } from ".";

class ResourceTracker extends foundry.applications.api.ApplicationV2 {
    #tool: ResourceTrackerTool;
    #userConnectedHook = createHook("userConnected", () => this.render());

    #setPosition = R.funnel(
        () => {
            const { left, top } = this.position;
            const position = this.#tool.settings.position;

            position.set(left, top);
            this.#tool.setSetting("position", position);
        },
        { minQuietPeriodMs: 1000 }
    );

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-resource-tracker",
        window: {
            positioned: true,
            frame: true,
        },
        position: {
            width: "auto",
            height: "auto",
        },
    };

    constructor(tool: ResourceTrackerTool, options: DeepPartial<ApplicationConfiguration> = {}) {
        super(options);

        this.#tool = tool;
    }

    close(options: ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<RenderContext> {
        const allUsersResources = getUsersSetting<Resource[]>(
            this.#tool.getSettingKey("userResources")
        );

        const usersResources = this.#tool.offline
            ? allUsersResources
            : allUsersResources.filter(({ user }) => game.users.get(user)?.active);

        const userId = game.user.isGM ? "world" : game.userId;
        const [ownResources, otherResources] = R.pipe(
            [{ user: "world", value: this.#tool.settings.worldResources }, ...usersResources],
            R.map(({ user, value }) => {
                const resources = value
                    .filter(({ shared }) => shared || user === userId)
                    .map((entry) => {
                        const resource = new ResourceModel(entry);
                        return resource.invalid ? undefined : resource;
                    })
                    .filter(R.isTruthy);

                if (!resources.length) return;

                return {
                    user,
                    resources,
                };
            }),
            R.filter(R.isTruthy),
            R.partition(({ user }) => user === userId)
        );

        return {
            otherResources,
            ownResources,
        };
    }

    protected _renderHTML(
        context: RenderContext,
        options: ApplicationRenderOptions
    ): Promise<string> {
        return this.#tool.render("tracker", context);
    }

    protected _replaceHTML(
        result: string,
        content: HTMLElement,
        options: ApplicationRenderOptions
    ): void {
        content.innerHTML = result;
    }

    async _renderFrame(options: ApplicationRenderOptions) {
        const frame = await super._renderFrame(options);
        const windowHeader = htmlQuery(frame, ".window-header");

        const header = createHTMLElement("div", {
            content: await this.#tool.render("header"),
        });

        windowHeader?.replaceChildren(...header.children);

        return frame;
    }

    _onFirstRender(context: RenderContext, options: ApplicationRenderOptions) {
        const { x, y } = this.#tool.settings.position;
        foundry.utils.setProperty(options, "position", { left: x, top: y });

        this.#userConnectedHook.activate();
    }

    _onClose(options: ApplicationClosingOptions): void {
        this.#userConnectedHook.disable();
    }

    _onPosition(position: ApplicationPosition) {
        this.#setPosition.call();
    }

    async _onClickAction(event: PointerEvent, target: HTMLElement) {
        type Action = "create-resource" | "decrease-resource" | "increase-resource";

        const action = target.dataset.action as Action;
        const resourceId = htmlClosest(target, `[data-resource-id]`)?.dataset.resourceId ?? "";

        if (event.button === 2 && action !== "create-resource") {
            return this.#editResource(resourceId);
        }

        if (event.button !== 0) return;

        if (action === "create-resource") {
            this.#createResource();
        } else if (action === "decrease-resource") {
            this.#updateValue(event, resourceId, -1);
        } else if (action === "increase-resource") {
            this.#updateValue(event, resourceId, 1);
        }
    }

    #updateValue(event: PointerEvent, resourceId: string, direction: 1 | -1) {
        const resources = this.#tool.resources;
        const resource = resources.get(resourceId);
        if (!resource) return;

        const step = event.ctrlKey ? 3 : event.shiftKey ? 2 : 1;
        const newValue = resource.value + resource[`step${step}`] * direction;

        if (newValue !== resource.value) {
            resource.updateSource({ value: newValue });
            resources.save();
        }
    }

    async #resourceMenu(
        resource: ResourceModel,
        isCreate?: boolean
    ): Promise<(Resource & { delete?: boolean }) | false | null> {
        return await waitDialog({
            content: `${this.#tool.key}/menu`,
            i18n: `${this.#tool.key}.resource`,
            data: {
                resource,
                isCreate,
            },
            title: this.#tool.localize("resource.title", isCreate ? "create" : "edit"),
            yes: {
                label: this.#tool.localize("resource.yes", isCreate ? "create" : "edit"),
            },
            classes: ["resource-menu"],
        });
    }

    async #editResource(resourceId: string) {
        const resources = this.#tool.resources;
        const resource = resources.get(resourceId);
        if (!resource) return;

        const result = await this.#resourceMenu(resource);
        if (!result) return;

        if (result.delete) {
            resources.delete(resourceId);
        } else {
            resource.updateSource(result);
        }

        resources.save();
    }

    async #createResource() {
        const resource = new ResourceModel();
        const result = await this.#resourceMenu(resource, true);
        if (!result) return;

        resource.updateSource(result);

        const resources = this.#tool.resources;

        resources.add(resource);
        resources.save();
    }
}

type RenderContext = RenderTemplateData & {
    otherResources: TemplateResource[];
    ownResources: TemplateResource[];
};

type TemplateResource = { user: string; resources: ResourceModel[] };

export { ResourceTracker };
