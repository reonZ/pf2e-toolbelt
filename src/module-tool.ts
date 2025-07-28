import {
    ApplicationConfiguration,
    ApplicationRenderContext,
    ApplicationRenderOptions,
    DataField,
    DataFlagArgs,
    deleteFlagProperty,
    deleteInMemory,
    error,
    FlagData,
    FlagDataArray,
    getDataFlag,
    getDataFlagArray,
    getFlag,
    getInMemory,
    getSetting,
    info,
    joinStr,
    localize,
    LocalizeArgs,
    localizeIfExist,
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
    updateSourceFlag,
    warning,
} from "module-helpers";
type Document = foundry.abstract.Document;

abstract class ModuleTool<TSettings extends Record<string, any> = Record<string, any>> {
    #settings: Record<string, any> = {};

    declare settings: TSettings;

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
        key: K,
        value: TSettings[K]
    ): Promise<TSettings[K]> {
        return setSetting(this.getSettingKey(key), value);
    }

    render<T extends Record<string, any>>(
        template: string,
        data?: T & RenderTemplateData
    ): Promise<string> {
        return render(`${this.key}/${template}`, data);
    }

    localizeKey(...path: string[]): string {
        return joinStr(".", this.key, ...path);
    }

    localizePath(...path: string[]): string {
        return localizePath(this.key, ...path);
    }

    localize(...args: LocalizeArgs): string {
        return localize(this.key, ...args);
    }

    localizeIfExist(...args: LocalizeArgs): string | undefined {
        return localizeIfExist(this.key, ...args);
    }

    info(...args: NotificationArgs): number {
        return info(this.key, ...args);
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

    getFlag<T>(doc: Document, ...path: string[]): T | undefined {
        return getFlag(doc, this.key, ...path);
    }

    setFlag<D extends Document, T>(doc: D, ...args: [...string[], T]): Promise<D> {
        return setFlag(doc, this.key, ...args);
    }

    unsetFlag<D extends Document>(doc: D, ...path: string[]): Promise<D> {
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

    updateSourceFlag<T extends Document>(
        doc: T,
        ...args: [...string[], any]
    ): DeepPartial<T["_source"]> {
        return updateSourceFlag(doc, this.key, ...args);
    }

    getDataFlag<T extends foundry.abstract.DataModel, D extends Document>(
        doc: D,
        Model: ConstructorOf<T>,
        ...args: DataFlagArgs<T>
    ): FlagData<T> | undefined {
        return getDataFlag(doc, Model, this.key, ...args);
    }

    getDataFlagArray<T extends foundry.abstract.DataModel, D extends Document>(
        doc: D,
        Model: ConstructorOf<T>,
        ...path: string[]
    ): FlagDataArray<T, D> {
        return getDataFlagArray(doc, Model, this.key, ...path);
    }

    _initialize(isGM: boolean) {
        const settings = {};
        const self = this;

        for (const setting of this.settingsSchema) {
            if (setting.gmOnly && !isGM) continue;

            const key = this.getSettingKey(setting.key);
            this.#settings[key] = getSetting(key);

            Object.defineProperty(settings, setting.key, {
                get() {
                    return self.#settings[key];
                },
                set(value) {
                    setSetting(key, value);
                },
            });
        }

        Object.defineProperty(this, "settings", {
            get() {
                return settings;
            },
        });
    }

    _getToolSettings(): ToolSettingsList<TSettings> {
        return this.settingsSchema.map((setting) => {
            const _onChange = setting.onChange;

            setting.onChange = (value, operation, userId) => {
                this.#settings[setting.key] = value;
                _onChange?.(value, operation, userId);
            };

            return setting;
        });
    }
}

abstract class ModuleToolApplication<TTool extends ModuleTool> extends foundry.applications.api
    .ApplicationV2 {
    #tool: TTool;

    constructor(tool: TTool, options: DeepPartial<ApplicationConfiguration> = {}) {
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
        value: TTool["settings"][K]
    ): Promise<TTool["settings"][K]> {
        return this.tool.setSetting(key, value);
    }

    localizePath(...path: string[]): string {
        return this.tool.localizePath(this.key, ...path);
    }

    localizeKey(...path: string[]): string {
        return this.tool.localizeKey(this.key, ...path);
    }

    localize(...args: LocalizeArgs): string {
        return this.tool.localize(this.key, ...args);
    }

    localizeIfExist(...args: LocalizeArgs): string | undefined {
        return this.tool.localizeIfExist(this.key, ...args);
    }

    info(...args: NotificationArgs): number {
        return this.tool.info(this.key, ...args);
    }

    protected _renderHTML(
        context: ApplicationRenderContext,
        options: ApplicationRenderOptions
    ): Promise<string> {
        return this.tool.render(this.key, context);
    }

    protected _replaceHTML(
        result: string,
        content: HTMLElement,
        options: ApplicationRenderOptions
    ): void {
        content.innerHTML = result;
        this._activateListeners(content);
    }

    protected _activateListeners(html: HTMLElement) {}
}

type ToolSetting<TSettings extends Record<string, any>> = TSettings extends Record<infer K, infer V>
    ? RegisterSettingOptions & { key: K; type: FromPrimitive<V> | DataField }
    : never;

type ToolSettingsList<TSettings extends Record<string, any>> = ReadonlyArray<
    ToolSetting<TSettings>
>;

export { ModuleTool, ModuleToolApplication };
export type { ToolSettingsList };
