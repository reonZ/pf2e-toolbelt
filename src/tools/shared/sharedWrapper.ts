import { MODULE, libWrapper, registerWrapper, unregisterWrapper } from "pf2e-api";

function createSharedWrapper<TListener extends (...args: any[]) => any>(
    path: string,
    callback: (listeners: TListener[], wrapped: libWrapper.RegisterCallback, ...args: any[]) => any
) {
    let wrapperId: number | null = null;
    const listeners: Record<string, TListener> = {};

    const wrapper = function (this: any, wrapped: libWrapper.RegisterCallback, ...args: any[]) {
        try {
            return callback.call(this, Object.values(listeners), wrapped, ...args);
        } catch (error) {
            MODULE.error(`an error occured in the shared wrapper'\n${path}`, error);

            const wrapFn = args.splice(0)[0] as Function;
            wrapFn(...args);
        }
    };

    return {
        activate(id: string, callback: TListener) {
            if (!(id in listeners)) {
                listeners[id] = callback;
            }
            if (wrapperId === null) {
                wrapperId = registerWrapper(path, wrapper, "WRAPPER");
            }
        },
        disable(id: string) {
            if (id in listeners) {
                delete listeners[id];
            }
            if (wrapperId !== null && isEmpty(listeners)) {
                unregisterWrapper(wrapperId);
                wrapperId = null;
            }
        },
        toggle(id: string, callback: TListener, enabled: boolean) {
            if (enabled) this.activate(id, callback);
            else this.disable(id);
        },
    };
}

export { createSharedWrapper };
