import {
    MODULE,
    beforeHTMLFromString,
    elementData,
    htmlElement,
    localize,
    querySelector,
    registerSetting,
} from "pf2e-api";
import { ToolConfig } from "./tool";

const firstSettings: { tool: string; key: string }[] = [];

function onRenderSettingsConfig(app: SettingsConfig, $html: JQuery) {
    const html = htmlElement($html);
    const tab = querySelector(html, `.tab[data-tab="${MODULE.id}"]`);
    if (!tab) return;

    for (const { tool, key } of firstSettings) {
        const group = tab.querySelector(`[data-setting-id="${MODULE.id}.${key}"]`);

        if (group) {
            const title = localize("settings", tool, "title");
            beforeHTMLFromString(group, `<h3>${title}</h3>`);
        }
    }

    const groups = tab.querySelectorAll<HTMLElement>("[data-setting-id]");

    for (const group of groups) {
        const { settingId } = elementData(group);
        const setting = game.settings.settings.get(settingId)!;

        if (setting.requiresReload) {
            const label = querySelector(group, "label")!;
            label.textContent = `${label.textContent} ${localize("settings.requiresReload")}`;
        }
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
