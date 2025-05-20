import { PersistentHook, Wrapper } from "module-helpers";

function toggleWrappersAndHooks(entries: (Wrapper | PersistentHook)[], enabled: boolean) {
    for (const entry of entries) {
        entry.toggle(enabled);
    }
}

export { toggleWrappersAndHooks };
