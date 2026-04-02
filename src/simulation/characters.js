import Chance from 'chance'
import { Tile, inBounds, isWalkable } from '../generation/tileTypes.js'

// 12 distinct high-contrast colors that read well on a dark background.
// order matters — first N get assigned to the cast, so front-load the most readable ones.
const CHARACTER_PALETTE = [
  0x55ff55, // green
  0x5599ff, // blue
  0xff5555, // red
  0xffff55, // yellow
  0xff55ff, // magenta
  0x55ffff, // cyan
  0xff8844, // orange
  0xaa77ff, // purple
  0x88ddaa, // mint
  0xffaacc, // pink
  0xdddd88, // khaki
  0xaaccff, // light blue
]

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// --- needs system ---

// ordered labels for the health state — driven by injuries and status effects.
// currently only 'FINE' is ever assigned; the rest are placeholders for future injury mechanics.
export const HEALTH_STATES = ['FINE', 'HURT', 'INJURED', 'HEAVILY_INJURED', 'NEAR_DEATH']

// ordered labels for mood, mapped from the average normalized goodness score across all needs.
export const MOOD_LABELS = ['TERRIBLE', 'BAD', 'OKAY', 'GOOD', 'GREAT']

// baseline need values for a character who just arrived at a late-night event.
// depleting stats (100 = full, 0 = empty): energy, stamina, hunger, thirst, social, sanity
// accumulating stats (0 = fine, 100 = maxed out): boredom, fear, adrenaline
const NEEDS_DEFAULTS = {
  energy:     80,
  stamina:    100,
  hunger:     70,
  thirst:     65,
  social:     80,
  sanity:     95,
  boredom:    20,
  fear:        5,
  adrenaline:  0,
}

// max ±variation applied to each default at spawn time so characters don't all start identical
const NEEDS_JITTER = 5

// per-tick passive decay — only fast-response stats tick every simulation step.
// negative = stat drains toward 0; positive = stat recovers toward 0 (for accumulators)
const TICK_DECAY = {
  fear:       -0.30, // fear fades quickly when nothing is happening
  adrenaline: -0.50, // adrenaline burns off fast once a threat passes
}

// per-minute passive decay — slow-moving survival and social stats.
// depleting stats drain (negative); stamina recovers passively while walking (positive).
// sanity has no passive decay — only event-driven changes (TODO)
const MINUTE_DECAY = {
  energy:  -0.15,
  stamina: +0.20, // light recovery while characters are not sprinting
  hunger:  -0.10,
  thirst:  -0.12,
  social:  -0.10,
  boredom: +0.20, // boredom builds when nothing interesting happens
  sanity:   0.00, // placeholder — will be event-driven
}

// build a jittered needs object for a fresh character
function initNeeds(rng) {
  const needs = {}
  for (const [key, base] of Object.entries(NEEDS_DEFAULTS)) {
    const jitter = rng.integer({ min: -NEEDS_JITTER, max: NEEDS_JITTER })
    needs[key] = Math.max(0, Math.min(100, base + jitter))
  }
  return needs
}

// compute a 0–1 "goodness" score for a single stat.
// depleting stats: 1 when full, 0 when empty.
// accumulating stats: 1 when calm (0), 0 when maxed (100).
function statGoodness(key, value) {
  const accumulating = key === 'boredom' || key === 'fear' || key === 'adrenaline'
  return accumulating ? (100 - value) / 100 : value / 100
}

// derive the HEALTH label from a character's current state.
// only 'FINE' is used until the injury system is implemented.
function deriveHealth(_character) {
  // TODO: factor in injury severity, bleeding, and status effects (not yet implemented)
  return 'FINE'
}

// derive the MOOD label from the average normalized goodness of all needs.
function deriveMood(character) {
  const keys = Object.keys(NEEDS_DEFAULTS)
  const avg = keys.reduce((sum, k) => sum + statGoodness(k, character.needs[k]), 0) / keys.length
  // TODO: weight health state heavily — HURT or worse should drag mood toward TERRIBLE
  // TODO: fear > 70 or adrenaline > 70 should override mood to 'TERRIBLE' regardless of other stats
  const idx = Math.min(MOOD_LABELS.length - 1, Math.floor(avg * MOOD_LABELS.length))
  return MOOD_LABELS[idx]
}

// write derived health + mood back onto the character in place
function refreshDerivedStats(character) {
  character.health = deriveHealth(character)
  character.mood   = deriveMood(character)
}

// apply per-tick passive decay/recovery to fast-response needs (fear, adrenaline)
function tickCharacterNeeds(character) {
  const n = character.needs
  for (const [key, delta] of Object.entries(TICK_DECAY)) {
    n[key] = Math.max(0, Math.min(100, n[key] + delta))
  }
  // TODO: spike FEAR by 20–40 when character hears a scream or witnesses a corpse
  // TODO: spike ADRENALINE by 30–50 on taking damage or being actively chased
  // TODO: a FEAR spike should also raise ADRENALINE and lower SANITY proportionally
}

