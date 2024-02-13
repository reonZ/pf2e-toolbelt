import { getFlag, setFlag, subLocalize, templatePath } from "module-api";

const localize = subLocalize("knowledges.editLore");

export class EditLores extends FormApplication {
	get actor() {
		return this.object;
	}

	get id() {
		return `npc-edit-lores-${this.actor.id}`;
	}

	get title() {
		return localize("title", this.actor);
	}

	get template() {
		return templatePath("knowledges/lores");
	}

	getData(options) {
		const actor = this.actor;

		return mergeObject(super.getData(options), {
			unspecified: getFlag(actor, "knowledges.unspecified") ?? "",
			specific: getFlag(actor, "knowledges.specific") ?? "",
			i18n: localize.template,
		});
	}

	async _updateObject(event, { unspecified, specific }) {
		const actor = this.object;
		setFlag(actor, "knowledges.unspecified", unspecified.trim());
		setFlag(actor, "knowledges.specific", specific.trim());
	}

	activateListeners(html) {
		html.find("button.cancel").on("click", this.#onCancel.bind(this));
	}

	#onCancel(event) {
		event.preventDefault();
		this.close();
	}
}
