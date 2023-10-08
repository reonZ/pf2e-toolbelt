# FoundryVTT PF2e ToolBelt

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/K3K6M2V13)

### This module adds some utilities that are not big enough to warrant standalone modules

# Automatic Rune Progression (Requires Reload)

This feature is made to replace the `Automatic Bonus Progression` variant rule, instead it will automatically give the `potency`, `striking` and `resilient` runes on character's equipment when appropriate. Nothing else from the regular `Automatic Bonus Progression` will be replicated.

Alchemical bombs, `Specific Magic` items, the `Shield Bash` weapon/maneuver and all the items that have been flagged by the `PF2e Companion Compedia` module are exceptions to this feature.

The module will automatically disable the system `Automatic Bonus Progression` variant rule to function properly when this feature is enabled.

# No Dropped Bulk (Requires Reload)

Dropped equipment in an actor's inventory won't be accounted for bulk value calculation

# Giveth

**IMPORTANT: A GM needs to be logged into your world to allow players to giveth their hard earned belongings.**

This module will allow players to give items to actors owned by the other players without any fuss, a simple drag & drop on a token and voila.

Players can also drag & drop effects/conditions that originated from them onto another actor that is owned by a player (the effect will lose its `unidentified` status and will have its `showIcon` set to `true` to avoid any possible weirdness), though this can sometimes result in some weirdness when effects rely on actor levels and such.

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

# Merge Damage

A new icon will appear in damage roll messages allowing the merging of the message with another one of the same type preceding it

-   the module will look at the 5 messages above it to find a matching message
-   the other message needs to have been initiated from the same `Item` (and therefore `Actor`)
-   the other message needs to have the same target (or both no target)

You can keep merging messages as long as the module find one appropriate

# Multi-Cast

A new `Multi` button will appear next to spells `Damage` button allowing the cast of multiple instances of the spell at once with only one chat message displayed

When this setting is enabled/disabled, the last 10 messages will be modified to add/remove the `Multi` button

# Remove Effect Shortcut

![](./readme/effects/remove.webp)

Using `[Shift + Right Click]` on effect icons in the effects panel will instantly remove all its charges/counters/badges

# Condition Sheet Icon

Adds the `open sheet` icon to conditions in the effects panel just like it would for non-condition effects

# Spells Summary

![](/readme/summary/before-after.webp)

This feature offers the ability to toggle between the regular and an alternate version of the character sheet's `Spellcasting` tab at any moment.

To toggle between both modes, you simply need to click on the spellcasting nav button <img src="./readme/summary/icon.webp" style="width:24px;"/> at the top of the sheet.

The alternate version gather, sort and display all the available spells into a single table per level regardless of their category or casting type.

New informations are displayed to make up for the lack of category grouping: `DC`, `Check` and type `Innate`, `Prepared`, `Spontaneous` or `Focus`. The spellcasting entry name is also displayed when hovering over the `Check/DC` values.

When hovering over a spell, the resources used by the spell will also be dislayed and can be interacted with as shown in the image below.

![](./readme/summary/resources.webp)

<sup>_Resources of a spontaneous `Magic Missile` displayed on hover_</sup>

The alternate mode does not allow to create, edit or delete the spells, nor does it allow to change the spells selected from a spellbook. It is there to make it easier to see what is available during playtime.

This feature is fully compatible with the module [PF2e Staves](https://foundryvtt.com/packages/pf2e-staves)

# CHANGELOG

You can see the changelog [HERE](./CHANGELOG.md)
