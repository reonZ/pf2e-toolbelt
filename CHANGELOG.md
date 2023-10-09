# 1.5.0

-   added `Hero Actions` setting, this feature replaces the `PF2e Hero Actions`
    -   it uses the same data as the standalone module, therefore, nothing will be lost when switching
    -   you will need to provide the UUID of your table in the settings if you had one in the standalone module
    -   the module doesn't have any compendium pack for the macros, they are still exposed in the API and are easy to setup
-   added `Stances` setting, this feature replaces the `PF2e Stances` module but works a bit differently now that the system has changed
    -   stance feats/features are no longer hardcoded into the module, it now looks at the system's compendium
    -   you can now add custom compendiums and world feat/features as long as they respect the following
        -   the feats/features must have the `Stance` trait
        -   the feats/features must have a self-applied effect
-   now order settings by scope for the GM (`world` then `client`) and added a `Client Settings` header in the module settings tab

# 1.4.0

-   added `Giveth` setting, this feature replaces the `PF2e Giveth` module

# 1.3.0

-   added `Spells Summary` setting, this feature replaces the `PF2e Spells Summary` module

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
