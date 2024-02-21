import { getTemplateTokens, render, subLocalize } from "module-api";
import { createTool } from "../tool";

export const templateOptions = {
	name: "template",
	settings: [
		{
			key: "target-template",
			type: Boolean,
			default: false,
			scope: "client",
			onChange: (value) => setHook(value),
		},
	],
	hooks: [["createMeasuredTemplate", createMeasuredTemplate]],
	init: () => {
		setHook.fromSetting("target-template");
	},
};

const { setHook } = createTool(templateOptions);

async function createMeasuredTemplate(template, _, userId) {
	const user = game.user;
	if (user.id !== userId) return;

	const localize = subLocalize("target.menu");
	const item = template.item;
	const actor = template.actor;
	const self = !actor ? undefined : actor.token ?? actor.getActiveTokens()[0];

	const data = {
		title: item?.name || localize("title"),
		content: await render("template/menu", {
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
