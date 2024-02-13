import { subLocalize, templatePath } from "module-api";
import { bindOnPreCreateSpellDamageChatMessage } from "../../chat";

const localize = subLocalize("merge.multi");

export class MultiCast extends Application {
	#message;
	#event;

	constructor(event, message, options) {
		super(options);
		this.#event = event;
		this.#message = message;
	}

	get title() {
		return localize("title", this.spell);
	}

	get template() {
		return templatePath("merge/multi");
	}

	getData(options) {
		return mergeObject(super.getData(options), {
			i18n: localize.template,
		});
	}

	activateListeners(html) {
		html.find("[data-action=cast]").on("click", this.#onCast.bind(this));
		html.find("[data-action=cancel]").on("click", this.#onCancel.bind(this));
	}

	async #onCast(event) {
		event.preventDefault();

		const nb = this.element.find("[name=multi]").val();
		if (nb < 1) {
			localize.error("zero");
			this.close();
			return;
		}

		const message = this.#message;
		if (!message) return;

		const spell = message.item;
		const actor = message.actor;
		if (!actor || !spell) return;

		const updateSource = (damages, heightening) => {
			for (const [id, damage] of Object.entries(damages)) {
				for (let i = 0; i < nb - 1; i++) {
					const newId = randomID();

					damages[newId] = damage;

					if (heightening.type === "interval") {
						const damage = heightening.damage[id];
						if (damage) heightening.damage[newId] = damage;
					} else if (heightening.type === "fixed") {
						for (const data of Object.values(heightening.levels)) {
							const damage = data.damage[id];
							if (!damage) continue;
							data.damage[newId] = damage;
						}
					}
				}
			}
		};

		const embeddedSource = deepClone(message.flags.pf2e.casting?.embeddedSpell);

		if (embeddedSource) {
			const damages = embeddedSource.system.damage;

			embeddedSource.system.heightening ??= {};
			const heightening = embeddedSource.system.heightening;

			updateSource(damages, heightening);

			const newSpell = new Item.implementation(embeddedSource, {
				parent: actor,
			});

			newSpell.trickMagicEntry = spell.trickMagicEntry;

			const overlayIds = message.getFlag("pf2e", "origin.variant.overlays");
			const castRank = message.getFlag("pf2e", "origin.castRank") ?? spell.rank;
			const modifiedSpell = newSpell.loadVariant({ overlayIds, castRank });
			const castSpell = modifiedSpell ?? newSpell;

			castSpell.rollDamage(this.#event);
		} else {
			const spellSource = spell.toObject();
			const damages = spellSource.system.damage;
			const heightening = spellSource.system.heightening ?? {};

			updateSource(damages, heightening);

			const newSpell = spell.clone({
				"system.damage": damages,
				"system.heightening": heightening,
			});

			newSpell.rollDamage(this.#event);
		}

		if (spell.damageKinds.size) {
			bindOnPreCreateSpellDamageChatMessage(message);
		}

		this.close();
	}

	#onCancel(event) {
		event.preventDefault();
		this.close();
	}
}
