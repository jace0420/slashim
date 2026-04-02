import { Container, Graphics } from 'pixi.js'

// wraps a content container (like the ascii grid) in a pannable/zoomable viewport.
// the viewport clips to the given bounds and supports wheel-zoom + drag-pan.

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4.0

export function createMapViewport(bounds) {
  // outer container positioned/sized to the layout zone
  const viewport = new Container()
  viewport.x = bounds.x
  viewport.y = bounds.y

  // mask so nothing draws outside the viewport bounds
  const clipMask = new Graphics()
  clipMask.rect(0, 0, bounds.w, bounds.h).fill({ color: 0xffffff })
  viewport.addChild(clipMask)
  viewport.mask = clipMask

  // inner container holds the actual map content — this is what gets scaled/translated
  const content = new Container()
  viewport.addChild(content)

  let zoom = 1
  let dragging = false
  let dragStart = { x: 0, y: 0 }
  let contentStart = { x: 0, y: 0 }

  // centers the content in the viewport at the current zoom, clamping so edge stays visible
  function clampPosition() {
    const cw = content.width
    const ch = content.height

    // if content is smaller than viewport at this zoom, center it
    if (cw <= bounds.w) {
      content.x = (bounds.w - cw) / 2
    } else {
      content.x = Math.min(0, Math.max(bounds.w - cw, content.x))
    }

    if (ch <= bounds.h) {
      content.y = (bounds.h - ch) / 2
    } else {
      content.y = Math.min(0, Math.max(bounds.h - ch, content.y))
    }
  }

  // fit-to-fill: scale so the content fits inside the viewport with some padding
  function fitToView(contentW, contentH) {
    const scaleX = bounds.w / contentW
    const scaleY = bounds.h / contentH
    zoom = Math.min(scaleX, scaleY) * 0.95 // slight padding
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
    content.scale.set(zoom)
    clampPosition()
  }

  // zoom around a point (in viewport-local coords)
  function zoomAt(localX, localY, delta) {
    const oldZoom = zoom
    const factor = delta > 0 ? 0.9 : 1.1
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))

    // adjust position so the point under the cursor stays fixed
    const ratio = zoom / oldZoom
    content.x = localX - (localX - content.x) * ratio
    content.y = localY - (localY - content.y) * ratio
    content.scale.set(zoom)
    clampPosition()
  }

  // pointer drag for panning
  viewport.eventMode = 'static'
  viewport.cursor = 'grab'
  viewport.hitArea = { contains: (x, y) => x >= 0 && x <= bounds.w && y >= 0 && y <= bounds.h }

  viewport.on('pointerdown', (e) => {
    dragging = true
    viewport.cursor = 'grabbing'
    const local = viewport.toLocal(e.global)
    dragStart = { x: local.x, y: local.y }
    contentStart = { x: content.x, y: content.y }
  })

  viewport.on('pointermove', (e) => {
    if (!dragging) return
    const local = viewport.toLocal(e.global)
    content.x = contentStart.x + (local.x - dragStart.x)
    content.y = contentStart.y + (local.y - dragStart.y)
    clampPosition()
  })

  viewport.on('pointerup', () => {
    dragging = false
    viewport.cursor = 'grab'
  })

  viewport.on('pointerupoutside', () => {
    dragging = false
    viewport.cursor = 'grab'
  })

  // resize when the layout zone changes
  function resize(newBounds) {
    bounds = newBounds
    viewport.x = bounds.x
    viewport.y = bounds.y
    clipMask.clear()
    clipMask.rect(0, 0, bounds.w, bounds.h).fill({ color: 0xffffff })
    clampPosition()
  }

  function destroy() {
    viewport.destroy({ children: true })
  }

  return {
    viewport,      // add to stage
    content,       // add your map container as a child of this
    zoomAt,
    fitToView,
    resize,
    destroy,
    // expose for hit-testing in the wheel handler
    get bounds() { return bounds },
  }
}
