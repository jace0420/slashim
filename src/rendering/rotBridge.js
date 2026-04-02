import { Container, Sprite, Texture } from 'pixi.js'

// bridges a ROT.Display canvas into the PixiJS scene graph as a single textured sprite.
// call refresh() after any ROT.Display draw calls to push changes to the GPU.
export function createRotBridge(rotCanvas) {
  const texture = Texture.from(rotCanvas)
  const sprite = new Sprite(texture)
  const container = new Container()
  container.addChild(sprite)

  const gridW = rotCanvas.width
  const gridH = rotCanvas.height

  // dirty flag — batch multiple draw calls per frame, refresh once
  let dirty = false

  function markDirty() {
    dirty = true
  }

  // push canvas changes to the PixiJS texture. call once per frame after all draws.
  function refresh() {
    texture.source.update()
    dirty = false
  }

  // conditionally refresh only if something changed
  function flushIfDirty() {
    if (dirty) refresh()
  }

  function destroy() {
    container.destroy({ children: true })
    texture.destroy(true)
  }

  return {
    container,
    sprite,
    texture,
    gridW,
    gridH,
    markDirty,
    refresh,
    flushIfDirty,
    destroy,
  }
}
