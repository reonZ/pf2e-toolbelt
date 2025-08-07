import { CreaturePF2e, R } from "module-helpers";
import {
    ALL_SHARE_DATA,
    CHARACTER_MASTER_SHARE_DATA,
    CHARACTER_SHARE_DATA,
    isValidMaster,
    ShareDataType,
} from ".";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

class ShareDataModel extends abstract.DataModel<null, ShareDataSchema> {
    static defineSchema(): ShareDataSchema {
        const CreaturePF2eCls = Reflect.getPrototypeOf(
            CONFIG.PF2E.Actor.documentClasses.npc
        ) as ConstructorOf<CreaturePF2e>;

        return {
            master: new fields.ForeignDocumentField(CreaturePF2eCls),
            ...R.mapToObj(ALL_SHARE_DATA, (option) => {
                return [
                    option,
                    new fields.BooleanField<boolean, boolean, false, false, true>({
                        required: false,
                        nullable: false,
                        initial: false,
                    }),
                ] as const;
            }),
        };
    }

    protected _initializeSource(
        data: object,
        options?: DataModelConstructionOptions<null> | undefined
    ): this["_source"] {
        const source = super._initializeSource(data, options);

        const disableOptions = (options: ReadonlyArray<ShareDataType>) => {
            for (const option of options) {
                source[option] = false;
            }
            return source;
        };

        if (!source.master) {
            return disableOptions(ALL_SHARE_DATA);
        }

        const master = game.actors.get(source.master);
        if (!isValidMaster(master)) {
            source.master = null;
            return disableOptions(ALL_SHARE_DATA);
        }

        if (master.isOfType("npc")) {
            return disableOptions([...CHARACTER_SHARE_DATA, ...CHARACTER_MASTER_SHARE_DATA]);
        }

        return source;
    }
}

interface ShareDataModel extends ModelPropsFromSchema<ShareDataSchema> {}

type ShareDataSchema = Record<
    ShareDataType,
    fields.BooleanField<boolean, boolean, false, false, true>
> & {
    master: fields.ForeignDocumentField<CreaturePF2e>;
};

type ShareDataSource = SourceFromSchema<ShareDataSchema>;

export { ShareDataModel };
export type { ShareDataSource };
