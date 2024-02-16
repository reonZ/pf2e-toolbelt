type ValueOf<T> = T[keyof T]
type PartialOf<T, K> = Omit<T, K> & Partial<Pick<T, K>>
type RequiredOf<T, K> = Omit<T, K> & Required<Pick<T, K>>
type KeysOfType<T, V> = keyof { [P in keyof T as T[P] extends V ? P : never]: P } & keyof T
type AtLeastOneOf<T> = {
    [K in keyof T]: { [L in K]: T[L] } & { [L in Exclude<keyof T, K>]?: T[L] }
}[keyof T]

declare type OptionsFilter<T> = {
    string?: Array<KeysOfType<T, string>>
    number?: Array<KeysOfType<T, number>>
    boolean?: Array<KeysOfType<T, boolean>>
    function?: Array<KeysOfType<T, DraggableFunction | DraggableDragEndFunction | DroppableFunction | DroppableDropFunction>>
}

declare type DraggableOptions = {
    element: HTMLElement
    /**
     * unique identifier, can be useful to make sure the draggable was started
     * in the current application render
     */
    identifier?: string
    selector?: string
    filter?: string
    /**
     * class added to the element initiating the drag event
     */
    draggedClass?: string
    /**
     * class added to the ghost element
     */
    ghostClass?: string
    /**
     * cursor distance moved before the drag event actually starts
     * default: 6
     */
    triggerDistance?: number
    /**
     * cancels the current drag event with mouse right click
     *
     * default: true
     */
    cancelOnRightClick?: boolean
    cursorImage?: {
        id?: string
        img?: (target: HTMLElement) => string | HTMLElement
    }
    droppables?: DroppableOptions[]
    createGhost?: DraggableGhostFunction
    onCancel?: DraggableFunction
    onDragStart?: DraggableFunction
    onDragEnd?: DraggableDragEndFunction
}

declare type DroppableOptions = {
    element: HTMLElement
    selector?: string
    /**
     * selector to filter out elements, it will check up to the element root
     */
    filter?: string
    /**
     * class to be set on drag enter and removed on drag leave
     */
    overClass?: string
    /**
     * should the classList be purged on drag leave
     */
    purgeOnLeave?: boolean
    onDragEnter?: DroppableFunction
    onDragOver?: DroppableFunction
    onDragLeave?: DroppableFunction
    onDrop?: DroppableDropFunction
}

declare type DraggableGhostFunction = (
    draggedElement: HTMLElement,
    draggedIndex: number
) => { element?: HTMLElement; index?: number }

declare type DraggableFunction = (event: MouseEvent, draggable: DraggableObj) => Promise<void>
declare type DraggableDragEndFunction = (
    event: MouseEvent,
    draggable: DraggableObj,
    options: { canceled: boolean; dropped: boolean }
) => Promise<void>

declare type DroppableFunction = (event: MouseEvent, draggable: DraggableObj, droppable: DroppableObj) => Promise<void>
declare type DroppableDropFunction = (event: MouseEvent, draggable: DraggableObj, droppable: DroppableObj) => Promise<boolean>

declare type ProcessedDraggableOptions = RequiredOf<
    DraggableOptions,
    'draggedClass' | 'triggerDistance' | 'cancelOnRightClick' | 'droppables'
> & {
    cursorImage: {
        id: string
    }
}

declare type ProcessedDroppableOptions = DroppableOptions & { id: number }

declare type DraggableData = {
    dragging: boolean
    dropped: boolean
    canceled: boolean
    options: ProcessedDraggableOptions
    cursorElement: HTMLElement
    draggable: DraggableObj
    droppables: ProcessedDroppableOptions[]
    hovered: Record<number, DroppableHoveredObj>
}

declare type DroppableHoveredObj = {
    id: number
    droppable: ProcessedDroppableOptions
    element: HTMLElement
    triggeringElement: HTMLElement
    classList: DraggableClassList
}

declare type DraggableClassList = Set<string> & {
    purge: () => void
    add: (value: string) => void
    remove: (value: string) => void
    toggle: (value: string, enabled?: boolean) => void
}

declare type DraggableObj = {
    identifier?: string
    classList: DraggableClassList
    triggeringElement: HTMLElement
    element: HTMLElement
    parent: HTMLElement
    index: number
    x: number
    y: number
    readonly ghost: DraggableGhost | undefined
    resetPosition: () => void
}

declare type DraggableGhost = {
    element: HTMLElement
    classList: DraggableClassList
    index: number
    reset: () => void
}

declare type DroppableObj = {
    element: HTMLElement
    triggeringElement: HTMLElement
    classList: DraggableClassList
}
