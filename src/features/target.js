import { bindOnPreCreateSpellDamageChatMessage } from "../shared/chat";
import { roll3dDice } from "../shared/dicesonice";
import {
	getFlag,
	moduleFlagUpdate,
	setFlag,
	updateSourceFlag,
} from "../shared/flags";
import { createChoicesHook, createHook } from "../shared/hook";
import { localize, subLocalize } from "../shared/localize";
import { getInMemory, setInMemory } from "../shared/misc";
import { warn } from "../shared/notification";
import { templatePath } from "../shared/path";
import {
	applyDamageFromMessage,
	onClickShieldBlock,
} from "../shared/pf2e/chat";
import { DegreeOfSuccess } from "../shared/pf2e/success";
import { choiceSettingIsEnabled, getSetting } from "../shared/settings";
import { socketEmit, socketOff, socketOn } from "../shared/socket";
import { getTemplateTokens } from "../shared/template";
import { isActiveGM, isUserGM } from "../shared/user";

const SAVES = {
	fortitude: { icon: "fa-solid fa-chess-rook", label: "PF2E.SavesFortitude" },
	reflex: { icon: "fa-solid fa-person-running", label: "PF2E.SavesReflex" },
	will: { icon: "fa-solid fa-brain", label: "PF2E.SavesWill" },
};

const REROLL = {
	hero: {
		icon: "fa-solid fa-hospital-symbol",
		reroll: "PF2E.RerollMenu.HeroPoint",
		rerolled: "PF2E.RerollMenu.MessageHeroPoint",
	},
	new: {
		icon: "fa-solid fa-dice",
		reroll: "PF2E.RerollMenu.KeepNew",
		rerolled: "PF2E.RerollMenu.MessageKeep.new",
	},
	lower: {
		icon: "fa-solid fa-dice-one",
		reroll: "PF2E.RerollMenu.KeepLower",
		rerolled: "PF2E.RerollMenu.MessageKeep.lower",
	},
	higher: {
		icon: "fa-solid fa-dice-six",
		reroll: "PF2E.RerollMenu.KeepHigher",
		rerolled: "PF2E.RerollMenu.MessageKeep.higher",
	},
};

const DEGREE_OF_SUCCESS = [
	"criticalFailure",
	"failure",
	"success",
	"criticalSuccess",
];

const setPrecreateMessageHook = createHook(
	"preCreateChatMessage",
	preCreateChatMessage,
);
const setRenderMessageHook = createChoicesHook(
	"renderChatMessage",
	renderChatMessage,
);
const setCreateTemplateHook = createHook(
	"createMeasuredTemplate",
	createMeasuredTemplate,
);

let SOCKET = false;

export function registerTargetTokenHelper() {
	return {
		settings: [
			{
				name: "target",
				type: Boolean,
				default: false,
				onChange: setHooks,
			},
			{
				name: "target-client",
				type: String,
				default: "disabled",
				choices: ["disabled", "small", "big"],
				scope: "client",
				onChange: (value) =>
					setRenderMessageHook(value && getSetting("target")),
			},
			{
				name: "target-template",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: (value) =>
					setCreateTemplateHook(value && getSetting("target")),
			},
		],
		conflicts: [],
		init: () => {
			if (getSetting("target")) setHooks(true);
		},
	};
}

function setHooks(value) {
	setPrecreateMessageHook(value);
	setRenderMessageHook(value);
	setCreateTemplateHook(value && getSetting("target-template"));

	if (isUserGM()) {
		if (value && !SOCKET) {
			socketOn(onSocket);
			SOCKET = true;
		} else if (!value && SOCKET) {
			socketOff(onSocket);
			SOCKET = false;
		}
	}
}

function onSocket(packet) {
	if (!isActiveGM()) return;
	switch (packet.type) {
		case "target.update-save":
			updateMessageSave(packet);
			break;
		case "target.update-applied":
			updateMessageApplied(packet);
			break;
	}
}

