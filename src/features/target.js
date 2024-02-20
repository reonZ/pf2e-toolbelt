import {
	DegreeOfSuccess,
	MODULE,
	applyDamageFromMessage,
	deleteInMemory,
	getFlag,
	getInMemory,
	getSetting,
	getTemplateTokens,
	hasEmbeddedSpell,
	info,
	isActiveGM,
	latestChatMessages,
	localize,
	localizePath,
	moduleFlagUpdate,
	onClickShieldBlock,
	registerWrapper,
	render,
	setFlag,
	setInMemory,
	subLocalize,
	toggleOffShieldBlock,
	updateSourceFlag,
	warn,
} from "module-api";
import { bindOnPreCreateSpellDamageChatMessage } from "../chat";
import { roll3dDice } from "../misc";
import { createTool } from "../tool";

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

const TEXTEDITOR_ENRICH_HTML = "TextEditor.enrichHTML";
const CHATLOG_ACTIVATE_LISTENERS = "ChatLog.prototype.activateListeners";

export const targetOptions = {
	name: "target",
	settings: [
		{
			key: "target",
			type: Boolean,
			default: false,
			requiresReload: true,
		},
		{
			key: "target-client",
			type: String,
			default: "disabled",
			choices: ["disabled", "small", "big"],
			scope: "client",
			onChange: (value) => setHook("chat", value),
		},
		{
			key: "target-template",
			type: Boolean,
			default: false,
			scope: "client",
			onChange: (value) => setHook("template", value),
		},
	],
	hooks: [
		{
			key: "chat",
			event: "renderChatMessage",
			listener: renderChatMessage,
			useChoices: true,
		},
		{
			key: "template",
			event: "createMeasuredTemplate",
			listener: createMeasuredTemplate,
			useChoices: true,
		},
	],
	socket: onSocket,
	init: (isGM) => {
		if (!getSetting("target")) return;

		if (isGM) {
			socket.activate();
			Hooks.on("getChatLogEntryContext", getChatLogEntryContext);
		}

		registerWrapper(TEXTEDITOR_ENRICH_HTML, textEditorEnrichHTML);
		registerWrapper(CHATLOG_ACTIVATE_LISTENERS, chatActivateListeners);

		document.body.addEventListener("dragstart", onDragStart, true);

		Hooks.on("preCreateChatMessage", preCreateChatMessage);
	},
	ready: (isGM) => {
		if (!getSetting("target")) return;

		hooks.setFromSetting("chat", "target-client");
		hooks.setFromSetting("template", "target-template");

		for (const { message, html } of latestChatMessages(10)) {
			renderChatMessage(message, html);
		}
	},
};

const { hooks, socket } = createTool(targetOptions);

