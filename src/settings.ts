import {
    MODULE,
    addExtraInfoToSettingLabel,
    createHTMLElement,
    elementDataset,
    htmlQuery,
    localize,
    registerSetting,
} from "module-helpers";
import { ToolConfig } from "./tool";

const firstSettings: { tool: string; key: string }[] = [];

function onRenderSettingsConfig(app: SettingsConfig, $html: JQuery) {
    const html = $html[0];
    const tab = htmlQuery(html, `.tab[data-tab="${MODULE.id}"]`);
    if (!tab) return;

    for (const { tool, key } of firstSettings) {
        const group = tab.querySelector(`[data-setting-id="${MODULE.id}.${key}"]`);

        if (group) {
            const titleElement = createHTMLElement("h3", {
                innerHTML: localize("settings", tool, "title"),
            });
            group.before(titleElement);
        }
    }

    const groups = tab.querySelectorAll<HTMLElement>("[data-setting-id]");

    for (const group of groups) {
        const { settingId } = elementDataset(group);
        const setting = game.settings.settings.get(settingId);

        addExtraInfoToSettingLabel(setting, group);
    }
}

function registerToolsSettings(tools: ToolConfig[], isGM: boolean) {
    for (const { name, settings } of tools) {
        for (const setting of settings) {
            setting.key = `${name}.${setting.key}`;
            registerSetting(setting);
        }

        const firstSetting = isGM
            ? settings.find((setting) => setting.config !== false)
            : settings.find((setting) => setting.scope === "client" && setting.config !== false);

        if (firstSetting) {
            firstSettings.push({
                tool: name,
                key: firstSetting.key,
            });
        }
    }
}

export { onRenderSettingsConfig, registerToolsSettings };
