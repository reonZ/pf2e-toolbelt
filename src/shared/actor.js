import { registerWrapper, unregisterWrapper } from "./libwrapper";
import { getInMemory, setInMemory } from "./misc";
import { templatePath } from "./path";

const registered = {
	wrapperIds: [],
	tabs: new Collection(),
};

const CHARACTER_SHEET_INNER_RENDER =
	"CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner";
const CHARACTER_SHEET_ACTIVE_LISTENERS =
	"CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners";

export function isPlayedActor(actor) {
	return actor && !actor.pack && actor.id && game.actors.has(actor.id);
}

export function registerCharacterSheetExtraTab(options) {
	if (!registered.wrapperIds.length) {
		registered.wrapperIds = [
			registerWrapper(CHARACTER_SHEET_INNER_RENDER, characterSheetInnerRender),
			registerWrapper(
				CHARACTER_SHEET_ACTIVE_LISTENERS,
				characterSheetActiveListeners,
			),
		];
	}
	registered.tabs.set(options.tabName, options);
}

export function unregisterCharacterSheetExtraTab(tabName) {
	registered.tabs.delete(tabName);
	if (registered.wrapperIds.length && !registered.tabs.size) {
		for (const wrapperId of registered.wrapperIds) {
			unregisterWrapper(wrapperId);
		}
		registered.wrapperIds = [];
	}
}

async function characterSheetInnerRender(wrapped, data) {
	const inner = await wrapped(data);
	const actor = this.actor;

	if (!registered.tabs.size || !isPlayedActor(actor)) {
		return inner;
	}

	const element = this.element;

	for (const { tabName, getData, templateFolder } of registered.tabs) {
		const innerTab = getCharacterSheetTab(inner, tabName);

		const tabData = await getData(
			actor,
			this,
			getCharacterSheetTab(element, tabName),
		);

		const template = await renderTemplate(
			templatePath(templateFolder),
			tabData,
		);

		if (getInMemory(this, `${tabName}.toggled`)) {
			innerTab.addClass("toggled");
		}

		innerTab.children(":first").after(template);
	}

	return inner;
}

function characterSheetActiveListeners(wrapped, inner) {
	wrapped(inner);

	const actor = this.actor;

	if (!registered.tabs.size || !isPlayedActor(actor)) {
		return;
	}

	for (const { tabName, addEvents } of registered.tabs) {
		inner
			.find(`nav.sheet-navigation .item[data-tab=${tabName}]`)
			.on("click", (event) =>
				onCharacterSheetTabBtnToggle(event, inner, this, tabName),
			);

		const tab = getCharacterSheetTab(inner, tabName);
		addEvents(tab.find("> .alternate"), this, actor);
	}
}

export function getCharacterSheetTab(html, tabName) {
	return html.find(
		`section.sheet-body .sheet-content > .tab[data-tab=${tabName}]`,
	);
}

function onCharacterSheetTabBtnToggle(event, html, sheet, tabName) {
	event.preventDefault();

	const tab = getCharacterSheetTab(html, tabName);

	if (tab.hasClass("active")) {
		tab.toggleClass("toggled");
		tab.scrollTop(0);
		setInMemory(sheet, `${tabName}.toggled`, tab.hasClass("toggled"));
	}
}
