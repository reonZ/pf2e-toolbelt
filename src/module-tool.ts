import {
    deleteFlagProperty,
    deleteInMemory,
    error,
    getFlag,
    getInMemory,
    getSetting,
    localize,
    LocalizeArgs,
    localizePath,
    NotificationArgs,
    RegisterSettingOptions,
    render,
    RenderTemplateData,
    setFlag,
    setFlagProperties,
    setFlagProperty,
    setInMemory,
    setSetting,
    unsetFlag,
    warning,
} from "module-helpers";

abstract class ModuleTool<TSettings extends Record<string, any> = Record<string, any>> {
    declare settings: Readonly<TSettings>;

    abstract get key(): string;
    abstract get settingsSchema(): ToolSettingsList<TSettings>;

    get keybindsSchema(): KeybindingActionConfig[] {
        return [];
    }

    get api(): Record<string, any> {
        return {};
    }

    init(isGM: boolean) {}
    setup(isGM: boolean) {}
    ready(isGM: boolean) {}
    _configurate() {}

    configurate = foundry.utils.debounce(this._configurate, 1);

    getSettingKey<K extends keyof TSettings & string>(setting: K): string {
        return `${this.key}.${setting}`;
    }

    setSetting<K extends keyof TSettings & string>(
        setting: K,
        value: TSettings[K]
    ): Promise<TSettings[K]> {
        const key = this.getSettingKey(setting);
        return setSetting(key, value);
    }

    render<T extends Record<string, any>>(
        template: string,
        data?: T & RenderTemplateData
    ): Promise<string> {
        return render(`${this.key}/${template}`, data);
    }

    localizePath(...path: string[]): string {
        return localizePath(this.key, ...path);
    }

    localize(...args: LocalizeArgs): string {
        return localize(this.key, ...args);
    }

    warning(...args: NotificationArgs): number {
        return warning(this.key, ...args);
    }

    error(...args: NotificationArgs): number {
        return error(this.key, ...args);
    }

    getInMemory<T>(obj: ClientDocument | Token, ...path: string[]): T | undefined {
        return getInMemory(obj, this.key, ...path);
    }

    setInMemory<T>(obj: ClientDocument | Token, ...args: [...string[], T]): boolean {
        return setInMemory(obj, this.key, ...args);
    }

    deleteInMemory(obj: ClientDocument | Token, ...path: string[]): boolean {
        return deleteInMemory(obj, this.key, ...path);
    }

    getFlag<T>(doc: foundry.abstract.Document, ...path: string[]): T | undefined {
        return getFlag(doc, this.key, ...path);
    }

    setFlag<D extends foundry.abstract.Document, T>(doc: D, ...args: [...string[], T]): Promise<D> {
        return setFlag(doc, this.key, ...args);
    }

    unsetFlag<D extends foundry.abstract.Document>(doc: D, ...path: string[]): Promise<D> {
        return unsetFlag(doc, this.key, ...path);
    }

    setFlagProperty<T extends object>(obj: T, ...args: [...string[], any]): T {
        return setFlagProperty(obj, this.key, ...args);
    }

    deleteFlagProperty<T extends object>(obj: T, ...path: string[]): T {
        return deleteFlagProperty(obj, this.key, ...path);
    }

    setFlagProperties<T extends object>(
        obj: T,
        ...args: [...string[], properties: Record<string, any>]
    ): T {
        return setFlagProperties(obj, this.key, ...args);
    }

    _initialize() {
        const settings = {};

        for (const setting of this.settingsSchema) {
            const key = this.getSettingKey(setting.key);

            Object.defineProperty(settings, setting.key, {
                get() {
                    return getSetting(key);
                },
            });
        }

        Object.defineProperty(this, "settings", {
            get() {
                return settings;
            },
        });
    }
}

type ToolSetting<TSettings extends Record<string, any>> = TSettings extends Record<infer K, infer V>
    ? RegisterSettingOptions & { key: K; type: FromPrimitive<V> }
    : never;

type ToolSettingsList<TSettings extends Record<string, any>> = ReadonlyArray<
    ToolSetting<TSettings>
>;

export { ModuleTool };
export type { ToolSettingsList };
