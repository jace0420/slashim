import { Assets, Container, Graphics, Text } from 'pixi.js'
import { Pane } from 'tweakpane'
import Chance from 'chance'

import { showScreen } from '../router'
import { createPixiApp } from '../rendering/createPixiApp'
import { createAsciiGrid } from '../rendering/asciiGrid'
import { buildCastPanel, buildCharacterTooltip } from '../ui/panels'
import { createCharacterIconLayer, loadFontAwesome } from '../ui/characterIcons'
import { buildClockWidget } from '../ui/clockWidget'
import { computeLayout, DEFAULT_HUD_PARAMS } from '../ui/hudLayout'
import { createMapViewport } from '../ui/mapViewport'
import { createTabStrip } from '../ui/tabStrip'
import { generateMap, debugPrintMap } from '../generation/mapGenerator'
import { state } from '../store/gameState'
import { initClock, formatClock, createClock, advanceMinute, SPEED_PRESETS, DEFAULT_CLOCK_PARAMS } from '../simulation/clock'
import {
  getCharacterBehaviorSummary,
  getCharacterBehaviorTarget,
  getCharacterConversationTopic,
  getCharacterNeedSummaries,
  getTopNeedCues,
  initCharacters,
  renderCharacters,
  tickCharacters,
  minuteTickCharacters,
} from '../simulation/characters'
import socialTopics from '../data/social/topics.json'
import conversationBeats from '../data/social/conversation-beats.json'

function shouldShowTweakPane() {
  return new URLSearchParams(window.location.search).get('tweak') === '1'
}

// lightweight placeholder panel — Graphics rect + label text
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

