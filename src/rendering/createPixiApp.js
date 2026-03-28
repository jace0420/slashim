import { Application } from 'pixi.js'

// creates and initializes a PixiJS v8 Application attached to a DOM container
// returns the app — caller is responsible for calling app.destroy() on cleanup
export async function createPixiApp(container) {
  const app = new Application()

  await app.init({
    resizeTo: container,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  // canvas fills the container; the parent CSS should handle positioning
  app.canvas.style.display = 'block'
  app.canvas.style.width = '100%'
  app.canvas.style.height = '100%'

  container.appendChild(app.canvas)

  return app
}
