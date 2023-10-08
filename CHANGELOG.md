# 1.2.1

-   `Multi-Cast` button and `Merge Damage` icon will only be shown if you are the author of the message (or the GM)

# 1.2.0

-   completely remove event hook when both `Remove Effect Shortcut` & `Condition Sheet Icon` are disabled
-   added `Multi-Cast` setting, it adds a new damage button for spells to directly roll multiple instances of the spell in one roll
-   added `Merge Damage` setting which allows you to merge multiple damage roll messages into a single one, useful for actions that require you to add the damage before applying `weakness` and `resistance`
    -   the module will look at the 5 messages above it to find a matching message
    -   the other message needs to have been initiated from the same `Item` (and therefore `Actor`)
    -   the other message needs to have the same target (or both no target)

# 1.1.0

-   module conflict warnings are only shown to the GM
-   Remove Effect Shortcut: no longer accepts `Ctrl + Right Click`

# 1.0.0

this module adds some utilities that are not big enough to warrant standalone modules:

-   `No Dropped Bulk`: Dropped equipment in an actor's inventory won't be accounted for bulk value calculation

it will also overlap with some other modules (it is meant to replace them):

-   PF2e Unided
-   PF2e Automatic Rune Progression
-   PF2e Npc Knowledges
-   PF2e Effect Description

when such module is active in your world, the GM will receive a warning for each one of them
