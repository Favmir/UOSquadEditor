# Mission Squad Editor

Change Unicorn Overlord **mission squads** (who stands where, what they hold,
which tactics list they use) and export a Ryujinx mod.

**Use the website:** https://thu1478.github.io/UOSquadEditor/editor/  
Hub (all mods): https://thu1478.github.io/UOSquadEditor/

You need your own copy of the game. This is not an official tool.

If the words UnitSet / CharaSet / preset 0 are new, read
[Docs/squad_tactics_equipment.md](../../Docs/squad_tactics_equipment.md) first.
It uses examples, not hex dumps.

## What the tabs are for

### Mission units

Pick a mission → a squad → a seat.

- **Formation** matches in-game (Back on top). Click a seat, click another to
  swap.
- **Swap the unit** to a different CharaSet (Soldier, Witch, a named boss, …).
- **Gear** — four slots. Empty vanilla slots show the runtime default (Bronze
  Spear, etc.). **Restore default** undoes your item edits for that template.
- **Preset 0** = class skills + skills from gear. A **named preset** = only
  that list (gear skills are *not* auto-added).
- A **new empty preset** does nothing until you fill it **and** assign it.
  Assigning an empty named preset in-game means **no tactics**.

### Class defaults

The skill slots every Fighter / Witch / … uses when they are on preset 0, and
what **Active Lv1** markers mean. This is global: you are editing the class,
not one mission.

### EquipAiSet presets

Named tactics lists. See [PRESET_EDITOR.md](PRESET_EDITOR.md) for a full walkthrough
(including “remove Lifeshare from Monica’s preset”).

### Default gear

The global “empty slot → which item?” tables. Three columns = levels 1–14 /
15–27 / 28–50.

Most mission enemies use **`NORMAL_SWORD`**, not `DEFAULT_SWORD`. Elves’ mixed
weapons are **`NORMAL_SWORD_M`**. `ENEMY_*` rows are unused.

### Reverting a squad

At the top of a unit in **Mission units**, **Revert squad…** puts the squad back to the
original game data. You choose what to revert:

- units, positions, leader flags and tactics presets (including private tactics copies);
- the squad's own equip tier;
- gear and tier overrides of the CharaSets it uses. These belong to the CharaSet and are
  shared with every other squad that uses it, so they are off by default when other
  squads would be affected, and the panel says how many.

Created presets are kept (delete them in the Presets tab to free the row).

### Equip tier (Normal / Power / Boss)

The tier picks which Default gear band fills a unit's **empty** gear slots, so it can
be used to give weaker units better accessories (for example the POWER band's Lapis
Pendant). Items named in a CharaSet are never changed by it. Two controls:

- **Squad equip tier (PARAMSET)**, at the top of a unit in **Mission units**: applies to
  every unit in that squad that has no CharaSet tier override.
- **Equip tier override**, in **CharaSet gear**: applies to every unit that uses that
  CharaSet (and beats the squad's PARAMSET).

A squad that contains a unit with a BOSS-level override gives its other NORMAL units the
POWER band (the "boss-pack rule"). Previews, the color coding and the export changelog
all follow your tier edits. Both fields are written as a single byte
(`UnitSet +0x14`, `CharaSet +0x1E`). Check the result in-game.

### CharaSet gear

The four item ids stored in each CharaSet row (the unit templates), with a
searchable list of every CharaSet. An empty slot is filled by the game from the
Default gear tables, and the tab previews that for a tier and level you choose.

Each CharaSet also lists the **mission units that use it** (mission, region, level,
squad, position and tier). **Open** jumps to that unit in Mission units.

Gear lives in the CharaSet itself, so many units can share one (for example the
generic `SHAMAN_HG_F` is used by 41 seats). This game has no free CharaSet rows to
copy a template into, so an edit applies to **every** unit using it. The tab shows how
many units that is before and after you edit. The Gear section of a unit in
**Mission units** edits the same data.

## Export / import

**Export Ryujinx mod** downloads `<name>.zip` with `exefs/main.pchtxt` and
`mission_editor_edits.json`. Unzip, copy the folder into Ryujinx → **Open Mods
Directory**, enable it under **Manage Mods**, fully quit, then boot. Name it
with **Mod folder name**.

**Import editor mod…** — pick the exported zip (or `mission_editor_edits.json`) to keep working.

**Load mods folder…** — preview someone else’s class `.pchtxt` in Final tactics.
It is not bundled into your export unless you made those class edits here.

Every export also includes a small engine fix so custom **accessories** actually
stick in-game (vanilla could duplicate Bronze Bangles). You do not install that
separately.

## Common surprises

| You did | What actually happens |
|---------|------------------------|
| Changed only `DEFAULT_SWORD` | Cornia Fighters still show Bronze — they use `NORMAL_SWORD` |
| Edited a blank Soldier’s gear | That CharaSet is shared; export will try to copy it or warn |
| Assigned a new empty preset | Unit has no tactics until you add lines |
| Scaled enemy levels | Empty gear slots upgrade by level band; named items do not |

## What the mod file actually changes

| You edited | Written into `main`? |
|------------|----------------------|
| Who sits in a seat / which preset id | Yes |
| That CharaSet’s four item ids | Yes, written into the CharaSet row itself. If other seats share it, they all change: this game has no free CharaSet rows to copy it into (the unit panel and CHANGELOG warn you). |
| Default-gear table columns | Yes |
| A named preset’s skill list | Yes (never writes preset id 0; forks a new id instead) |
| Class skill slots / default IFs | Yes (global) |
| Class “is this a lance slot?” types | No |
| Accessory-slot engine fix | Yes, always |

## Data files

- `Extraction/editor/mission_squads.json` — what the GUI loads (copied to
  `public/data/` when you sync)
- Concepts and examples: [Docs/squad_tactics_equipment.md](../../Docs/squad_tactics_equipment.md)
