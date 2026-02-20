import { Coins, z, ZodDocument } from "foundry-helpers";
import { DefaultFilterData } from "..";

abstract class BaseFilter<T extends z.ZodObject = z.ZodObject> extends ZodDocument<T> {
    abstract calculatePrice(...args: any[]): CalulatedFilterPrice;
    abstract getRatio(...args: any[]): number;
    abstract testFilter(...args: any[]): boolean;
}

abstract class DefaultFilter<T extends z.ZodObject = z.ZodObject> extends BaseFilter<T> {
    get id(): string {
        return "default";
    }

    get name(): string {
        return game.i18n.localize("Default");
    }

    testFilter() {
        return this.enabled;
    }

    getRatio(...args: any[]): number {
        return this.ratio;
    }

    abstract calculatePrice(...args: any[]): CalulatedFilterPrice;
}

interface DefaultFilter extends DefaultFilterData {}

type CalulatedFilterPrice = {
    ratio: number;
    original: Coins;
    value: Coins;
};

export { BaseFilter, DefaultFilter };
export type { CalulatedFilterPrice };
