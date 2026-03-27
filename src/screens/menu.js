import { Pane } from 'tweakpane'

import { showScreen } from '../router'
import { resetGameState } from '../store/gameState'
import { applyTextures } from '../ui/textures'

const layout = {
  titleOffsetY: -24,
  titleFontSize: 108,
  menuOffsetY: 0,
  menuGap: 10,
  buttonWidth: 320,
  buttonHeight: 52,
  buttonFontSize: 28,
}

function applyLayoutVars() {
  const root = document.documentElement
  root.style.setProperty('--title-offset-y', `${layout.titleOffsetY}px`)
  root.style.setProperty('--title-font-size', `${layout.titleFontSize}px`)
  root.style.setProperty('--menu-offset-y', `${layout.menuOffsetY}px`)
  root.style.setProperty('--menu-gap', `${layout.menuGap}px`)
  root.style.setProperty('--button-width', `${layout.buttonWidth}px`)
  root.style.setProperty('--button-height', `${layout.buttonHeight}px`)
  root.style.setProperty('--button-font-size', `${layout.buttonFontSize}px`)
}

function shouldShowTweakPane() {
  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('tweak') === '1'
}

export function mountMenu(app) {
  app.innerHTML = `
    <main class="menu-screen" aria-label="SLASHIM main menu">
      <h1 id="menu-title">SLASHIM</h1>
      <nav class="menu-nav" aria-label="Primary">
        <button id="menu-new-game" class="menu-button" type="button" data-action="new-game" data-tex-backdrop data-tex-hover>NEW GAME</button>
        <button id="menu-load-game" class="menu-button" type="button" data-action="load-game" data-tex-backdrop data-tex-hover>LOAD GAME</button>
        <button id="menu-settings" class="menu-button" type="button" data-action="settings" data-tex-backdrop data-tex-hover>SETTINGS</button>
        <button id="menu-credits" class="menu-button" type="button" data-action="credits" data-tex-backdrop data-tex-hover>CREDITS</button>
        <button id="menu-quit" class="menu-button" type="button" data-action="quit" data-tex-backdrop data-tex-hover>QUIT</button>
      </nav>
    </main>
  `

  applyLayoutVars()
  applyTextures(app)

  const newGameButton = app.querySelector('#menu-new-game')
  newGameButton?.addEventListener('click', () => {
    resetGameState()
    showScreen('setup')
  })

  if (!shouldShowTweakPane()) {
    return null
  }

  const pane = new Pane({ title: 'Menu Layout' })
  pane.addBinding(layout, 'titleOffsetY', { min: -220, max: 220, step: 1, label: 'title y' })
  pane.addBinding(layout, 'titleFontSize', { min: 48, max: 180, step: 1, label: 'title size' })
  pane.addBinding(layout, 'menuOffsetY', { min: -220, max: 220, step: 1, label: 'menu y' })
  pane.addBinding(layout, 'menuGap', { min: 4, max: 48, step: 1, label: 'menu gap' })
  pane.addBinding(layout, 'buttonWidth', { min: 180, max: 600, step: 1, label: 'button width' })
  pane.addBinding(layout, 'buttonHeight', { min: 36, max: 96, step: 1, label: 'button height' })
  pane.addBinding(layout, 'buttonFontSize', { min: 16, max: 48, step: 1, label: 'button size' })
  pane.on('change', applyLayoutVars)

  return () => {
    pane.dispose()
  }
}