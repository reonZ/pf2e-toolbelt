export function htmlQuery(parent, selectors) {
    if (!(parent instanceof Element || parent instanceof Document)) return null
    return parent.querySelector(selectors)
}
