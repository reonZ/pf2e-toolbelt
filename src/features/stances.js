import {
	getItemWithSourceId,
	hasItemWithSourceId,
	info,
	isOwner,
	refreshActorSheets,
	render,
	subLocalize,
} from "module-api";
import { isPlayedActor } from "../actor-sheet";
import { calledIfSetting } from "../misc";
import { createTool } from "../tool";

const STANCE_SAVANT = [
	"Compendium.pf2e.feats-srd.Item.yeSyGnYDkl2GUNmu",
	"Compendium.pf2e.feats-srd.Item.LI9VtCaL5ZRk0Wo8",
];

const REPLACERS = new Map([
	[
		"Compendium.pf2e.feats-srd.Item.nRjyyDulHnP5OewA", // gorilla pound

		{
			replace: "Compendium.pf2e.feats-srd.Item.DqD7htz8Sd1dh3BT", // gorilla stance
			effect: "Compendium.pf2e.feat-effects.Item.UZKIKLuwpQu47feK",
		},
	],
]);

const EXTRAS = new Map([
	[
		"Compendium.pf2e.classfeatures.Item.09iL38CZZEa0q0Mt", // arcane cascade
		{
			effect: "Compendium.pf2e.feat-effects.Item.fsjO5oTKttsbpaKl",
			action: "Compendium.pf2e.actionspf2e.Item.HbejhIywqIufrmVM",
		},
	],
	[
		"Compendium.pf2e.feats-srd.Item.xQuNswWB3eg1UM28", // cobra envenom
		{
			effect: "Compendium.pf2e.feat-effects.Item.2Qpt0CHuOMeL48rN",
		},
	],
	[
		"Compendium.pf2e.feats-srd.Item.R7c4PyTNkZb0yvoT", // dread marshal
		{
			effect: "Compendium.pf2e.feat-effects.Item.qX62wJzDYtNxDbFv", // the stance aura
		},
	],
	[
		"Compendium.pf2e.feats-srd.Item.bvOsJNeI0ewvQsFa", // inspiring marshal
		{
			effect: "Compendium.pf2e.feat-effects.Item.er5tvDNvpbcnlbHQ", // the stance aura
		},
	],
]);

export const stancesOptions = {
	name: "stances",
	settings: [
		{
			key: "stances",
			type: Boolean,
			default: false,
			scope: "client",
			onChange: (value) => setup(value),
		},
	],
	hooks: [
		["deleteCombat", deleteCombat],
		["deleteCombatant", deleteCombatant],
		["createCombatant", createCombatant],
		["renderCharacterSheetPF2e", renderCharacterSheetPF2e],
	],
	conflicts: ["pf2e-stances"],
	api: {
		getStances,
		toggleStance,
		isValidStance,
	},
	ready: calledIfSetting(setup, "stances"),
};

const { hooks } = createTool(stancesOptions);

function setup(value) {
	hooks.setAll(value);
	refreshActorSheets("character");
}

function isValidStance(stance) {
	return (
		stance?.system.traits.value.includes("stance") &&
		stance.system.selfEffect?.uuid
	);
}

function getStances(actor) {
	const stances = [];
	const replaced = new Set();

	for (const {
		replace,
		sourceId,
		effectUUID,
		effect,
		img,
		name,
		itemName,
		action,
	} of actorStances(actor)) {
		if (replace) replaced.add(replace);

		const foundAction = action
			? getItemWithSourceId(actor, action, "action")
			: getItemWithSourceId(actor, sourceId, "feat");

		stances.push({
			name,
			itemName,
			uuid: sourceId,
			img,
			effectUUID,
			effectID: effect?.id,
			actionUUID: foundAction.sourceId,
			actionID: foundAction.id,
		});
	}

	return stances.filter(({ uuid }) => !replaced.has(uuid));
}

async function renderCharacterSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!isPlayedActor(actor)) return;

	const stances = getStances(actor);
	if (!stances.length) return;

	const inCombat = actor
		.getActiveTokens(true, true)
		.some((token) => token.inCombat);
	const tab = html.find(
		".sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter]",
	);
	const options = tab.find(".actions-options");
	const template = await render("stances/sheet", {
		stances,
		canUseStances: inCombat && !actor.isDead,
		i18n: subLocalize("stances"),
	});

	if (options.length) options.after(template);
	else tab.prepend(template);

	html
		.find(
			".sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter] .pf2e-stances .pf2e-stances__stance",
		)
		.on("click", (event) => onToggleStance(event, actor));
}

