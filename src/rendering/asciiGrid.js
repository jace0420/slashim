import { createRotDisplay, tintToCSS } from './rotDisplay.js'
import { createRotBridge } from './rotBridge.js'

// creates the ascii grid renderer backed by ROT.Display + a PixiJS texture bridge.
// same public API as before — container, updateTile, renderFullMap, destroy, gridW, gridH.
export function createAsciiGrid(mapW, mapH, cellPx = 16) {
  const rot = createRotDisplay(mapW, mapH, cellPx)
  const bridge = createRotBridge(rot.canvas)

  // cells that need canvas-level rotation (e.g. east/west prop glyphs).
  // set once after map generation; re-drawn after every flush.
  let rotatedCells = []

  // grab the 2D context from the ROT canvas for post-draw rotation
  const ctx = rot.canvas.getContext('2d')

  function setRotatedCells(cells) {
    rotatedCells = cells || []
  }

  // redraw rotated cells directly on the canvas, matching ROT's _drawNoCache layout.
  // called after rot.flush() but before the GPU texture upload.
  function applyRotatedCells() {
    if (rotatedCells.length === 0) return
    const { spacingX, spacingY, font } = rot

    for (const cell of rotatedCells) {
      const px = cell.x * spacingX
      const py = cell.y * spacingY
      const cx = (cell.x + 0.5) * spacingX
      const cy = Math.ceil((cell.y + 0.5) * spacingY)
      const angle = cell.rotation * Math.PI / 180

      // clear and fill background (same as ROT's bg fill)
      ctx.fillStyle = cell.bg
      ctx.fillRect(px, py, spacingX, spacingY)

      // draw the rotated character
      ctx.save()
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.fillStyle = cell.fg
      ctx.fillText(cell.char, 0, 0)
      ctx.restore()
    }
  }

  function updateTile(x, y, char, color, bg) {
    const fg = typeof color === 'string' ? color : tintToCSS(color)
    const bgCSS = bg != null ? (typeof bg === 'string' ? bg : tintToCSS(bg)) : '#000000'
    rot.draw(x, y, char, fg, bgCSS)
    bridge.markDirty()
  }

  function renderFullMap(mapData) {
    rot.renderFullMap(mapData)
    // ROT defers canvas drawing to rAF; force it to draw synchronously so the
    // canvas has content before we push to the GPU texture.
    rot.flush()
    applyRotatedCells()
    bridge.refresh()
  }

  // call once per frame (e.g. end of tick) to push any pending draws to the GPU
  function flush() {
    // Force ROT to draw all pending tile changes to the canvas before uploading.
    rot.flush()
    applyRotatedCells()
    bridge.flushIfDirty()
  }

  function destroy() {
    bridge.destroy()
    rot.destroy()
  }

  return {
    container: bridge.container,
    updateTile,
    renderFullMap,
    setRotatedCells,
    flush,
    destroy,
    gridW: rot.gridW,
    gridH: rot.gridH,
  }
}
