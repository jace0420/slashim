import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js'
import { Pane } from 'tweakpane'
import Chance from 'chance'

import { showScreen } from '../router'
import { createPixiApp } from '../rendering/createPixiApp'
import { createLightingFilter, DEFAULT_LIGHT_PARAMS, createFlicker, DEFAULT_FLICKER_PARAMS } from '../rendering/lighting'
import { createAsciiGrid } from '../rendering/asciiGrid'
import { buildCastPanel, buildNarrativePanel } from '../ui/panels'
import { buildClockWidget } from '../ui/clockWidget'
import { generateMap, debugPrintMap } from '../generation/mapGenerator'
import { state } from '../store/gameState'
import { initClock, formatClock, createClock, advanceMinute, SPEED_PRESETS, DEFAULT_CLOCK_PARAMS } from '../simulation/clock'
import { initCharacters, renderCharacters, tickCharacters } from '../simulation/characters'

const DIFFUSE_URL = '/assets/ui/game-screen-diffuse.png'

const DEFAULT_PANEL_PARAMS = {
  narrative: { x: 668,   y: 329, w: 192, h: 312 },
  cast:      { x: 445, y: 329,  w: 192, h: 312 },
  location:  { x: 883,  y: 329,  w: 192, h: 312 },
  areaMap:   { x: 1113, y: 141, w: 312, h: 312 },
  clockHud:  { x: 652,  y: 215, radius: 58 },
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
  let mapPane = null
  let simPane = null
  let lighting = null
  let flicker = null
  let backdrop = null
  let sceneContainer = null
  let panels = {}
  let asciiGrid = null
  let followCursor = false
  let mouseMoveHandler = null
  let wheelHandler = null
  let cleanedUp = false
  let clockHandle = null   // { play, pause, setSpeed, stop, isPaused } from createClock
  let clockWidget = null   // analog clock HUD (buildClockWidget)
  let simControls = null   // play/pause + speed buttons container
  let simRng = null        // Chance instance for simulation randomness

  // flicker params live on this object so tweakpane bindings mutate it in-place
  const flickerParams = { ...DEFAULT_FLICKER_PARAMS }

  // simulation tuning — mutable so tweakpane can adjust live
  const clockParams = { ...DEFAULT_CLOCK_PARAMS }

  // track current tweakpane params in a local object so bindings can mutate it
  const params = {
    panels: {
      narrative: { ...DEFAULT_PANEL_PARAMS.narrative },
      cast:      { ...DEFAULT_PANEL_PARAMS.cast },
      location:  { ...DEFAULT_PANEL_PARAMS.location },
      areaMap:   { ...DEFAULT_PANEL_PARAMS.areaMap },
      clockHud:  { ...DEFAULT_PANEL_PARAMS.clockHud },
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

  // builds merged cast entries combining setup data with live sim state (color + current room)
  function buildCastEntries() {
    return state.cast.map((castEntry, i) => {
      const char = state.characters.find(c => c.castIndex === i)
      let room = null
      if (char && char.roomIndex >= 0) {
        room = state.map?.rooms[char.roomIndex]?.def?.label ?? null
      }
      return {
        name: castEntry.name,
        archetype: castEntry.archetype,
        color: char?.color ?? null,
        room,
      }
    })
  }

  // builds the sim controls row: a play/pause toggle + NORMAL / FAST / FASTEST speed buttons
  function buildSimControls(x, y) {
    const ctr = new Container()
    ctr.x = x
    ctr.y = y

    const btnH = 26
    const ppW = 50   // play/pause button
    const spW = 56   // each speed button
    const gap = 4

    // generic button factory — returns { container, setText, setActive }
    function makeBtn(label, bx, bw, onClick) {
      const b = new Container()
      b.x = bx
      b.eventMode = 'static'
      b.cursor = 'pointer'

      const bg = new Graphics()
      b.addChild(bg)

      const txt = new Text({
        text: label,
        style: { fontSize: 10, fill: 0xcccccc, fontFamily: 'monospace', letterSpacing: 1 },
      })
      b.addChild(txt)

      function draw(active) {
        bg.clear()
        bg.rect(0, 0, bw, btnH)
          .fill({ color: active ? 0x334455 : 0x1a1a2e, alpha: 0.85 })
          .stroke({ color: active ? 0xaabbcc : 0x556677, alpha: 0.7, width: 1 })
        txt.x = Math.floor((bw - txt.width) / 2)
        txt.y = Math.floor((btnH - txt.height) / 2)
      }

      draw(false)
      b.on('pointerdown', onClick)

      return {
        container: b,
        setActive(val) { draw(val) },
        setText(s) { txt.text = s; draw(false) },
      }
    }

    let playing = false
    let activeSpeed = 'normal'

    const playBtn = makeBtn('▶ PLAY', 0, ppW, () => {
      if (!clockHandle) return
      if (playing) {
        clockHandle.pause()
        playing = false
        state.simulation.running = false
      } else {
        clockHandle.play()
        playing = true
        state.simulation.running = true
      }
      playBtn.setActive(playing)
      playBtn.setText(playing ? '⏸ PAUSE' : '▶ PLAY')
    })
    ctr.addChild(playBtn.container)

    const speeds = Object.entries(SPEED_PRESETS)
    const speedBtns = {}
    speeds.forEach(([key, preset], i) => {
      const bx = ppW + gap + i * (spW + gap)
      const btn = makeBtn(preset.label, bx, spW, () => {
        activeSpeed = key
        clockHandle?.setSpeed(preset.tickIntervalMs)
        clockParams.tickIntervalMs = preset.tickIntervalMs
        for (const [k, b] of Object.entries(speedBtns)) b.setActive(k === key)
      })
      speedBtns[key] = btn
      ctr.addChild(btn.container)
    })
    speedBtns['normal'].setActive(true)

    return {
      container: ctr,
      // externally force a pause (e.g. major events — TODO)
      forcePause() {
        if (!playing) return
        clockHandle?.pause()
        playing = false
        state.simulation.running = false
        playBtn.setActive(false)
        playBtn.setText('▶ PLAY')
      },
      isPlaying: () => playing,
    }
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

    // font must be loaded before any panel Text objects are created
    await Assets.load({ alias: 'NothingYouCouldDo', src: '/assets/fonts/NothingYouCouldDo-Regular.ttf' })

    // cast + narrative use functional panels; location remains placeholder; areaMap hosts the generated map
    panels.narrative = buildNarrativePanel(params.panels.narrative)
    panels.cast      = buildCastPanel(params.panels.cast, state.cast)
    panels.location  = buildPanel('LOCATION PANE',  params.panels.location)
    panels.areaMap   = buildPanel('AREA MAP',        params.panels.areaMap)

    for (const panel of Object.values(panels)) {
      sceneContainer.addChild(panel.container)
    }

    // generate and render the procedural map into the area map panel
    const mapSeed = state.mapSeed || String(Date.now())
    state.mapSeed = mapSeed
    state.map = generateMap('manor', mapSeed)
    debugPrintMap(state.map)

    asciiGrid = createAsciiGrid(params.panels.areaMap, state.map.width, state.map.height)
    asciiGrid.renderFullMap(state.map)
    panels.areaMap.container.addChild(asciiGrid.container)

    // spawn characters on the map
    state.characters = initCharacters(state.cast, state.map, state.mapSeed)
    renderCharacters(state.characters, asciiGrid)
    simRng = new Chance(state.mapSeed + '-sim')

    // refresh cast panel with colors + starting rooms now that characters exist
    panels.cast.refresh(buildCastEntries())

    // initialize clock from setup meta
    state.clock = initClock(state.meta)
    state.simulation = { running: false }

    // analog clock HUD widget
    clockWidget = buildClockWidget(params.panels.clockHud)
    clockWidget.update(state.clock) // draw initial hand positions
    sceneContainer.addChild(clockWidget.container)

    // create the realtime clock — starts paused, play/pause buttons control it
    clockHandle = createClock(state.clock, clockParams, {
      onTick: (_tickIndex, _minuteAdvanced) => {
        const events = tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance)
        for (const evt of events) {
          if (evt.type === 'room-enter') {
            panels.narrative.appendEntry(`${evt.name} entered the ${evt.room}.`)
          }
        }
        // refresh the cast panel whenever someone moved rooms
        if (events.length > 0) panels.cast.refresh(buildCastEntries())
      },
      onMinute: (clock) => {
        clockWidget?.update(clock)
      },
    })

    // sim controls row: play/pause + speed buttons, positioned below the panels
    simControls = buildSimControls(params.panels.cast.x, params.panels.cast.y + params.panels.cast.h + 12)
    sceneContainer.addChild(simControls.container)

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

    // wheel scrolls whichever panel the cursor is over
    const scrollablePanels = [
      { ref: panels.cast,      p: params.panels.cast },
      { ref: panels.narrative, p: params.panels.narrative },
    ]
    wheelHandler = (e) => {
      if (!pixiApp) return
      const rect = pixiApp.canvas.getBoundingClientRect()
      const sx = pixiApp.renderer.width / rect.width
      const sy = pixiApp.renderer.height / rect.height
      const cx = (e.clientX - rect.left) * sx
      const cy = (e.clientY - rect.top) * sy
      for (const { ref, p } of scrollablePanels) {
        if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) {
          ref.scroll(e.deltaY * 0.5)
          e.preventDefault()
          break
        }
      }
    }
    pixiApp.canvas.addEventListener('wheel', wheelHandler, { passive: false })

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

    // clock HUD position + size
    const clockHudFolder = uiPane.addFolder({ title: 'Clock HUD', expanded: false })
    clockHudFolder.addBinding(params.panels.clockHud, 'x',      { min: 0, max: 2560, step: 1,  label: 'x'      }).on('change', () => clockWidget?.redraw())
    clockHudFolder.addBinding(params.panels.clockHud, 'y',      { min: 0, max: 1440, step: 1,  label: 'y'      }).on('change', () => clockWidget?.redraw())
    clockHudFolder.addBinding(params.panels.clockHud, 'radius', { min: 20, max: 200, step: 1,  label: 'radius' }).on('change', () => clockWidget?.redraw())

    // map generation debug controls
    mapPane = new Pane({ title: 'Map Generation' })
    const mapParams = { seed: state.mapSeed || '' }
    mapPane.addBinding(mapParams, 'seed', { label: 'seed' })
    mapPane.addButton({ title: 'Regenerate' }).on('click', () => {
      const newSeed = mapParams.seed || String(Date.now())
      state.mapSeed = newSeed
      mapParams.seed = newSeed
      state.map = generateMap('manor', newSeed)
      debugPrintMap(state.map)

      // rebuild the ascii grid with the new map
      if (asciiGrid) {
        panels.areaMap.container.removeChild(asciiGrid.container)
        asciiGrid.destroy()
      }
      asciiGrid = createAsciiGrid(params.panels.areaMap, state.map.width, state.map.height)
      asciiGrid.renderFullMap(state.map)

      // re-spawn characters on the fresh map
      state.characters = initCharacters(state.cast, state.map, newSeed)
      renderCharacters(state.characters, asciiGrid)
      simRng = new Chance(newSeed + '-sim')

      // refresh cast panel with new character positions + colors
      panels.cast.refresh(buildCastEntries())

      panels.areaMap.container.addChild(asciiGrid.container)
      mapPane.refresh()
    })
    mapPane.addButton({ title: 'Random Seed' }).on('click', () => {
      mapParams.seed = String(Date.now())
      mapPane.refresh()
    })

    // simulation debug controls
    simPane = new Pane({ title: 'Simulation' })
    simPane.addBinding(clockParams, 'ticksPerMinute', { min: 1, max: 10, step: 1, label: 'ticks/min' })
    simPane.addBinding(clockParams, 'moveChance', { min: 0, max: 1, step: 0.05, label: 'move chance' })

    const simClockDisplay = { time: formatClock(state.clock) }
    simPane.addBinding(simClockDisplay, 'time', { label: 'clock', readonly: true })

    // manual step buttons — only useful while paused
    simPane.addButton({ title: 'Advance 1 Tick' }).on('click', () => {
      if (!clockHandle?.isPaused()) return
      const events = tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance)
      for (const evt of events) {
        if (evt.type === 'room-enter') {
          panels.narrative.appendEntry(`${evt.name} entered the ${evt.room}.`)
        }
      }
      if (events.length > 0) panels.cast.refresh(buildCastEntries())
    })
    simPane.addButton({ title: 'Advance 1 Minute' }).on('click', () => {
      if (!clockHandle?.isPaused()) return
      for (let t = 0; t < clockParams.ticksPerMinute; t++) {
        const events = tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance)
        for (const evt of events) {
          if (evt.type === 'room-enter') {
            panels.narrative.appendEntry(`${evt.name} entered the ${evt.room}.`)
          }
        }
        if (events.length > 0) panels.cast.refresh(buildCastEntries())
      }
      advanceMinute(state.clock)
      clockWidget?.update(state.clock)
      simClockDisplay.time = formatClock(state.clock)
      simPane.refresh()
    })
  }

  // kick off async init — any errors surface in the console
  init().catch((error) => {
    console.error('[game] init failed:', error)
  })

  return function cleanup() {
    if (cleanedUp) return
    cleanedUp = true

    // stop any running simulation batch
    clockHandle?.stop()
    clockHandle = null

    if (mouseMoveHandler) {
      window.removeEventListener('mousemove', mouseMoveHandler)
    }
    if (wheelHandler && pixiApp) {
      pixiApp.canvas.removeEventListener('wheel', wheelHandler)
    }

    flicker?.stop()
    asciiGrid?.destroy()
    pane?.dispose()
    uiPane?.dispose()
    mapPane?.dispose()
    simPane?.dispose()

    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: false })
      pixiApp = null
    }
  }
}
