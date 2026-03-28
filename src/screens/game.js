import { Assets, Sprite } from 'pixi.js'
import { Pane } from 'tweakpane'

import { showScreen } from '../router'
import { createPixiApp } from '../rendering/createPixiApp'
import { createLightingFilter, DEFAULT_LIGHT_PARAMS } from '../rendering/lighting'

const DIFFUSE_URL = '/assets/ui/game-screen-diffuse.png'

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
  let lighting = null
  let backdrop = null
  let followCursor = false
  let mouseMoveHandler = null
  let cleanedUp = false

  // track current tweakpane params in a local object so bindings can mutate it
  const params = {
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
    backdrop.filters = [lighting.filter]

    coverSprite(backdrop, pixiApp.renderer.width, pixiApp.renderer.height)
    pixiApp.stage.addChild(backdrop)

    // update cover + aspect ratio whenever the renderer resizes
    pixiApp.renderer.on('resize', (width, height) => {
      if (backdrop) coverSprite(backdrop, width, height)
      if (lighting) lighting.setAspectRatio(width / height)
    })

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

    pane?.dispose()

    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: false })
      pixiApp = null
    }
  }
}
