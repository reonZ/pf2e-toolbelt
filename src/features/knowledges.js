import { EditLores } from '../apps/knowledges/lores'
import { getFlag, getSetting } from '../module'
import { createHook } from './shared/hook'

const setHook = createHook('renderNPCSheetPF2e', renderNPCSheetPF2e)

export function registerKnowledges() {
    return {
        settings: [
            {
                name: 'knowledges',
                type: Boolean,
                default: false,
                onChange: value => setHook(value),
            },
        ],
        conflicts: ['pf2e-npc-knowledges'],
        ready: isGM => {
            if (isGM && getSetting('knowledges')) setHook(true)
        },
    }
}

function renderNPCSheetPF2e(sheet, $html) {
    const actor = sheet.actor

    replaceLores(actor, $html)
    addEditButton($html)
    addEvents(actor, $html)
}

function knowledgeSelector(html, section, selector) {
    return html.find(
        `[data-tab="main"] .recall-knowledge ${section === 'header' ? '.section-header' : '.section-body'} ${selector}`
    )
}

function editLores(actor) {
    new EditLores(actor).render(true)
}

function replaceLores(actor, html) {
    const unspecifics = getFlag(actor, 'unspecified')
    const specifics = getFlag(actor, 'specific')
    if (!unspecifics && !specifics) return

    const lores = actor.identificationDCs.lore
    const body = knowledgeSelector(html, 'body', '')
    body.find('.identification-skills').last().remove()

    function tag(skills, dc, adjustment) {
        const content = game.i18n.format('PF2E.Actor.NPC.Identification.Skills.Label', { skills, dc, adjustment })
        return `<div class="tag-legacy identification-skills tooltipstered">${content}</div>`
    }

    function addTags(lores, { dc, start }) {
        const tags = lores
            .split(',')
            .filter(lore => lore.trim())
            .map(lore => tag(lore, dc, start))
            .join('')
        body.append(tags)
    }

    addTags(unspecifics || 'Unspecific', lores[0])
    addTags(specifics || 'Specific', lores[1])
}

function addEvents(actor, html) {
    const edit = knowledgeSelector(html, 'header', 'button.edit')
    edit.on('click', () => editLores(actor))
}

function addEditButton(html) {
    const attempts = knowledgeSelector(html, 'header', 'button')
    const edit = '<button type="button" class="breakdown edit">Edit</button>'
    attempts.before(edit)
}