async function createMeasuredTemplate(template, _, userId) {
	const user = game.user;
	if (user.id !== userId) return;

	const localize = subLocalize("target.menu");
	const item = template.item;
	const actor = item?.actor;
	const self = !actor ? undefined : actor.token ?? actor.getActiveTokens()[0];

	const data = {
		title: item?.name || localize("title"),
		content: await renderTemplate(templatePath("target/template-menu"), {
			i18n: localize,
			noSelf: !self,
		}),
		buttons: {
			select: {
				icon: '<i class="fa-solid fa-bullseye-arrow"></i>',
				label: localize("target"),
				callback: (html) => ({
					targets: html.find("[name=targets]:checked").val(),
					self: html.find("[name=self]").prop("checked"),
					neutral: html.find("[name=neutral]").prop("checked"),
				}),
			},
		},
		close: () => null,
	};

	const result = await Dialog.wait(data, undefined, {
		id: "pf2e-toolbelt-target-template",
		width: 260,
	});
	if (!result) return;

	const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
	const opposition =
		alliance === "party"
			? "opposition"
			: alliance === "opposition"
			  ? "party"
			  : null;

	const tokens = getTemplateTokens(template);
	const targets = tokens.filter((token) => {
		const validActor = token.actor?.isOfType("creature", "hazard", "vehicle");
		if (!validActor) return false;

		if (token.document.hidden) return false;

		if (self && token === self) return result.self;

		const targetAlliance = token.actor ? token.actor.alliance : token.alliance;

		if (targetAlliance === null) return result.neutral;

		return (
			result.targets === "all" ||
			(result.targets === "allies" && targetAlliance === alliance) ||
			(result.targets === "enemies" && targetAlliance === opposition)
		);
	});

	const targetsIds = targets.map((token) => token.id);
	user.updateTokenTargets(targetsIds);
	user.broadcastActivity({ targets: targetsIds });
}

let HEALINGS_REGEX;
function isRegenMessage(message) {
	HEALINGS_REGEX ??= (() => {
		const healings = [
			game.i18n.localize(
				"PF2E.Encounter.Broadcast.FastHealing.fast-healing.ReceivedMessage",
			),
			game.i18n.localize(
				"PF2E.Encounter.Broadcast.FastHealing.regeneration.ReceivedMessage",
			),
		];
		return new RegExp(`^<div>(${healings.join("|")})</div>`);
	})();
	return HEALINGS_REGEX.test(message.flavor);
}

function isValidDamageMessage(message) {
	return !message.rolls[0].options.evaluatePersistent;
}

function preCreateChatMessage(message) {
	const isDamageRoll = message.isDamageRoll;
	const updates = [];

	if (isDamageRoll && !isValidDamageMessage(message)) return;

	if (isDamageRoll && !getFlag(message, "target")) {
		const token = message.token;
		const actor = token?.actor;
		const isRegen = isRegenMessage(message);

		const targets = isRegen
			? actor
				? [{ token: token.uuid, actor: actor.uuid }]
				: []
			: Array.from(
					game.user.targets.map((target) => ({
						token: target.document.uuid,
						actor: target.actor.uuid,
					})),
			  );

		updates.push(["targets", targets]);
		if (isRegen) updates.push(["isRegen", true]);

		if (message.rolls.length === 2) {
			const rolls = message.rolls.filter((roll) => roll.options);
			const splashRollIndex = rolls.findIndex(
				(roll) => roll.options.splashOnly,
			);
			const regularRollIndex = rolls.findIndex(
				(roll) =>
					!roll.options.splashOnly &&
					roll.options.damage?.modifiers.some(
						(modifier) => modifier.damageCategory === "splash",
					),
			);

			if (splashRollIndex !== -1 && regularRollIndex !== -1) {
				updates.push(["splashIndex", splashRollIndex]);
			}
		}
	}

	if (
		isDamageRoll ||
		message.getFlag("pf2e", "context.type") === "spell-cast"
	) {
		const item = message.item;
		const save = item && item.type === "spell" && item.system.defense?.save;
		if (save) {
			const dc = (() => {
				if (!item.trickMagicEntry) return item.spellcasting?.statistic.dc.value;
				return $(message.content).find("[data-action=spell-save]").data()?.dc;
			})();
			if (typeof dc === "number") updates.push(["save", { ...save, dc }]);
		}
	}

	if (!updates.length) return;

	updateSourceFlag(
		message,
		"target",
		updates.reduce((acc, [key, value]) => {
			acc[key] = value;
			return acc;
		}, {}),
	);
}

