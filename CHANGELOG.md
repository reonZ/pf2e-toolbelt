# 3.1.0

-   small refactor of tool settings code, nothing on the user's end should be affected
-   `Actionable`:
    -   fix `Item Macro` & `Spell Macro` settings name/hint
    -   fix items being 'usable' when un-identified
-   `Better Template`:
    -   reset the `Remove Template` checkbox to default value
    -   fix error when the module tries to remove a template that was already destroyed
-   `Resource Tracker`:
    -   fix not being able to create resources in w world with negative world-time

# 3.0.3

-   `Automatic Rune Progression`
    -   fix not being able to update shield HP when using the `Shield Rune` setting
    -   remove the shield HP update automation to fix the bug, so you are gonna have to do it manually from now on whenever a shield rune is updated, there is really no solution for that problem sadly

# 3.0.2

-   `Better Movement`:
    -   fix tokens being blocked by walls during teleportation
-   add `Polish` & `Chinese` localizations

# 3.0.1

-   `Resource Tracker`:
    -   fix resource menu template path error

# 3.0.0

-   this is a foundry `13.344` and system `7.1.0` release
-   all `client` settings have been converted into `user` settings and have been reset to their default value
-   `Actionable` was revamped:
    -   `Action Macro`
        -   now works on NPCs as well
        -   now uses the macro image for actions that use the default image
        -   a `use` and `cancel` function arguments are now also passed to the macros
            -   nothing is processed until the `use` function is called from the macro (including uses value reduction)
            -   calling the `cancel` function will display a notification to the user (you don't need to call it)
    -   `Item Macro`
        -   adds a way to link a macro to equipment & consumable items (except scrolls & wands)
        -   macros are provided with a `item`, `use` and `cancel` function arguments
            -   nothing is processed until the `use` function is called from the macro (including uses value reduction for consumables)
            -   calling the `cancel` function will display a notification to the user (you don't need to call it)
    -   `Spell Macro`
        -   the module doesn't expect anything to be returned from the macros anymore
        -   renamed the macro `item` argument to `spell`
        -   macros are now provided a `cast` & `cancel` function arguments
            -   calling the `cast` function will cast the spell and accepts an object of type `CastOptions` to override the casting options of the spells (e.g. `rank`)
            -   calling the `cancel` function will display a notification to the user (you don't need to call it)
    -   `Use Consumable`
        -   previously a feature of `Use Button`
        -   now also handles ammunition
    -   `Auto Self-Applied`
        -   previously a feature of `Use Button`
-   `Automatic Rune Progression`:
    -   no longer modifies `Specific Magic Weapon`, `Specific Magic Armor` or `Specific Magic Shield` items
    -   no longer hides rune select fields from the item sheet when `Force Update` is enabled
    -   now allows the use of `Handwraps of Mighty Blows` without the `Invested` trait
    -   add `Shield Rune` setting (disabled) : automatically adds reinforcing runes to shields
        -   shield HP is proportionally updated to fit the change
    -   add `Subtract Rune Price` setting (enabled): remove the price of fundamental runes from non-specific equipment
-   `Droppeth`:
    -   remove the `Remove on Empty` setting
    -   remove the `Send Message to Chat` setting
-   `Giveth`:
    -   remove the `Send Message to Chat` setting
-   `Merge Damage`:
    -   split the tool into 2 settings: `Merge Button` & `Inject Button`
-   `Target Helper`:
    -   lot of small style improvement/tweaks
    -   add `Upgrade Checks Messages` setting (enabled)
        -   this allow you to opt out of the upgraded version of simple save check links which was previously imposed on you by the module if the `Add Targets to Messages` setting was enabled
        -   is now able to retrieve the origin item if the link was sent to chat from an actor sheet
        -   traits are now always shown to the players
    -   rework spell message workflow: targets now always show on spell messages that have a save and when the damage is rolled, all the save related data is transferred to the damage message
        -   data is removed from the spell message once a damage is rolled
    -   extend the action message workflow: on top of being able to drag a save onto an action message, the module will now also do the following:
        -   if a single save link is found in the message content, the save will automatically be added to it as if you dragged it manually
        -   if an action message currently has data from a **basic** save on it, clicking a damage link will automatically transfer all the data to the newly generated damage message
        -   save data is removed from the action message when a damage is rolled from one of its links, which means you could do the drag-save + roll-damage process multiple times from a same action message if it was ever needed
    -   extend check message workflow: if a damage message is created right after a save check message, you will be offered the option to transfer the check message data to the damage message following it
        -   the save check message is reset to its regular form once transferred to a damage message
-   `Underground`:
    -   make sure to refresh the canvas when disabling/enabling the feature
-   convert `Effects Panel` tool to `Better Effects Panel`
-   convert `No Bulk` tool to `Better Inventory`:
    -   settings have been reset to default values
-   convert `Template Helper` tool to `Better Templates`:
    -   remove the `Auto Dismiss` setting
        -   it is now an option in the popup instead
    -   clicking on either buttons of the popup will respect the `Remove Template` option while closing the popup via the `x` button will do nothing
-   add `Anonymous` tool:
    -   the `Anonymize NPC spells` allows the GM to cast spells from NPCs while not revealing their name or description to the players
        -   the GM can reveal the full spell at any time using the `Reveal spell to players` option in the message context menu
-   add `Better Movement` tool:
    -   move the `Teleport Tokens` in it while combining both its settings into a single one
    -   add `No History Record` setting
        -   prevents movement history recording on your client
-   add `Better Trade` tool:
    -   move the `With Container Content` feature there and reset its setting
-   add `Resource Tracker` tool:
    -   a small widget to track arbitrary resources that can be toggled via a control button on the left UI
    -   resources can be shown to everybody, though only the owner can update them
    -   resources created by GMs are shared among all GMs
    -   resources can have a timeout option linked to the world clock to decrement their value automatically over time
-   remove `Hide Damage` tool
-   remove `Spells Summary` tool
-   remove `Stances` tool
-   remove `De-targeting` tool
-   the `Better Merchant`, `Hero Actions`, `Identify`, `Roll Tracker` and `Share Data` tools will be re-implemented at a later date

# 2.35.1

-   `Target Helper`:
    -   make sure to always add the `damaging-effect` when a save is basic
        -   this is mostly for third party module who manually feed data to the feature's flag

# 2.35.0

-   `Hero Actions`:
    -   fix the `Trigger` added by the module to system hero deck actions not being localized
-   `Teleport Tokens`:
    -   add new `Re-Select Tokens` setting (disabled by default)
        -   re-select the tokens at the end of the teleport
    -   improve the spread algorithm so tokens can be moved around corners
        -   this is still a simple logic, but it should be enough for the majority of cases
    -   no longer start to spread on the outer squares when a large & larger token is in the selection
    -   now sort tokens by size so that larger tokens are behind smaller ones
    -   now put the center of large & larger tokens at the center of the square to make sure they don't end up seeing the wrong side of a wall
    -   fix large & larger tokens not being teleported if only one of them was in the selection

# 2.34.0

-   add new `Teleport Tokens` feature:
    -   this is a gm only feature and will move tokens anywhere in a scene without any travel time
    -   2 keybinds are available (no key is bound by default)
        -   the `(Unselect)` keybind will also unselect all the tokens to give an unobstructed vision of the scene
    -   tokens will fan out in a small radius around the target location while being constrained by any `move` wall
    -   if `[Right Click]` is used instead, all the tokens will stack on top of each other at the location
-   `Condition Manager`:
    -   update the setting description to make it clear that a keybind is involved in the the feature's process

# 2.33.4

-   `Actionable`:
    -   fix not being able to drop feats in the `Suppressed Class Features` field
    -   fix localization of macro delete button tooltip

# 2.33.3

-   `Better Merchant`:
    -   increase the height of the service menu app
    -   fix description editor header scrolling out of bounds when reaching the bottom of the section

# 2.33.2

-   `Better Merchant`:
    -   fix items with runes not having their price updated by filters
    -   fix filters `Price Ratio` field being too small

# 2.33.1

-   `Condition Manager`:
    -   fix players being able to see the name of creatures in the `Origin` select when they shouldn't (due to settings)

# 2.33.0

-   `Condition Manager`:
    -   `Origin` now defaults to the current combatant instead of the target's
    -   add `Label` field
        -   the field will give you a preview the effect label based on the selected origin
        -   you can alter the label instead of using the auto generated entry
-   `Target Helper`:
    -   do not highlight the save icon indicating `Modifiers Matter` existing in the tooltip if said modifiers aren't shown to the user (due to settings)

# 2.32.2

-   `Hide Damage`:
    -   fix damages made by the GM without any associated actor not being hidden

# 2.32.1

-   `Stances`:
    -   fix current stance not being toggled off when clicking on its button

# 2.32.0

-   this is a system `6.10.0` release
-   `Condition Manager`:
    -   no longer disable the `Show token icon?` option from the effect
        -   the latest system changes now also hides the effect from the `Effects Panel`

# 2.31.2

-   `Rolls Tracker`:
    -   fix non-creature actors being shown in the list
    -   fix x-absis labels not being localized
    -   fix shared actors being selected for every user owning them

# 2.31.1

-   `Hide Damage`:
    -   fix players being able to expand the dice results when some system metagame settings are used

# 2.31.0

-   add new `Rolls Tracker` feature:
    -   you can access its interface by clicking on the control button added to the left UI part
        -   the interface offers different filter options
        -   you can select multiple users/actors using the `[shift]` key
    -   encounters are automatically registered when one begins
    -   the GM can `pause` the whole feature at any time
    -   the GM can create `sessions`
        -   they allow grouping of data in a controlled amount of time
        -   players will not see any new recorded data while a session is active
        -   everything will be available to players when the session ends
    -   the GM can `clear` recorded data
        -   a date can be provided to only delete data prior to it
    -   all the GM specific actions can be accessed via the API
        -   the `clear` action can receive a `days` argument to delete everything older than `x` allowing some automation if needed
    -   no rolls are recorded when a single user is logged in unless you enable the debug mode `CONFIG.debug.modules = true`

# 2.30.3

-   `Condition Manager`:
    -   fix adding a condition that also add other conditions preventing from closing the character sheet
        -   this is actually a system bug, not related to the module itself

# 2.30.2

-   `Condition Manager`:
    -   revert latest default change of `Expire On`

# 2.30.1

-   `Condition Manager`:
    -   change the default `Expire On` to be `End of Turn` as this is the default behavior of conditions
    -   replace the `Current Combatant is Origin?` checkbox with a `Origin` select
        -   you can pick any combatant from the combat

# 2.30.0

-   `Condition Manager`:
    -   add `Current Combatant is Origin?` row
        -   this will add the current combatant as the origin of the effect
        -   will only show if the receiving actor is in combat and isn't the current combatant
    -   fix persistent-damage conditions not working with the manager

# 2.29.1

-   `Condition Manager`:
    -   set default options to `1` `Rounds` instead of `Unlimited`
    -   add `Counter` row to manually change its value before applying the condition if needed
        -   won't show for conditions that can't have counter
    -   small improvements to the number fields to avoid invalid entries

# 2.29.0

-   add new `Condition Manager` feature
    -   to use it, you need to setup a key to hold it while adding a condition to an actor
    -   a condition manager popup will show and let you set up a duration, expiration anf if the effect is unidentified (GM only)
    -   an effect handling the condition will be created in its place to handle those options

# 2.28.0

-   `Droppeth`:
    -   add `Droppeth Modifier` keybind
        -   allow you to change the key that needs to be held to drop an item on the ground
-   `Merge Damages`:
    -   significantly improve the handling of damage notes
        -   it should now avoid duplication of notes even in more complex cases
        -   improve styling of notes in chat message
        -   fix awkward "comma" character sometimes showing between notes
-   `Target Helper`:
    -   remove the select icon from target headers
        -   clicking on the target header replace that functionality (double click to open the sheet included)
        -   players can now also use it

# 2.27.0

-   this is a system `6.8.5` update
-   `No Bulk`:
    -   fix actor breaking error due to latest system changes

# 2.26.2

-   `Target Helper`:
    -   fix dropped inline checks not accounting for `adjustment`

# 2.26.1

-   `Target Helper`:
    -   add the roll message in the `pf2e-toolbelt.rollSave` hook

# 2.26.0

-   `Use Button`:
    -   add an extra flavor text for consumables `use` to make it more obvious
-   `Target Helper`:
    -   add two custom hooks when a save is rolled/rerolled

# 2.25.2

-   `Droppeth`:
    -   only count root items (exclude items inside containers) when it comes to check if a single item exists in a droppeth actor's inventory
-   `Stances`:
    -   always removes old stances before adding the new one (or non at all)

# 2.25.1

-   `Global`:
    -   fix players not being able to transfer a container and its content to a `loot` actor
    -   fix duplicating items when a player would transfer a container and its content out of a `loot` actor

# 2.25.0

-   this is a system `6.8.0` release
-   the module now uses a migration manager
    -   the main GM will be asked to migrate on load
    -   if the system is migrating data, make sure to wait until it is done before starting
-   add new/first `With Container Content` global setting
    -   when enabled, moving a container to another actor will be accompanied by its entire content
    -   will not interfere with any transaction related to merchants
-   add `Droppeth` section:
    -   this new feature allows any user to drop items directly onto the ground by holding the `[Ctrl]` key before starting to drag
    -   a `Loot` actor & token are automatically created to host the dropped item
    -   whenever only one item is present in the loot actor, its name and image will be used for the actor
    -   if more items are added later on to the loot actor, a generic name & image will be used instead
    -   if the only present item is a source of light, the actor will emit said light until the item is removed or more are added
    -   you can also drop items directly from the sidebar or the compendium (no quantity window will be shown for those though)
-   `Actionable`:
    -   update to be compatible with the new crafting actions
    -   you cannot add a macro to an action that is associated with crafting
-   `Better Merchant`:
    -   update filters to be compatible with the new compendium browser
    -   switched the `Filters Menu` to `ApplicationV2`
    -   merchants now always buy treasures for 100% of their price if they reach the default filter
    -   the items selection of `From Merchant` cannot be done directly in the compendium browser anymore
        -   that step has been moved after you setup the browser filters and click on `Add To Merchant`
        -   a new window will allow you to select which items you want to add
        -   items creation is now done in batch of 10 at a time
-   `Giveth` rework:
    -   add new `Include Effects/Conditions` world setting
        -   allows players to drop effects & conditions onto actors they do not own
    -   allow creating new stacks when giving items
-   `Hero Actions`:
    -   allow the use of `Mythic Points` instead of `Hero Points`

# 2.24.0

-   if you use the `PF2e Dailies` module, make sure to update it to version `3.15.0`
-   `Better Merchant`:
    -   add `Buy Max Ratio`, `Sell Max Ratio` and `Service Max Ratio` settings
    -   allow 2 decimals to filter and service ratios
-   `Spells Summary`:
    -   hide non-primary vessel spells from the list
    -   fix background color for signature spells
    -   fix not being able to modify the focus points
-   `Target Helper`:
    -   add `speaker` argument to `Dice So Nice!` call

# 2.23.1

-   `Identify`:
    -   fix date year value when not using the `Unthemed (Gregorian Calendar)`

# 2.23.0

-   `Identify`:
    -   fix spellcasting entries other than prepared & spontaneous being used to check if a character can use recall knowledge to identify a scroll/wand
-   some internal changes

# 2.22.4

-   `Target Helper`:
    -   fix damage buttons being highlighted or blurred even when the `Show Check Outcomes` metagame setting is disabled

# 2.22.3

-   `Target Helper`:
    -   fix save result generated for unobservable origin actors
        -   this impact the tooltip & the degree of success buttons color

# 2.22.2

-   `Target Helper`:
    -   improve roll options generation for target inline saves

# 2.22.1

-   expose the whole toolbelt API & more to `game.toolbelt`
-   `Shared Data`:
    -   add bunch of functions to the tool api
-   `Target Helper`:
    -   fix missing item traits for dropped & reposted saves

# 2.22.0

-   `Effects Panel`:
    -   remove the `Condition-Sheet Icon` feature
    -   no longer display the `Remove-Effect Shortcut` info in the tooltip
        -   the functionality still works though
    -   those removals are due to a recent system change that makes them impossible to work
-   `Identify`:
    -   now display the item identification DCs in the `Identify Item` tooltip
-   `Spells Summary`:
    -   add background color to signature spells
    -   fix prepared cantrips having the expended toggle
-   `Target Helper`:
    -   add vehicles & hazards to the valid target list
        -   only hazards with HP will be added
    -   add new icon in place of the die to indicate that the actor cannot roll the save
    -   add new icon to `Set Splash Targets`
        -   this functionality works on top of how the module already handles splash damage
        -   it specifically adds splash targets which won't have the regular damage buttons
        -   this is useful in situations where an actor targets multiple tokens with the same name which makes it hard to differentiate the original target from the ones that are supposed to be splashed
    -   add support for persistent damage messages
        -   this refers to the message that adds it to the actor, not the message that applies the damage
        -   due to the nature of the data generated by the system for messages originating from a spell, some persistent damage messages can end up having a save added to them even when it shouldn't, there is nothing that can be done about it
    -   mousing over a target row header will now emit the `hover` event and highlight the target token
    -   you can now drop foundry items (i.e. conditions, effects, equipment) on a target row header
        -   works the same way you would drop them on a token or an actor sheet
        -   makes it convenient to add conditions/effects to the target token that failed a save for instance
    -   replace the `Open Sheet` icon with `Select Target`
        -   this simply set the target token as your current selection
        -   double-click to open the actor sheet

# 2.21.1

-   `Target Helper`:
    -   small improvement to header styling
    -   fix origin actor pointing to the wrong actor for saves
    -   fix adjustment not always showing in the save tooltip

# 2.21.0

-   this is a system `6.5.0` update
-   use `string#replace` instead of `string#replaceAll` for compatibility with older browsers
-   `Actionable`:
    -   made the necessary changes to work with the new system frequency handling
    -   actions are no longer prevented from being used when no use remain (following the system workflow)
-   `Automatic Rune Progression`:
    -   add support for all types of handwraps now that the system recognize them
-   `Better Browser`:
    -   remove the `Remove Bestiary Duplicates` setting/feature now that duplicate monsters have been removed from the system
-   `Share Data`:
    -   replace `Turn Start/End` with `Time Events`
        -   it now handles turn start/end, initiative change and rest-for-the-night
        -   it now handles frequency recharge (doesn't work with frequency of `turn`)
-   `Use Button`:
    -   remove the `Add To Actions` setting/feature now that the system handles it
    -   fix `Auto Self-Applied` message update

# 2.20.0

-   `Merge Damages`:
    -   no longer emit dice roll sound when merging or splitting messages
    -   no longer roll 3D dice when merging or splitting messages
        -   you need to update `Dice So Nice` to version `5.1.2`
    -   fix parsing of the messages on load when the feature is disabled
-   `Target Helper`:
    -   skip manual dice roll input when re-rolling a private save

# 2.19.0

-   `Better Merchant`:
    -   fix incorrect modified price for items that come in bundle (such as arrows)
-   `Merge Damages`:
    -   increase the size of the icons added to damage messages
    -   add a new `Inject Damage` feature/icon to damage messages
        -   as opposed to `Merge Damages`, it will leave the previous message intact and only inject damage instances to it
        -   useful when only extra damage is added and/or when you want to keep the "identity" of the message
            -   if you want to keep the saves from `Target Helper` for instance
        -   an merged/injected message cannot inject its damage into another but can still merge to or be merged with
        -   a message can be injected more than once
-   `Target Helper`:
    -   slightly increase the size of icons and text for the header of extra rows

# 2.18.0

-   `Hide Damage`:
    -   you can now click on the total number to reveal it to all players
-   `Target Helper`:
    -   clicking the message save button will now first try to roll the inline save for the selected tokens instead of rolling a regular system save
        -   this works for both spell and prompted check messages
        -   if more than one token is selected, it will roll for each one of them that is a target of the message (and hasn't rolled its save yet) and roll regular system saves for the other ones
        -   if the token of a target that has already rolled its save is selected, a regular system save will be rolled instead

# 2.17.0

-   `Better Browser`:
    -   fix missing results when using the `Search Text` field
-   `Target Helper`:
    -   some slight improvement in the handling of messages
        -   this will cause any message created before this update to not be handled by the feature anymore
    -   add support for actions messages (ability & feat)
        -   you can now drop a save inline link onto an action message
        -   useful for actions that do not have a damage inline link
    -   add support for prompted check messages
        -   prompted messages are ones that only have an inline link in them
        -   some of those messages generated by the system also have a label or flavor header and will also work
            -   when clicking on a inline link `Post prompt to chat` icon
            -   when using the system `Generate Check Prompt` macro
    -   `Roll NPC Saves` is now a button directly added on the message and no longer shows in the context-menu
    -   fix targets being added to spell check roll messages
    -   fix 3D dice not properly following the `Show Ghost dice for hidden rolls` setting when rolling a private save

# 2.16.0

-   this is a system `6.4.1` release
-   `Actionable`:
    -   make sure the spell macro `options` parameter always has a reference, so the macro can change its data in all use case
-   `Target Helper`:
    -   add support for the new ally/enemy roll option to damage-taken

# 2.15.2

-   `Actionable`:
    -   forward cast `options` to the spell macros (containing cast `rank` and more)
-   `Better Merchant`:
    -   fix sell refusal message

# 2.15.1

-   `Actionable`:
    -   spell macros can also return an object containing `customNotification` or `skipNotification` to cancel the cast

# 2.15.0

-   `Actionable`:
    -   spell macros will now cancel the spell cast if it returns `false`
-   `Better Merchant`:
    -   service macros will now be provided more parameters, see [here](https://github.com/reonZ/pf2e-toolbelt/wiki/Better-Merchant#service-macro) for more details

# 2.14.0

-   few updates of the settings descriptions
-   `Actionable`:
    -   add support for spells
        -   a drop zone section has been added in the `Details` tab of the spell sheet
        -   the macro is executed on `cast`
        -   the spell is forwarded to the macro as the `item` parameter
-   add `Better Browser` section:
    -   add `Remove Bestiary Duplicates` world setting
        -   it removes creatures from the original 3 `Pathfinder Bestiary` that have a version with the same name in the `Pathfinder Monster Core`
        -   it only affects the displayed results in the compendium browser
-   `Better Merchant`:
    -   add a new line to the merchant sidebar menu to set the services ratio
    -   you can now link a macro to be executed when the service is purchased/offered

# 2.13.0

-   `Actionable`:
    -   add support for passive actions
        -   a drop zone section has been added to passive actions (since they are not handled by the system self-applied feature)
    -   remove the `Chat Message` setting
        -   the macro should post the message if needed now that the `item` is passed as argument
-   `Better Merchant`:
    -   add `Services` feature
        -   the GM can create simple services offered by the merchant to Character/NPC/Party actors
        -   services consist mostly of a description, it can contain anything
        -   services can be imported and exported individually or in bundle
        -   players will only see services that are `enabled` and have a quantity other than `0`
    -   add a `Services Above Items` world setting
-   `Identify`:
    -   remove the misidentify icon, after multiple (almost finished) attempts, i wasn't able to reach a state that was satisfactory
-   `Target Helper`:
    -   button highlighting for basic saves will now take into account legendary save features which halve the damage taken of a failure (e.g. `Greater Juggernaut`)
    -   fix `Dice So Nice!` dice not showing for other clients when rolling saves
-   `Use Button`:
    -   no longer send the action description to chat if a macro is ran

# 2.12.0

-   this is a system `6.3.1` release
-   add an error notification to features that require a GM to be online and none is found
-   `Identify`:
    -   no longer display the "Already Identified" banner
    -   fix not being able to unlock a item row when clicking on its image, details or a cell that have a green vial
-   `Stances`:
    -   fix character sheets not being refreshed when a combat ends
-   `Template Helper`:
    -   you can now hold `shift` when clicking the `🎯Target` button to add the template targets to ones that already exist instead of replacing them

# 2.11.1

-   `Target Helper`:
    -   fix trying to access a missing global variable

# 2.11.0

-   `Identify`:
    -   updated settings hints
    -   have different icons based on the item actor type
    -   allow items from any type of actor to be identified using this feature
        -   any item that is in an actor's inventory/stash will have its `Identify Item` button open the tracker
        -   players can now also request an identification from any actor they have ownership or can usually update (e.g. loot, party, dead NPCs)

# 2.10.0

-   switched all dialogs used by the module to their ApplicationV2 version
-   add a new `Identify` feature:
    -   help manage the unidentified items from the party members' inventory (plus the party stash if enabled)
    -   track the items that have been identified by the characters in the party
    -   allow for fast and bundled identification
    -   you can open the tracker window using the api function `game.modules.get("pf2e-toolbelt")?.api.identify.openTracker()`
        -   best make a macro out of it
    -   the `Identify Item` button/icon in the character sheet's inventory tab will now open the tracker window instead of the system's one
        -   if the `Allow Player Request` setting is enabled, players will now have access to that button instead of it being GM only
        -   sends a request for identification to the GM when used by a player
-   `Hide Damage`:
    -   fix `Enabled` setting not doing anything when changed until reload
-   `Target Helper`:
    -   add support for `PF2e Modifiers Matter`
        -   modifiers which matter will be colored inside the save tooltip
        -   the save icon will blink with the most important modifier color to notify the user
        -   it respects the `Always show highlights to everyone` setting
    -   fix localization of the `Keeley` low roll modifier
-   `Template Helper`:
    -   fix targeting of dead actors' tokens
-   `Use Button`:
    -   fix use button showing for unidentified consumables

# 2.9.2

-   `Stances`:
    -   fixed custom stances not working

# 2.9.1

-   `Underground`:
    -   fixed the elevation constant being reset on scene change

# 2.9.0

-   this is a system `6.2.1` release
-   `Target Helper`:
    -   fixed not being able to use new inline checks from system `6.2`
-   `Template Helper`:
    -   you can now skip the feature by holding `Ctrl` when placing a template.

# 2.8.2

-   `Actionable`:
    -   now provides the item as argument to the macro scope
-   `Hero Actions`:
    -   updated the setting hint for `Table UUID` to indicate the use of `Left Click` instead of `Right Click` now that foundry V12 changed those
-   `Underground`:
    -   fixed error when enabling/disabling the feature while no scene is currently active
-   fixed language label issue for `Polish` language

# 2.8.1

-   `Shared Data`:
    -   the `Turn Start/End` option now also triggers the system's hooks (a virtual combatant is created for that purpose)

# 2.8.0

-   this is a system `6.1.0` release
-   `Better Merchant`:
    -   fixed party not being able to sell items
-   `Hero Actions`:
    -   fixed broken style in the sheet
-   `Shared Data`:
    -   fixed breaking changes with skills
-   `Stances`:
    -   now supports non-feat stances directly

# 2.7.10

-   `Better Merchant`
    -   fix some trade messages having `undefined` names
-   `Template Helper`:
    -   prevent the popup from showing on scenes without a square grid

# 2.7.9

-   `Template Helper`:
    -   fixed spell templates being removed even with the `Orphan Only` option selected

# 2.7.8

-   fixed buttons added by both `Actionable` and `Use Button` being considered as submit buttons and would trigger whenever the `Enter` key is being used in an input field on the sheet

# 2.7.7

-   `Shared Data`:
    -   fixed update on actors that share their health triggering an error to other players

# 2.7.6

-   `Target Helper`:
    -   fixed shift+click on a target damage button instead applying the damage to the selected token

# 2.7.5

-   `Target Helper`:
    -   fixed not being able to roll saves on spell cards

# 2.7.4

-   `Hero Actions`:
    -   fixed private trade not working

# 2.7.3

-   `Actionable`:
    -   exposes `getActionMacro` function to the API

# 2.7.2

-   `Merge Damages`:
    -   fixed naming/merging issue with item-less strikes (such as unarmed attack)

# 2.7.1

-   `Merge Damages`:
    -   fixed modifier tags inside a gm-only section not having any border
    -   fixed error when merging damages generated by a temporary/consumable item (wands, scrolls, ..)

# 2.7.0

-   added a new `Underground` feature:
    -   it allows tokens with negative elevation to remain visible on the board
    -   added a few client settings to customize the render of tokens that have a negative elevation

# 2.6.1

-   added Polish localization (thanks to [Lioheart](https://github.com/Lioheart))

# 2.6.0

-   this is a system `6.0.1` release
-   lot of internal changes were made
-   `Actionable`:
    -   fixed not being able to drop an effect on the item sheet
    -   fixed fringe issue preventing the interaction with the `Use Button` feature when both a macro and an effect existed
-   `Better Merchant`:
    -   the feature was reworked to be compatible with the latest changes
-   `Giveth`:
    -   the feature was reworked to be compatible with the latest changes
-   `Hero Actions`:
    -   now uses whisper for private message because of the v12 changes to roll messages
-   `Merge Damages`:
    -   fixed persistent damages being lost on merge
-   `De-targeting`:
    -   fixed the feature not starting on load

# 2.5.0

-   this is a `6.0.0-beta1` release
-   this is the first version of the module for v12, there was a significant amount of stuff that needed to be changed and most likely more that were missed

# 2.4.5

-   added extra checks across the features to avoid missing elements errors

# 2.4.4

-   `Hero Actions`:
    -   fixed a parsing issue when using a custom table pointing to a custom compendium pack journal

# 2.4.3

-   `Merge Damages`:
    -   avoid `null` degree of success for merged damages

# 2.4.2

-   `Merge Damages`:
    -   make sure long instances of damage do not stretch the message outside of its bounds

# 2.4.1

-   `Actionable`:
    -   fixed error with passive actions

# 2.4.0

-   added a new `Actionable` Feature:
    -   this lets you link a macro to a character action
    -   compatible with both regular and feat actions
    -   simply drag & drop a macro in the `Details` tab of the action the same way you would for a self-applied effect
    -   a `use` button will be generated to execute the macro (compatible with the `Use Button` feature)
    -   the macro is executed with the character as `actor` parameter

# 2.3.1

-   `Target Helper`:
    -   now adds hazards & vehicles as targets
-   `Template Helper`:
    -   now targets hazards & vehicles
    -   still doesn't target "hidden" tokens

# 2.3.0

-   `Use Button`:
    -   `Add To Actions` no longer creates a second `use` button to actions that already have one (because they have a self-applied effect), it now instead piggy back on the existing button to consume a charge on use
    -   `Add To Consumables`
        -   no longer adds a button for ammunition
        -   now constructs a more in-depth message depending on the consumable
            -   scrolls/wands doesn't change
            -   items with a formula will now have their description above the roll
            -   other items will have their description used instead of the generic system message
            -   the `use` button and footer are stripped from the items description when used that way

# 2.2.0

-   `Better Merchant`:
    -   you can now disable the default filters
        -   the default filter will never be chosen as the filter for the transaction if disabled
        -   this won't change the `Use Default Purse` behaviour of the other filters and will still make sure the default purse has enough gold for the transaction
-   `Share Data`:
    -   a master can now share its hero points with another character actor
-   `Target Helper`:
    -   re-formatted the save tooltip structure based on the different metagame settings (let's hope i got it right this time)
    -   GMs can now roll an inline save private and its result won't be shown to the players
        -   by having your global roll mode set to private/blind/self at the time of rolling the save
        -   by having your modifiers window roll mode set to private/blind/self
        -   by holding `ctrl` while clicking on the inline save
        -   reroll will keep the private state of the original roll

# 2.1.1

-   `Hero Actions`:
    -   fixed error when trying to `give` hero actions manually and not using the `draw with replacement` option in the table

# 2.1.0

-   `Hero Actions`:
    -   added a new gm-only `Give` button to manually give actions to a character
-   `Shared Data`:
    -   it is now possible for a master to have more than one linked actor
    -   non-"linked" actors can now also select a master (NPCs & Characters only)
    -   NPCs cannot use the `Skills Proficiencies` or `Weapon Runes` options
-   `Target Helper`:
    -   no longer shows the result of the die if the `Show Check Outcomes` metagame setting is disabled

# 2.0.2

-   `Better Merchant`:
    -   fixed error when the merchant had any container in their inventory
-   `Stances`:
    -   fixed error with missing actions that are associated with a stance

# 2.0.1

-   `Better Merchant`:
    -   fixed actors not receiving coins from selling items to a merchant
    -   fixed not being able to set a buy purse to `0` to prevent the merchant from buying items.

# 2.0.0

-   the module has been completely remade from scratch
-   the module no longer contains compendium packs
-   the `Inventory`, `Npc Lore Knowledges` and `Multi-Cast` features have been retired
-   the settings have received an overhaul
    -   everything has been reset
    -   some settings have been added or split into more settings
    -   all settings are now grouped by feature (with a title for each feature)
    -   some settings are now enabled/set by default (only the ones that are dependent on a feature-enabling setting)
    -   no longer has settings that could be hidden when another setting is disabled
-   `Better Merchant`:
    -   complete rework of the feature
    -   removed individual `Infinite Stock`
    -   selling ratio now works off filters like buying does
    -   selling items doesn't add coins to the inventory, it instead keep track of it in the filters
    -   buying/selling filters now use a modified version of the compendium browser
    -   for GM: price numbers of a ratio other than 1 will be colored and can be hovered over to see which filter changed it and at which ratio
-   `Effects Panel`:
    -   no longer add the `Condition-Sheet Icon` to persistent damage conditions
-   `Giveth`:
    -   no longer allows to drag & drop effects/conditions onto unowned actors, the feature is strictly reserved for giving "equipment"
-   `Hero Actions`:
    -   revisited the design and ergonomics of the sheet UI
    -   some styling improvement were made to the different dialogs used
    -   you can now "safely" use the `Private` and `Allow Trade` settings together
        -   users who don't own targetted characters will not be shown the list of their actions (and therefor can't select which one they want to receive)
        -   when receiving a trade request, the user will have to select which action they want to give without knowing what they are offered
    -   a new `Hero Set Variant` setting has been added
        -   when set to 0, the feature will work as before: a character is allowed to have 1 hero action per hero point available
        -   when set to any number, the feature functions differently and instead have characters draw a set amount of cards (equal to the setting number) and can use any of them by spending a hero point without being forced to discard or draw any action
-   `Hide Damage`:
    -   this new setting lets you hide the damage value of non-player owned creature from players, it can be particularly useful paired with the target helper feature so player don't know if they should reroll or not a save just by seeing some big number in the chat message
-   `Merge Damages`:
    -   material is now propagated to the all the damage instances of the same type instead of splitting them into multiple instances (which was basically creating issues with IWR instead of fixing them)
    -   details will now be hidden from players when merging damages for non-player owned creatures (when necessary)
    -   merged message will now use the targets from the original messages instead of using current targets
    -   if merged damages have more than on roll (usually for splash), those rolls will be added to the merged message as extra rolls
-   `Share Health Pool` is now `Shared Data`:
    -   the option to select a master is now limited to GMs
    -   a master must be a "linked" character actor to be selected
    -   only "linked" actors can select a master
    -   an actor can now take advantage of turn start/end if their master is in combat
        -   effects/conditions on the actor will trigger/expire as if it was in the encounter
        -   if the actor is already in the encounter, nothing special will be done
    -   an actor can use its master's skills proficiencies
    -   an actor can use its master's invested handwraps/weapon fundamental & property runes
    -   an actor can use its master's invested armor/bracers potency & resilient runes
-   `Spells Summary`:
    -   even though the end user experience hasn't changed much, it now works very similarly to the regular spellcasting tab (it is also now an actual tab)
    -   spell `uses` are now directly available in the spell rows instead of having to hover over them
    -   mousing over the `category` of a spell will show the name of the spellcasting entry in a tooltip
-   `Target Helper`:
    -   now can use substitute rolls
    -   a new icon that can be hovered over shows up if a save roll results in having notes
    -   no longer disables the chat message when a roll is inbound
    -   no longer show target rows on private messages
-   `Template Helper`:
    -   added a new `Auto Dismiss` settings which will remove the template after setting the targets (or cancelled)
        -   `Orphan Only` refers to templates that do not originate from spell messages (no little trash icon to remove them)
-   `Use Button`:
    -   new feature that either add new use buttons or enhance existing ones

# 1.43.0

-   `Spells Summary` updates:
    -   is now compatible with the version `3.0.0` of `PF2e Dailies`
    -   no longer compatible with previous versions of `PF2e Dailies`
    -   no longer offer backward compatibility support for `PF2e Staves`
    -   fixed issue with flexible spellcasting uses showing even not hovered

# 1.42.2

-   `Target Token Helper` updates:
    -   fixed error on chat render when a registered targets no longer exist in the scene

# 1.42.1

-   `Target Token Helper` updates:
    -   fixed `enrichHTML` not handling synchronous calls
    -   fixed small buttons line height issue with some browsers

# 1.42.0

-   `Target Token Helper` updates:
    -   now show degree of success adjustment in the save tooltip if any
    -   fixed error when adding targets linked to an actor no longer existing

# 1.41.4

-   `Spells Summary` updates:
    -   fixed feature not properly unregistering itself when disabled
    -   fixed character sheets not being re-rendered on setting change
-   `Target Token Helper` updates:
    -   `Roll All Saves` will now always skip the modifiers dialog

# 1.41.3

-   `Target Token Helper` updates:
    -   fixed not being able to use the `Block` button when equipped with more than one shield

# 1.41.2

-   `Target Token Helper` updates:
    -   fixed closing the `Check Modifiers Dialog` without rolling not giving back access to the chat message

# 1.41.1

-   `Target Token Helper` updates:
    -   the module will now roll ghosted dice with `Dice So Nice` when rolling a save check with the `Show Roll Breakdowns` metagame setting disabled

# 1.41.0

-   this is a `5.14.0` release
-   updated the module to maintain compatibility with the latest system version
-   readme as been updated at long last
-   improved management of settings across the different features
    -   fixed some fringe quirks
    -   can hide settings in relation to another one being disabled
        -   the only one for now is `Target Token Helper` client setting
-   split up `Template Targeting` from `Target Token Helper`, this is now its own separate feature, there was no reason for it to be disabled when the `Target Token Helper` was turned off as it is a client side feature entirely that doesn't interact with the rest
-   `Giveth` updates:
    -   updated the transfer item popup
    -   updated the giveth message to look more fancy
-   `Spells Summary`:
    -   updated all the broken stylings
    -   now shows the spells specific roll options above the spells list
    -   fixed prepare spell toggle showing for cantrips
-   `Better Merchant` updates:
    -   updated the buy message to look more fancy
    -   complete rework of the `From Browser` feature
        -   it now works directly from a modified version of the compendium browser
        -   the name filter field has been removed, it was interfering too much with the feature
        -   you can now pick which items among the ones present in the browser up to a limit of 100
-   `Target Token Helper` updates:
    -   no longer roll `Dice So Nice` on save check when the `Show Roll Breakdowns` metagame setting is disabled
    -   you can now drag & drop save-check inline links onto a damage chat message
        -   this will add the save directly into the damage message
        -   only links that have a DC and are of type reflex, will or fortitude will be draggable
        -   the damage message musn't already have a `save` module entry
        -   you must be the author of the damage message (or GM)

# 1.40.2

-   `Better Merchant` updates:
    -   added more actor types allowed to sell items (with conditions associated to them)
    -   fixed filter data being modified while editing a filter and changing its traits

# 1.40.1

-   `Automatic Rune Progression` updates:
    -   fixed check for handwraps being equipped/invested not always working depending on the order the data is processed by the system

# 1.40.0

-   added a new `Hero Actions - Give Actions` macro (it was already in the API)
-   `Better Merchant` updates:
    -   added a new `Buy Items` feature
        -   once the feature enabled, it will block the transfer if the trade is rejected for any reason
        -   it uses filters processed from top to bottom, they are the same as the ones in the compendium browser
        -   a filter is selected if it matches the item data and have enough gold remaining in its allocated purse (or have infinite gold)
        -   once a filter is selected, its ratio will be used for the purchase
        -   if no filter is selected, the ratio of the default filter will be used unless the `All Items` setting is disabled, in that case, the buy will be rejected
        -   if the total gold purse cannot afford the buy, the trade will be rejected
        -   if the selected filter purse cannot afford the buy and the `All Items` setting is disabled, the trade will be rejected
        -   the gold purse of the selected filter will see its amount deducted by the calculated price (unless infinite)
        -   the total gold purse is always used to check if an item can be purchased (unless infinite)
        -   the total gold purse is always deducted by the calculated price (unless infinite)

# 1.39.1

-   `Better Merchant` updates:
    -   fixed players not being able to buy items
    -   fixed trying to modify html that doesn't exist on players client

# 1.39.0

-   `Better Merchant` updates:
    -   added a new `Pull from Browser` combo of buttons
        -   the magnifier one will open the browser to the `Equipment` tab
        -   the other button will offer the possibility to add the resulting list of items from the browser
        -   the browser doesn't need to be rendered on screen
        -   the browser doesn't need to have the `Equipment` tab opened
        -   the `Equipment` tab needs to have been generated at one point before
        -   a limit of `100` items to be added has been set
    -   properly clamp the price ratio both in the displayed value and in its actual calculation
    -   fixed quantity `-` and `+` buttons always being removed
-   `Multi Cast` updates:
    -   fixed the popup title not containing the actor's name
-   `Target Token Helper` updates:
    -   optimized the `Block` button behaviour for the target rows

# 1.38.0

-   `Better Merchant` updates:
    -   added an infinity icon which enables `Infinite Stock` for a singular item
        -   the `Infinite Stocks` option must be disabled for the icon to show up
        -   the merchant's inventory and bulk will be nullified in the sheet as soon as one item has infinite stock
        -   same issue about item quantity applies with this

# 1.37.0

-   added a new `Better Merchant` world setting:
    -   adds custom features to the default system `merchant`
    -   everything reverts back when switching to `loot` (exception may be item quantity, see `Infinite Stocks`)
    -   `Price Ratio` let you set a global ratio for the merchant (between `0.1` and `5`)
        -   new calculated price is only applied when the item is in the merchant's inventory
        -   once the item is added to another actor's inventory, the regular price is back
    -   `Receive No Coins` will not add coins to the merchant when an item is sold to another actor
    -   `Infinite Stocks` will set the quantity of every item in the merchant inventory to `9999`
        -   `Treasure` items will not be modified by this
        -   the merchant's inventory and bulk will be nullified in the sheet
        -   the `+` and `-` quantity buttons will be removed from the items (except for `Treasure` items)
        -   the displayed quantity is fictional until one item is sold (on a per item bases)
        -   once an item is sold, the quantity is deducted by the system and is updated in the item for good
        -   because of that, the quantity cannot be reverted anymore when disabling `Infinite Stocks` or switching the actor to `Loot`

# 1.36.4

-   `Target Token Helper` updates:
    -   fixed issue with the adjusted damage popup when holding `shift`

# 1.36.3

-   `Target Token Helper` updates:
    -   changed the "hidden" icon to be the same as the regular one but not filled in
    -   updated support for spells originating from consumables, the system data having changed
        -   saves won't appear on damage messages that originated from a consumable spell description (only an issue from the activations tab), there is no way to link the message to the original spell currently

# 1.36.2

-   `Target Token Helper` updates:
    -   fixed unowned target names always ending up being `Unnamed` regardless of the `Tokens Determine NPC Name Visibility` setting
    -   fixed target sorting for player not always showing owned targets above unowned ones

# 1.36.1

-   `Target Token Helper` updates:
    -   fixed some setup issues

# 1.36.0

-   `Target Token Helper` updates:
    -   the `Target Token Helper` world setting now requires a reload on change
    -   added a `Roll All Saves` context menu option to chat messages
        -   will only appear for the GM and on messages that have targets and a save
        -   only roll saves for non-owned targets, players will have to roll for their own actors
        -   will only appear if there are actual saves to roll left (it deduct already rolled saves)

# 1.35.3

-   `Target Token Helper` updates:
    -   fixed players unable to reroll a save because of the anti-spam feature

# 1.35.2

-   removed `Custom Stances` setting, it hasn't been of use for a while now

# 1.35.1

-   `Target Token Helper` updates:
    -   always show die result to owned targets save

# 1.35.0

-   removed the `Hide Modifiers` feature now that the system handles it
-   `Spells Summary` updates:
    -   replaced the `Consumable` spell category with the appropriate `Wand` or `Scroll`
-   `Target Token Helper` updates:
    -   players will now see all visible targets, sorted as follow
        -   players: owned -> player owned -> unowned
        -   gm: unowned -> owned
    -   icons representing owned and unowned targets have been added before their name (a special icon is shown for targets that are "hidden" from players)
    -   respects all 3 metagame settings `Show Check DCs`, `Show Check Outcomes` and `Show Roll Breakdowns`
    -   only the last 10 messages in the chat will be processed on reload
-   `Merge Damages` updates:
    -   fixed issue with damage traits not working once merged (such as `Holy`)

# 1.34.0

-   this is a `5.13.1` release
-   `Spells Summary` updates:
    -   added description for rituals
    -   added support for wands and scrolls
        -   their type label is `Consumable`
        -   you must first `Draw` the item before being able to `Cast` it
        -   you can modify and reset its charges
    -   fixed reset icon not being vertically centered

# 1.33.0

-   this is a `5.13.0` release
-   updated the different helpers and data changes made in the system
-   `Target Token Helper` updates:
    -   made possible to use the `Target Self` option for inline templates
-   `Spells Summary` updates:
    -   do not display the sub tabs added by the system with the alternate version
    -   fixed the `Range` label
    -   properly restore the alternate tab scroll position on sheet render

# 1.32.0

-   `Target Token Helper` updates:
    -   added support for `Dice So Nice` when rolling inline saves
    -   added an anti-spam to prevent users from clicking more than once on an inline save button

# 1.31.1

-   now use a custom localization key for the `Open Sheet` tooltip

# 1.31.0

-   `Automatic Rune Progression` updates:
    -   added exception for `Shield Boss` and `Shield Spikes` to the shield exception (so they get the runes)

# 1.30.1

-   fixed an error with `Dice So Nice`

# 1.30.0

-   this is a `5.12.0` release
-   `Spells Summary` updates:
    -   updated to use the new system data
    -   added the prepared toggle button to cantrips as is now done in the system
    -   now grey out expended spell images
    -   fixed focus spell category label
    -   fixed overall broken styling
-   `Multi Cast` updates:
    -   updated to use the new system data
-   `Merge Damages` updates:
    -   fixed error with formulas with hyphened damage types, the error wasn't preventing the feature from working but was still an eyesore in the console
-   added a new `Inventory` client setting:
    -   this is a work in progress and is more of a gimmick than an actual useful feature
    -   it offers the ability to toggle between the regular and an alternate version of the character sheet's `Inventory` tab at any moment by clicking once more on the tab icon
    -   you can drag & drop item icons around to rearrange them or directly equip/invest them depending on where they are dropped

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
-   `Merge Damages` updates:
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
-   fixed item traits not being provided to the `Merge Damages` chat message, sadly, the only way of doing it is to merge the traits of all the original chat messages, which could result in occasional false positives when using different weapons

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

-   prevent `Dice so Nice` from rolling the dice on `Merge Damages`

# 1.10.0

-   this is a `5.8.3` release
-   fixed localization for spells headers that were changed in the last system update

# 1.9.1

-   fixed traits not showing up in `Merge Damages` chat message

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

-   fixed error with `Merge Damages`

# 1.8.0

-   added `Weightless Coins` setting/feature

# 1.7.1

-   added exception for `Inspiring Marshal Stance`

# 1.7.0

-   this is a `5.7.0` release
-   reworked the `Merge Damages` feature
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

-   the `Merge Damages` icon will now move itself next to the `PF2e Target Damage` collapse/expand button when present
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

-   `Multi-Cast` button and `Merge Damages` icon will only be shown if you are the author of the message (or the GM)

# 1.2.0

-   completely remove event hook when both `Remove Effect Shortcut` & `Condition Sheet Icon` are disabled
-   added `Multi-Cast` setting, it adds a new damage button for spells to directly roll multiple instances of the spell in one roll
-   added `Merge Damages` setting which allows you to merge multiple damage roll messages into a single one, useful for actions that require you to add the damage before applying `weakness` and `resistance`
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