export function mountGame(container) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#0a0a12;'
  container.appendChild(wrapper)

  let pixiApp = null
  let pane = null
  let mapPane = null
  let simPane = null
  let needsPane = null
  let uiPane = null
  let sceneContainer = null
  let panels = {}
  let asciiGrid = null
  let charIconLayer = null
  let mapVP = null        // mapViewport instance
  let tabStrip = null
  let wheelHandler = null
  let cleanedUp = false
  let clockHandle = null
  let clockWidget = null
  let simControls = null
  let simRng = null
  let minuteCount = 0
  let characterTooltip = null
  let lastMapPointerGlobal = null

  const clockParams = { ...DEFAULT_CLOCK_PARAMS }
  const hudParams = { ...DEFAULT_HUD_PARAMS }

  // live panel param objects — layout zones write into these, panels read from them
  const panelParams = {
    cast:     { x: 0, y: 0, w: 220, h: 600 },
    clockHud: { x: 0, y: 0, radius: 28 },
  }

  // computes layout from current viewport size and applies it to all panel params
  function applyLayout() {
    const vw = pixiApp.renderer.width
    const vh = pixiApp.renderer.height
    const layout = computeLayout(vw, vh, hudParams)

    // cast — right sidebar
    Object.assign(panelParams.cast, {
      x: layout.rightSidebar.x,
      y: layout.rightSidebar.y,
      w: layout.rightSidebar.w,
      h: layout.rightSidebar.h,
    })

    // clock — inside the top-left HUD zone
    Object.assign(panelParams.clockHud, {
      x: layout.topLeftHud.x + 28 + 4,
      y: layout.topLeftHud.y + 30,
      radius: 28,
    })

    // resize map viewport
    mapVP?.resize(layout.mapViewport)

    // resize tab strip
    tabStrip?.resize(layout.tabStrip)

    // redraw all panels
    panels.cast?.redraw()
    clockWidget?.redraw()
    refreshCharacterInspectionUI()
    refreshHoverFromPointer()

    // reposition sim controls next to the clock
    if (simControls) {
      simControls.container.x = layout.topLeftHud.x + 28 * 2 + 16
      simControls.container.y = layout.topLeftHud.y + 17
    }
  }

  // builds merged cast entries combining setup data with live sim state
  function buildCastEntries() {
    return state.cast.map((castEntry, i) => {
      const char = state.characters.find(c => c.castIndex === i)
      let room = null
      if (char && char.roomIndex >= 0) {
        room = state.map?.rooms[char.roomIndex]?.def?.label ?? null
      }
      return {
        castIndex: i,
        name: castEntry.name,
        archetype: castEntry.archetype,
        color: char?.color ?? null,
        room,
        behavior: char ? getCharacterBehaviorSummary(char) : null,
        behaviorTarget: char ? getCharacterBehaviorTarget(char) : null,
        health: char?.health ?? null,
        mood:   char?.mood   ?? null,
      }
    })
  }

  function getCharacterByCastIndex(castIndex) {
    return state.characters.find((character) => character.castIndex === castIndex) ?? null
  }

  function buildCharacterDetail(castIndex) {
    if (castIndex == null) return null

    const castEntry = state.cast[castIndex]
    const character = getCharacterByCastIndex(castIndex)
    if (!castEntry || !character) return null

    const room = character.roomIndex >= 0
      ? (state.map?.rooms[character.roomIndex]?.def?.label ?? null)
      : null

    return {
      castIndex,
      name: character.name,
      archetype: castEntry.archetype,
      room,
      color: character.color,
      health: character.health,
      mood: character.mood,
      behavior: getCharacterBehaviorSummary(character),
      behaviorTarget: getCharacterBehaviorTarget(character),
      topNeedCues: getTopNeedCues(character, 2),
      needSummaries: getCharacterNeedSummaries(character),
      conversationTopic: getCharacterConversationTopic(character),
    }
  }

  function buildTooltipData(castIndex) {
    const character = getCharacterByCastIndex(castIndex)
    if (!character) return null

    return {
      castIndex,
      name: character.name,
      color: character.color,
      behavior: getCharacterBehaviorSummary(character),
      topNeedCues: getTopNeedCues(character, 2),
      conversationTopic: getCharacterConversationTopic(character),
    }
  }

  function refreshCharacterInspectionUI() {
    if (!panels.cast) return

    const detail = buildCharacterDetail(state.inspection.selectedCastIndex)
    if (!detail && state.inspection.selectedCastIndex != null) {
      state.inspection.selectedCastIndex = null
    }

    panels.cast.refresh(buildCastEntries(), detail)
  }

  function refreshTooltip() {
    if (!characterTooltip) return

    if (!state.inspection.tooltip.visible || state.inspection.hoveredCastIndex == null) {
      characterTooltip.hide()
      return
    }

    const data = buildTooltipData(state.inspection.hoveredCastIndex)
    if (!data) {
      characterTooltip.hide()
      return
    }

    characterTooltip.show(data, state.inspection.tooltip, mapVP.bounds)
  }

  function setSelectedCharacter(castIndex) {
    state.inspection.selectedCastIndex = castIndex
    refreshCharacterInspectionUI()
  }

  function clearSelectedCharacter() {
    state.inspection.selectedCastIndex = null
    refreshCharacterInspectionUI()
  }

  function setHoveredCharacter(castIndex, globalPoint) {
    state.inspection.hoveredCastIndex = castIndex
    state.inspection.tooltip.visible = castIndex != null
    if (globalPoint) {
      state.inspection.tooltip.x = globalPoint.x
      state.inspection.tooltip.y = globalPoint.y
    }
    refreshTooltip()
  }

  function clearHoveredCharacter() {
    state.inspection.hoveredCastIndex = null
    state.inspection.tooltip.visible = false
    refreshTooltip()
  }

  function findCharacterAtGrid(gx, gy) {
    return state.characters.find((character) => character.x === gx && character.y === gy) ?? null
  }

  function syncHoverFromPoint(globalPoint) {
    if (!globalPoint || !asciiGrid || !state.map) {
      clearHoveredCharacter()
      return
    }

    const local = mapVP.toContentPoint(globalPoint)
    if (local.x < 0 || local.y < 0 || local.x >= asciiGrid.gridW || local.y >= asciiGrid.gridH) {
      clearHoveredCharacter()
      return
    }

    const cellW = asciiGrid.gridW / state.map.width
    const cellH = asciiGrid.gridH / state.map.height
    const gx = Math.floor(local.x / cellW)
    const gy = Math.floor(local.y / cellH)
    const character = findCharacterAtGrid(gx, gy)

    if (!character) {
      clearHoveredCharacter()
      return
    }

    setHoveredCharacter(character.castIndex, globalPoint)
  }

  function refreshHoverFromPointer() {
    if (!lastMapPointerGlobal) {
      clearHoveredCharacter()
      return
    }

    syncHoverFromPoint(lastMapPointerGlobal)
  }

  // sim controls row: play/pause toggle + speed buttons
  function buildSimControls(x, y) {
    const ctr = new Container()
    ctr.x = x
    ctr.y = y

    const btnH = 26
    const ppW = 50
    const spW = 56
    const gap = 4

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

    await Assets.load({ alias: 'NothingYouCouldDo', src: '/assets/fonts/NothingYouCouldDo-Regular.ttf' })
    await loadFontAwesome()

    sceneContainer = new Container()

    // compute initial layout
    const vw = pixiApp.renderer.width
    const vh = pixiApp.renderer.height
    const layout = computeLayout(vw, vh, hudParams)

    // --- map viewport (background layer, fills most of the screen) ---
    mapVP = createMapViewport(layout.mapViewport)
    sceneContainer.addChild(mapVP.viewport)

    // generate the map
    const mapSeed = state.mapSeed || String(Date.now())
    state.mapSeed = mapSeed
    state.map = generateMap('manor', mapSeed)
    debugPrintMap(state.map)

    asciiGrid = createAsciiGrid(state.map.width, state.map.height, 16)

    // spawn characters
    state.characters = initCharacters(state.cast, state.map, state.mapSeed)
    simRng = new Chance(state.mapSeed + '-sim')

    asciiGrid.setRotatedCells(state.map.rotatedCells)
    asciiGrid.renderFullMap(state.map)
    renderCharacters(state.characters, asciiGrid, state.map)
    // Force ROT to draw pending tile changes to the canvas and push to the GPU
    // texture now. Without this, ROT's rAF-deferred draw may lose the race
    // against PixiJS's first render frame, resulting in a blank initial map.
    asciiGrid.flush()

    mapVP.content.addChild(asciiGrid.container)

    // character behavior icon layer — sits above the ascii grid in content space
    charIconLayer = createCharacterIconLayer(state.map.width, state.map.height, asciiGrid.gridW, asciiGrid.gridH)
    charIconLayer.update(state.characters)
    mapVP.content.addChild(charIconLayer.container)

    mapVP.fitToView(asciiGrid.gridW, asciiGrid.gridH)

    mapVP.interactionLayer.on('pointermove', (event) => {
      lastMapPointerGlobal = { x: event.global.x, y: event.global.y }
      syncHoverFromPoint(lastMapPointerGlobal)
    })
    mapVP.interactionLayer.on('pointerleave', () => {
      lastMapPointerGlobal = null
      clearHoveredCharacter()
    })
    mapVP.interactionLayer.on('pointerdown', () => {
      if (state.inspection.hoveredCastIndex != null) {
        setSelectedCharacter(state.inspection.hoveredCastIndex)
      }
    })

    // --- HUD overlay layer (sits on top of the map) ---
    const hudLayer = new Container()
    sceneContainer.addChild(hudLayer)

    // cast panel — right sidebar
    Object.assign(panelParams.cast, {
      x: layout.rightSidebar.x,
      y: layout.rightSidebar.y,
      w: layout.rightSidebar.w,
      h: layout.rightSidebar.h,
    })
    panels.cast = buildCastPanel(panelParams.cast, state.cast, {
      onSelect: setSelectedCharacter,
      onBack: clearSelectedCharacter,
    })
    hudLayer.addChild(panels.cast.container)

    // refresh cast with sim state
    refreshCharacterInspectionUI()

    characterTooltip = buildCharacterTooltip()
    hudLayer.addChild(characterTooltip.container)

    // clock widget — top-left
    Object.assign(panelParams.clockHud, {
      x: layout.topLeftHud.x + 28 + 4,
      y: layout.topLeftHud.y + 30,
      radius: 28,
    })
    state.clock = initClock(state.meta)
    state.simulation = { running: false }

    clockWidget = buildClockWidget(panelParams.clockHud)
    clockWidget.update(state.clock)
    hudLayer.addChild(clockWidget.container)

    // sim controls next to the clock
    simControls = buildSimControls(
      layout.topLeftHud.x + 28 * 2 + 16,
      layout.topLeftHud.y + 17,
    )
    hudLayer.addChild(simControls.container)

    // clock handle — starts paused
    clockHandle = createClock(state.clock, clockParams, {
      onTick: (tickIndex, _minuteAdvanced) => {
        tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance, tickIndex, socialTopics, conversationBeats, state.cast)
        asciiGrid.flush()
        charIconLayer?.update(state.characters)
        refreshCharacterInspectionUI()
        refreshHoverFromPointer()
      },
      onMinute: (clock) => {
        minuteCount++
        minuteTickCharacters(state.characters, state.cast, socialTopics, minuteCount, simRng)
        refreshCharacterInspectionUI()
        refreshHoverFromPointer()
        clockWidget?.update(clock)
      },
    })

    // --- bottom tab strip ---
    tabStrip = createTabStrip(layout.tabStrip)

    // location placeholder as the first tab
    const locationContent = new Container()
    const locText = new Text({
      text: 'Location data will appear here.',
      style: { fontSize: 11, fill: 0x778899, fontFamily: 'monospace' },
    })
    locationContent.addChild(locText)
    tabStrip.addTab('locations', 'LOCATIONS', locationContent)

    sceneContainer.addChild(tabStrip.container)

    // --- add scene to stage ---
    pixiApp.stage.addChild(sceneContainer)

    // --- resize handler ---
    pixiApp.renderer.on('resize', () => {
      applyLayout()
    })

    // --- wheel: scroll panels ---
    wheelHandler = (e) => {
      if (!pixiApp) return
      const rect = pixiApp.canvas.getBoundingClientRect()
      const sx = pixiApp.renderer.width / rect.width
      const sy = pixiApp.renderer.height / rect.height
      const cx = (e.clientX - rect.left) * sx
      const cy = (e.clientY - rect.top) * sy

      // check if cursor is over a scrollable panel first
      const scrollablePanels = [
        { ref: panels.cast, p: panelParams.cast },
      ]
      for (const { ref, p } of scrollablePanels) {
        if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) {
          ref.scroll(e.deltaY * 0.5)
          e.preventDefault()
          return
        }
      }
    }
    pixiApp.canvas.addEventListener('wheel', wheelHandler, { passive: false })

    if (shouldShowTweakPane()) {
      setupTweakPane()
    }
  }

  function setupTweakPane() {
    // HUD layout tuning
    uiPane = new Pane({ title: 'HUD Layout' })
    uiPane.addBinding(hudParams, 'sidebarW',  { min: 140, max: 400, step: 1, label: 'sidebar W'   }).on('change', applyLayout)
    uiPane.addBinding(hudParams, 'tabStripH', { min: 60, max: 300, step: 1, label: 'tab strip H' }).on('change', applyLayout)
    uiPane.addBinding(hudParams, 'hudPad',    { min: 0, max: 32, step: 1,   label: 'padding'     }).on('change', applyLayout)

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

      if (asciiGrid) {
        mapVP.content.removeChild(asciiGrid.container)
        asciiGrid.destroy()
      }
      if (charIconLayer) {
        mapVP.content.removeChild(charIconLayer.container)
        charIconLayer.destroy()
      }
      asciiGrid = createAsciiGrid(state.map.width, state.map.height, 16)
      asciiGrid.setRotatedCells(state.map.rotatedCells)
      asciiGrid.renderFullMap(state.map)
      mapVP.content.addChild(asciiGrid.container)

      state.characters = initCharacters(state.cast, state.map, newSeed)
      renderCharacters(state.characters, asciiGrid, state.map)
      asciiGrid.flush()

      charIconLayer = createCharacterIconLayer(state.map.width, state.map.height, asciiGrid.gridW, asciiGrid.gridH)
      charIconLayer.update(state.characters)
      mapVP.content.addChild(charIconLayer.container)

      mapVP.fitToView(asciiGrid.gridW, asciiGrid.gridH)
      simRng = new Chance(newSeed + '-sim')
      refreshCharacterInspectionUI()
      refreshHoverFromPointer()

      mapPane.refresh()
    })
    mapPane.addButton({ title: 'Random Seed' }).on('click', () => {
      mapParams.seed = String(Date.now())
      mapPane.refresh()
    })

    // character needs monitor
    needsPane = new Pane({ title: 'Character Needs' })
    for (const c of state.characters) {
      const folder = needsPane.addFolder({ title: c.name, expanded: false })
      const statKeys = ['energy', 'stamina', 'hunger', 'thirst', 'social', 'sanity', 'boredom', 'fear', 'adrenaline']
      for (const key of statKeys) {
        folder.addBinding(c.needs, key, { readonly: true, min: 0, max: 100, label: key })
      }
      folder.addBinding(c, 'health', { readonly: true, label: 'health' })
      folder.addBinding(c, 'mood',   { readonly: true, label: 'mood'   })
    }
    pixiApp.ticker.add(() => needsPane.refresh())

    // simulation debug controls
    simPane = new Pane({ title: 'Simulation' })
    simPane.addBinding(clockParams, 'ticksPerMinute', { min: 1, max: 10, step: 1, label: 'ticks/min' })
    simPane.addBinding(clockParams, 'moveChance', { min: 0, max: 1, step: 0.05, label: 'move chance' })

    const simClockDisplay = { time: formatClock(state.clock) }
    simPane.addBinding(simClockDisplay, 'time', { label: 'clock', readonly: true })

    simPane.addButton({ title: 'Advance 1 Tick' }).on('click', () => {
      if (!clockHandle?.isPaused()) return
      tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance)
      asciiGrid.flush()
      charIconLayer?.update(state.characters)
      refreshCharacterInspectionUI()
      refreshHoverFromPointer()
    })
    simPane.addButton({ title: 'Advance 1 Minute' }).on('click', () => {
      if (!clockHandle?.isPaused()) return
      for (let t = 0; t < clockParams.ticksPerMinute; t++) {
        tickCharacters(state.characters, state.map, asciiGrid, simRng, clockParams.moveChance)
      }
      asciiGrid.flush()
      charIconLayer?.update(state.characters)
      advanceMinute(state.clock)
      minuteTickCharacters(state.characters)
      refreshCharacterInspectionUI()
      refreshHoverFromPointer()
      clockWidget?.update(state.clock)
      simClockDisplay.time = formatClock(state.clock)
      simPane.refresh()
    })
  }

  init().catch((error) => {
    console.error('[game] init failed:', error)
  })

  return function cleanup() {
    if (cleanedUp) return
    cleanedUp = true

    clockHandle?.stop()
    clockHandle = null

    if (wheelHandler && pixiApp) {
      pixiApp.canvas.removeEventListener('wheel', wheelHandler)
    }

    asciiGrid?.destroy()
    charIconLayer?.destroy()
    mapVP?.destroy()
    tabStrip?.destroy()
    pane?.dispose()
    uiPane?.dispose()
    mapPane?.dispose()
    simPane?.dispose()
    needsPane?.dispose()

    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: false })
      pixiApp = null
    }
  }
}
