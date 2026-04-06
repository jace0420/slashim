// places props (furniture, obstacles) onto rooms after map generation.
// props are an overlay on FLOOR tiles tracked via a parallel propMap grid.

import { Tile, inBounds } from './tileTypes.js'

// wall direction → the offset to check for a wall tile on the "back" side,
// and the offset for clearance checks in front of the prop
const WALL_INFO = {
  north: { wallDx: 0, wallDy: -1, clearDx: 0, clearDy: 1, axis: 'x' },
  south: { wallDx: 0, wallDy: 1,  clearDx: 0, clearDy: -1, axis: 'x' },
  east:  { wallDx: 1, wallDy: 0,  clearDx: -1, clearDy: 0, axis: 'y' },
  west:  { wallDx: -1, wallDy: 0, clearDx: 1,  clearDy: 0, axis: 'y' },
}

// create an empty propMap (same size as tile grid, filled with null)
function createPropMap(w, h) {
  const map = []
  for (let y = 0; y < h; y++) map[y] = new Array(w).fill(null)
  return map
}

// check if a tile is a door
function isDoor(grid, x, y) {
  return inBounds(grid, x, y) && grid[y][x] === Tile.DOOR
}

// check manhattan distance from a position to the nearest door in the room
function minDoorDistance(grid, room, x, y) {
  let best = Infinity
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      if (isDoor(grid, rx, ry)) {
        best = Math.min(best, Math.abs(rx - x) + Math.abs(ry - y))
      }
    }
  }
  // also check tiles immediately outside the room (doors often sit on hallway side)
  for (let rx = room.x - 1; rx <= room.x + room.w; rx++) {
    for (let ry = room.y - 1; ry <= room.y + room.h; ry++) {
      if (rx >= room.x && rx < room.x + room.w && ry >= room.y && ry < room.y + room.h) continue
      if (isDoor(grid, rx, ry)) {
        best = Math.min(best, Math.abs(rx - x) + Math.abs(ry - y))
      }
    }
  }
  return best
}

// find all valid placement candidates for a prop in a given room.
// returns array of { x, y, dir, orient } where (x,y) is the top-left of the glyph grid.
function findCandidates(grid, room, propDef, propMap) {
  const candidates = []
  const { placement } = propDef

  for (const [dir, orient] of Object.entries(propDef.orientations)) {
    const info = WALL_INFO[dir]
    const { w: pw, h: ph } = orient

    // scan every position inside the room where this orientation could fit
    for (let y = room.y; y <= room.y + room.h - ph; y++) {
      for (let x = room.x; x <= room.x + room.w - pw; x++) {
        if (!isValidPlacement(grid, propMap, room, propDef, x, y, orient, info)) continue
        candidates.push({ x, y, dir, orient })
      }
    }
  }

  return candidates
}

