# 1.30.0

-   this is a `5.12.0` release
-   `Spell Summary` updates:
    -   updated to use the new system data
    -   added the prepared toggle button to cantrips as is now done in the system
    -   now grey out expended spell images
    -   fixed focus spell category label
    -   fixed overall broken styling
-   `Multi Cast` updates:
    -   updated to use the new system data
-   `Merge Damage` updates:
    -   fixed error with formulas with hyphened damage types, the error wasn't preventing the feature from working but was still an eyesore in the console
-   added a new `Inventory` client setting:
    -   this is a work in progress and is more of a gimmick than an actual useful feature
    -   it offers the ability to toggle between the regular and an alternate version of the character sheet's `Inventory` tab at any moment by clicking once more on the tab icon
    -   you can drag & drop item icons around to rearange them or directly equip/invest them depending on where they are dropped

# 1.29.2

-   due to issues with settings migration, some settings needed to be completely reset to their default value:
    -   `Automatic Rune Progression`
    -   `Target Token Helper - Chat`

# 1.29.1

-   fixed runes dropdowns reappearing on item sheet refresh

# 1.29.0

-   `Automatic Rune Progression` updates:
    -   the setting is now a multi-choice instead of an enabled/disabled
    -   `Force Update` will always update the runes to be based on the actor's level
    -   `Keep Highest` will only update the runes if they are currently lower than what they should be at that level, allowing the use of higher tier runes
    -   if you previously had the setting enabled, it will automatically be replaced by the `Force Update` option
    -   when the `Force Update` option is chosen, the potency, striking and resilient dropdowns in the item sheet will be removed

# 1.28.0

-   added a `Un-Target` client setting, it will remove all the user's targets at turn/round change
-   added a `Force Un-Target` world setting, it will forcibly remove the targets of all users at turn/round change
-   `Spells Summary` updates:
    -   fixed spell name over style
    -   fixed spell description not showing up on click

# 1.27.3

-   reduce the foundry version requirement to `11.311`

# 1.27.2

-   `Target Token Helper` updates:
    -   updated styling of the "big" healing-only button to look like the one from the system

# 1.27.1

-   added try/catch on all the `prepareBaseData`, `prepareDerivedData` and `prepareEmbeddedDocuments` wrappers of the module to avoid migration errors with the system

# 1.27.0

-   `Target Token Helper` updates:
    -   the concerned actor of fast-healing and regeneration messages will now automatically be added as a target

# 1.26.0

-   this is a `5.11.0` release
-   fixed breaking errors with `Automatic Rune Progression`
-   fixed styling for `Hero Actions`
-   fixed attack message modifiers still showing when using `Hide Modifiers`

# 1.25.1

-   staff spellcasting entry spells will now be shown as expended when appropriate, taking into account possible use of spontaneous spell slots

# 1.25.0

-   this is a `5.10.5` release
-   `Spells Summary` updates:
    -   added support for the `Preparing a Staff` feature of `PF2e Dailies`
    -   fixed rituals labels
    -   fixed disabled cast button styling
    -   fixed issue with spell slot index when prepared spellcasting entry had empty slots in between spells

# 1.24.6

-   fixed heal button error when trying to heal an actor with bonus healing when using `Target Token Helper`

# 1.24.5

-   fixed issue with `Handwraps of Mighty Blows` not always providing the runes to unarmed strikes when using `Automatic Rune Progression`

# 1.24.4

-   fixed settings migration only working for the GM

# 1.24.3

-   `Target Token Helper` updates:
    -   increased the font size of the save result
    -   increased contrast between failure and critical failure colors for the save result

# 1.24.2

-   fixed `Target Token Helper` adding targets to persistent damage, fast-healing and regeneration messages

# 1.24.1

-   fixed the module always disabling the system's `Automatic Bonus Progression` variant rule even when the `Automatic Rune Progression` setting was disabled

# 1.24.0

-   this is a `5.10.0` release
-   migrated the `Target Token Helper - Chat` setting that was changed in the `1.20.0` update to avoid it showing as `disabled` even though it is enabled with the `small` default option selected
-   `Automatic Rune Progression` updates:
    -   weapons/strikes belonging to the `shield` group will not receive any weapon potency/striking runes
    -   weapons/strikes belonging to the `unarmed` category will not receive any weapon potency/striking runes, those will come from the invested `Handwraps of Mighty Blows`

# 1.23.0

-   `Target Token Helper` updates:
    -   will now be opinionated when it comes to damage messages with splash damage
        -   applying splash damage to a target will blur out both rows for that target
        -   applying combined damage to a target will blur out both rows for that target
        -   applying combined damage to a target will blur out the combined damage row for all the other targets as well
        -   fixed blurring of damage rows not working when initiated by players

# 1.22.2

-   `Target Token Helper` updates:
    -   fixed chat log not properly scrolling to bottom (again)
    -   now also handle scroll-to-bottom for chat-log popouts
    -   now properly refresh message popouts that have extras elements injected from this feature

# 1.22.1

