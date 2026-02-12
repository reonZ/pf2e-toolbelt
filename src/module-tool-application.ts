import { Localize, Notifications } from "foundry-helpers";
import { ModuleTool } from "module-tool";

export abstract class ModuleToolApplication<TTool extends ModuleTool> extends foundry.applications.api.ApplicationV2 {
    #localize?: Localize;
    #notify?: Notifications;
    #tool: TTool;

    constructor(tool: TTool, options: DeepPartial<fa.ApplicationConfiguration> = {}) {
        super(options);
        this.#tool = tool;
    }

    abstract get key(): string;

    get tool(): TTool {
        return this.#tool;
    }

    get toolKey(): string {
        return this.tool.key;
    }

    get settings(): TTool["settings"] {
        return this.tool.settings;
    }

    get localize(): Localize {
        return (this.#localize ??= this.tool.localize.sub(this.key));
    }

    get notify(): Notifications {
        return (this.#notify ??= this.tool.notify.sub(this.key));
    }

    setSetting<K extends keyof TTool["settings"] & string>(
        key: K,
        value: TTool["settings"][K],
    ): Promise<TTool["settings"][K]> {
        return this.tool.setSetting(key, value);
    }

    path(...path: string[]): string {
        return this.tool.path(this.key, ...path);
    }

    templatePath(...path: string[]): string {
        return this.tool.templatePath(this.key, ...path);
    }

    protected _renderHTML(context: fa.ApplicationRenderContext, options: fa.ApplicationRenderOptions): Promise<string> {
        return this.tool.render(this.key, context);
    }

    protected _replaceHTML(result: string, content: HTMLElement, options: fa.ApplicationRenderOptions): void {
        content.innerHTML = result;
        content.dataset.tooltipDirection = "UP";
        content.dataset.tooltipClass = "pf2e";

        this._activateListeners(content);
    }

    protected _activateListeners(html: HTMLElement) {}
}
