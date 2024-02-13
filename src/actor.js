import {
	getInMemory,
	registerWrapper,
	render,
	setInMemory,
	unregisterWrapper,
} from "module-api";

const sheetTabsRegistered = {
	wrapperIds: [],
	tabs: new Collection(),
};

const preparedEmbeddedRegistered = {
	wrapperIds: [],
	listeners: new Map(),
};

const ACTOR_PREPARE_EMBEDDED_DOCUMENTS =
	"CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments";

const CHARACTER_SHEET_INNER_RENDER =
	"CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner";
const CHARACTER_SHEET_RENDER =
	"CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._render";
const CHARACTER_SHEET_ACTIVE_LISTENERS =
	"CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners";

export function isPlayedActor(actor) {
	return actor && !actor.pack && actor.id && game.actors.has(actor.id);
}

export function registerActorPreparedEmbeddedDocuments(feature, listener) {
	if (!preparedEmbeddedRegistered.wrapperIds.length) {
		preparedEmbeddedRegistered.wrapperIds = [
			registerWrapper(
				ACTOR_PREPARE_EMBEDDED_DOCUMENTS,
				actorPrepareEmbeddedDocuments,
				"WRAPPER",
			),
		];
	}
	preparedEmbeddedRegistered.listeners.set(feature, listener);
}

export function registerCharacterSheetExtraTab(options) {
	if (!sheetTabsRegistered.wrapperIds.length) {
		sheetTabsRegistered.wrapperIds = [
			registerWrapper(CHARACTER_SHEET_RENDER, characterSheetRender),
			registerWrapper(CHARACTER_SHEET_INNER_RENDER, characterSheetInnerRender),
			registerWrapper(
				CHARACTER_SHEET_ACTIVE_LISTENERS,
				characterSheetActiveListeners,
			),
		];
	}
	sheetTabsRegistered.tabs.set(options.tabName, options);
}

export function unregisterCharacterSheetExtraTab(tabName) {
	sheetTabsRegistered.tabs.delete(tabName);
	if (sheetTabsRegistered.wrapperIds.length && !sheetTabsRegistered.tabs.size) {
		for (const wrapperId of sheetTabsRegistered.wrapperIds) {
			unregisterWrapper(wrapperId);
		}
		sheetTabsRegistered.wrapperIds = [];
	}
}

function actorPrepareEmbeddedDocuments(wrapped, ...args) {
	wrapped(...args);

	for (const [feature, listener] of preparedEmbeddedRegistered.listeners) {
		try {
			listener.call(this);
		} catch {
			wrapperError(feature, ACTOR_PREPARE_EMBEDDED_DOCUMENTS);
		}
	}
}

async function characterSheetRender(wrapped, ...args) {
	const positions = {};

	for (const { tabName } of sheetTabsRegistered.tabs) {
		const existingTab = getCharacterSheetTab(this.element, tabName);
		const existingAlternate = existingTab.find(".alternate")[0];
		if (!existingAlternate) continue;
		positions[tabName] = existingAlternate.scrollTop;
	}

	await wrapped(...args);

	for (const { tabName } of sheetTabsRegistered.tabs) {
		const oldPosition = positions[tabName];
		if (!oldPosition) continue;

		const tab = getCharacterSheetTab(this.element, tabName);
		const alternate = tab.find(".alternate")[0];
		alternate.scrollTop = positions[tabName];
	}
}

async function characterSheetInnerRender(wrapped, data) {
	const inner = await wrapped(data);
	const actor = this.actor;

	if (!sheetTabsRegistered.tabs.size || !isPlayedActor(actor)) {
		return inner;
	}

	const element = this.element;

	for (const {
		tabName,
		getData,
		templateFolder,
		onRender,
	} of sheetTabsRegistered.tabs) {
		const innerTab = getCharacterSheetTab(inner, tabName);

		const tabData = await getData(
			actor,
			this,
			getCharacterSheetTab(element, tabName),
		);

		const template = await render(templateFolder, tabData);

		if (onRender) {
			await onRender(actor, this, inner);
		}

		if (getInMemory(this, `${tabName}.toggled`)) {
			innerTab.addClass("toggled");
		}

		innerTab.children(":last").before(template);
	}

	return inner;
}

function characterSheetActiveListeners(wrapped, inner) {
	wrapped(inner);

	const actor = this.actor;

	if (!sheetTabsRegistered.tabs.size || !isPlayedActor(actor)) {
		return;
	}

	for (const { tabName, addEvents } of sheetTabsRegistered.tabs) {
		inner
			.find(`nav.sheet-navigation .item[data-tab=${tabName}]`)
			.on("click", (event) =>
				onCharacterSheetTabBtnToggle(event, inner, this, tabName),
			);

		const tab = getCharacterSheetTab(inner, tabName);
		addEvents(tab.find("> .alternate"), this, actor, inner);
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