async function renderChatMessage(message, html) {
	const clientEnabled = choiceSettingIsEnabled("target-client");

	if (clientEnabled && message.isDamageRoll) {
		if (!isValidDamageMessage(message)) return;
		await renderDamageChatMessage(message, html);
		refreshMessage(message);
		return;
	}

	const item = message.item;
	if (!item || item.type !== "spell") return;

	if (clientEnabled && !item.damageKinds.size) {
		await renderSpellChatMessage(message, html, item);
		refreshMessage(message);
		return;
	}

	if (item.trickMagicEntry && item.system.defense?.save) {
		html.find("[data-action=spell-damage]").on("click", () => {
			bindOnPreCreateSpellDamageChatMessage(message);
		});
	}
}

function refreshMessage(message) {
	Promise.all(
		[ui.chat, ui.chat._popout].map(async (chat) => {
			const el = chat?.element[0]?.querySelector("#chat-log");
			if (!el || (!chat.isAtBottom && message.user._id !== game.user._id))
				return;

			await chat._waitForImages();
			el.scrollTop = el.scrollHeight;
		}),
	);

	for (const app of Object.values(message.apps)) {
		if (!(app instanceof ChatPopout)) continue;
		if (!app.rendered) continue;

		app.setPosition();
	}
}

async function renderSpellChatMessage(message, html, spell) {
	const data = await getMessageData(message);
	if (!data) return;

	const { targets, save } = data;
	const msgContent = html.find(".message-content");
	const cardBtns = msgContent.find(".card-buttons");

	if (game.user.isGM || message.isAuthor) {
		const saveBtn = cardBtns.find("[data-action=spell-save]");
		const wrapper = $('<div class="pf2e-toolbelt-target-wrapper"></div>');
		const targetsTooltip = localize("target.chat.targets.tooltip");

		const targetsBtn =
			$(`<button class="pf2e-toolbelt-target-targets" title="${targetsTooltip}">
    <i class="fa-solid fa-bullseye-arrow"></i>
</button>`);

		targetsBtn.on("click", (event) => addTargets(event, message));

		wrapper.append(targetsBtn);
		wrapper.append(saveBtn);
		cardBtns.prepend(wrapper);
	}

	if (spell?.area && !spell.traits.has("aura")) {
		const template = canvas.scene?.templates.some(
			(template) => template.message === message && template.isOwner,
		);
		if (template)
			cardBtns.find(".owner-buttons .hidden.small").removeClass("hidden");
	}

	if (!targets.length) return;

	const rowsTemplate = $('<div class="pf2e-toolbelt-target-spell"></div>');

	for (const { template } of targets) {
		rowsTemplate.append("<hr>");
		rowsTemplate.append(template);
	}

	msgContent.after(rowsTemplate);

	addHeaderListeners(message, rowsTemplate, save);
}

function addTargets(event, message) {
	event.stopPropagation();
	const targets = game.user.targets;

	setFlag(
		message,
		"target.targets",
		Array.from(
			targets.map((target) => ({
				token: target.document.uuid,
				actor: target.actor.uuid,
			})),
		),
	);
}

