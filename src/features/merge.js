import {
	MODULE,
	compareArrays,
	getDamageRollClass,
	getFlag,
	getSetting,
	latestChatMessages,
	localize,
	render,
	warn,
} from "module-api";
import { MultiCast } from "../apps/merge/multi";
import { createHook } from "../misc";

const setHook = createHook("renderChatMessage", renderChatMessage);

const setupDebounced = debounce(setup, 1);

export function registerMerge() {
	return {
		settings: [
			{
				key: "merge-damage",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: setupDebounced,
			},
			{
				key: "multi-cast",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: setupDebounced,
			},
		],
		init: setupDebounced,
	};
}

function setup() {
	const enabled = getSetting("merge-damage") || getSetting("multi-cast");
	setHook(enabled);
	updateMessages();
}

function updateMessages() {
	for (const { message, html } of latestChatMessages(10)) {
		html.find("[data-action=multi-cast]").remove();
		html.find("[data-action=merge-damage]").remove();
		renderChatMessage(message, html);
	}
}

function renderChatMessage(message, html) {
	if (!game.user.isGM && !message.isAuthor) return;

	if (getSetting("merge-damage") && isDamageRoll(message))
		renderDamage(message, html);
	else if (
		getSetting("multi-cast") &&
		message.getFlag("pf2e", "origin.type") === "spell"
	)
		renderSpell(message, html);
}

function renderSpell(message, html) {
	const item = message.item;
	if (!item) return;

	const spellBtn = html.find(
		".message-content .chat-card .owner-buttons .spell-button",
	);

	spellBtn
		.find("[data-action=spell-damage]")
		.after(
			`<button data-action="multi-cast">${localize(
				"merge.spell.button",
			)}</button>`,
		);

	spellBtn.find("[data-action=multi-cast]").on("click", (event) => {
		new MultiCast(event, message).render(true);
	});
}

function renderDamage(message, html) {
	let buttons = '<span class="pf2e-toolbelt-merge">';

	if (getFlag(message, "merge.merged")) {
		const tooltip = localize("merge.damage.split-tooltip");
		buttons += `<button data-action="split-damage" title="${tooltip}">`;
		buttons += '<i class="fa-duotone fa-split"></i>';
	}

	const tooltip = localize("merge.damage.tooltip");
	buttons += `<button data-action="merge-damage" title="${tooltip}">`;
	buttons += '<i class="fa-duotone fa-merge"></i></button>';

	buttons += "</span>";

	const actorUUID = getActorUUID(message);
	const targetUUIDs = getTargetUUIDs(message);

	html.find(".dice-result .dice-total").append(buttons);
	html
		.find(".pf2e-toolbelt-merge [data-action=merge-damage]")
		.on("click", (event) => {
			event.stopPropagation();

			for (const { message: otherMessage } of latestChatMessages(5, message)) {
				const otherTargetsUUIDS = getTargetUUIDs(otherMessage);

				if (
					!isDamageRoll(otherMessage) ||
					getActorUUID(otherMessage) !== actorUUID ||
					!compareArrays(
						targetUUIDs?.map((t) => t.actor).filter(Boolean),
						otherTargetsUUIDS?.map((t) => t.actor).filter(Boolean),
					)
				)
					continue;

				mergeDamages(event, message, otherMessage, { actorUUID, targetUUIDs });
				return;
			}

			warn("merge.damage.none");
		});

	html
		.find(".pf2e-toolbelt-merge [data-action=split-damage]")
		.on("click", (event) => {
			event.stopPropagation();
			splitDamages(event, message);
		});
}

async function splitDamages(event, message) {
	const sources = getFlag(message, "merge.data").flatMap((data) => data.source);
	await removeChatMessages(message.id);
	await ChatMessage.implementation.createDocuments(sources);
}

