import {
	getBrowser,
	getBrowserTab,
	getEquipmentTabData,
	getFlag,
	render,
	setFlag,
	subLocalize,
	templatePath,
} from "module-api";
import noUiSlider from "nouislider";
import {
	PRICE_RATIO,
	clampPriceRatio,
	clampPurse,
	getBuyAll,
} from "../../features/merchant";

const localize = subLocalize("merchant.buy");

export class BuyItems extends Application {
	constructor(actor, options = {}) {
		super(options);

		this.actor = actor;

		this.defaultData = getEquipmentTabData({ collapsed: true });
		this.defaultData.name = "";

		this.editing = null;

		this.tabs = {
			equipment: {
				filterData: deepClone(this.defaultData),
				isOfType: (...types) => {
					return types.includes("equipment");
				},
			},
		};

		this.activeTab = "equipment";

		this.navigationTab = {
			active: "equipment",
		};

		this.expanded = {};
	}

	get id() {
		return `pf2e-toolbelt-buy-${this.actor.id}`;
	}

	get title() {
		return localize("title", this.actor);
	}

	get template() {
		return templatePath("merchant/buy");
	}

	get tab() {
		return this.tabs.equipment;
	}

	get filters() {
		return getFlag(this.actor, "merchant.filters") ?? [];
	}

	async setFilters(filters, reset = false) {
		if (reset) this.resetFilters();
		await setFlag(this.actor, "merchant.filters", filters);
		this.render();
	}

	render(force, options) {
		this.actor.apps[this.appId] = this;
		return super.render(force, options);
	}

	async close(options) {
		await super.close(options);
		delete this.actor.apps?.[this.appId];
	}

	async getData(options) {
		const filters = this.filters;
		const defaultRatio = getFlag(this.actor, "merchant.buyRatio");
		const defaultPurse = getFlag(this.actor, "merchant.buyPurse");

		const formatPurse = (value) => {
			const clamped = clampPurse(value);
			return clamped < 0 ? "" : Math.floor(clamped);
		};

		const getSummary = (filter) => {
			const summary = [];

			const getDefaultData = (category, type) => {
				const defaultData = this.defaultData[category][type];
				return {
					defaultData,
					title: game.i18n.localize(defaultData.label),
				};
			};

			const checkboxes = Object.entries(filter.checkboxes ?? {});
			for (const [type, { selected }] of checkboxes) {
				const { title, defaultData } = getDefaultData("checkboxes", type);
				const row = selected
					.map((entry) => defaultData.options[entry].label)
					.join(", ");
				summary.push({ title, row });
			}

			const multiselects = Object.entries(filter.multiselects ?? {});
			for (const [type, { selected, conjunction }] of multiselects) {
				const { title } = getDefaultData("multiselects", type);
				const row = selected
					.map(({ label, not }) => {
						if (not) return `<s>${label}</s>`;
						return label;
					})
					.join(", ");
				summary.push({ title: `${title} (${conjunction})`, row });
			}

			for (const category of ["ranges", "sliders"]) {
				const entries = Object.entries(filter[category] ?? {});
				for (const [type, { values }] of entries) {
					const { title } = getDefaultData(category, type);
					const min = values.inputMin ?? values.min;
					const max = values.inputMax ?? values.max;
					const row = `${min} - ${max}`;
					summary.push({ title, row });
				}
			}

			return summary
				.map(({ title, row }) => `<div><strong>${title}: </strong>${row}</div>`)
				.join("");
		};

		return {
			...this.tabs.equipment,
			...localize.i18n,
			filters: filters.map((filter) => ({
				...filter,
				summary: getSummary(filter),
				expanded: this.expanded[filter.id],
				name: this.getFilterName(filter),
				purse: formatPurse(filter.purse),
				priceRatio: clampPriceRatio("buy", filter.priceRatio),
			})),
			defaultFilter: {
				id: "",
				name: localize("default.label"),
				purse: formatPurse(defaultPurse),
				priceRatio: clampPriceRatio("buy", defaultRatio),
				buyAll: getBuyAll(this.actor),
			},
			priceRatio: PRICE_RATIO,
		};
	}