// apply per-minute passive decay to all slow-moving needs and refresh derived stats.
// call this from the onMinute clock callback in game.js.
export function minuteTickCharacters(characters) {
  for (const c of characters) {
    const n = c.needs
    for (const [key, delta] of Object.entries(MINUTE_DECAY)) {
      n[key] = Math.max(0, Math.min(100, n[key] + delta))
    }
    // TODO: drain STAMINA faster per-tick when the character is running (not yet implemented)
    // TODO: low ENERGY (<20) should reduce moveChance or trigger a "seek rest" behavior
    // TODO: HUNGER < 15 should push character toward any room containing food (to be implemented)
    // TODO: THIRST < 15 should push character toward any room containing drink (to be implemented)
    // TODO: BOREDOM > 80 should drive character toward social areas or other characters
    // TODO: SOCIAL < 20 should push character toward other characters to restore the stat
    // TODO: high FEAR (>60) should trigger flee behavior once pathfinding is in place
    // TODO: SANITY < 15 should trigger a mental break event (system to be implemented)
    refreshDerivedStats(c)
  }
}

// pick a random walkable FLOOR tile inside a room rect that isn't already occupied
function randomFloorInRoom(room, mapData, occupied, rng) {
  const candidates = []

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (mapData.tiles[y][x] === Tile.FLOOR && !occupied.has(`${x},${y}`)) {
        candidates.push({ x, y })
      }
    }
  }

  if (candidates.length === 0) return null
  return rng.pickone(candidates)
}

// figure out which room (if any) a tile belongs to
export function findRoomAt(x, y, rooms) {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return i
    }
  }
  return -1
}

// spawn all cast members onto the map with unique colors and positions.
// each character gets a random room and a random floor tile within it.
export function initCharacters(cast, mapData, seed) {
  const rng = new Chance(seed + '-characters')
  const characters = []
  const occupied = new Set()

  // shuffle room indices so characters spread across different rooms
  const roomIndices = mapData.rooms.map((_, i) => i)
  rng.shuffle(roomIndices)

  for (let i = 0; i < cast.length; i++) {
    const color = CHARACTER_PALETTE[i % CHARACTER_PALETTE.length]

    // try the next room in the shuffled list, wrapping if more cast than rooms
    const roomIndex = roomIndices[i % roomIndices.length]
    const room = mapData.rooms[roomIndex]

    const pos = randomFloorInRoom(room, mapData, occupied, rng)
    if (!pos) {
      // shouldn't happen unless rooms are tiny and packed — skip this character
      console.warn(`[characters] couldn't place ${cast[i].name} in room ${roomIndex}`)
      continue
    }

    occupied.add(`${pos.x},${pos.y}`)

    const needs = initNeeds(rng)
    const character = {
      castIndex: i,
      name: cast[i].name,
      x: pos.x,
      y: pos.y,
      color,
      glyph: '@',
      roomIndex,
      needs,
      health: 'FINE',
      mood: deriveMood({ needs }),
    }
    characters.push(character)
  }

  return characters
}

// render all characters onto the ascii grid
export function renderCharacters(characters, asciiGrid, mapData) {
  for (const c of characters) {
    const bg = mapData?.bgs?.[c.y]?.[c.x] ?? 0x000000
    asciiGrid.updateTile(c.x, c.y, c.glyph, c.color, bg)
  }
}

// build a set of occupied positions for quick lookup
function buildOccupiedSet(characters) {
  const set = new Set()
  for (const c of characters) {
    set.add(`${c.x},${c.y}`)
  }
  return set
}

// process one simulation tick — each character may move one tile.
// returns an array of narrative events (room transitions) that happened this tick.
export function tickCharacters(characters, mapData, asciiGrid, rng, moveChance) {
  const events = []
  const occupied = buildOccupiedSet(characters)

  for (const c of characters) {
    // apply per-tick need decay (fear, adrenaline) regardless of movement
    tickCharacterNeeds(c)

    // TODO: factor in personality, fear, adrenaline, movement speed, status effects
    if (rng.floating({ min: 0, max: 1 }) > moveChance) continue

    // collect valid neighbors
    const options = []
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx
      const ny = c.y + dy
      if (!inBounds(mapData.tiles, nx, ny)) continue
      if (!isWalkable(mapData.tiles[ny][nx])) continue
      if (occupied.has(`${nx},${ny}`)) continue
      options.push({ x: nx, y: ny })
    }

    if (options.length === 0) continue

    // TODO: pathfinding, room-seeking behavior, personality-driven direction bias, flee/chase AI
    const dest = rng.pickone(options)

    // restore the base tile where we were standing
    const prevChar = mapData.chars[c.y][c.x]
    const prevColor = mapData.colors[c.y][c.x]
    const prevBg = mapData.bgs?.[c.y]?.[c.x]
    asciiGrid.updateTile(c.x, c.y, prevChar, prevColor, prevBg)
    occupied.delete(`${c.x},${c.y}`)

    // move
    c.x = dest.x
    c.y = dest.y
    occupied.add(`${c.x},${c.y}`)

    // render character at new position with the tile's bg color
    const destBg = mapData.bgs?.[c.y]?.[c.x] ?? 0x000000
    asciiGrid.updateTile(c.x, c.y, c.glyph, c.color, destBg)

    // check for room transition
    const newRoom = findRoomAt(c.x, c.y, mapData.rooms)
    if (newRoom !== -1 && newRoom !== c.roomIndex) {
      const roomLabel = mapData.rooms[newRoom].def?.label || `Room ${newRoom}`
      events.push({ type: 'room-enter', name: c.name, room: roomLabel })
      c.roomIndex = newRoom
    }
  }

  return events
}
