import { Container, Sprite, Texture, Rectangle } from 'pixi.js'

// generates a glyph atlas texture at runtime from a monospace font on a canvas.
// returns a Map<string, Texture> keyed by character
function buildGlyphAtlas(glyphs, cellSize = 8, font = 'monospace') {
  const cols = 16
  const rows = Math.ceil(glyphs.length / cols)
  const canvas = document.createElement('canvas')
  canvas.width = cols * cellSize
  canvas.height = rows * cellSize

  const ctx = canvas.getContext('2d')
  ctx.font = `${cellSize}px ${font}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'

  glyphs.forEach((ch, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * cellSize
    const y = row * cellSize

    // center the glyph in its cell
    const measured = ctx.measureText(ch)
    const offsetX = Math.max(0, (cellSize - measured.width) / 2)
    ctx.fillText(ch, x + offsetX, y)
  })

  // pixi v8: Texture.from(canvas) gives us the base source we can slice
  const baseTexture = Texture.from(canvas)

  const textures = new Map()
  glyphs.forEach((ch, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const frame = new Rectangle(col * cellSize, row * cellSize, cellSize, cellSize)
    textures.set(ch, new Texture({ source: baseTexture.source, frame }))
  })

  // blank space fallback
  if (!textures.has(' ')) {
    textures.set(' ', Texture.EMPTY)
  }

  return textures
}

const DEFAULT_GLYPHS = [
  '#', '.', '+', '@', ' ',
  '~', ':', ';', '!', '?', '*', '%', '/', '\\',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]

// creates the ascii grid renderer. call renderFullMap() to populate it from a MapData.
// cellPx controls the base pixel size per tile (zoom is handled externally by the viewport).
export function createAsciiGrid(mapW, mapH, cellPx = 16) {
  const glyphTextures = buildGlyphAtlas(DEFAULT_GLYPHS, cellPx)

  const container = new Container()
  const sprites = [] // flat array, index = y * mapW + x

  const gridW = cellPx * mapW
  const gridH = cellPx * mapH

  // create one sprite per tile — no offset, grid starts at (0,0) of container
  const blankTex = glyphTextures.get(' ') || Texture.EMPTY
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const sprite = new Sprite(blankTex)
      sprite.width = cellPx
      sprite.height = cellPx
      sprite.x = x * cellPx
      sprite.y = y * cellPx
      container.addChild(sprite)
      sprites.push(sprite)
    }
  }

  function getSprite(x, y) {
    return sprites[y * mapW + x]
  }

  function updateTile(x, y, char, color) {
    const sprite = getSprite(x, y)
    if (!sprite) return
    sprite.texture = glyphTextures.get(char) || blankTex
    sprite.tint = color
  }

  function renderFullMap(mapData) {
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const ch = mapData.chars[y]?.[x] ?? ' '
        const color = mapData.colors[y]?.[x] ?? 0x000000
        updateTile(x, y, ch, color)
      }
    }
  }

  function destroy() {
    container.destroy({ children: true })
  }

  return {
    container,
    updateTile,
    renderFullMap,
    destroy,
    gridW,
    gridH,
  }
}
