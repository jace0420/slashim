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

    characters.push({
      castIndex: i,
      name: cast[i].name,
      x: pos.x,
      y: pos.y,
      color,
      glyph: '@',
      roomIndex,
      // the tile data underneath this character so we can restore it when they move
      previousTile: {
        char: mapData.chars[pos.y][pos.x],
        color: mapData.colors[pos.y][pos.x],
      },
    })
  }

  return characters
}

// render all characters onto the ascii grid
export function renderCharacters(characters, asciiGrid) {
  for (const c of characters) {
    asciiGrid.updateTile(c.x, c.y, c.glyph, c.color)
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

    // restore the tile we were standing on
    asciiGrid.updateTile(c.x, c.y, c.previousTile.char, c.previousTile.color)
    occupied.delete(`${c.x},${c.y}`)

    // move
    c.previousTile = {
      char: mapData.chars[dest.y][dest.x],
      color: mapData.colors[dest.y][dest.x],
    }
    c.x = dest.x
    c.y = dest.y
    occupied.add(`${c.x},${c.y}`)

    // render at new position
    asciiGrid.updateTile(c.x, c.y, c.glyph, c.color)

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
