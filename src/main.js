import {
	MODULE,
	getModule,
	isUserGM,
	localize,
	registerModule,
	registerSetting,
	warn,
} from "module-api";
import { arpOptions } from "./features/arp";
import { debugOptions } from "./features/debug";
import { effectsOptions } from "./features/effects";
import { givethOptions } from "./features/giveth";
import { heroOptions } from "./features/hero";
import { inventoryOptions } from "./features/inventory";
import { knowledgesOptions } from "./features/knowledges";
import { merchantOptions } from "./features/merchant";
import { mergeOptions } from "./features/merge";
import { nobulkOptions } from "./features/nobulk";
import { shareOptions } from "./features/share";
import { stancesOptions } from "./features/stances";
import { summaryOptions } from "./features/summary";
import { targetOptions } from "./features/target";
import { templateOptions } from "./features/template";
import { unidedOptions } from "./features/unided";
import { untargetOptions } from "./features/untarget";
import { permaConditionEffect } from "./macros/condition";
import { checkFeatureOptions } from "./tool";

registerModule("pf2e-toolbelt");

const FEATURES = new Collection(
	[
		arpOptions,
		debugOptions,
		effectsOptions,
		givethOptions,
		heroOptions,
		inventoryOptions,
		knowledgesOptions,
		merchantOptions,
		mergeOptions,
		nobulkOptions,
		shareOptions,
		stancesOptions,
		summaryOptions,
		targetOptions,
		templateOptions,
		unidedOptions,
		untargetOptions,
	].map((feature) => {
		checkFeatureOptions(feature);
		return [feature.name, feature];
	}),
);

const CONFLICTS = new Set();

let firstClientSetting = null;

Hooks.once("init", () => {
	const isGM = isUserGM();

	// biome-ignore lint/complexity/useFlatMap: Collection doesn't have flatMap
	const settings = FEATURES.map(({ settings }) => settings).flat();
	const worldSettings = settings.filter(
		({ scope }) => !scope || scope === "world",
	);
	const clientSettings = settings.filter(({ scope }) => scope === "client");

	for (const setting of [worldSettings, clientSettings].flat()) {
		registerSetting(setting);
	}

	if (isGM && clientSettings.length) {
		const first = clientSettings.find((x) => x.config !== false);
		if (first) {
			firstClientSetting = first.key;
			Hooks.on("renderSettingsConfig", renderSettingsConfig);
		}
	}

	const module = getModule();
	module.api = {
		macros: {
			permaConditionEffect,
		},
	};

	for (const feature of FEATURES) {
		const { init, conflicts = [], api, name } = feature;

		if (isGM) {
			for (const id of conflicts) {
				const conflictingModule = game.modules.get(id);
				if (conflictingModule?.active) {
					feature.conflicting = true;
					CONFLICTS.add(conflictingModule.title);
				}
			}
		}

		if (api) {
			if (!name) {
				throw new Error("API needs a module name to be added");
			}
			module.api[name] = api;
		}

		if (!feature.conflicting && init) init(isGM);
	}
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
	if (firstClientSetting) {
		const id = MODULE.id;
		const group = html.find(
			`.tab[data-tab=${id}] [data-setting-id="${id}.${firstClientSetting}"]`,
		);
		group.before(`<h3>${localize("settings.client")}</h3>`);
	}
}
