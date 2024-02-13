import { render, subLocalize } from "module-api";

const localize = subLocalize("macros.condition");

export async function permaConditionEffect(actor) {
	const callback = (html, type) => {
		const condition = html.find("[name=condition]");
		const { name, slug, img } = condition.find(":selected").data();

		return {
			type,
			slug,
			img,
			name:
				html.find("[name=name]").val().trim() ||
				localize("effect-name", { condition: name }),
			uuid: condition.val(),
			badge: Number(html.find("[name=badge]").val() || 1),
			unidentified: html.find("[name=unidentified]").prop("checked"),
		};
	};

	const buttons = {
		generate: {
			icon: '<i class="fas fa-suitcase"></i>',
			label: localize("generate"),
			callback: (html) => callback(html, "generate"),
		},
		add: {
			icon: '<i class="fa-solid fa-user"></i>',
			label: localize("add"),
			callback: (html) => callback(html, "add"),
		},
	};

	const conditions = Array.from(game.pf2e.ConditionManager.conditions.values());
	const withBadge = new Set(
		conditions
			.filter((condition) => !!condition.badge)
			.map((condition) => condition.slug),
	);

	const content = await render("macros/condition", {
		i18n: localize.template,
		conditions: Array.from(
			new Set(conditions.sort((a, b) => a.name.localeCompare(b.name))),
		),
	});

	const setInputs = (html) => {
		const { name, slug } = html.find("[name=condition] :selected").data();
		html
			.find("[name=name]")
			.prop("placeholder", localize("effect-name", { condition: name }));

		const hasBadge = withBadge.has(slug);
		const badge = html.find("[name=badge]");
		badge.prop("disabled", !hasBadge);
		if (!hasBadge) badge.val(1);
	};

	const result = await Dialog.wait(
		{
			buttons,
			content,
			title: localize("title"),
			close: () => null,
			render: (html) => {
				setInputs(html);
				html.find("[name=condition]").on("change", () => setInputs(html));
			},
		},
		{
			id: "pf2e-toolbelt-macros-condition",
			width: 320,
		},
	);

	if (!result) return;

	const rule = {
		inMemoryOnly: true,
		key: "GrantItem",
		uuid: result.uuid,
	};

	if (result.badge > 1 && withBadge.has(result.slug)) {
		rule.alterations = [
			{
				mode: "override",
				property: "badge-value",
				value: result.badge,
			},
		];
	}

	const source = {
		name: result.name,
		type: "effect",
		img: result.img,
		system: {
			rules: [rule],
			unidentified: result.unidentified,
		},
	};

	if (result.type === "generate" || !actor) await Item.create(source);
	else await actor.createEmbeddedDocuments("Item", [source]);
}
