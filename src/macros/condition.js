import { subLocalize } from '../shared/localize'
import { templatePath } from '../shared/path'

const localize = subLocalize('macros.condition')

export async function permaConditionEffect(actor) {
    const callback = (html, type) => {
        const condition = html.find('[name=condition]')
        return {
            type,
            name:
                html.find('[name=name]').val().trim() ||
                localize('effect-name', { condition: condition.find(':selected').data().name }),
            uuid: condition.val(),
            badge: Number(html.find('[name=badge]').val() || 1),
            img: condition.find(':selected').data().img,
            unidentified: html.find('[name=unidentified]').prop('checked'),
        }
    }

    const buttons = {
        generate: {
            icon: '<i class="fas fa-suitcase"></i>',
            label: localize('generate'),
            callback: html => callback(html, 'generate'),
        },
        add: {
            icon: '<i class="fa-solid fa-user"></i>',
            label: localize('add'),
            callback: html => callback(html, 'add'),
        },
    }

    const content = await renderTemplate(templatePath('macros/condition'), {
        i18n: localize,
        conditions: Array.from(
            new Set(Array.from(game.pf2e.ConditionManager.conditions.values()).sort((a, b) => a.name.localeCompare(b.name)))
        ),
    })

    const setName = html => {
        const condition = html.find('[name=condition] :selected').data().name
        html.find('[name=name]').attr('placeholder', localize('effect-name', { condition }))
    }

    const result = await Dialog.wait(
        {
            buttons,
            content,
            title: localize('title'),
            close: () => null,
            render: html => {
                setName(html)
                html.find('[name=condition]').on('change', () => setName(html))
            },
        },
        {
            id: 'pf2e-toolbelt-macros-condition',
            width: 320,
        }
    )

    if (!result) return

    const rule = {
        inMemoryOnly: true,
        key: 'GrantItem',
        uuid: result.uuid,
    }

    if (result.badge > 1) {
        rule.alterations = [
            {
                mode: 'override',
                property: 'badge-value',
                value: result.badge,
            },
        ]
    }

    const source = {
        name: result.name,
        type: 'effect',
        img: result.img,
        system: {
            rules: [rule],
            unidentified: result.unidentified,
        },
    }

    if (result.type === 'generate' || !actor) await Item.create(source)
    else await actor.createEmbeddedDocuments('Item', [source])
}