async function renderDamageChatMessage(message, html) {
	const data = await getMessageData(message);
	const msgContent = html.find(".message-content");
	const damageRows = msgContent.find(".damage-application");
	const clonedRows = damageRows.clone();

	const buttons = $('<div class="pf2e-toolbelt-target-buttons"></div>');

	if (data?.targets.length && damageRows.length) {
		const toggleDamageRow = () => {
			const expanded = !!getInMemory(message, "target.expanded");
			toggleBtn.toggleClass("collapse", expanded);
			damageRows.toggleClass("hidden", !expanded);
		};

		const toggleTooltip = localize("target.chat.toggle.tooltip");
		const toggleBtn = $(`<button class="toggle" title="${toggleTooltip}">
    <i class="fa-solid fa-plus expand"></i>
    <i class="fa-solid fa-minus collapse"></i>
</button>`);

		toggleDamageRow();

		toggleBtn.on("click", (event) => {
			event.stopPropagation();
			setInMemory(
				message,
				"target.expanded",
				!getInMemory(message, "target.expanded"),
			);
			toggleDamageRow();
		});

		buttons.append(toggleBtn);
	}

	if (data?.isRegen !== true && (game.user.isGM || message.isAuthor)) {
		const targetsTooltip = localize("target.chat.targets.tooltip");
		const targetsBtn = $(`<button class="targets" title="${targetsTooltip}">
    <i class="fa-solid fa-bullseye-arrow"></i>
</button>`);

		targetsBtn.on("click", (event) => addTargets(event, message));

		buttons.append(targetsBtn);
	}

	html.find(".dice-result .dice-total").append(buttons);

	if (!data?.targets.length) return;

	const { targets, save } = data;
	if (!clonedRows.length) return;

	clonedRows
		.removeClass("damage-application")
		.addClass("target-damage-application");

	if (getSetting("target-client") !== "big")
		clonedRows.find("button").addClass("small");

	clonedRows.find("[data-action]").each(function () {
		const action = this.dataset.action;
		this.dataset.action = `target-${action}`;
	});

	const rowsTemplate = $('<div class="pf2e-toolbelt-target-damage"></div>');

	for (const { uuid, template, save, applied = {} } of targets) {
		const isBasicSave = !!(save?.result && save.basic);
		const clones = clonedRows.clone();

		rowsTemplate.append("<hr>");
		rowsTemplate.append(template);

		clones.each((index, el) => {
			el.dataset.rollIndex = index;
			el.dataset.targetUuid = uuid;

			el.classList.toggle(
				"applied",
				!!applied[index] ||
					(isBasicSave && save.result.success === "criticalSuccess"),
			);
			if (isBasicSave) el.classList.add(save.result.success);
		});

		rowsTemplate.append(clones);
	}

	msgContent.after(rowsTemplate);

	addHeaderListeners(message, rowsTemplate, save);
	rowsTemplate
		.find("button[data-action^=target-]")
		.on("click", (event) => onTargetButton(event, message));
}

function addHeaderListeners(message, html, save) {
	html.find("[data-action=ping-target]").on("click", pingTarget);
	html.find("[data-action=open-target-sheet]").on("click", openTargetSheet);
	html
		.find("[data-action=roll-save]")
		.on("click", (event) => rollSave(event, message, save));
	html
		.find("[data-action=reroll-save]")
		.on("click", (event) => rerollSave(event, message, save));
}

async function getMessageData(message) {
	const targetsFlag = getFlag(message, "target.targets") ?? [];
	const showDC = game.user.isGM || game.settings.get("pf2e", "metagame_showDC");

	const save = (() => {
		const flag = getFlag(message, "target.save");
		if (!flag) return;
		return {
			...flag,
			...SAVES[flag.statistic],
		};
	})();

	if (!targetsFlag.length && !save) return;

	if (save) {
		const saveLabel = game.i18n.format("PF2E.SavingThrowWithName", {
			saveName: game.i18n.localize(save.label),
		});
		const saveDC = showDC
			? localize("target.chat.save.dcWithValue", { dc: save.dc })
			: "";
		save.tooltipLabel = `${saveLabel} ${saveDC}`;
		save.tooltip = await renderTemplate(templatePath("target/save-tooltip"), {
			check: save.tooltipLabel,
		});
	}

	const targets = (
		await Promise.all(
			targetsFlag.map(async ({ token }) => {
				const target = await fromUuid(token);
				if (!target?.isOwner) return;

				const targetId = target.id;
				const actor = target.actor;
				const hasSave = save && !!actor?.saves[save.statistic];

				const targetSave = await (async () => {
					if (!hasSave) return;

					const flag = getFlag(message, `target.saves.${targetId}`);
					if (!flag) return;

					const rerolled = flag.rerolled;
					const canReroll = hasSave && !rerolled;
					const successLabel = game.i18n.localize(
						`PF2E.Check.Result.Degree.Check.${flag.success}`,
					);
					const offset = flag.value - save.dc;

					return {
						...flag,
						canReroll,
						tooltip: await renderTemplate(templatePath("target/save-tooltip"), {
							i18n: subLocalize("target.chat.save"),
							check: save.tooltipLabel,
							result: localize(
								`target.chat.save.result.${
									showDC ? "withOffset" : "withoutOffset"
								}`,
								{
									success: successLabel,
									offset: offset >= 0 ? `+${offset}` : offset,
									die: `<i class="fa-solid fa-dice-d20"></i> ${flag.die}`,
								},
							),
							modifiers: flag.modifiers,
							canReroll,
							rerolled: REROLL[rerolled],
						}),
					};
				})();

				const templateSave = save && {
					...save,
					result: targetSave,
				};

				return {
					uuid: token,
					target: target,
					save: templateSave,
					applied: getFlag(message, `target.applied.${targetId}`),
					template: await renderTemplate(templatePath("target/row-header"), {
						name: target.name,
						uuid: token,
						save: hasSave && templateSave,
						canReroll: targetSave?.canReroll,
						rerolled: REROLL[targetSave?.rerolled],
						i18n: subLocalize("target.chat.row"),
					}),
				};
			}),
		)
	).filter(Boolean);

	return { targets, save, isRegen: getFlag(message, "target.isRegen") };
}

