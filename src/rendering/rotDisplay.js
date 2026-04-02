import { Display } from 'rot-js'

// convert a 0xRRGGBB int tint to a CSS '#rrggbb' string
export function tintToCSS(tint) {
  return '#' + (tint & 0xffffff).toString(16).padStart(6, '0')
}

// wraps ROT.Display with an API shaped for our map rendering needs.
// the underlying canvas is meant to be consumed by rotBridge for PixiJS integration.
export function createRotDisplay(mapW, mapH, cellPx = 16) {
  const display = new Display({
    width: mapW,
    height: mapH,
    fontSize: cellPx,
    fontFamily: 'monospace',
    fg: '#666666',
    bg: '#000000',
    forceSquareRatio: true,
  })

  const canvas = display.getContainer()

  // actual pixel dims — ROT.Display may adjust based on font metrics
  const gridW = canvas.width
  const gridH = canvas.height

  function draw(x, y, char, fg, bg) {
    display.draw(x, y, char, fg ?? null, bg ?? null)
  }

  function drawOver(x, y, char, fg, bg) {
    display.drawOver(x, y, char ?? null, fg ?? null, bg ?? null)
  }

  // batch-render an entire map. mapData has chars[][], colors[][], and optionally bgs[][].
  // colors/bgs can be either 0xRRGGBB ints or CSS strings — we normalize to CSS.
  function renderFullMap(mapData) {
    display.clear()
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const ch = mapData.chars[y]?.[x] ?? ' '
        const rawFg = mapData.colors[y]?.[x] ?? 0x000000
        const rawBg = mapData.bgs?.[y]?.[x] ?? 0x000000
        const fg = typeof rawFg === 'string' ? rawFg : tintToCSS(rawFg)
        const bg = typeof rawBg === 'string' ? rawBg : tintToCSS(rawBg)
        display.draw(x, y, ch, fg, bg)
      }
    }
  }

  function clear() {
    display.clear()
  }

  function destroy() {
    display.clear()
    canvas.remove()
  }

  return {
    display,
    canvas,
    draw,
    drawOver,
    renderFullMap,
    clear,
    destroy,
    gridW,
    gridH,
  }
}
