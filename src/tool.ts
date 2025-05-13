import { getSetting, RegisterSettingOptions } from "module-helpers";

abstract class ModuleTool<TSettings extends Record<string, string | number | boolean>> {
    abstract get key(): string;
    abstract get settings(): ReadonlyArray<ToolSetting<TSettings>>;

    init(isGM: boolean) {}
    ready(isGM: boolean) {}

    getSetting<K extends keyof TSettings & string>(setting: K): TSettings[K] {
        return getSetting(`${this.key}.${setting}`);
    }
}

type ToolSetting<TSettings extends Record<string, string | number | boolean>> =
    TSettings extends Record<infer K, infer V>
        ? RegisterSettingOptions & { key: K; type: FromPrimitive<V> }
        : never;

export { ModuleTool };
export type { ToolSetting };