async function mergeDamages(event, origin, other, { actorUUID, targetUUIDs }) {
	const dataGroups = {};

	const data = getMessageData(other).concat(getMessageData(origin));
	for (const { name, notes, outcome, modifiers, tags } of data) {
		dataGroups[name] ??= {
			name,
			tags,
			notes: new Set(),
			results: [],
		};

		for (const note of notes) {
			dataGroups[name].notes.add(note);
		}

		const exists = dataGroups[name].results.some(
			(result) =>
				result.outcome === outcome &&
				compareArrays(result.modifiers, modifiers),
		);

		if (!exists) dataGroups[name].results.push({ outcome, modifiers });
	}

	const groups = Object.values(dataGroups).map((group) => {
		group.label = group.name;

		for (const result of group.results) {
			if (!result.outcome) continue;
			result.label = game.i18n.localize(
				`PF2E.Check.Result.Degree.Attack.${result.outcome}`,
			);
		}

		return group;
	});

	groups.at(-1).isLastGroup = true;

	const flavor = await render("merge/merged", {
		groups,
		hasMultipleGroups: groups.length > 1,
	});

	const originRolls = getMessageRolls(origin);
	const otherRolls = getMessageRolls(other);
	const groupedRolls = [];

	for (const roll of [].concat(otherRolls, originRolls)) {
		const { options, total, terms } = roll;
		const term = terms[0];
		const formula = roll.formula
			.replaceAll(/(\[[\w,-]+\])/g, "")
			.replace(/^\(/, "")
			.replace(/\)$/, "");
		const group = groupedRolls.find(
			({ options: { flavor, critRule } }) =>
				flavor === options.flavor && critRule === options.critRule,
		);

		if (group) {
			group.terms.push(term);
			group.total += total;
			group.formulas.push(formula);
		} else {
			groupedRolls.push({
				options,
				formulas: [formula],
				total,
				terms: [term],
			});
		}
	}

	const DamageRoll = getDamageRollClass();
	for (const group of groupedRolls) {
		if (group.options.flavor.includes("persistent")) {
			const { index } = group.formulas.reduce(
				(prev, curr, index) => {
					const value = new DamageRoll(curr).expectedValue;
					if (value <= prev.value) return prev;
					return { value, index };
				},
				{ value: 0, index: -1 },
			);

			group.formulas = [group.formulas[index]];
			group.terms = [group.terms[index]];
		}

		group.formula = `(${group.formulas.join(" + ")})[${group.options.flavor}]`;
		group.term =
			group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms);
	}

	const roll = {
		class: "DamageRoll",
		options: {},
		dice: [],
		formula: `{${groupedRolls.map(({ formula }) => formula).join(", ")}}`,
		total: groupedRolls.reduce((acc, { total }) => acc + total, 0),
		evaluated: true,
		terms: [
			{
				class: "InstancePool",
				options: {},
				evaluated: true,
				terms: groupedRolls.map(({ formula }) => formula),
				modifiers: [],
				rolls: groupedRolls.map(({ options, formula, total, term }) => ({
					class: "DamageInstance",
					options,
					dice: [],
					formula,
					total,
					terms: [term],
					evaluated: true,
				})),
				results: groupedRolls.map(({ total }) => ({
					result: total,
					active: true,
				})),
			},
		],
	};

	if (game.modules.get("dice-so-nice")?.active) {
		const setHidden = (term) => {
			if ("results" in term) {
				for (const result of term.results) {
					result.hidden = true;
				}
			} else {
				const operands = (term.term ?? term).operands ?? [];
				for (const operand of operands) {
					setHidden(operand);
				}
			}
		};

		for (const r of roll.terms[0].rolls) {
			for (const term of r.terms) {
				setHidden(term);
			}
		}
	}

	await removeChatMessages(origin.id, other.id);

	await ChatMessage.implementation.create({
		flavor,
		type: CONST.CHAT_MESSAGE_TYPES.ROLL,
		speaker: origin.speaker,
		flags: {
			[MODULE.id]: {
				merge: {
					actor: actorUUID,
					targets: targetUUIDs,
					merged: true,
					type: "damage-roll",
					data,
				},
				target: {
					targets: targetUUIDs,
				},
			},
			pf2e: {
				context: {
					options: Array.from(
						new Set(data.flatMap((entry) => entry.itemTraits)),
					),
				},
			},
		},
		rolls: [roll],
	});
}

function getMessageData(message) {
	const flags = getFlag(message, "merge.data");
	if (flags) return flags;

	const source = message.toObject();
	// biome-ignore lint/performance/noDelete: <explanation>
	delete source._id;
	// biome-ignore lint/performance/noDelete: <explanation>
	delete source.timestamp;

	const html = $(`<div>${message.flavor}</div>`);
	const tags = html.find("h4.action + .tags").prop("outerHTML");

	const modifiers = [];
	html.find(".tag.tag_transparent").each(function () {
		modifiers.push(this.innerHTML);
	});

	const notes = source.flags.pf2e.context.notes.map(
		({ title, text }) =>
			`<strong>${game.i18n.localize(title)}</strong> ${game.i18n.localize(
				text,
			)}`,
	);

	return [
		{
			source,
			name: source.flags.pf2e.strike?.name ?? message.item.name,
			outcome: source.flags.pf2e.context.outcome,
			itemTraits: source.flags.pf2e.context.options.filter((option) =>
				/^(item|self):/.test(option),
			),
			modifiers,
			tags,
			notes,
		},
	];
}

function removeChatMessages(...ids) {
	const joinedIds = ids.map((id) => `[data-message-id=${id}]`).join(", ");
	ui.chat.element.find(joinedIds).remove();
	return ChatMessage.deleteDocuments(ids);
}

function createTermGroup(terms) {
	const options = deepClone(terms[0].options);

	for (const term of terms) {
		term.options = {};
	}

	return {
		class: "Grouping",
		options,
		evaluated: true,
		term: {
			class: "ArithmeticExpression",
			options: {},
			evaluated: true,
			operator: "+",
			operands: [
				terms.shift(),
				terms.length > 1 ? createTermGroup(terms) : terms[0],
			],
		},
	};
}

function getMessageRolls(message) {
	return (
		getFlag(message, "merge.rolls") ??
		JSON.parse(message._source.rolls[0]).terms[0].rolls
	);
}

function getActorUUID(message) {
	return getFlag(message, "merge.actor") ?? message.actor?.uuid;
}

function getTargetUUIDs(message) {
	const targetTargets = getFlag(message, "target.targets");
	if (targetTargets) return targetTargets;

	const mergeTargets =
		getFlag(message, "merge.targets") ?? message.getFlag("pf2e", "target");
	if (Array.isArray(mergeTargets)) return mergeTargets;
	return mergeTargets ? [mergeTargets] : [];
}

function isDamageRoll(message) {
	return (
		getFlag(message, "merge.type") === "damage-roll" ||
		message.getFlag("pf2e", "context.type") === "damage-roll"
	);
}
