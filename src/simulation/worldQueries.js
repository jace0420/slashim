import { inBounds, isWalkable } from '../generation/tileTypes.js'

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function makeKey(x, y) {
  return `${x},${y}`
}

export function buildOccupiedSet(characters, excludeCastIndex = null) {
  const set = new Set()
  for (const character of characters) {
    if (character.castIndex === excludeCastIndex) continue
    set.add(makeKey(character.x, character.y))
  }
  return set
}

export function buildReservedRestSlotSet(characters, excludeCastIndex = null) {
  const set = new Set()
  for (const character of characters) {
    if (character.castIndex === excludeCastIndex) continue
    const target = character.behavior?.target
    if (character.behavior?.key !== 'rest') continue
    if (!target?.slotKey) continue
    set.add(target.slotKey)
  }
  return set
}

export function findRoomAt(x, y, rooms) {
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) {
      return i
    }
  }
  return -1
}

export function getRoomLabel(mapData, roomIndex) {
  if (roomIndex == null || roomIndex < 0) return 'Hallway'
  return mapData.rooms[roomIndex]?.def?.label ?? `Room ${roomIndex}`
}

export function getRoomFloorTiles(room, mapData, occupied, options = {}) {
  const allowOccupiedGoal = options.allowOccupiedGoal === true
  const tiles = []

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isOpenTile(mapData, x, y, occupied, { allowOccupiedGoal })) continue
      tiles.push({ x, y })
    }
  }

  return tiles
}

export function pickRoomTile(room, mapData, occupied, rng, options = {}) {
  const tiles = getRoomFloorTiles(room, mapData, occupied, options)
  if (tiles.length === 0) return null

  if (options.preferInterior) {
    const interior = tiles.filter((tile) => isInteriorRoomTile(room, tile.x, tile.y))
    if (interior.length > 0) return rng.pickone(interior)
  }

  return rng.pickone(tiles)
}

function isInteriorRoomTile(room, x, y) {
  return x > room.x && x < room.x + room.w - 1 && y > room.y && y < room.y + room.h - 1
}

export function isOpenTile(mapData, x, y, occupied, options = {}) {
  const allowOccupiedGoal = options.allowOccupiedGoal === true
  if (!inBounds(mapData.tiles, x, y)) return false
  if (!isWalkable(mapData.tiles[y][x])) return false
  if (mapData.propMap?.[y]?.[x] != null) return false
  if (!allowOccupiedGoal && occupied?.has(makeKey(x, y))) return false
  return true
}

export function getOpenNeighborTiles(mapData, x, y, occupied, options = {}) {
  const neighbors = []
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (!isOpenTile(mapData, nx, ny, occupied, options)) continue
    neighbors.push({ x: nx, y: ny })
  }
  return neighbors
}

export function countOpenNeighbors(mapData, x, y, occupied, options = {}) {
  return getOpenNeighborTiles(mapData, x, y, occupied, options).length
}

export function findPath(mapData, start, goal, occupied, options = {}) {
  if (!goal) return null
  if (start.x === goal.x && start.y === goal.y) return []

  const frontier = [start]
  const cameFrom = new Map()
  const startKey = makeKey(start.x, start.y)
  const goalKey = makeKey(goal.x, goal.y)
  cameFrom.set(startKey, null)

  while (frontier.length > 0) {
    const current = frontier.shift()
    const currentKey = makeKey(current.x, current.y)
    if (currentKey === goalKey) break

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx
      const ny = current.y + dy
      const nextKey = makeKey(nx, ny)
      if (cameFrom.has(nextKey)) continue

      const isGoal = nx === goal.x && ny === goal.y
      if (!isOpenTile(mapData, nx, ny, occupied, { allowOccupiedGoal: isGoal && options.allowOccupiedGoal })) {
        continue
      }

      cameFrom.set(nextKey, current)
      frontier.push({ x: nx, y: ny })
    }
  }

  if (!cameFrom.has(goalKey)) return null

  const path = []
  let current = goal
  while (current && !(current.x === start.x && current.y === start.y)) {
    path.push(current)
    current = cameFrom.get(makeKey(current.x, current.y))
  }
  path.reverse()
  return path
}

