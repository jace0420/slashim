import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js'
import { Pane } from 'tweakpane'

import { showScreen } from '../router'
import { createPixiApp } from '../rendering/createPixiApp'
import { createLightingFilter, DEFAULT_LIGHT_PARAMS, createFlicker, DEFAULT_FLICKER_PARAMS } from '../rendering/lighting'

const DIFFUSE_URL = '/assets/ui/game-screen-diffuse.png'

// casual starting positions — dev adjusts with tweakpane (1920×1080 baseline)
const DEFAULT_PANEL_PARAMS = {
  narrative: { x: 668,   y: 329, w: 192, h: 312 },
  cast:      { x: 445, y: 329,  w: 192, h: 312 },
  location:  { x: 883,  y: 329,  w: 192, h: 312 },
  areaMap:   { x: 1113, y: 141, w: 312, h: 312 },
}

// lightweight placeholder panel — Graphics rect + label text
// p is the live params object so redraw() always reads current values
function buildPanel(label, p) {
  const container = new Container()
  const bg = new Graphics()
  const title = new Text({
    text: label,
    style: { fontSize: 11, fill: 0xaaaaaa, fontFamily: 'monospace' },
  })
  title.x = 8
  title.y = 6
  container.addChild(bg)
  container.addChild(title)

  function redraw() {
    container.x = p.x
    container.y = p.y
    bg.clear()
    bg.rect(0, 0, p.w, p.h)
      .fill({ color: 0x111118, alpha: 0.55 })
      .stroke({ color: 0x8899aa, alpha: 0.45, width: 1 })
  }

  redraw()
  return { container, redraw }
}

function shouldShowTweakPane() {
  return new URLSearchParams(window.location.search).get('tweak') === '1'
}

// scales and positions a sprite to cover the renderer dimensions (like CSS background-size: cover)
function coverSprite(sprite, width, height) {
  const texW = sprite.texture.width
  const texH = sprite.texture.height
  const scale = Math.max(width / texW, height / texH)

  sprite.width = texW * scale
  sprite.height = texH * scale
  sprite.x = (width - sprite.width) / 2
  sprite.y = (height - sprite.height) / 2
}

