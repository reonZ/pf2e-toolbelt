import { registerWrapper, unregisterWrapper, wrapperError } from "module-helpers";

function createSharedWrapper<TListener extends (...args: any[]) => any>(
    path: string,
    callback: (
        wrapperError: (error: Error) => void,
        listeners: TListener[],
        wrapped: libWrapper.RegisterCallback,
        ...args: any[]
    ) => any,
    type: Exclude<libWrapper.RegisterType, "OVERRIDE"> = "WRAPPER"
) {
    let wrapperId: number | null = null;
    const listeners: Record<string, TListener> = {};

    const wrapper = function (this: any, wrapped: libWrapper.RegisterCallback, ...args: any[]) {
        return callback.call(
            this,
            (error) => wrapperError(path, error),
            Object.values(listeners),
            wrapped,
            ...args
        );
    };

    return {
        activate(id: string, callback: TListener) {
            if (!(id in listeners)) {
                listeners[id] = callback;
            }
            if (wrapperId === null) {
                wrapperId = registerWrapper(path, wrapper, type);
            }
        },
        disable(id: string) {
            if (id in listeners) {
                delete listeners[id];
            }
            if (wrapperId !== null && foundry.utils.isEmpty(listeners)) {
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
