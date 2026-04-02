// tile type enum + display defaults (char + color)

export const Tile = {
  VOID:    0,
  FLOOR:   1,
  WALL:    2,
  DOOR:    3,
  HALLWAY: 4,
}

// default visual for each tile type — char is the CP437 glyph, color is the hex tint, bg is optional background
export const TILE_DISPLAY = {
  [Tile.VOID]:    { char: ' ', color: 0x000000, bg: 0x000000 },
  [Tile.FLOOR]:   { char: '.', color: 0x666666, bg: 0x0f0f1a },
  [Tile.WALL]:    { char: '#', color: 0x8899aa, bg: 0x1a1a2e },
  [Tile.DOOR]:    { char: '+', color: 0xaa8844, bg: 0x1a1510 },
  [Tile.HALLWAY]: { char: '.', color: 0x555555, bg: 0x0d0d18 },
}

// create an empty w×h grid filled with a given tile type
export function createGrid(w, h, fill = Tile.VOID) {
  const grid = []
  for (let y = 0; y < h; y++) {
    grid[y] = new Array(w).fill(fill)
  }
  return grid
}

// bounds check
export function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length
}

// true for any tile a character can stand on / walk through
export function isWalkable(tile) {
  return tile === Tile.FLOOR || tile === Tile.HALLWAY || tile === Tile.DOOR
}