export function pickTileNearCharacter(targetCharacter, mapData, occupied, rng, maxDistance = 2) {
  const candidates = []

  for (let dy = -maxDistance; dy <= maxDistance; dy++) {
    for (let dx = -maxDistance; dx <= maxDistance; dx++) {
      const x = targetCharacter.x + dx
      const y = targetCharacter.y + dy
      const distance = Math.abs(dx) + Math.abs(dy)
      if (distance === 0 || distance > maxDistance) continue
      if (!isOpenTile(mapData, x, y, occupied)) continue
      candidates.push({ x, y, distance })
    }
  }

  if (candidates.length === 0) return null
  const nearestDistance = Math.min(...candidates.map((candidate) => candidate.distance))
  const nearest = candidates.filter((candidate) => candidate.distance === nearestDistance)
  const pick = rng.pickone(nearest)
  return { x: pick.x, y: pick.y }
}

function buildPropDefMap(mapData) {
  const out = new Map()
  for (const def of mapData.propDefs ?? []) out.set(def.id, def)
  return out
}

function getFrontEdgeTiles(placedProp, offset = 1) {
  const { x, y, orient, dir } = placedProp
  const tiles = []

  if (dir === 'north') {
    const slotY = y + orient.h - 1 + offset
    for (let dx = 0; dx < orient.w; dx++) tiles.push({ x: x + dx, y: slotY })
  } else if (dir === 'south') {
    const slotY = y - offset
    for (let dx = 0; dx < orient.w; dx++) tiles.push({ x: x + dx, y: slotY })
  } else if (dir === 'east') {
    const slotX = x - offset
    for (let dy = 0; dy < orient.h; dy++) tiles.push({ x: slotX, y: y + dy })
  } else if (dir === 'west') {
    const slotX = x + orient.w - 1 + offset
    for (let dy = 0; dy < orient.h; dy++) tiles.push({ x: slotX, y: y + dy })
  }

  return tiles
}

function sampleCapacityTiles(tiles, capacity) {
  if (capacity >= tiles.length) return tiles
  const picks = []
  for (let i = 0; i < capacity; i++) {
    const position = Math.round(((i + 1) * (tiles.length + 1)) / (capacity + 1)) - 1
    picks.push(tiles[Math.max(0, Math.min(tiles.length - 1, position))])
  }
  return picks
}

export function getRestTargets(mapData, occupied, reservedSlotKeys) {
  const propDefs = buildPropDefMap(mapData)
  const targets = []

  for (const placedProp of mapData.placedProps ?? []) {
    const def = propDefs.get(placedProp.propId)
    const rest = def?.affordances?.rest
    if (!rest) continue

    const interaction = def.interaction ?? { mode: 'front-edge', offset: 1 }
    if (interaction.mode !== 'front-edge') continue

    const roomIndex = findRoomAt(placedProp.x, placedProp.y, mapData.rooms)
    const slotTiles = sampleCapacityTiles(
      getFrontEdgeTiles(placedProp, interaction.offset ?? 1).filter((tile) => isOpenTile(mapData, tile.x, tile.y, occupied)),
      rest.capacity ?? 1,
    )

    slotTiles.forEach((tile, index) => {
      const slotKey = `${placedProp.instanceId}:${index}`
      if (reservedSlotKeys?.has(slotKey)) return
      targets.push({
        slotKey,
        x: tile.x,
        y: tile.y,
        roomIndex,
        comfort: rest.comfort ?? 1,
        posture: rest.posture ?? 'sit',
        recoveryPerTick: rest.recoveryPerTick ?? 0.35,
        propId: placedProp.propId,
        label: def.label ?? placedProp.propId,
      })
    })
  }

  return targets
}