export function mountGame(container) {
  // wrapper fills the viewport — PixiJS canvas lives inside it
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#000;'
  container.appendChild(wrapper)

  let pixiApp = null
  let pane = null
  let uiPane = null
  let lighting = null
  let flicker = null
  let backdrop = null
  let sceneContainer = null
  let panels = {}
  let followCursor = false
  let mouseMoveHandler = null
  let cleanedUp = false

  // flicker params live on this object so tweakpane bindings mutate it in-place
  const flickerParams = { ...DEFAULT_FLICKER_PARAMS }

  // track current tweakpane params in a local object so bindings can mutate it
  const params = {
    panels: {
      narrative: { ...DEFAULT_PANEL_PARAMS.narrative },
      cast:      { ...DEFAULT_PANEL_PARAMS.cast },
      location:  { ...DEFAULT_PANEL_PARAMS.location },
      areaMap:   { ...DEFAULT_PANEL_PARAMS.areaMap },
    },
    light: {
      x: DEFAULT_LIGHT_PARAMS.lightPos.x,
      y: DEFAULT_LIGHT_PARAMS.lightPos.y,
      color: { r: Math.round(DEFAULT_LIGHT_PARAMS.lightColor.r * 255), g: Math.round(DEFAULT_LIGHT_PARAMS.lightColor.g * 255), b: Math.round(DEFAULT_LIGHT_PARAMS.lightColor.b * 255) },
      intensity: DEFAULT_LIGHT_PARAMS.lightIntensity,
      radius: DEFAULT_LIGHT_PARAMS.lightRadius,
      falloff: DEFAULT_LIGHT_PARAMS.lightFalloff,
    },
    ambient: {
      color: { r: Math.round(DEFAULT_LIGHT_PARAMS.ambientColor.r * 255), g: Math.round(DEFAULT_LIGHT_PARAMS.ambientColor.g * 255), b: Math.round(DEFAULT_LIGHT_PARAMS.ambientColor.b * 255) },
      intensity: DEFAULT_LIGHT_PARAMS.ambientIntensity,
    },
    followCursor: false,
  }

  function syncUniforms() {
    if (!lighting) return
    lighting.setLightPos(params.light.x, params.light.y)
    lighting.setLightColor({ r: params.light.color.r / 255, g: params.light.color.g / 255, b: params.light.color.b / 255 })
    lighting.uniforms.uLightIntensity = params.light.intensity
    lighting.uniforms.uLightRadius = params.light.radius
    lighting.uniforms.uLightFalloff = params.light.falloff
    lighting.setAmbientColor({ r: params.ambient.color.r / 255, g: params.ambient.color.g / 255, b: params.ambient.color.b / 255 })
    lighting.uniforms.uAmbientIntensity = params.ambient.intensity
  }

  function onMouseMove(e) {
    if (!followCursor || !pixiApp) return
    params.light.x = e.clientX / pixiApp.renderer.width
    params.light.y = e.clientY / pixiApp.renderer.height
    lighting?.setLightPos(params.light.x, params.light.y)
    // refresh tweakpane display if open
    pane?.refresh()
  }

  async function init() {
    pixiApp = await createPixiApp(wrapper)

    const texture = await Assets.load(DIFFUSE_URL)
    backdrop = new Sprite(texture)

    lighting = createLightingFilter(DEFAULT_LIGHT_PARAMS)
    lighting.setAspectRatio(pixiApp.renderer.width / pixiApp.renderer.height)

    // sceneContainer gets the filter so backdrop + all panels share the same lighting pass
    sceneContainer = new Container()
    sceneContainer.filters = [lighting.filter]

    coverSprite(backdrop, pixiApp.renderer.width, pixiApp.renderer.height)
    sceneContainer.addChild(backdrop)

    // build the four placeholder UI panels above the backdrop
    panels.narrative = buildPanel('NARRATIVE PANE', params.panels.narrative)
    panels.cast      = buildPanel('CAST PANE',      params.panels.cast)
    panels.location  = buildPanel('LOCATION PANE',  params.panels.location)
    panels.areaMap   = buildPanel('AREA MAP',        params.panels.areaMap)

    for (const panel of Object.values(panels)) {
      sceneContainer.addChild(panel.container)
    }

    pixiApp.stage.addChild(sceneContainer)

    // update cover + aspect ratio whenever the renderer resizes
    pixiApp.renderer.on('resize', (width, height) => {
      if (backdrop) coverSprite(backdrop, width, height)
      if (lighting) lighting.setAspectRatio(width / height)
    })

    // flicker reads params.light each frame so tweakpane base changes propagate naturally
    flicker = createFlicker(lighting, pixiApp.ticker, params.light, flickerParams)

    mouseMoveHandler = onMouseMove
    window.addEventListener('mousemove', mouseMoveHandler)

    if (shouldShowTweakPane()) {
      setupTweakPane()
    }
  }

  function setupTweakPane() {
    pane = new Pane({ title: 'Game Lighting' })

    const lightFolder = pane.addFolder({ title: 'Point Light', expanded: true })
    lightFolder.addBinding(params.light, 'x', { min: 0, max: 1, step: 0.001, label: 'pos x' }).on('change', syncUniforms)
    lightFolder.addBinding(params.light, 'y', { min: 0, max: 1, step: 0.001, label: 'pos y' }).on('change', syncUniforms)
    lightFolder.addBinding(params.light, 'color', { label: 'color' }).on('change', syncUniforms)
    lightFolder.addBinding(params.light, 'intensity', { min: 0, max: 5, step: 0.01, label: 'intensity' }).on('change', syncUniforms)
    lightFolder.addBinding(params.light, 'radius', { min: 0.01, max: 2, step: 0.01, label: 'radius' }).on('change', syncUniforms)
    lightFolder.addBinding(params.light, 'falloff', { min: 0.1, max: 10, step: 0.1, label: 'falloff' }).on('change', syncUniforms)

    const ambientFolder = pane.addFolder({ title: 'Ambient', expanded: true })
    ambientFolder.addBinding(params.ambient, 'color', { label: 'color' }).on('change', syncUniforms)
    ambientFolder.addBinding(params.ambient, 'intensity', { min: 0, max: 1, step: 0.01, label: 'intensity' }).on('change', syncUniforms)

    pane.addBinding(params, 'followCursor', { label: 'follow cursor' }).on('change', ({ value }) => {
      followCursor = value
    })

    const flickerFolder = pane.addFolder({ title: 'Flicker', expanded: true })
    flickerFolder.addBinding(flickerParams, 'enabled', { label: 'enabled' })
    flickerFolder.addBinding(flickerParams, 'intensityScale', { min: 0, max: 0.5, step: 0.01, label: 'intensity scale' })
    flickerFolder.addBinding(flickerParams, 'radiusScale', { min: 0, max: 0.3, step: 0.01, label: 'radius scale' })
    flickerFolder.addBinding(flickerParams, 'swayScale', { min: 0, max: 0.02, step: 0.001, label: 'sway scale' })
    flickerFolder.addBinding(flickerParams, 'speed', { min: 0.1, max: 3, step: 0.05, label: 'speed' })

    // separate pane for UI panel layout — resize and position each panel live
    uiPane = new Pane({ title: 'Game UI' })

    const panelDefs = [
      { key: 'narrative', label: 'Narrative Pane' },
      { key: 'cast',      label: 'Cast Pane'      },
      { key: 'location',  label: 'Location Pane'  },
      { key: 'areaMap',   label: 'Area Map'        },
    ]

    for (const { key, label } of panelDefs) {
      const p = params.panels[key]
      const panel = panels[key]
      const folder = uiPane.addFolder({ title: label, expanded: false })
      folder.addBinding(p, 'x', { min: 0, max: 2560, step: 1, label: 'x' }).on('change', () => panel.redraw())
      folder.addBinding(p, 'y', { min: 0, max: 1440, step: 1, label: 'y' }).on('change', () => panel.redraw())
      folder.addBinding(p, 'w', { min: 50, max: 1920, step: 1, label: 'w' }).on('change', () => panel.redraw())
      folder.addBinding(p, 'h', { min: 50, max: 1080, step: 1, label: 'h' }).on('change', () => panel.redraw())
    }
  }

  // kick off async init — any errors surface in the console
  init().catch((error) => {
    console.error('[game] init failed:', error)
  })

  return function cleanup() {
    if (cleanedUp) return
    cleanedUp = true

    if (mouseMoveHandler) {
      window.removeEventListener('mousemove', mouseMoveHandler)
    }

    flicker?.stop()
    pane?.dispose()
    uiPane?.dispose()

    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: false })
      pixiApp = null
    }
  }
}