-   `Target Token Helper` updates:
    -   removed highlights for non-save damage rolls (this was nonsensical)

# 1.22.0

-   `Target Token Helper` updates:
    -   damage buttons rows will now be blurred out when damage has been applied to the target (or when the basic save was a critical success)
    -   now highlight the `Damage` and `Double` buttons for non-save damage rolls based on their outcome (`Hit` or `Critical Hit`)

# 1.21.0

-   `Target Token Helper` updates:
    -   save reroll is no longer limited to using hero points, the dialog now offers a selection of reroll types to choose from
    -   now respects the system metagame setting `Show DCs on Attacks and Saves` when generating the tooltip for players
    -   fixed? chat not properly scrolling to bottom when updating chat messages

# 1.20.0

-   `Target Token Helper` updates:
    -   removed the `Target Token Helper - Saves` world setting
    -   changed the `Target Token Helper - Chat` into a multi-choices setting
        -   you can now select to use small or big (regular) sized buttons in the damage chat message
    -   now hide the original damage buttons when there is at least one target damage row visible
    -   added a new button to expand/collapse the original damage buttons
    -   remade the tooltip showing when hovering over a save, it now gives a lot more information
    -   characters can now reroll save checks using hero points
        -   if you have `PF2e Workbench` active and its setting `Keeley's Hero Point Rule` enabled, the same implementation of the rule will be used
-   `Merge Damage` updates:
    -   persistent damages will no longer stack with each other, the one with the highest mean will be chosen
    -   fixed targets being re-created for the purpose of displaying them in the damage chat message of `Target Token Helper`

# 1.19.1

-   fixed template targeting not working on all grid sizes when using `Target Token Helper`

# 1.19.0

-   `Target Token Helper` updates:
    -   renamed the `Add targets to message` button to `Set targets for message`
    -   removed the `Select All Targeted Tokens` button from damage chat messages
    -   added a `Set targets for message` button to damage chat messages (works the same as the one in the spell message)
    -   fixed error with save-less damage messages
    -   fixed inline saves not showing up for anyone if the actor using wands/scrolls didn't have the `Target Token Helper - Chat` enabled

# 1.18.0

-   this is a `5.9.5` release
-   added the die result (in the tooltip) for inline save checks when using `Target Token Helper`
-   only show an inline save check if the actor actually has one when using `Target Token Helper`
-   template targeting of `Target Token Helper` no longer targets tokens that are hidden (not the condition but foundry visibility state)
-   template targeting of `Target Token Helper` now only target creatures, hazards and vehicles
-   fixed tiny creatures not always being targeted when using `Target Token Helper` template targeting
-   fixed not being able to roll inline save checks for spells generated by scrolls/wands when using `Target Token Helper`
-   fixed `Multi Cast` with spells generated by scrolls/wands

# 1.17.2

