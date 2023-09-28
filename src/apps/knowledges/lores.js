import { getFlag, setFlag, subLocalize, templatePath } from '../../module'

export class EditLores extends FormApplication {
    constructor(actor, options = {}) {
        const id = `npc-edit-lores-${actor.id}`
        super(actor, { ...options, id })
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: 'Edit Lores',
            template: templatePath('knowledges/lores.hbs'),
            width: 400,
        })
    }

    getData(options) {
        const actor = this.object

        return mergeObject(super.getData(options), {
            unspecified: getFlag(actor, 'unspecified') ?? '',
            specific: getFlag(actor, 'specific') ?? '',
            i18n: subLocalize('knowledges.editLore'),
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
