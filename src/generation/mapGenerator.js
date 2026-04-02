import Chance from 'chance'
import { Tile, TILE_DISPLAY, createGrid, inBounds, isWalkable } from './tileTypes.js'
import { tryPlaceRoom } from './roomPlacer.js'
import { connectRooms } from './hallways.js'

import manorRooms from '../data/rooms/manor.rooms.json'
import manorTemplate from '../data/templates/manor.template.json'

const TEMPLATES = { manor: manorTemplate }
const ROOM_DEFS = { manor: manorRooms }

// cardinal neighbor offsets
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// build the room placement queue — roll rarity, expand counts, sort by priority
function buildPlacementQueue(roomDefs, rng) {
  const queue = []

  for (const def of roomDefs) {
    // figure out how many of this room to attempt
    let count
    if (def.rarity >= 1) {
      count = rng.integer({ min: def.count.min, max: def.count.max })
    } else {
      // roll rarity for each possible instance
      count = 0
      for (let i = 0; i < def.count.max; i++) {
        if (rng.floating({ min: 0, max: 1 }) <= def.rarity) count++
      }
      count = Math.max(def.count.min, count)
    }

    for (let i = 0; i < count; i++) {
      queue.push({ ...def, _instance: i })
    }
  }

  // always-spawn rooms first, then by rarity descending
  queue.sort((a, b) => b.rarity - a.rarity)
  return queue
}

// surround all walkable tiles (FLOOR, HALLWAY, DOOR) with WALL where they border VOID
function placeWalls(grid) {
  const h = grid.length
  const w = grid[0].length

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== Tile.VOID) continue

      // check if any neighbor is walkable
      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (!inBounds(grid, nx, ny)) continue
        const neighbor = grid[ny][nx]
        if (neighbor === Tile.FLOOR || neighbor === Tile.HALLWAY || neighbor === Tile.DOOR) {
          grid[y][x] = Tile.WALL
          break
        }
      }
    }
  }

  // also fill diagonal neighbors for cleaner corners
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== Tile.VOID) continue
      const diags = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      for (const [dx, dy] of diags) {
        const nx = x + dx
        const ny = y + dy
        if (!inBounds(grid, nx, ny)) continue
        const neighbor = grid[ny][nx]
        if (neighbor === Tile.FLOOR || neighbor === Tile.HALLWAY || neighbor === Tile.DOOR) {
          grid[y][x] = Tile.WALL
          break
        }
      }
    }
  }
}

// place doors where hallway tiles meet room floor tiles
function placeDoors(grid, rooms) {
  const h = grid.length
  const w = grid[0].length

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== Tile.HALLWAY) continue

      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (!inBounds(grid, nx, ny)) continue
        if (grid[ny][nx] !== Tile.FLOOR) continue

        // this hallway tile is adjacent to a room floor — check if this is the boundary
        // the door goes on the hallway tile that's right at the room edge
        const isRoomEdge = rooms.some(r =>
          (nx === r.x || nx === r.x + r.w - 1 || ny === r.y || ny === r.y + r.h - 1) &&
          nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h
        )
        if (isRoomEdge) {
          grid[y][x] = Tile.DOOR
          break
        }
      }
    }
  }
}

// collapse double walls between walkable regions down to a single wall.
// when rooms end up 2+ tiles apart, placeWalls creates a wall on both sides of the gap.
// this pass detects WALL-WALL pairs that separate walkable areas and removes one.
function collapseDoubleWalls(grid) {
  const h = grid.length
  const w = grid[0].length
  let changed = true

  while (changed) {
    changed = false

    // horizontal: WALKABLE WALL WALL WALKABLE → WALKABLE FLOOR WALL WALKABLE
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        if (grid[y][x] !== Tile.WALL || grid[y][x + 1] !== Tile.WALL) continue
        const leftOk = x > 0 && isWalkable(grid[y][x - 1])
        const rightOk = x + 2 < w && isWalkable(grid[y][x + 2])
        if (leftOk && rightOk) {
          grid[y][x] = Tile.FLOOR
          changed = true
        }
      }
    }

    // vertical: same check top-to-bottom
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (grid[y][x] !== Tile.WALL || !inBounds(grid, x, y + 1) || grid[y + 1][x] !== Tile.WALL) continue
        const topOk = y > 0 && isWalkable(grid[y - 1][x])
        const bottomOk = y + 2 < h && isWalkable(grid[y + 2][x])
        if (topOk && bottomOk) {
          grid[y][x] = Tile.FLOOR
          changed = true
        }
      }
    }
  }
}

// adjacent doors look wrong — keep one, turn the other into floor
function cleanupDoubleDoors(grid) {
  const h = grid.length
  const w = grid[0].length

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (grid[y][x] === Tile.DOOR && grid[y][x + 1] === Tile.DOOR) {
        grid[y][x + 1] = Tile.FLOOR
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h - 1; y++) {
      if (grid[y][x] === Tile.DOOR && grid[y + 1][x] === Tile.DOOR) {
        grid[y + 1][x] = Tile.FLOOR
      }
    }
  }
}

// convert tile grid into char, color, and bg grids for rendering
function buildDisplayGrids(grid) {
  const h = grid.length
  const w = grid[0].length
  const chars = []
  const colors = []
  const bgs = []

  for (let y = 0; y < h; y++) {
    chars[y] = []
    colors[y] = []
    bgs[y] = []
    for (let x = 0; x < w; x++) {
      const display = TILE_DISPLAY[grid[y][x]] || TILE_DISPLAY[Tile.VOID]
      chars[y][x] = display.char
      colors[y][x] = display.color
      bgs[y][x] = display.bg ?? 0x000000
    }
  }

  return { chars, colors, bgs }
}

// dump the map to the console for debug
export function debugPrintMap(mapData) {
  const lines = mapData.chars.map(row => row.join(''))
  console.log(lines.join('\n'))
}

// main entry point — generate a full map from a template
export function generateMap(templateId = 'manor', seed) {
  const template = TEMPLATES[templateId]
  const roomDefs = ROOM_DEFS[templateId]
  if (!template || !roomDefs) throw new Error(`unknown template: ${templateId}`)

  const rng = new Chance(seed)
  const { width: mapW, height: mapH } = template.mapSize

  const grid = createGrid(mapW, mapH, Tile.VOID)
  const placedRooms = []

  // build and place rooms
  const queue = buildPlacementQueue(roomDefs, rng)

  for (const roomDef of queue) {
    if (placedRooms.length >= template.maxRooms) break

    const placed = tryPlaceRoom(grid, roomDef, template.zones, placedRooms, rng, mapW, mapH)
    if (placed) placedRooms.push(placed)
  }

  // connect rooms with hallways
  connectRooms(grid, placedRooms, rng)

  // walls around all walkable areas
  placeWalls(grid)

  // collapse any double walls before placing doors
  collapseDoubleWalls(grid)

  // doors at room-hallway junctions
  placeDoors(grid, placedRooms)

  // kill leftover double doors
  cleanupDoubleDoors(grid)

  const { chars, colors, bgs } = buildDisplayGrids(grid)

  return {
    width: mapW,
    height: mapH,
    tiles: grid,
    chars,
    colors,
    bgs,
    rooms: placedRooms,
    seed: rng.seed,
  }
}
