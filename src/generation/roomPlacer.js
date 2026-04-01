import { Tile, inBounds } from './tileTypes.js'

// resolves the pixel-rect for a named zone within the map dimensions
function resolveZone(zoneName, zones, mapW, mapH) {
  if (zoneName === 'any') return { x: 1, y: 1, w: mapW - 2, h: mapH - 2 }

  if (zoneName === 'center') {
    const z = zones.center
    return {
      x: Math.floor(z.x * mapW),
      y: Math.floor(z.y * mapH),
      w: Math.floor(z.w * mapW),
      h: Math.floor(z.h * mapH),
    }
  }

  if (zoneName === 'edge') {
    // full map minus a 1-tile border — rooms near the outer ring
    return { x: 1, y: 1, w: mapW - 2, h: mapH - 2 }
  }

  if (zoneName === 'corner') {
    // pick a random quadrant later — for now return the full map
    return { x: 1, y: 1, w: mapW - 2, h: mapH - 2 }
  }

  return { x: 1, y: 1, w: mapW - 2, h: mapH - 2 }
}

// check whether a rect overlaps any placed room (with a 1-tile buffer for walls)
function overlaps(x, y, w, h, placedRooms) {
  for (const room of placedRooms) {
    const buffer = 1
    if (
      x - buffer < room.x + room.w &&
      x + w + buffer > room.x &&
      y - buffer < room.y + room.h &&
      y + h + buffer > room.y
    ) {
      return true
    }
  }
  return false
}

// check the rect fits inside the map with at least 1 tile of border
function fitsInMap(x, y, w, h, mapW, mapH) {
  return x >= 1 && y >= 1 && x + w < mapW - 1 && y + h < mapH - 1
}

// tries to place a single room on the grid. returns the placed room or null
export function tryPlaceRoom(grid, roomDef, zones, placedRooms, rng, mapW, mapH) {
  const { size, bias } = roomDef
  const maxAttempts = 60

  const zone = resolveZone(bias.zone, zones, mapW, mapH)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const w = rng.integer({ min: size.minW, max: size.maxW })
    const h = rng.integer({ min: size.minH, max: size.maxH })

    // pick a random position within the zone
    const maxX = zone.x + zone.w - w
    const maxY = zone.y + zone.h - h
    if (maxX < zone.x || maxY < zone.y) continue

    const x = rng.integer({ min: zone.x, max: maxX })
    const y = rng.integer({ min: zone.y, max: maxY })

    if (!fitsInMap(x, y, w, h, mapW, mapH)) continue
    if (overlaps(x, y, w, h, placedRooms)) continue

    // carve floor tiles into the grid
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        grid[ry][rx] = Tile.FLOOR
      }
    }

    const placed = { x, y, w, h, def: roomDef, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) }
    return placed
  }

  return null
}
