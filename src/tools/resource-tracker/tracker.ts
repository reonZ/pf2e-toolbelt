import {
    createHTMLElement,
    createToggleHook,
    getUserSetting,
    getWorldTime,
    htmlClosest,
    htmlQuery,
    localize,
    R,
    waitDialog,
} from "foundry-helpers";
import { ModuleToolApplication } from "module-tool-application";
import { ResourcesCollection, ResourceTrackerTool, TrackedResource, TrackedResourceSource, zTrackedResource } from ".";

class ResourceTracker extends ModuleToolApplication<ResourceTrackerTool> {
    #userConnectedHook = createToggleHook("userConnected", () => this.render());

    #setPosition = R.funnel(
        () => {
            const { left, top } = this.position;
            this.settings.position = { x: left, y: top };
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

    get resources(): ResourcesCollection {
        return this.tool.resources;
    }

    close(options: fa.ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<RenderContext> {
        const worldResources = { user: "world", value: this.settings.worldResources };
        const allUsersResources = getUserSetting<TrackedResourceSource[]>(this.tool.getSettingKey("userResources"));
        const usersResources = this.settings.offline
            ? allUsersResources
            : allUsersResources.filter(({ user }) => game.users.get(user)?.active);

        const userId = game.user.isGM ? "world" : game.userId;
        const [ownResources, otherResources] = R.pipe(
            [worldResources, ...usersResources],
            R.map(({ user, value }) => {
                const resources = R.pipe(
                    value,
                    R.map((data) => zTrackedResource.safeParse(data)?.data),
                    R.filter((resource): resource is TrackedResource => {
                        return R.isTruthy(resource) && (resource.shared || user === userId);
                    }),
                    R.map((resource): TemplateResource => {
                        return {
                            ...resource,
                            decrease: generateTooltip(resource, "decrease"),
                            increase: generateTooltip(resource, "increase"),
                            label: resource.name || resource.id,
                            ratio: (resource.value - resource.min) / (resource.max - resource.min),
                        };
                    }),
                );

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
            resource.value = newValue;
            resource.time = getWorldTime();
            this.tool.saveResources();
        }
    }

    async #resourceMenu(resource: TrackedResource, isCreate: true): Promise<TrackedResource | null>;
    async #resourceMenu(
        resource: TrackedResource,
        isCreate?: boolean,
    ): Promise<(TrackedResource & { delete: boolean }) | null>;
    async #resourceMenu(resource: TrackedResource, isCreate?: boolean) {
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

    async #updateResource(resource: TrackedResource, changes: TrackedResourceSource) {
        const min = R.isNumber(changes.min) ? changes.min : resource.min;

        if (R.isNumber(changes.max)) {
            changes.max = Math.max(changes.max, min + 2);
        }

        if (R.isNumber(changes.value)) {
            const max = R.isNumber(changes.max) ? changes.max : resource.max;
            changes.value = Math.clamp(changes.value, min, max);
        }

        const diff = foundry.utils.diffObject(resource, changes);

        if ("timeout" in diff || ("value" in diff && !("time" in diff))) {
            changes.time = getWorldTime();
        }

        foundry.utils.mergeObject(resource, changes);
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
            this.#updateResource(resource, result);
        }

        this.tool.saveResources();
    }

    async #createResource() {
        const blank = zTrackedResource.parse({});
        const resource = await this.#resourceMenu(blank, true);
        if (!resource) return;

        this.resources.set(resource.id, resource);
        this.tool.saveResources();
    }
}

function generateTooltip(resource: TrackedResource, direction: "increase" | "decrease"): string {
    const steps = R.pipe(
        ["step1", ...(["step2", "step3"] as const).filter((step) => resource[step] !== resource.step1)] as const,
        R.map((step) => {
            const value = resource[step];
            const click = localize("resourceTracker.resource.steps", step);
            return localize("resourceTracker.resource", direction, { click, value });
        }),
    );

    steps.unshift(localize("resourceTracker.resource.edit"));

    return steps.join("<br>");
}

type RenderContext = fa.ApplicationRenderContext & {
    otherResources: TemplateResourcesGroup[];
    ownResources: TemplateResourcesGroup[];
};

type TemplateResourcesGroup = {
    user: string;
    resources: TemplateResource[];
};

type TemplateResource = TrackedResource & {
    decrease: string;
    increase: string;
    label: string;
    ratio: number;
};

export { ResourceTracker };