	async activateListeners(html) {
		const filterData = this.tab.filterData;

		const controlArea = html.find(".control-area");
		controlArea.find("[id]").removeAttr("id");
		controlArea.find("[data-filter-name='source']").remove();

		const sortcontainer = controlArea.find(".sortcontainer");
		sortcontainer.children().remove();

		const extra = await render("merchant/extra", {
			value: filterData.name,
			editing: this.editing,
			...localize.i18n,
		});

		sortcontainer.append(extra);

		sortcontainer.find("[name=filter-name]").on("change", (event) => {
			filterData.name = event.currentTarget.value.trim();
		});

		sortcontainer.find("button").on("click", (event) => {
			event.preventDefault();

			const { action } = event.currentTarget.dataset;

			switch (action) {
				case "reset-filter":
					this.resetFilters();
					break;
				case "save-filter":
					this.saveFilter();
					break;
			}
		});

		const filtercontainers = controlArea.find(
			".filtercontainer:not([data-filter-type=multiselects])",
		);
		for (const container of filtercontainers) {
			const { filterType, filterName } = container.dataset;
			const data = filterData[filterType][filterName];

			const title = container.querySelector(".title");
			title.querySelector("button")?.remove();

			const content = title.nextElementSibling;
			title.addEventListener("click", () => {
				content.style.display = data.isExpanded ? "none" : "";
				data.isExpanded = !data.isExpanded;
			});
			content.style.display = data.isExpanded ? "" : "none";

			container.setAttribute("data-buy-filter-type", filterType);
			container.setAttribute("data-buy-filter-name", filterName);

			container.removeAttribute("data-filter-type");
			container.removeAttribute("data-filter-name");

			if (filterType === "sliders") {
				const sliderElement = content.querySelector("[class^=slider-]");
				const slider = noUiSlider.create(sliderElement, {
					range: {
						min: data.values.lowerLimit,
						max: data.values.upperLimit,
					},
					start: [data.values.min, data.values.max],
					tooltips: {
						to(value) {
							return Math.floor(value).toString();
						},
					},
					connect: [false, true, false],
					behaviour: "snap",
					step: data.values.step,
				});

				const minLabel = sliderElement.previousElementSibling;
				const maxLabel = sliderElement.nextElementSibling;

				slider.on("change", (values) => {
					const [min, max] = values.map((value) => Number(value));

					data.values.min = min;
					data.values.max = max;

					minLabel.textContent = min;
					maxLabel.textContent = max;
				});
			} else if (filterType === "ranges") {
				const lowerEl = content.querySelector("input[name^=lowerBound]");
				const upperEl = content.querySelector("input[name^=upperBound]");
				for (const range of [lowerEl, upperEl]) {
					range.addEventListener("change", () => {
						const lowerBound = lowerEl.value ?? "";
						const upperBound = upperEl.value ?? "";
						const values = this.parseRangeFilterInput(
							filterName,
							lowerBound,
							upperBound,
						);
						data.values = values;
						data.changed = true;
						lowerEl.value = values.inputMin;
						upperEl.value = values.inputMax;
					});
				}
			} else if (filterType === "checkboxes") {
				const checkboxes = container.querySelectorAll("input[type=checkbox]");
				for (const checkboxElement of checkboxes) {
					checkboxElement.addEventListener("click", () => {
						const optionName = checkboxElement.name;
						const option = data.options[optionName];
						option.selected = !option.selected;
						if (option.selected) {
							data.selected.push(optionName);
						} else {
							data.selected = data.selected.filter(
								(name) => name !== optionName,
							);
						}
					});
				}
			}
		}

		html
			.find("input[type=text], input[type=search], input[type=number]")
			.on("keyup", (event) => {
				if (event.key !== "Enter") return;
				event.currentTarget.blur();
			});

		getBrowser().activateListeners.call(this, html);

		const filterElements = html.find(".filters .filter");

		const getFilterId = (event) => {
			const filterElement = event.currentTarget.closest("[data-filter-id]");
			return {
				filterElement,
				filterId: filterElement.dataset.filterId,
			};
		};

		filterElements.find("[data-action]").on("click", (event) => {
			event.preventDefault();

			const { filterId, filterElement } = getFilterId(event);
			const { direction, action } = event.currentTarget.dataset;

			switch (action) {
				case "delete-filter":
					this.deleteFilter(filterId);
					break;
				case "move-filter":
					this.moveFilterPosition(filterId, direction);
					break;
				case "edit-filter":
					this.editFilter(filterId);
					break;
				case "toggle-summary":
					this.toggleFilterSummary(filterElement, filterId);
					break;
			}
		});

		const setFilterValue = (filterId, key, value) => {
			if (!filterId) {
				setFlag(this.actor, `merchant.${key}`, value);
				return;
			}

			const filters = this.filters.slice();
			const filter = filters.find((f) => f.id === filterId);
			if (!filter) return;

			filter[key] = value;
			this.setFilters(filters);
		};

		filterElements.find("[name=price-ratio]").on("change", (event) => {
			const { filterId } = getFilterId(event);
			const value = event.currentTarget.valueAsNumber;
			const ratio = clampPriceRatio("buy", value);
			setFilterValue(filterId, filterId ? "priceRatio" : "buyRatio", ratio);
		});

		filterElements.find("[name=purse]").on("change", (event) => {
			const { filterId } = getFilterId(event);
			const value = event.currentTarget.value;
			const purse = clampPurse(value);
			setFilterValue(filterId, filterId ? "purse" : "buyPurse", purse);
		});

		filterElements.find("[name=buy-all]").on("change", (event) => {
			const value = event.currentTarget.checked;
			setFlag(this.actor, "merchant.buyAll", value);
		});
	}

