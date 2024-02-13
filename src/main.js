import {
	MODULE,
	getModule,
	isUserGM,
	localize,
	registerModule,
	registerSetting,
	socketOn,
	warn,
} from "module-api";
import { registerArp } from "./features/arp";
import { registerDebug } from "./features/debug";
import { registerEffectsPanelHelper } from "./features/effects";
import { registerGiveth } from "./features/giveth";
import { registerHeroActions } from "./features/hero";
import { registerInventory } from "./features/inventory";
import { registerKnowledges } from "./features/knowledges";
import { registerMerchant } from "./features/merchant";
import { registerMerge } from "./features/merge";
import { registerNobulk } from "./features/nobulk";
import { registerShare } from "./features/share";
import { registerStances } from "./features/stances";
import { registerSpellsSummary } from "./features/summary";
import { registerTargetTokenHelper } from "./features/target";
import { registerUnided } from "./features/unided";
import { registerUntarget } from "./features/untarget";
import { permaConditionEffect } from "./macros/condition";
import { onSocket } from "./socket";

registerModule("pf2e-toolbelt");

const FEATURES = [
	registerArp(),
	registerNobulk(),
	registerTargetTokenHelper(),
	registerGiveth(),
	registerKnowledges(),
	registerUnided(),
	registerMerge(),
	registerEffectsPanelHelper(),
	registerSpellsSummary(),
	registerStances(),
	registerHeroActions(),
	registerShare(),
	registerUntarget(),
	registerInventory(),
	registerDebug(),
	registerMerchant(),
];

const CONFLICTS = new Set();

let firstClientSetting = null;

Hooks.once("init", () => {
	const isGM = isUserGM();

	const settings = FEATURES.flatMap(({ settings }) => settings ?? []);
	const worldSettings = settings.filter(
		({ scope }) => !scope || scope === "world",
	);
	const clientSettings = settings.filter(({ scope }) => scope === "client");

	for (const setting of [worldSettings, clientSettings].flat()) {
		registerSetting(setting);
	}

	if (isGM) {
		firstClientSetting = clientSettings[0].key;
		Hooks.on("renderSettingsConfig", renderSettingsConfig);
	}

	const module = getModule();
	module.api = {
		macros: {
			permaConditionEffect,
		},
	};

	for (const feature of FEATURES) {
		const { init, conflicts = [], api, name, socket } = feature;

		if (isGM) {
			for (const id of conflicts) {
				const conflictingModule = game.modules.get(id);
				if (conflictingModule?.active) {
					feature.conflicting = true;
					CONFLICTS.add(conflictingModule.title);
				}
			}
		}

		if (api && name) module.api[name] = api;

		if (!feature.conflicting && init) init(isGM);
	}

	socketOn(onSocket);
});

Hooks.once("ready", () => {
	const isGM = game.user.isGM;

	for (const { conflicting, ready } of FEATURES) {
		if (!conflicting && ready) ready(isGM);
	}

	if (isGM) {
		for (const conflict of CONFLICTS) {
			warn("module-conflict", { name: conflict }, true);
		}
	}
});

function renderSettingsConfig(_, html) {
	if (!firstClientSetting) return;

	const id = MODULE.id;
	const group = html.find(
		`.tab[data-tab=${id}] [data-setting-id="${id}.${firstClientSetting}"]`,
	);

	group.before(`<h3>${localize("settings.client")}</h3>`);
}
