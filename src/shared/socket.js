import { MODULE_ID } from '../module'

export function socketOn(callback) {
    game.socket.on(`module.${MODULE_ID}`, callback)
}

export function socketOff(callback) {
    game.socket.off(`module.${MODULE_ID}`, callback)
}

export function socketEmit(packet) {
    game.socket.emit(`module.${MODULE_ID}`, packet)
}
