import { Tile } from './tileTypes.js'

// euclidean distance between two room centers
function dist(a, b) {
  return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2)
}

// Prim's MST — guarantees all rooms are connected with minimum total corridor length.
// returns array of [indexA, indexB] pairs
function buildMST(rooms) {
  if (rooms.length < 2) return []

  const inTree = new Set([0])
  const edges = []

  while (inTree.size < rooms.length) {
    let best = null
    let bestDist = Infinity

    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue
        const d = dist(rooms[i], rooms[j])
        if (d < bestDist) {
          bestDist = d
          best = [i, j]
        }
      }
    }

    if (!best) break
    edges.push(best)
    inTree.add(best[1])
  }

  return edges
}

// optionally add extra edges for loops so the map isn't a pure tree
function addExtraEdges(rooms, mstEdges, rng, extraCount = 2) {
  const existing = new Set(mstEdges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`))
  const extras = []

  const candidates = []
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const key = `${i}-${j}`
      if (!existing.has(key)) candidates.push([i, j])
    }
  }

  // shuffle and pick up to extraCount
  rng.shuffle(candidates)
  for (let k = 0; k < Math.min(extraCount, candidates.length); k++) {
    extras.push(candidates[k])
  }

  return [...mstEdges, ...extras]
}

// carve an L-shaped corridor between two points on the grid.
// randomly pick whether to go horizontal-first or vertical-first
function carveCorridorL(grid, x1, y1, x2, y2, rng) {
  const goHorizontalFirst = rng.bool()

  if (goHorizontalFirst) {
    carveHorizontal(grid, x1, x2, y1)
    carveVertical(grid, y1, y2, x2)
  } else {
    carveVertical(grid, y1, y2, x1)
    carveHorizontal(grid, x1, x2, y2)
  }
}

function carveHorizontal(grid, x1, x2, y) {
  const start = Math.min(x1, x2)
  const end = Math.max(x1, x2)
  for (let x = start; x <= end; x++) {
    if (grid[y][x] === Tile.VOID) {
      grid[y][x] = Tile.HALLWAY
    }
  }
}

function carveVertical(grid, y1, y2, x) {
  const start = Math.min(y1, y2)
  const end = Math.max(y1, y2)
  for (let y = start; y <= end; y++) {
    if (grid[y][x] === Tile.VOID) {
      grid[y][x] = Tile.HALLWAY
    }
  }
}

// run the full hallway pass: MST + optional extras, then carve corridors
export function connectRooms(grid, rooms, rng) {
  if (rooms.length < 2) return

  const mst = buildMST(rooms)
  const edges = addExtraEdges(rooms, mst, rng, rng.integer({ min: 1, max: 2 }))

  for (const [i, j] of edges) {
    carveCorridorL(grid, rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy, rng)
  }
}
