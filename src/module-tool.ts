import {
    error,
    getSetting,
    localize,
    LocalizeArgs,
    NotificationArgs,
    RegisterSettingOptions,
    setSetting,
} from "module-helpers";

abstract class ModuleTool<TSettings extends Record<string, any> = Record<string, any>> {
    declare settings: Readonly<TSettings>;

    abstract get key(): string;
    abstract get settingsSchema(): ToolSettingsList<TSettings>;

    get keybindsSchema(): KeybindingActionConfig[] {
        return [];
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

    localize(...args: LocalizeArgs): string {
        return localize(this.key, ...args);
    }

    error(...args: NotificationArgs): number {
        return error(this.key, ...args);
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