	toggleFilterSummary(filterElement, filterId) {
		const isExpanded = this.expanded[filterId];
		this.expanded[filterId] = !isExpanded;
		filterElement.classList.toggle("expanded", !isExpanded);
	}

	editFilter(filterId) {
		const filter = this.filters.find((f) => f.id === filterId);
		if (!filter) return;

		const filterData = getEquipmentTabData({
			collapsed: true,
			mergeWith: deepClone(filter),
		});

		this.tab.filterData = filterData;
		this.editing = filterId;
		this.render();
	}

	deleteFilter(filterId, skipConfirm = false) {
		const filters = this.filters.slice();
		const index = filters.findIndex((f) => f.id === filterId);
		if (index === -1) return;

		const deleteIt = () => {
			filters.splice(index, 1);
			this.setFilters(filters, this.editing === filterId);
		};

		if (skipConfirm) {
			deleteIt();
			return;
		}

		Dialog.confirm({
			title: localize("delete.title"),
			content: localize("delete.content", {
				name: filters[index].name,
			}),
			yes: () => {
				const index = filters.findIndex((f) => f.id === filterId);
				if (index !== -1) deleteIt();
			},
		});
	}

	moveFilterPosition(filterId, direction) {
		const filters = this.filters.slice();
		if (filters.length < 2) return;

		const index = filters.findIndex((f) => f.id === filterId);
		if (index === -1) return;

		if (direction === "up" && index === 0) return;
		if (direction === "down" && index === filters.length - 1) return;

		const newIndex = direction === "down" ? index + 1 : index - 1;
		const filter = filters.splice(index, 1)[0];
		filters.splice(newIndex, 0, filter);

		this.setFilters(filters);
	}

	parseRangeFilterInput(name, lowerRange, upperRange) {
		const tab = getBrowserTab("equipment");

		const defaultRange = this.defaultData.ranges[name].values;
		const lower = lowerRange.trim() || defaultRange.inputMin;
		const upper = upperRange.trim() || defaultRange.inputMax;

		const values = tab.parseRangeFilterInput(name, lower, upper);
		if (values.max < values.min) {
			values.max = values.min;
			values.inputMax = values.inputMin;
		}

		return values;
	}

