export class MoveLootPopup extends FormApplication {
    constructor(object, options, callback) {
        super(object, options)
        this.onSubmitCallback = callback
    }

    async getData() {
        const [prompt, buttonLabel] = this.options.isPurchase
            ? ['PF2E.loot.PurchaseLootMessage', 'PF2E.loot.PurchaseLoot']
            : ['PF2E.loot.MoveLootMessage', 'PF2E.loot.MoveLoot']

        return {
            ...(await super.getData()),
            maxQuantity: this.options.maxQuantity,
            newStack: this.options.newStack,
            lockStack: this.options.lockStack,
            prompt,
            buttonLabel,
        }
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: 'MoveLootPopup',
            classes: [],
            title: game.i18n.localize('PF2E.loot.MoveLootPopupTitle'),
            template: 'systems/pf2e/templates/popups/loot/move-loot-popup.hbs',
            width: 'auto',
            maxQuantity: 1,
            newStack: false,
            lockStack: false,
            isPurchase: false,
        }
    }

    async _updateObject(_event, formData) {
        this.onSubmitCallback(formData.quantity, formData.newStack)
    }
}
