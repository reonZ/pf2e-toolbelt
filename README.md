# FoundryVTT PF2e ToolBelt

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/K3K6M2V13)

### This module adds some utilities that are not big enough to warrant standalone modules

# Automatic Rune Progression (Requires Reload)

This feature is made to replace the `Automatic Bonus Progression` variant rule, instead it will automatically give the `potency`, `striking` and `resilient` runes on character's equipment when appropriate. Nothing else from the regular `Automatic Bonus Progression` will be replicated.

Alchemical bombs, `Specific Magic` items, the `Shield Bash` weapon/maneuver and all the items that have been flagged by the `PF2e Companion Compedia` module are exceptions to this feature.

The module will automatically disable the system `Automatic Bonus Progression` variant rule to function properly when this feature is enabled.

# No Dropped Bulk (Requires Reload)

Dropped equipment in an actor's inventory won't be accounted for bulk value calculation

# Npc Lore Knowledges

This feature adds the ability to set custom lores for NPCs.

![](./readme/knowledges/edit.webp)

A new `Edit` button is added to the `Recall Knowledge` section of the NPC sheet which opens a new window where both the `Unspecified` and `Specific` lores can be set.

More than one of each can be set, simply by separating them with commas.

![](./readme/knowledges/result.webp)

Once saved, the custom Lores will replace the generic ones on the sheet.

# Set Un-Identified Image

Automatically set the un-identifed image of items to be the same as the regular image

-   `On Creation Only:` Should the un-identified image be set for newly created or imported items
-   `On Creation & Update:` Should the un-identified image also be set when the image of an item is updated

# Remove Effect Shortcut

![](./readme/effects/remove.webp)

Using `[Shift + Right Click]` on effect icons in the effects panel will instantly remove all its charges/counters/badges

# Condition Sheet Icon

Adds the `open sheet` icon to conditions in the effects panel just like it would for non-condition effects

# CHANGELOG

You can see the changelog [HERE](./CHANGELOG.md)
