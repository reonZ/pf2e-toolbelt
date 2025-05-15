import { DataModelCollection, IdField, localize, MODULE, R, setSetting } from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

class ResourceModel extends abstract.DataModel<null, ResourceSchema> {
    static defineSchema(): ResourceSchema {
        return {
            id: new IdField(),
            max: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 100,
            }),
            min: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 0,
            }),
            name: new fields.StringField({
                required: false,
                nullable: false,
                blank: true,
                initial: "",
            }),
            shared: new fields.BooleanField({
                required: false,
                nullable: false,
                initial: false,
            }),
            step1: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 1,
                min: 1,
            }),
            step2: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 1,
                min: 1,
            }),
            step3: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 1,
                min: 1,
            }),
            time: new fields.NumberField({
                required: false,
                nullable: false,
                initial: () => game.settings.get("core", "time"),
                min: 0,
            }),
            timeout: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 0,
                min: 0,
            }),
            value: new fields.NumberField({
                required: false,
                nullable: false,
                initial: 100,
            }),
        };
    }

    get label(): string {
        return this.name || this.id;
    }

    get isTimeout(): boolean {
        return this.timeout > 0 && this.value > this.min;
    }

    get ratio(): number {
        return (this.value - this.min) / (this.max - this.min);
    }

    get decrease(): string {
        return this.tooltip("decrease");
    }

    get increase(): string {
        return this.tooltip("increase");
    }

    tooltip(direction: "increase" | "decrease") {
        const steps = R.pipe(
            [
                "step1",
                ...(["step2", "step3"] as const).filter((step) => this[step] !== this.step1),
            ] as const,
            R.map((step) => {
                const value = this[step];
                const click = localize("resource-tracker.resource.steps", step);
                return localize("resource-tracker.resource", direction, { click, value });
            })
        );

        steps.unshift(localize("resource-tracker.resource.edit"));

        return steps.join("<br>");
    }

    updateSource(
        changes: Record<string, unknown> = {},
        options?: Partial<DocumentSourceUpdateContext>
    ): DeepPartial<this["_source"]> {
        const min = R.isNumber(changes.min) ? changes.min : this.min;

        if (R.isNumber(changes.max)) {
            changes.max = Math.max(changes.max, min + 2);
        }

        if (R.isNumber(changes.value)) {
            const max = R.isNumber(changes.max) ? changes.max : this.max;
            changes.value = Math.clamp(changes.value, min, max);
        }

        const diff = super.updateSource(changes, options);

        if ("timeout" in diff || ("value" in diff && !("time" in diff))) {
            return super.updateSource({ time: game.settings.get("core", "time") }, options);
        }

        return diff;
    }

    _initializeSource(data: object, options?: DataModelConstructionOptions<null>): this["_source"] {
        const source = super._initializeSource(data, options);

        source.max = Math.max(source.max, source.min + 2);
        source.value = Math.clamp(source.value, source.min, source.max);

        return source;
    }
}

class ResourceCollection extends DataModelCollection<ResourceModel> {
    #setting: string;

    constructor(setting: string, entries?: Resource[]) {
        super(ResourceModel, entries);

        this.#setting = setting;
    }

    save() {
        const entries = this.map((entry) => entry.toObject());
        return setSetting(this.#setting, entries);
    }
}

interface ResourceModel extends abstract.DataModel<null, ResourceSchema>, Resource {}

type ResourceSchema = {
    id: IdField;
    max: fields.NumberField<number, number, false, false, true>;
    min: fields.NumberField<number, number, false, false, true>;
    name: fields.StringField<string, string, false, false, true>;
    shared: fields.BooleanField<boolean, boolean, false, false, true>;
    step1: fields.NumberField<number, number, false, false, true>;
    step2: fields.NumberField<number, number, false, false, true>;
    step3: fields.NumberField<number, number, false, false, true>;
    time: fields.NumberField<number, number, false, false, true>;
    timeout: fields.NumberField<number, number, false, false, true>;
    value: fields.NumberField<number, number, false, false, true>;
};

type Resource = ModelPropsFromSchema<ResourceSchema>;

MODULE.devExpose({ ResourceModel });

export { ResourceModel, ResourceCollection };
export type { Resource };
