import { MODULE_ID } from '../module'

export function registerWrapper(path, callback, type) {
    return libWrapper.register(MODULE_ID, path, callback, type)
}

export function unregisterWrapper(id) {
    libWrapper.unregister(MODULE_ID, id)
}
