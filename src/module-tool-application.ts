import { LocalizeArgs, NotificationArgs } from "foundry-helpers";
import { ModuleTool } from "module-tool";

abstract class ModuleToolApplication<TTool extends ModuleTool> extends foundry.applications.api.ApplicationV2 {
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

    localizePath(...path: string[]): string {
        return this.tool.localizePath(this.key, ...path);
    }

    localize(...args: LocalizeArgs): string {
        return this.tool.localize(this.key, ...args);
    }

    localizeIfExist(...args: LocalizeArgs): string | undefined {
        return this.tool.localizeIfExist(this.key, ...args);
    }

    info(...args: NotificationArgs): fa.ui.Notification {
        return this.tool.info(this.key, ...args);
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

export { ModuleToolApplication };