function setHook(key, value) {
	const realValue = getSetting("target") ? value : "disabled";
	hooks.set(key, realValue);
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

const INLINE_CHECK_REGEX = /(class="inline-check[\w0-9 -]*")/g;
// /(class="inline-check[\w0-9 -]*"[^>]+data-pf2-check="(reflex|fortitude|will)")/g;
async function textEditorEnrichHTML(wrapped, ...args) {
	let enriched = await wrapped(...args);
	enriched = enriched.replace(INLINE_CHECK_REGEX, "$1 draggable='true'");
	return enriched;
}

function chatActivateListeners(wrapped, html) {
	wrapped(html);
	html[0].addEventListener("drop", onChatMessageDrop);
}

function onChatMessageDrop(event) {
	const target = event.target.closest("li.chat-message");
	if (!target) return;

	const { isBasic, pf2Dc, pf2Check, type, pf2RollOptions, pf2Traits } =
		TextEditor.getDragEventData(event);
	if (type !== `${MODULE.id}-check-roll`) return;

	const messageId = target.dataset.messageId;
	const message = game.messages.get(messageId);
	if (!message || !message.isDamageRoll) return;

	if (!game.user.isGM && !message.isAuthor) {
		warn("target.chat.drop.unauth");
		return;
	}

	if (getFlag(message, "target.save")) {
		warn("target.chat.drop.already");
		return;
	}

	setFlag(message, "target", {
		rollOptions: [
			...(pf2Traits?.split(",").map((o) => o.trim()) ?? []),
			...(pf2RollOptions?.split(",").map((o) => o.trim()) ?? []),
		],
		save: {
			basic: isBasic,
			dc: Number(pf2Dc),
			statistic: pf2Check,
		},
	});

	info("target.chat.drop.added");
}

let BASIC_SAVE_REGEX;
function onDragStart(event) {
	const { target, dataTransfer } = event;
	if (
		!dataTransfer ||
		!(target instanceof HTMLAnchorElement) ||
		!target.classList.contains("inline-check")
	)
		return;

	const data = {
		...target.dataset,
		type: `${MODULE.id}-check-roll`,
	};

	if (!data.pf2Dc || !["reflex", "will", "fortitude"].includes(data.pf2Check)) {
		event.preventDefault();
		return;
	}

	event.stopPropagation();

	if (data.isBasic == null) {
		const label = target
			.querySelector("span.label")
			?.lastChild.textContent.trim();

		if (label) {
			if (!BASIC_SAVE_REGEX) {
				const saves = Object.values(CONFIG.PF2E.saves).map((x) =>
					game.i18n.localize(x),
				);
				const joined = game.i18n.format("PF2E.InlineCheck.BasicWithSave", {
					save: `(${saves.join("|")})`,
				});
				BASIC_SAVE_REGEX = new RegExp(joined);
			}

			data.isBasic = BASIC_SAVE_REGEX.test(label);
		} else {
			data.isBasic = false;
		}
	}

	dataTransfer.setData("text/plain", JSON.stringify(data));
}

function getChatLogEntryContext(_, data) {
	const getMessageData = (html) => {
		const messageId = html.data("messageId");
		const message = game.messages.get(messageId);
		if (!message) return;

		const inMemory = getInMemory(message, "target");
		if (!inMemory) return;

		return {
			message,
			inMemory,
		};
	};

	data.unshift({
		icon: '<i class="fa-solid fa-dice-d20"></i>',
		name: localizePath("target.chat.context.saves.name"),
		condition: (html) => {
			const data = getMessageData(html);
			return !!data?.inMemory.canRollSave?.length;
		},
		callback: (html) => {
			const { inMemory, message } = getMessageData(html) ?? {};
			const canRollSave = inMemory.canRollSave;
			if (!canRollSave?.length) return;

			const save = getSaveData(message);
			if (!save) return;

			rollSave(
				{
					target: html.find(".pf2e-toolbelt-target-damage")[0],
				},
				message,
				save,
				canRollSave,
			);
		},
	});
}

async function createMeasuredTemplate(template, _, userId) {
	const user = game.user;
	if (user.id !== userId) return;

	const localize = subLocalize("target.menu");
	const item = template.item;
	const actor = template.actor;
	const self = !actor ? undefined : actor.token ?? actor.getActiveTokens()[0];

	const data = {
		title: item?.name || localize("title"),
		content: await render("target/template-menu", {
			i18n: localize.template,
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
			const dc = item.spellcasting?.statistic.dc.value;
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
	const clientEnabled = getSetting("target-client") !== "disabled";
	deleteInMemory(message, "target.canRollSave");

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

	// we remove that
	if (item.system.defense?.save && hasEmbeddedSpell(message)) {
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

	const clonedRows = damageRows.clone();
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

	const { targets, save } = data;
	const rowsTemplate = $('<div class="pf2e-toolbelt-target-damage"></div>');

	for (const { uuid, template, save, isOwner, applied = {} } of targets) {
		rowsTemplate.append("<hr>");
		rowsTemplate.append(template);

		if (!isOwner) continue;

		const isBasicSave = !!(save?.result && save.basic);
		const clones = clonedRows.clone();

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

function getRowsElement(event) {
	return event.target?.closest(".pf2e-toolbelt-target-damage");
}

function disableSaveListeners(event) {
	getRowsElement(event)?.classList.add("disable-saves");
}

function enableSaveListeners(event) {
	getRowsElement(event)?.classList.remove("disable-saves");
}

function addHeaderListeners(message, html, save) {
	const listener = (event) => {
		const target = event.target.closest("[data-action]");
		if (!target) return;

		const dataAction = target.dataset.action;
		const saveEnabled = () => {
			return !getRowsElement(event)?.classList.contains("disable-saves");
		};

		switch (dataAction) {
			case "ping-target": {
				pingTarget(event);
				break;
			}
			case "open-target-sheet": {
				openTargetSheet(event);
				break;
			}
			case "roll-save": {
				saveEnabled() && rollSave(event, message, save);
				break;
			}
			case "reroll-save": {
				saveEnabled() && rerollSave(event, message, save);
				break;
			}
		}
	};

	html.on("click", listener);
}

function getSaveData(message) {
	const flag = getFlag(message, "target.save");
	if (!flag) return;
	return {
		...flag,
		...SAVES[flag.statistic],
	};
}

async function getMessageData(message) {
	const isGM = game.user.isGM;
	const targetsFlag = getFlag(message, "target.targets") ?? [];
	const showDC = isGM || game.settings.get("pf2e", "metagame_showDC");
	const showMods = isGM || game.settings.get("pf2e", "metagame_showBreakdowns");
	const showSuccess = isGM || game.settings.get("pf2e", "metagame_showResults");

	const save = getSaveData(message);
	if (!targetsFlag.length && !save) return;

	if (save) {
		const saveLabel = game.i18n.format("PF2E.SavingThrowWithName", {
			saveName: game.i18n.localize(save.label),
		});
		const saveDC = showDC
			? localize("target.chat.save.dcWithValue", { dc: save.dc })
			: "";
		save.tooltipLabel = `${saveLabel} ${saveDC}`;
		save.tooltip = await render("target/save-tooltip", {
			check: save.tooltipLabel,
		});
	}

	const canRollSave = [];

	const targets = (
		await Promise.all(
			targetsFlag.map(async ({ token }) => {
				const target = await fromUuid(token);
				const targetId = target.id;
				const actor = target.actor;
				if (!actor) return;

				const isVisible = !actor.hasCondition("undetected");
				if (!isGM && !isVisible) return;

				const isOwner = actor.isOwner;
				const hasPlayerOwner = actor.hasPlayerOwner;
				const isFriendly = isOwner || hasPlayerOwner;
				const hasSave = save && !!actor?.saves[save.statistic];
				const saveFlag = getFlag(message, `target.saves.${targetId}`);

				if (hasSave && !hasPlayerOwner && !saveFlag) {
					canRollSave.push(token);
				}

				const targetSave = await (async () => {
					if (!hasSave || !saveFlag) return;

					const rerolled = saveFlag.rerolled;
					const canReroll = hasSave && isOwner && !rerolled;
					const successLabel = game.i18n.localize(
						`PF2E.Check.Result.Degree.Check.${saveFlag.success}`,
					);
					const offset = saveFlag.value - save.dc;
					const result =
						isFriendly || showSuccess
							? localize(
									`target.chat.save.result.${
										showDC
											? "withOffset"
											: isFriendly
											  ? "withoutOffsetWithDie"
											  : "withoutOffset"
									}`,
									{
										success: successLabel,
										offset: offset >= 0 ? `+${offset}` : offset,
										die: `<i class="fa-solid fa-dice-d20"></i> ${saveFlag.die}`,
									},
							  )
							: undefined;

					return {
						...saveFlag,
						canReroll,
						tooltip: await render("target/save-tooltip", {
							i18n: subLocalize("target.chat.save"),
							check: save.tooltipLabel,
							result,
							modifiers: isFriendly || showMods ? saveFlag.modifiers : [],
							canReroll,
							rerolled: REROLL[rerolled],
						}),
					};
				})();

				const templateSave = save && {
					...save,
					result: targetSave,
				};

				const anonymous = game.modules.get("anonymous");
				const canSeeName = isGM
					? true
					: anonymous?.active
					  ? anonymous.api.playersSeeName(target.actor)
					  : !game.pf2e.settings.tokens.nameVisibility ||
						  target.playersCanSeeName;
				const name = canSeeName
					? target.name
					: anonymous?.active
					  ? anonymous.api.getName(target.actor)
					  : localize("unnamed");

				return {
					isOwner,
					canSeeName,
					hasPlayerOwner,
					uuid: token,
					target: target,
					save: templateSave,
					applied: getFlag(message, `target.applied.${targetId}`),
					template: await render("target/row-header", {
						name,
						isGM,
						isOwner,
						hasPlayerOwner,
						isHidden: !isVisible,
						uuid: token,
						showSuccess: isFriendly || showSuccess,
						save: hasSave && templateSave,
						canReroll: targetSave?.canReroll,
						rerolled: REROLL[targetSave?.rerolled],
						i18n: subLocalize("target.chat.row"),
					}),
				};
			}),
		)
	).filter(Boolean);

	setInMemory(message, "target.canRollSave", canRollSave);

	if (isGM) {
		targets.sort((a, b) => a.hasPlayerOwner - b.hasPlayerOwner);
	} else {
		targets.sort((a, b) =>
			!a.isOwner && !b.isOwner
				? b.hasPlayerOwner - a.hasPlayerOwner
				: b.isOwner - a.isOwner,
		);
	}

	return { targets, save, isRegen: getFlag(message, "target.isRegen") };
}

async function getTargetFromEvent(event) {
	const { targetUuid } = event.target.closest("[data-target-uuid]").dataset;
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

	disableSaveListeners(event);

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

	if (!reroll) {
		enableSaveListeners(event);
		return;
	}

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

	const isAuthor = game.user.isGM || message.isAuthor;

	const data = {
		value: keptRoll.total,
		die: keptRoll.dice[0].total,
		success: keptRoll.degreeOfSuccess,
		roll: JSON.stringify(keptRoll.toJSON()),
		dosAdjustments: deepClone(flag.dosAdjustments),
		modifiers: deepClone(flag.modifiers),
		rerolled: reroll,
	};

	if (keptRoll.options.keeleyAdd10) {
		data.modifiers.push({
			label: localize("target.chat.save.reroll.keeley"),
			modifier: 10,
		});
	}

	const packet = {
		type: "target.update-save",
		message: isAuthor ? message : message.id,
		targets: [
			{
				target: target.id,
				data,
			},
		],
	};

	if (game.user.isGM || message.isAuthor) {
		updateMessageSave(packet);
	} else {
		socket.emit(packet);
	}
}

async function rollSave(event, message, { dc, statistic }, tokens) {
	const isAuthor = game.user.isGM || message.isAuthor;

	const targetPromises = Array.isArray(tokens)
		? tokens.map((uuid) => fromUuid(uuid))
		: [getTargetFromEvent(event)];

	const packet = {
		type: "target.update-save",
		message: isAuthor ? message : message.id,
		targets: [],
	};

	disableSaveListeners(event);

	await Promise.all(
		targetPromises.map(async (targetPromise) => {
			const target = await targetPromise;
			const actor = target?.actor;
			if (!actor) return;

			const save = actor.saves[statistic];
			if (!save) return;

			const item = (() => {
				const item = message.item;
				if (item) return item;

				const messageId = getFlag(message, "target.messageId");
				if (messageId) {
					const otherMessage = game.messages.get(messageId);
					return otherMessage?.item;
				}
			})();

			const skipDefault = !game.user.settings.showCheckDialogs;
			const rollOptions = getFlag(message, "target.rollOptions");

			return new Promise((resolve) => {
				save.check.roll({
					dc: { value: dc },
					item,
					origin: actor,
					skipDialog: event.shiftKey ? !skipDefault : skipDefault,
					extraRollOptions: rollOptions,
					createMessage: false,
					callback: async (roll, __, msg) => {
						await roll3dDice(roll);

						const data = {
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

						packet.targets.push({
							data,
							target: target.id,
						});

						resolve();
					},
				});
			});
		}),
	);

	if (isAuthor) {
		updateMessageSave(packet);
	} else {
		socket.emit(packet);
	}
}

async function updateMessageSave({ targets, message }) {
	if (typeof message === "string") {
		message = game.messages.get(message);
		if (!message) return;
	}

	const updates = {};

	for (const { data, target } of targets) {
		if (typeof data.success === "number") {
			data.success = DEGREE_OF_SUCCESS[data.success];
		}
		updates[target] = deepClone(data);
	}

	await setFlag(message, "target.saves", updates);
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
		const messageId = message.id;

		if (!btn.classList.contains("shield-activated")) {
			toggleOffShieldBlock(messageId);
		}

		requestAnimationFrame(() => {
			onClickShieldBlock(target, btn, message.element);
		});

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

	applyDamageFromMessage({
		message,
		multiplier,
		addend: 0,
		promptModifier: event.shiftKey,
		rollIndex: Number(rollIndex),
		tokens: [target],
		onDamageApplied,
	});
}

export function onDamageApplied(message, tokens, rollIndex) {
	const updates = {};

	for (const token of tokens) {
		const tokenId = token.id;

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
	}

	if (game.user.isGM || message.isAuthor) {
		updateMessageApplied({ message, updates });
	} else {
		socket.emit({
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
