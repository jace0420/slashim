import { Container, Graphics } from 'pixi.js'

// wraps a content container (like the ascii grid) in a clipped, auto-fitted viewport.
// content is scaled to fit and centered — no interactive zoom or pan.

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

  // inner container holds the actual map content — scaled to fit
  const content = new Container()
  viewport.addChild(content)

  const interactionLayer = new Graphics()
  interactionLayer.eventMode = 'static'
  interactionLayer.cursor = 'pointer'
  viewport.addChild(interactionLayer)

  let zoom = 1

  function redrawInteractionLayer() {
    interactionLayer.clear()
    interactionLayer.rect(0, 0, bounds.w, bounds.h)
      .fill({ color: 0xffffff, alpha: 0.001 })
  }

  // center the content within the viewport at current zoom
  function centerContent() {
    const cw = content.width
    const ch = content.height
    content.x = (bounds.w - cw) / 2
    content.y = (bounds.h - ch) / 2
  }

  // scale so the content fits inside the viewport with some padding
  function fitToView(contentW, contentH) {
    const scaleX = bounds.w / contentW
    const scaleY = bounds.h / contentH
    zoom = Math.min(scaleX, scaleY) * 0.95
    content.scale.set(zoom)
    centerContent()
  }

  // resize when the layout zone changes
  function resize(newBounds) {
    bounds = newBounds
    viewport.x = bounds.x
    viewport.y = bounds.y
    clipMask.clear()
    clipMask.rect(0, 0, bounds.w, bounds.h).fill({ color: 0xffffff })
    centerContent()
    redrawInteractionLayer()
  }

  function toContentPoint(globalPoint) {
    return content.toLocal(globalPoint)
  }

  function destroy() {
    viewport.destroy({ children: true })
  }

  redrawInteractionLayer()

  return {
    viewport,
    content,
    interactionLayer,
    fitToView,
    resize,
    destroy,
    toContentPoint,
    get bounds() { return bounds },
  }
}
