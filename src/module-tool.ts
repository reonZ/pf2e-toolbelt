import { getSetting, RegisterSettingOptions, setSetting } from "module-helpers";

abstract class ModuleTool<TSettings extends Record<string, any> = Record<string, any>> {
    abstract get key(): string;
    abstract get settings(): ReadonlyArray<ToolSetting<TSettings>>;

    get keybinds(): KeybindingActionConfig[] {
        return [];
    }

    init(isGM: boolean) {}
    setup(isGM: boolean) {}
    ready(isGM: boolean) {}

    getSettingKey<K extends keyof TSettings & string>(setting: K): string {
        return `${this.key}.${setting}`;
    }

    getSetting<K extends keyof TSettings & string>(setting: K): TSettings[K] {
        const key = this.getSettingKey(setting);
        return getSetting(key);
    }

    setSetting<K extends keyof TSettings & string>(
        setting: K,
        value: TSettings[K]
    ): Promise<TSettings[K]> {
        const key = this.getSettingKey(setting);
        return setSetting(key, value);
    }
}

type ToolSetting<TSettings extends Record<string, any>> = TSettings extends Record<infer K, infer V>
    ? RegisterSettingOptions & { key: K; type: FromPrimitive<V> }
    : never;

export { ModuleTool };
export type { ToolSetting };
