import { getFlag, setFlag } from '../../shared/flags'
import { subLocalize } from '../../shared/localize'
import { templatePath } from '../../shared/path'

const localize = subLocalize('knowledges.editLore')

export class EditLores extends FormApplication {
    get actor() {
        return this.object
    }

    get id() {
        return `npc-edit-lores-${this.actor.id}`
    }

    get title() {
        return localize('title', this.actor)
    }

    get template() {
        return templatePath('knowledges/lores')
    }

    getData(options) {
        const actor = this.actor

        return mergeObject(super.getData(options), {
            unspecified: getFlag(actor, 'unspecified') ?? '',
            specific: getFlag(actor, 'specific') ?? '',
            i18n: localize,
        })
    }

    async _updateObject(event, { unspecified, specific }) {
        const actor = this.object
        setFlag(actor, 'unspecified', unspecified.trim())
        setFlag(actor, 'specific', specific.trim())
    }

    activateListeners(html) {
        html.find('button.cancel').on('click', this.#onCancel.bind(this))
    }

    #onCancel(event) {
        event.preventDefault()
        this.close()
    }
}