	resetFilters() {
		this.editing = null;
		this.tab.filterData = deepClone(this.defaultData);
		this.render(false, { force: true });
	}

	static compareItemWithFilter(item, filterData) {
		const tab = getBrowserTab("equipment");
		const {
			checkboxes = {},
			multiselects = {},
			ranges = {},
			sliders = {},
		} = filterData;

		// Level
		if (
			sliders.level &&
			(item.level < sliders.level.values.min ||
				item.level > sliders.level.values.max)
		) {
			return false;
		}
		// Price
		if (
			ranges.price &&
			(item.priceInCopper < ranges.price.values.min ||
				item.priceInCopper > ranges.price.values.max)
		) {
			return false;
		}
		// Item type
		if (
			checkboxes.itemTypes?.selected.length > 0 &&
			!checkboxes.itemTypes.selected.includes(item.type)
		) {
			return false;
		}
		// Armor
		if (
			checkboxes.armorTypes?.selected.length > 0 &&
			!tab.arrayIncludes(checkboxes.armorTypes.selected, [
				item.category,
				item.group,
			])
		) {
			return false;
		}
		// Weapon categories
		if (
			checkboxes.weaponTypes?.selected.length > 0 &&
			!tab.arrayIncludes(checkboxes.weaponTypes.selected, [
				item.category,
				item.group,
			])
		) {
			return false;
		}
		// Traits
		if (
			multiselects.traits &&
			!tab.filterTraits(
				[...item.traits],
				multiselects.traits.selected,
				multiselects.traits.conjunction,
			)
		) {
			return false;
		}
		// Source
		if (
			checkboxes.source?.selected.length > 0 &&
			!checkboxes.source.selected.includes(item.source)
		) {
			return false;
		}
		// Rarity
		if (
			checkboxes.rarity?.selected.length > 0 &&
			!checkboxes.rarity.selected.includes(item.rarity)
		) {
			return false;
		}

		return true;
	}

	getFilterName(filter) {
		return filter.name || `filter-${filter.id}`;
	}

	extractFilterData() {
		const defaultData = this.defaultData;
		const filterData = this.tab.filterData;
		const extractedData = {};

		for (const type of ["checkboxes", "multiselects"]) {
			for (const [category, data] of Object.entries(filterData[type])) {
				if (!data.selected.length) continue;

				const path = `${type}.${category}`;
				setProperty(extractedData, `${path}.selected`, data.selected);
				if (type === "multiselects") {
					setProperty(extractedData, `${path}.conjunction`, data.conjunction);
				}
			}
		}

		for (const type of ["ranges", "sliders"]) {
			const defaultType = defaultData[type];

			for (const [category, data] of Object.entries(filterData[type])) {
				const defaultCategory = defaultType[category];
				if (objectsEqual(data.values, defaultCategory.values)) continue;
				setProperty(extractedData, `${type}.${category}.values`, data.values);
			}
		}

		if (isEmpty(extractedData)) return;

		extractedData.name = filterData.name.trim();
		extractedData.id = filterData.id ?? randomID();
		extractedData.priceRatio = filterData.priceRatio;
		extractedData.purse = filterData.purse;

		return extractedData;
	}

	saveFilter() {
		const filter = this.extractFilterData();
		if (!filter) {
			localize.warn("empty");
			return;
		}

		const allFilters = this.filters.slice();

		if (this.editing) {
			const index = allFilters.findIndex((x) => x.id === this.editing);
			if (index === -1) return;
			allFilters[index] = filter;
		} else {
			allFilters.push(filter);
		}

		localize.info(this.editing ? "saved" : "created", {
			name: this.getFilterName(filter),
		});
		this.setFilters(allFilters, true);
	}
}
