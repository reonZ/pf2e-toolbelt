import { createToggleHook, getWorldTime, SceneControl, settingPath, userIsGM } from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { TrackedResource } from ".";

class ResourceTrackerTool extends ModuleTool<ResourceTrackerSettings> {
    #updateWorldTimeHook = createToggleHook("updateWorldTime", this.#onUpdateWorldTime.bind(this));
    #application: ResourceTracker | null = null;
    #resources: Collection<string, TrackedResource> = new Collection();

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

    get resources(): ResourceCollection {
        return this.#resources;
    }

    init(): void {
        if (!this.settings.enabled) return;

        Hooks.on("getSceneControlButtons", this.#onGetSceneControlButtons.bind(this));
    }

    setup(): void {
        if (!this.settings.enabled) return;

        this.#setResources();
        this.#onUpdateWorldTime();
    }

    ready(): void {
        if (!this.settings.enabled) return;

        this.#showApplication();
    }

    #setResources(resources?: TrackedResource[]) {
        const settingKey = userIsGM() ? "worldResources" : "userResources";
        const resourcesKey = this.getSettingKey(settingKey);

        resources ??= this.settings[settingKey];

        this.#resources = new ResourceCollection(resourcesKey, resources);

        const hasTimeout = this.#resources.some((resource) => resource.isTimeout);
        this.#updateWorldTimeHook.toggle(hasTimeout);
    }

    #onUpdateWorldTime(worldTime: number = getWorldTime()) {
        if (!game.ready || (game.user.isGM && !game.user.isActiveGM)) return;

        let updated = false;

        for (const resource of this.resources) {
            if (!resource.isTimeout) continue;

            const decrements = Math.floor((worldTime - resource.time) / resource.timeout);
            if (decrements < 1) continue;

            updated = true;
            resource.updateSource({
                value: resource.value - decrements,
                time: resource.time + resource.timeout * decrements,
            });
        }

        if (updated) {
            this.resources.save();
        }
    }

    #onResourceUpdate(value: TrackedResource[], userId: string) {
        if (userId === game.userId || (userId === "world" && game.user.isGM)) {
            this.#setResources(value);
        }

        this.#application?.render();
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

type ResourceTrackerSettings = {
    enabled: boolean;
    offline: boolean;
    position: Point;
    show: boolean;
    userResources: TrackedResource[];
    worldResources: TrackedResource[];
};

export { ResourceTrackerTool };
