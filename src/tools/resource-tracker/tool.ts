import { createToggleHook, getWorldTime, SceneControl, settingPath, userIsGM } from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { ResourceTracker, TrackedResource, TrackedResourceSource, zTrackedResource } from ".";

class ResourceTrackerTool extends ModuleTool<ResourceTrackerSettings> {
    #updateWorldTimeHook = createToggleHook("updateWorldTime", this.#onUpdateWorldTime.bind(this));
    #application: ResourceTracker | null = null;
    #resources: ResourcesCollection = new Collection();

    get key(): "resourceTracker" {
        return "resourceTracker";
    }

    get settingsSchema(): ToolSettingsList<ResourceTrackerSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "offline",
                type: Boolean,
                default: true,
                scope: "world",
                config: false,
                requiresReload: true,
            },
            {
                key: "show",
                type: Boolean,
                default: false,
                scope: "user",
                config: false,
                onChange: (value) => {
                    if (!this.settings.enabled) return;
                    this.#showApplication(value);
                },
            },
            {
                key: "position",
                type: Object as any,
                default: { x: 150, y: 100 },
                scope: "user",
                config: false,
            },
            {
                key: "userResources",
                type: Array,
                default: [],
                scope: "user",
                config: false,
                broadcast: true,
                onChange: (value, _, userId) => {
                    this.#onResourceUpdate(value, userId);
                },
            },
            {
                key: "worldResources",
                type: Array,
                default: [],
                scope: "world",
                config: false,
                onChange: (value) => {
                    this.#onResourceUpdate(value, "world");
                },
            },
        ];
    }

    get resources(): ResourcesCollection {
        return this.#resources;
    }

    get resourcesKey(): "worldResources" | "userResources" {
        return userIsGM() ? "worldResources" : "userResources";
    }

    init(): void {
        if (!this.settings.enabled) return;
        Hooks.on("getSceneControlButtons", this.#onGetSceneControlButtons.bind(this));
    }

    setup(): void {
        if (!this.settings.enabled) return;
        this.#setResources(this.settings[this.resourcesKey]);
        this.#onUpdateWorldTime(getWorldTime());
    }

    ready(): void {
        if (!this.settings.enabled) return;
        this.#showApplication();
    }

    saveResources() {
        const entries = this.resources.map((entry) => entry);
        this.settings[this.resourcesKey] = entries;
    }

    #onResourceUpdate(value: TrackedResourceSource[], userId: string) {
        if (userId === game.userId || (userId === "world" && game.user.isGM)) {
            this.#setResources(value);
        }
        this.#application?.render();
    }

    #setResources(resources: TrackedResourceSource[]) {
        this.resources.clear();

        for (const data of resources) {
            const resource = zTrackedResource.safeParse(data)?.data;
            if (!resource) continue;
            this.resources.set(resource.id, resource);
        }

        const hasTimeout = this.resources.some(isTimeout);
        this.#updateWorldTimeHook.toggle(hasTimeout);
    }

    #onUpdateWorldTime(worldTime: number) {
        if (!game.ready || (game.user.isGM && !game.user.isActiveGM)) return;

        let updated = false;

        for (const resource of this.resources) {
            if (!isTimeout(resource)) continue;

            const decrements = Math.floor((worldTime - resource.time) / resource.timeout);
            if (decrements < 1) continue;

            updated = true;

            resource.value -= decrements;
            resource.time += resource.timeout * decrements;
        }

        if (updated) {
            this.saveResources();
        }
    }

    #showApplication(show = this.settings.show) {
        if (show) {
            if (this.#application) {
                this.#application.bringToFront();
            } else {
                this.#application = new ResourceTracker(this);
                this.#application.render(true);
            }
        } else {
            this.#application?.close();
            this.#application = null;
        }
    }

    #onGetSceneControlButtons(controls: Record<string, SceneControl>) {
        const tokenTools = controls.tokens?.tools;
        if (!tokenTools) return;

        tokenTools.resourceTracker = {
            active: this.settings.show,
            name: "resourceTracker",
            title: settingPath("resourceTracker.title"),
            icon: "fa-regular fa-bars-progress",
            order: Object.keys(tokenTools).length,
            toggle: true,
            visible: true,
            onChange: (_event, active) => {
                this.settings.show = !!active;
            },
        };
    }
}

function isTimeout(resource: TrackedResource) {
    return resource.timeout > 0 && resource.value > resource.min;
}

type ResourceTrackerSettings = {
    enabled: boolean;
    offline: boolean;
    position: Point;
    show: boolean;
    userResources: TrackedResourceSource[];
    worldResources: TrackedResourceSource[];
};

type ResourcesCollection = Collection<string, TrackedResource>;

export { ResourceTrackerTool };
export type { ResourcesCollection };