function onToggleStance(event, actor) {
	const target = event.currentTarget;
	const canUseStances = target
		.closest(".pf2e-stances")
		?.classList.contains("can-use-stances");
	if (!event.ctrlKey && !canUseStances) return;

	const effectUUID = target.dataset.effectUuid;
	toggleStance(actor, effectUUID);
}

function* actorStances(actor) {
	for (const feat of actor.itemTypes.feat) {
		const sourceId = feat.sourceId;

		const replacer = REPLACERS.get(sourceId);
		const extra = EXTRAS.get(sourceId);
		if (!replacer && !extra && !isValidStance(feat)) continue;

		const effectUUID =
			replacer?.effect ?? extra?.effect ?? feat.system.selfEffect.uuid;
		const effect = fromUuidSync(effectUUID);
		if (!effect) continue;

		yield {
			name: (replacer && fromUuidSync(replacer.replace)?.name) ?? feat.name,
			itemName: feat.name,
			replace: replacer?.replace,
			extra,
			sourceId,
			effectUUID,
			effect: getItemWithSourceId(actor, effectUUID, "effect"),
			action: extra?.action,
			img: effect.img,
		};
	}
}

function getStancesEffects(actor) {
	const effects = [];

	for (const { effect } of actorStances(actor)) {
		if (!effect) continue;
		effects.push({
			uuid: effect.sourceId,
			id: effect.id,
		});
	}

	return effects;
}

async function toggleStance(actor, effectUUID) {
	const effects = getStancesEffects(actor);
	const already = effects.findIndex((effect) => effect.uuid === effectUUID);

	let create = false;

	if (already === -1) {
		create = true;
	} else {
		const other = effects.filter((effect) => effect.uuid !== effectUUID).length;
		const more =
			effects.filter((effect) => effect.uuid === effectUUID).length > 1;
		if (other || more) effects.splice(already, 1);
	}

	if (effects.length) {
		await actor.deleteEmbeddedDocuments(
			"Item",
			effects.map((x) => x.id),
		);
	}

	if (create) addStance(actor, effectUUID);
}

async function addStance(actor, uuid) {
	const effect = await fromUuid(uuid);

	if (effect) {
		const obj = effect.toObject();
		if (!getProperty(obj, "flags.core.sourceId"))
			setProperty(obj, "flags.core.sourceId", effect.uuid);

		const items = await actor.createEmbeddedDocuments("Item", [obj]);
		items[0]?.toMessage();

		return true;
	}

	return false;
}

function deleteCombat(combat) {
	for (const combatant of combat.combatants) {
		deleteCombatant(combatant);
	}
}

function deleteCombatant(combatant) {
	const actor = getActorFromCombatant(combatant);
	if (!actor) return;

	if (!game.user.isGM && isOwner(actor)) {
		const effects = getStancesEffects(actor).map((effect) => effect.id);
		if (effects.length) actor.deleteEmbeddedDocuments("Item", effects);
	}

	actor.sheet.render();
}

function createCombatant(combatant) {
	const actor = getActorFromCombatant(combatant);
	if (!actor) return;

	if (!game.user.isGM && isOwner(actor)) checkForSavant(actor);

	actor.sheet.render();
}

function getActorFromCombatant(combatant) {
	const actor = combatant.actor;
	if (actor && !actor.isToken && actor.isOfType("character")) return actor;
}

async function checkForSavant(actor) {
	const stances = getStances(actor);
	if (!stances.length) return;

	const hasStancesEffects = stances.filter(({ effectID }) => effectID).length;
	if (hasStancesEffects) return;

	const hasSavantFeat = hasItemWithSourceId(actor, STANCE_SAVANT, ["feat"]);
	if (!hasSavantFeat) return;

	if (stances.length === 1) {
		const stance = stances[0];
		if (await addStance(actor, stance.effectUUID))
			info("stances.useStance", { stance: stance.name });
	} else {
		openStancesMenu(actor, stances);
	}
}

async function openStancesMenu(actor, stances) {
	const localize = subLocalize("stances.menu");

	new Dialog({
		title: localize("title"),
		content: await render("stances/menu", {
			stances,
			i18n: localize.template,
		}),
		buttons: {
			yes: {
				icon: '<i class="fa-solid fa-people-arrows"></i>',
				label: localize("accept"),
				callback: (html) =>
					addStance(actor, html.find("[name=stance]:checked").val()),
			},
			no: {
				icon: '<i class="fa-solid fa-xmark"></i>',
				label: localize("cancel"),
			},
		},
	}).render(true);
}