function isValidPlacement(grid, propMap, room, propDef, px, py, orient, wallInfo) {
  const { w: pw, h: ph } = orient
  const { placement } = propDef

  // 1) all prop tiles must be FLOOR and unoccupied
  for (let dy = 0; dy < ph; dy++) {
    for (let dx = 0; dx < pw; dx++) {
      const tx = px + dx
      const ty = py + dy
      if (!inBounds(grid, tx, ty)) return false
      if (grid[ty][tx] !== Tile.FLOOR) return false
      if (propMap[ty][tx] !== null) return false
    }
  }

  // 2) wall adjacency — every tile along the "back" edge must have a wall neighbor
  if (placement.wallAdjacent) {
    const { wallDx, wallDy } = wallInfo

    for (let dy = 0; dy < ph; dy++) {
      for (let dx = 0; dx < pw; dx++) {
        // figure out if this tile is on the back edge
        const isBackEdge =
          (wallDy === -1 && dy === 0) ||     // north: top row is back
          (wallDy === 1 && dy === ph - 1) ||  // south: bottom row is back
          (wallDx === -1 && dx === 0) ||      // west: left col is back
          (wallDx === 1 && dx === pw - 1)     // east: right col is back

        if (!isBackEdge) continue

        const wx = px + dx + wallDx
        const wy = py + dy + wallDy
        if (!inBounds(grid, wx, wy)) continue // map edge counts as wall
        if (grid[wy][wx] !== Tile.WALL) return false
      }
    }
  }

  // 3) clearance — open FLOOR tiles in front of prop
  if (placement.clearance > 0) {
    const { clearDx, clearDy } = wallInfo

    for (let step = 1; step <= placement.clearance; step++) {
      for (let dy = 0; dy < ph; dy++) {
        for (let dx = 0; dx < pw; dx++) {
          // front edge only
          const isFrontEdge =
            (clearDy === 1 && dy === ph - 1) ||
            (clearDy === -1 && dy === 0) ||
            (clearDx === 1 && dx === pw - 1) ||
            (clearDx === -1 && dx === 0)

          if (!isFrontEdge) continue

          const cx = px + dx + clearDx * step
          const cy = py + dy + clearDy * step
          if (!inBounds(grid, cx, cy)) return false
          if (grid[cy][cx] !== Tile.FLOOR) return false
          if (propMap[cy][cx] !== null) return false
        }
      }
    }
  }

  // 4) door padding — every prop tile must be far enough from doors
  if (placement.padding > 0) {
    for (let dy = 0; dy < ph; dy++) {
      for (let dx = 0; dx < pw; dx++) {
        const dist = minDoorDistance(grid, room, px + dx, py + dy)
        if (dist <= placement.padding) return false
      }
    }
  }

  return true
}

// stamp a placed prop into the propMap
function writePropMap(propMap, px, py, orient, propId) {
  const { w: pw, h: ph } = orient
  for (let dy = 0; dy < ph; dy++) {
    for (let dx = 0; dx < pw; dx++) {
      propMap[py + dy][px + dx] = { propId, originX: px, originY: py }
    }
  }
}

// main entry — place all eligible props across all rooms.
// returns { propMap, placedProps }
export function placeProps(grid, rooms, propDefs, rng) {
  const h = grid.length
  const w = grid[0].length
  const propMap = createPropMap(w, h)
  const placedProps = []

  for (const room of rooms) {
    const roomId = room.def.id

    for (const propDef of propDefs) {
      if (!propDef.allowedRoomIds.includes(roomId)) continue

      // roll how many of this prop to place in this room
      const count = rng.integer({ min: propDef.count.min, max: propDef.count.max })

      for (let i = 0; i < count; i++) {
        const candidates = findCandidates(grid, room, propDef, propMap)
        if (candidates.length === 0) break // no valid spots left

        const pick = rng.pickone(candidates)
        writePropMap(propMap, pick.x, pick.y, pick.orient, propDef.id)

        placedProps.push({
          propId: propDef.id,
          x: pick.x,
          y: pick.y,
          dir: pick.dir,
          orient: pick.orient,
          roomDef: room.def,
        })
      }
    }
  }

  return { propMap, placedProps }
}

// write prop glyphs into the display grids (chars/colors/bgs).
// called after buildDisplayGrids so floor bgs are already set.
export function stampProps(chars, colors, bgs, placedProps, propDefs) {
  // index prop defs by id for quick lookup
  const defMap = {}
  for (const def of propDefs) defMap[def.id] = def

  for (const placed of placedProps) {
    const def = defMap[placed.propId]
    const { glyphs } = placed.orient
    const color = parseInt(def.color, 16)

    for (let dy = 0; dy < glyphs.length; dy++) {
      for (let dx = 0; dx < glyphs[dy].length; dx++) {
        const tx = placed.x + dx
        const ty = placed.y + dy
        chars[ty][tx] = glyphs[dy][dx]
        colors[ty][tx] = color
        // if prop bg is null, keep the existing floor bg (already in bgs array)
        if (def.bg !== null) bgs[ty][tx] = parseInt(def.bg, 16)
      }
    }
  }
}
