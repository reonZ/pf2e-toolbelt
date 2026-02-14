import {
    ClientDocument,
    deleteFlagProperty,
    deleteInMemory,
    getFlag,
    getInMemory,
    getSetting,
    HandlebarsRenderData,
    KeybindingActionConfig,
    Localize,
    localize,
    R,
    RegisterSettingOptions,
    render,
    setFlag,
    setFlagProperties,
    setFlagProperty,
    setInMemory,
    setSetting,
    Token,
    unsetFlag,
    unsetFlagProperty,
} from "foundry-helpers";
import DataField = foundry.data.fields.DataField;

abstract class ModuleTool<TSettings extends Record<string, any> = Record<string, any>> {
    #localize?: Localize;
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

    get localize(): Localize {
        return (this.#localize ??= localize.sub(this.key));
    }

    init(isGM: boolean) {}
    setup(isGM: boolean) {}
    ready(isGM: boolean) {}
    _configurate() {}

    /** debounce version of _configurate */
    configurate = foundry.utils.debounce(this._configurate, 1);

    path(...path: string[]) {
        return R.join([this.key, ...path], ".");
    }

    templatePath(...path: string[]) {
        return R.join([this.key, ...path], "/");
    }

    getSettingKey<K extends keyof TSettings & string>(setting: K): string {
        return `${this.key}.${setting}`;
    }

    setSetting<K extends keyof TSettings & string>(key: K, value: TSettings[K]): Promise<TSettings[K]> {
        return setSetting(this.getSettingKey(key), value);
    }

    getFlag<T = boolean>(doc: ClientDocument, ...path: string[]): T | undefined {
        return getFlag(doc, this.key, ...path);
    }

    setFlag<D extends ClientDocument, T>(doc: D, ...args: [...string[], T]): Promise<D> {
        return setFlag(doc, this.key, ...args);
    }

    unsetFlag<D extends ClientDocument>(doc: D, ...path: string[]): Promise<D | undefined> {
        return unsetFlag(doc, this.key, ...path);
    }

    setFlagProperty<T extends object>(obj: T, ...args: [...string[], any]): T {
        return setFlagProperty(obj, this.key, ...args);
    }

    setFlagProperties<T extends object>(obj: T, ...args: [...string[], properties: Record<string, any>]): T {
        return setFlagProperties(obj, this.key, ...args);
    }

    unsetFlagProperty<T extends object>(obj: T, ...path: [string, ...string[]]): T {
        return unsetFlagProperty(obj, this.key, ...path);
    }

    deleteFlagProperty<T extends object>(obj: T, ...path: string[]): T {
        return deleteFlagProperty(obj, this.key, ...path);
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

    render<T extends Record<string, any>>(template: string, data: T & HandlebarsRenderData): Promise<string> {
        return render(`${this.key}/${template}`, data);
    }

    _initialize(isGM: boolean) {
        const settings = {};
        const self = this;

        for (const setting of this.settingsSchema) {
            if (isGM && setting.playerOnly) continue;
            if (!isGM && setting.gmOnly) continue;

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
                if (setting.scope !== "user" || userId === game.userId) {
                    this.#settings[setting.key] = value;
                }

                _onChange?.(value, operation, userId);
            };

            return setting;
        });
    }
}

type ToolSetting<TSettings extends Record<string, any>> =
    TSettings extends Record<infer K, infer V>
        ? RegisterSettingOptions & { key: K; type: FromPrimitive<V> | DataField }
        : never;

type ToolSettingsList<TSettings extends Record<string, any>> = ReadonlyArray<ToolSetting<TSettings>>;

export { ModuleTool };
export type { ToolSettingsList };
