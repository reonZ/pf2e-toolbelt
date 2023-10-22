import { MODULE_ID } from '../module'

export function templatePath(...path) {
    path = path.filter(x => typeof x === 'string')
    return `modules/${MODULE_ID}/templates/${path.join('/')}.hbs`
}