async function getTargetFromEvent(event) {
	const { targetUuid } =
		event.currentTarget.closest("[data-target-uuid]").dataset;
	return fromUuid(targetUuid);
}

async function rerollSave(event, message, { dc }) {
	const target = await getTargetFromEvent(event);
	const actor = target?.actor;
	if (!actor) return;

	const flag = getFlag(message, `target.saves.${target.id}`);
	if (!flag?.roll || flag.rerolled) return;

	const heroPoints = actor.isOfType("character") ? actor.heroPoints.value : 0;

	const template = Object.entries(REROLL)
		.map(([type, { icon, reroll }]) => {
			if (type === "hero" && !heroPoints) return;
			const label = game.i18n.localize(reroll);
			return `<label><input type="radio" name="reroll" value="${type}"><i class="${icon}"></i> ${label}</label>`;
		})
		.filter(Boolean)
		.join("");

	const buttons = {
		yes: {
			icon: '<i class="fa-solid fa-rotate rotate"></i>',
			label: "reroll",
			callback: (html) => html.find("[name=reroll]:checked").val() ?? null,
		},
		no: {
			icon: '<i class="fa-solid fa-xmark"></i>',
			label: "cancel",
			callback: () => null,
		},
	};

	const reroll = await Dialog.wait(
		{
			title: `${target.name} - ${localize(
				"target.chat.save.reroll.confirm.title",
			)}`,
			content: template,
			buttons,
			close: () => null,
		},
		{
			id: `pf2e-toolbelt-target-save-reroll-dialog-${target.id}`,
		},
	);

	if (!reroll) return;

	const isHeroReroll = reroll === "hero";
	const keep = isHeroReroll ? "new" : reroll;

	if (isHeroReroll) {
		const { value, max } = actor.heroPoints;

		if (value < 1) {
			warn("target.chat.save.reroll.noPoints");
			return;
		}

		await actor.update({
			"system.resources.heroPoints.value": Math.clamped(value - 1, 0, max),
		});
	}

	const oldRoll = Roll.fromJSON(flag.roll);
	const unevaluatedNewRoll = oldRoll.clone();
	unevaluatedNewRoll.options.isReroll = true;
	Hooks.callAll(
		"pf2e.preReroll",
		Roll.fromJSON(flag.roll),
		unevaluatedNewRoll,
		isHeroReroll,
		keep,
	);

	const newRoll = await unevaluatedNewRoll.evaluate({ async: true });
	await roll3dDice(newRoll);
	
	Hooks.callAll(
		"pf2e.reroll",
		Roll.fromJSON(flag.roll),
		newRoll,
		isHeroReroll,
		keep,
	);

	const keptRoll =
		(keep === "higher" && oldRoll.total > newRoll.total) ||
		(keep === "lower" && oldRoll.total < newRoll.total)
			? oldRoll
			: newRoll;

	if (keptRoll === newRoll) {
		const success = new DegreeOfSuccess(newRoll, dc, flag.dosAdjustments);
		keptRoll.options.degreeOfSuccess = success.value;
	}

	const packet = {
		type: "target.update-save",
		target: target.id,
		data: {
			value: keptRoll.total,
			die: keptRoll.dice[0].total,
			success: keptRoll.degreeOfSuccess,
			roll: JSON.stringify(keptRoll.toJSON()),
			dosAdjustments: deepClone(flag.dosAdjustments),
			modifiers: deepClone(flag.modifiers),
			rerolled: reroll,
		},
	};

	if (keptRoll.options.keeleyAdd10) {
		packet.data.modifiers.push({
			label: localize("target.chat.save.reroll.keeley"),
			modifier: 10,
		});
	}

	if (game.user.isGM || message.isAuthor) {
		packet.message = message;
		updateMessageSave(packet);
	} else {
		packet.message = message.id;
		socketEmit(packet);
	}
}

