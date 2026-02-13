import { ModuleToolApplication } from "module-tool-application";
import { ResourceTrackerTool } from ".";
import { createHTMLElement, createToggleHook, htmlClosest, htmlQuery, R, waitDialog } from "foundry-helpers";

class ResourceTracker extends ModuleToolApplication<ResourceTrackerTool> {
    #userConnectedHook = createToggleHook("userConnected", () => this.render());

    #setPosition = R.funnel(
        () => {
            const { left, top } = this.position;
            const position = this.settings.position;

            position.set(left, top);
            this.settings.position = position;
        },
        { minQuietPeriodMs: 1000 },
    );

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
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

    get key(): string {
        return "tracker";
    }

    get resources(): ResourceCollection {
        return this.tool.resources;
    }

    close(options: fa.ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(options: fa.ApplicationRenderOptions): Promise<RenderContext> {
        const allUsersResources = getUsersSetting<Resource[]>(this.tool.getSettingKey("userResources"));

        const usersResources = this.settings.offline
            ? allUsersResources
            : allUsersResources.filter(({ user }) => game.users.get(user)?.active);

        const userId = game.user.isGM ? "world" : game.userId;
        const [ownResources, otherResources] = R.pipe(
            [{ user: "world", value: this.settings.worldResources }, ...usersResources],
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
            R.partition(({ user }) => user === userId),
        );

        return {
            otherResources,
            ownResources,
        };
    }

    async _renderFrame(options: fa.ApplicationRenderOptions) {
        const frame = await super._renderFrame(options);
        const windowHeader = htmlQuery(frame, ".window-header");

        const header = createHTMLElement("div", {
            content: await this.tool.render("header", {}),
        });

        windowHeader?.replaceChildren(...header.children);

        return frame;
    }

    async _onFirstRender(_context: RenderContext, options: fa.ApplicationRenderOptions) {
        const { x, y } = this.settings.position;
        foundry.utils.setProperty(options, "position", { left: x, top: y });

        this.#userConnectedHook.activate();
    }

    _onClose(_options: fa.ApplicationClosingOptions): void {
        this.#userConnectedHook.disable();
    }

    _onPosition(_position: fa.ApplicationPosition) {
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
        const resources = this.resources;
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
        isCreate?: boolean,
    ): Promise<(Resource & { delete?: boolean }) | false | null> {
        return await waitDialog({
            content: `${this.toolKey}/menu`,
            i18n: `${this.toolKey}.resource`,
            data: {
                resource,
                isCreate,
            },
            title: this.tool.localize("resource.title", isCreate ? "create" : "edit"),
            yes: {
                label: this.tool.localize("resource.yes", isCreate ? "create" : "edit"),
            },
            classes: ["resource-menu"],
        });
    }

    async #editResource(resourceId: string) {
        const resources = this.resources;
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

        const resources = this.resources;

        resources.add(resource);
        resources.save();
    }
}

type RenderContext = fa.ApplicationRenderContext & {
    otherResources: TemplateResourcesGroup[];
    ownResources: TemplateResourcesGroup[];
};

type TemplateResourcesGroup = {
    user: string;
    resources: TemplateResource[];
};

type TemplateResource = {};

export { ResourceTracker };
