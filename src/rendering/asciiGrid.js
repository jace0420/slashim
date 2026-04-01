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

// creates the ascii grid renderer. call renderFullMap() to populate it from a MapData
export function createAsciiGrid(panelParams, mapW, mapH) {
  const glyphTextures = buildGlyphAtlas(DEFAULT_GLYPHS)

  const container = new Container()
  const sprites = [] // flat array, index = y * mapW + x

  // spacing so the grid fills the content area below the title row
  const titleH = 20
  const pad = 4
  const availW = panelParams.w - pad * 2
  const availH = panelParams.h - titleH - pad
  const cellW = availW / mapW
  const cellH = availH / mapH
  const cellSize = Math.min(cellW, cellH)

  // offset to center the grid in the available space
  const gridW = cellSize * mapW
  const gridH = cellSize * mapH
  const offsetX = pad + (availW - gridW) / 2
  const offsetY = titleH + (availH - gridH) / 2

  // create one sprite per tile
  const blankTex = glyphTextures.get(' ') || Texture.EMPTY
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const sprite = new Sprite(blankTex)
      sprite.width = cellSize
      sprite.height = cellSize
      sprite.x = offsetX + x * cellSize
      sprite.y = offsetY + y * cellSize
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
  }
}