async function rollSave(event, message, { dc, statistic }) {
	const target = await getTargetFromEvent(event);
	const actor = target?.actor;
	if (!actor) return;

	const save = actor.saves[statistic];
	if (!save) return;

	const item = (() => {
		const item = message.item;
		if (item) return item;

		const messageId = getFlag(message, "target.messageId");
		if (!messageId) return;

		const otherMessage = game.messages.get(messageId);
		if (!otherMessage) return;

		return otherMessage.item;
	})();

	const skipDefault = !game.user.settings.showCheckDialogs;

	const packet = {
		type: "target.update-save",
		target: target.id,
	};

	save.check.roll({
		dc: { value: dc },
		item,
		origin: actor,
		skipDialog: event.shiftKey ? !skipDefault : skipDefault,
		createMessage: false,
		callback: async (roll, __, msg) => {
			await roll3dDice(roll);
			packet.data = {
				value: roll.total,
				die: roll.dice[0].total,
				success: roll.degreeOfSuccess,
				roll: JSON.stringify(roll.toJSON()),
				dosAdjustments: msg.getFlag("pf2e", "context.dosAdjustments"),
				modifiers: msg
					.getFlag("pf2e", "modifiers")
					.filter((modifier) => modifier.enabled)
					.map(({ label, modifier }) => ({ label, modifier })),
			};

			if (game.user.isGM || message.isAuthor) {
				packet.message = message;
				updateMessageSave(packet);
			} else {
				packet.message = message.id;
				socketEmit(packet);
			}
		},
	});
}

function updateMessageSave({ message, target, data }) {
	if (typeof message === "string") {
		message = game.messages.get(message);
		if (!message) return;
	}

	if (typeof data.success === "number")
		data.success = DEGREE_OF_SUCCESS[data.success];

	setFlag(message, `target.saves.${target}`, deepClone(data));
}

async function openTargetSheet(event) {
	const target = await getTargetFromEvent(event);
	if (!target) return;

	target.actor?.sheet.render(true);
}

async function pingTarget(event) {
	if (!canvas.ready) return;

	const target = await getTargetFromEvent(event);
	if (!target) return;

	canvas.ping(target.center);
}

async function onTargetButton(event, message) {
	const btn = event.currentTarget;
	const { rollIndex, targetUuid } = btn.closest("[data-target-uuid]").dataset;
	const target = await fromUuid(targetUuid);
	if (!target) return;

	const type = btn.dataset.action;

	if (type === "target-shield-block") {
		onClickShieldBlock(target, btn, message.element);
		return;
	}

	const multiplier =
		type === "target-apply-healing"
			? -1
			: type === "target-half-damage"
			  ? 0.5
			  : type === "target-apply-damage"
				  ? 1
				  : type === "target-double-damage"
					  ? 2
					  : 3;

	applyDamageFromMessage(target, {
		message,
		multiplier,
		addend: 0,
		promptModifier: event.shiftKey,
		rollIndex: Number(rollIndex),
	});
}

export function onDamageApplied(message, tokenId, rollIndex) {
	const updates = {};
	moduleFlagUpdate(updates, `target.applied.${tokenId}.${rollIndex}`, true);

	const splashRollIndex = getFlag(message, "target.splashIndex");
	if (splashRollIndex !== undefined) {
		const regularRollIndex = splashRollIndex === 0 ? 1 : 0;

		if (rollIndex === splashRollIndex) {
			moduleFlagUpdate(
				updates,
				`target.applied.${tokenId}.${regularRollIndex}`,
				true,
			);
		} else {
			moduleFlagUpdate(
				updates,
				`target.applied.${tokenId}.${splashRollIndex}`,
				true,
			);

			const targetsFlag = getFlag(message, "target.targets") ?? [];
			for (const target of targetsFlag) {
				const targetId = target.token?.split(".").at(-1);
				if (targetId === tokenId) continue;

				moduleFlagUpdate(
					updates,
					`target.applied.${targetId}.${regularRollIndex}`,
					true,
				);
			}
		}
	}

	if (game.user.isGM || message.isAuthor) {
		updateMessageApplied({ message, updates });
	} else {
		socketEmit({
			type: "target.update-applied",
			message: message.id,
			updates,
		});
	}
}

function updateMessageApplied({ message, updates }) {
	if (typeof message === "string") {
		message = game.messages.get(message);
		if (!message) return;
	}
	message.update(updates);
}
