import { Coins, enrichHTML, isScriptMacro, MacroPF2e } from "foundry-helpers";
import { BaseFilter, CalulatedFilterPrice, DefaultFilter } from ".";
import {
    MerchantFilters,
    ServiceData,
    ServiceFilterData,
    ServiceSource,
    zServiceDefaultFilter,
    zServiceFilter,
} from "..";

class ServiceDefaultFilter extends DefaultFilter<typeof zServiceDefaultFilter> {
    static schema = zServiceDefaultFilter;

    calculatePrice(service: ServiceData): CalulatedFilterPrice {
        return calculateServicePrice(this, service);
    }
}

class ServiceFilter extends BaseFilter<typeof zServiceFilter> {
    static schema = zServiceFilter;

    testFilter(service: ServiceData): boolean {
        const { enabled, level, tag } = this;
        return enabled && service.level >= level && (!tag || service.tags.includes(tag));
    }

    getRatio(): number {
        return this.ratio;
    }

    calculatePrice(service: ServiceData): CalulatedFilterPrice {
        return calculateServicePrice(this, service);
    }
}

interface ServiceFilter extends ServiceFilterData {}

function calculateServicePrice(
    filter: ServiceDefaultFilter | ServiceFilter,
    service: ServiceData,
): CalulatedFilterPrice {
    const original = service.price;
    const ratio = filter?.getRatio() ?? 1;

    return {
        original,
        ratio,
        value: ratio === 1 ? original : original.scale(ratio),
    };
}

async function serviceToTemplate(service: ServiceData, filters: MerchantFilters<"service">): Promise<ServiceTemplate> {
    const filter = filters.find((filter) => filter.testFilter(service));
    const ratio = filter?.ratio ?? 1;
    const enrichedPrice = filter?.calculatePrice(service)?.value ?? service.price;

    return {
        ...service,
        enrichedDescription: await enrichHTML(service.description),
        enrichedPrice,
        isFree: enrichedPrice.copperValue === 0,
        isInfinite: service.quantity < 0,
        label: service.name || service.id,
        notForSell: !filter,
        originalPrice: ratio === 1 ? undefined : service.price,
        priceUpdate: ratio > 1 ? "expensive" : ratio < 1 ? "cheap" : "",
    };
}

async function getServiceMacro({ macroUUID }: { macroUUID?: string | null }): Promise<MacroPF2e | null> {
    const macro = macroUUID ? await fromUuid<MacroPF2e>(macroUUID) : null;
    return isScriptMacro(macro) ? macro : null;
}

type ServiceTemplate = ServiceSource & {
    enrichedDescription: string;
    enrichedPrice: Coins;
    isFree: boolean;
    isInfinite: boolean;
    label: string;
    notForSell: boolean;
    originalPrice: Coins | undefined;
    priceUpdate: "expensive" | "cheap" | "";
};

export { getServiceMacro, ServiceDefaultFilter, ServiceFilter, serviceToTemplate };