-   fixed chat log not scrolling properly on extended damage messages modified by `Target Token Helper` (though i couldn't make it work for the spell card)

# 1.17.1

-   fixed players not being able to use inline save rolls on messages they were not the author of when using `Target Token Helper`
-   fixed missing roll options on inline save rolls when using `Target Token Helper`

# 1.17.0

-   damage buttons are now highlighted depending on the result of the inline save check for spells in damage chat messages when using `Target Token Helper`
-   added a `Add targets to message` button to spell cards for spells that have a save and don't deal damage when `Target Token Helper` is enabled
    -   adding targets to the message will show the list of owned targets in said message and allow inline save check rolls
-   fixed pricing of runeless items when using `Automated Rune Progression` (again!)

# 1.16.6

-   fixed template dialog from `Target Token Helper` showing up on all users
-   fixed template targeting from `Target Token Helper` not being broadcasted to all users

# 1.16.5

-   fixed `Automated Rune Progression` pricing of items that have yet to gain any rune

# 1.16.4

-   fixed error with item-less messages when using `Target Token Helper`

# 1.16.3

-   changed the default options of the template dialog from `Target Token Helper`

# 1.16.2

-   allow the use of `shift + click` on the inline save checks in the extra rows from `Target Token Helper`

# 1.16.1

-   console spam is bad

# 1.16.0

-   added a `fortitude`/`reflex`/`will` icon to the damage chat messages extra rows from `Target Token Helper` for spells that have a save check
    -   clicking on the icon will automatically roll the save check against the original spell
    -   once rolled, the result will be displayed next to the icon using the regular system's color coding for the degree of success
-   added `Target Token Helper - Saves` world setting (enabled by default): when a damage chat message with multiple targets is created from a spell, should the inline save rolls also generate the regular chat messages

# 1.15.0

-   changed `Target Token Helper`, this is no longer a GM only feature, it now enables the global feature to your world but requires client settings to enable its different parts
-   added `Target Token Helper - Chat` client setting: damage chat messages will have extra application damage rows for each owned token that was targeted during the roll
-   added a new `Select All Targeted Tokens` button to damage chat messages that have more than one owned targeted token
-   added `Target Token Helper - Template` client setting: when placing a template on the board, a new dialog will pop allowing you to target all the tokens inside the template (with various criterias)

# 1.14.0

-   added `Target Token Helper`, GM only feature where damage chat messages will have extra application damage rows for each token that was targeted during the roll
-   fixed `Spells Summary` spell description broken styling
-   fixed an issue with module flags, this will only really affect the `Npc Lore Knowledges` feature, you will have to redo them (sorry)

# 1.13.1

-   fixed not being able to use `Multi Cast`
-   fixed `Multi Cast` not properly using heightened damages
-   fixed item traits not being provided to the `Merge Damage` chat message, sadly, the only way of doing it is to merge the traits of all the original chat messages, which could result in occasional false positives when using different weapons

# 1.13.0

-   this is a `5.9.1` release
-   fixed `Automatic Rune Progression` price manipulation for items that cost less than 1 gold
-   fixed `Spells Summary` spell row styling
-   fixed `Spells Summary` cast button styling
-   fixed `Spells Summary` spell category label

# 1.12.1

-   fixed `Permanent Condition Effect` macro issue with badge-less conditions

# 1.12.0

-   renamed the module to `PF2e Toolbelt`
-   added a compendium pack for macros containing the following
    -   `Hero Action - Create Table`
    -   `Hero Actions - Remove Hero Actions`
    -   `Permanent Condition Effect`
        -   helps you generate (or directly add to an actor) an effect setting a permanent condition
        -   it automatically sets the name and image of the effect
        -   you can select the badge value for the condition
        -   you can select if the permanent effect is unidentified, making it impossible for the players to remove the condition

# 1.11.0

-   added `Share Health Pool` feature/setting
    -   this feature let you link 2 actors together in a "master" and "slave" relationship to share their HP/SP
    -   you can find the option to select a "master" for a creature in the `Configure` menu of the actor sheet
        -   a "master" cannot also have a "master"
        -   a "master" can have multiple "slave"
        -   a "slave" cannot also be a "master"
    -   the `Force Refresh` option should only be used if you notice some modules getting out of sync with the "slave" creatures

# 1.10.1

-   prevent `Dice so Nice` from rolling the dice on `Merge Damage`

# 1.10.0

-   this is a `5.8.3` release
-   fixed localization for spells headers that were changed in the last system update

# 1.9.1

-   fixed traits not showing up in `Merge Damage` chat message

# 1.9.0

-   added "only character" warnings to `heroActions` API functions
-   added "only GM" warnings to `heroActions` API functions
-   added new `heroActions` API functions
    -   `getDeckTable` which returns the table used by the feature, looking for the table in that order
        -   a table in your world with the UUID specified in the settings
        -   a default `Hero Point Deck` table in your world
        -   the default `Hero Point Deck` from the compendium
    -   `giveHeroActions` which opens a menu allowing you to manually grant hero actions to a character
    -   `createChatMessage` generates a chat message with a label and a list of actions
-   moved the API doc to the github [wiki](https://github.com/reonZ/pf2e-toolbelt/wiki#api) instead of the `README`

# 1.8.2

-   added missing chinese localization (thanks to [LiyuNodream](https://github.com/LiyuNodream))

# 1.8.1

-   fixed error with `Merge Damage`

# 1.8.0

-   added `Weightless Coins` setting/feature

# 1.7.1

-   added exception for `Inspiring Marshal Stance`

# 1.7.0

-   this is a `5.7.0` release
-   reworked the `Merge Damage` feature
    -   you can now merge damages from any source as long the messages have the same originating actor and the same target
    -   improved the newly created merged damage chat message, showing all the different damage sources and their outcomes
    -   added a new `Split back to original messages` icon on merged damage messages which reverts the merging process
-   fixed the `No Dropped Bulk` error that was introduced in this system version

# 1.6.1

-   added exception for `Dread Marshal Stance`

# 1.6.0

-   added `Hide Modifiers` setting
    -   messages generated by non-player owned actors will see their modifiers tags hidden from players
    -   can also hide the traits tags on those same messages
-   the `Stances` feature has been reworked, it now only uses the actor's data instead of looking and comparing with compendium stances
-   removed the `Custom Stances` setting, no longer needed with the new implementation of the feature
-   made sure that stances are added/removed automatically only once even if more than one owning player is online

# 1.5.5

-   the `Merge Damage` icon will now move itself next to the `PF2e Target Damage` collapse/expand button when present
    -   firefox users will have to enable the `:has` feature for it to work because firefox still hasn't made it core

# 1.5.4

-   fixed `Cobra Envenom` stance (which has a limited use of once per minute) always replacing `Cobra Stance`
-   fixed missing `actionID` in returned data preventing third party from displaying the right description in chat

# 1.5.3

-   added missing french localization (thanks to [rectulo](https://github.com/rectulo))

# 1.5.2

-   added missing api functions

# 1.5.1

-   fixed cn localization file error

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
-   now sort settings by scope for the GM (`world` then `client`) and added a `Client Settings` header in the module settings tab

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
