import { createRotDisplay, tintToCSS } from './rotDisplay.js'
import { createRotBridge } from './rotBridge.js'

// creates the ascii grid renderer backed by ROT.Display + a PixiJS texture bridge.
// same public API as before — container, updateTile, renderFullMap, destroy, gridW, gridH.
export function createAsciiGrid(mapW, mapH, cellPx = 16) {
  const rot = createRotDisplay(mapW, mapH, cellPx)
  const bridge = createRotBridge(rot.canvas)

  function updateTile(x, y, char, color, bg) {
    const fg = typeof color === 'string' ? color : tintToCSS(color)
    const bgCSS = bg != null ? (typeof bg === 'string' ? bg : tintToCSS(bg)) : null
    if (bgCSS != null) {
      rot.draw(x, y, char, fg, bgCSS)
    } else {
      // use drawOver to preserve existing background when no bg is provided
      rot.drawOver(x, y, char, fg, null)
    }
    bridge.markDirty()
  }

  function renderFullMap(mapData) {
    rot.renderFullMap(mapData)
    bridge.refresh()
  }

  // call once per frame (e.g. end of tick) to push any pending draws to the GPU
  function flush() {
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
    flush,
    destroy,
    gridW: rot.gridW,
    gridH: rot.gridH,
  }
}
