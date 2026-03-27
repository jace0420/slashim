import { Pane } from 'tweakpane'

import { showScreen } from '../router'
import { saveGame } from '../store/db'
import { patchGameState, state } from '../store/gameState'
import { applyTextures } from '../ui/textures'

const setupLayout = {
  setupWidth: 440,
  setupGap: 18,
  setupTitleSize: 42,
  setupFieldLabelSize: 18,
  setupFieldTextSize: 24,
}

function applySetupLayoutVars() {
  const root = document.documentElement
  root.style.setProperty('--setup-width', `${setupLayout.setupWidth}px`)
  root.style.setProperty('--setup-gap', `${setupLayout.setupGap}px`)
  root.style.setProperty('--setup-title-size', `${setupLayout.setupTitleSize}px`)
  root.style.setProperty('--setup-label-size', `${setupLayout.setupFieldLabelSize}px`)
  root.style.setProperty('--setup-field-size', `${setupLayout.setupFieldTextSize}px`)
}

function shouldShowTweakPane() {
  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('tweak') === '1'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function createStepper(app, fieldName, min, max) {
  const decreaseButton = app.querySelector(`[data-stepper="${fieldName}-decrease"]`)
  const increaseButton = app.querySelector(`[data-stepper="${fieldName}-increase"]`)
  const valueNode = app.querySelector(`[data-stepper-value="${fieldName}"]`)

  const renderValue = () => {
    valueNode.textContent = String(state.meta[fieldName])
  }

  const adjustValue = (delta) => {
    patchGameState({
      meta: {
        [fieldName]: clamp(state.meta[fieldName] + delta, min, max),
      },
    })
    renderValue()
  }

  decreaseButton?.addEventListener('click', () => adjustValue(-1))
  increaseButton?.addEventListener('click', () => adjustValue(1))
  renderValue()
}

async function handleNext(app) {
  const titleInput = app.querySelector('#setup-film-title')
  const filmTitle = titleInput?.value.trim() ?? ''
  const errorNode = app.querySelector('#setup-meta-error')

  if (!filmTitle) {
    errorNode.textContent = 'Film title is required.'
    titleInput?.focus()
    return
  }

  errorNode.textContent = ''

  patchGameState({
    meta: {
      filmTitle,
      filmType: 'slasher',
      mpaaRating: 'R',
    },
  })

  try {
    await saveGame(structuredClone(state))
    console.info('META setup saved.', state)
    showScreen('setup-setting')
  } catch (error) {
    console.error('Failed to save META setup.', error)
    errorNode.textContent = 'Could not save right now. Try again.'
  }
}

export function mountSetup(app) {
  app.innerHTML = `
    <main class="setup-screen" aria-label="New game setup">
      <button class="setup-back" id="setup-back" type="button">&lt; BACK</button>
      <section class="setup-panel" aria-labelledby="setup-title">
        <header class="setup-header">
          <p class="setup-kicker">SETUP NEW GAME</p>
          <h1 id="setup-title">META</h1>
        </header>

        <form class="setup-form" id="setup-form" novalidate>
          <label class="setup-field" for="setup-film-title">
            <span class="setup-label">Film Title</span>
            <input
              class="setup-text-input"
              id="setup-film-title"
              name="filmTitle"
              type="text"
              maxlength="60"
              value="${state.meta.filmTitle}"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <div class="setup-field">
            <span class="setup-label">Film Type</span>
            <div class="option-group" role="group" aria-label="Film type">
              <button class="option-btn is-active" type="button" aria-pressed="true" data-tex-backdrop data-tex-hover data-tex-selection>SLASHER</button>
              <button class="option-btn is-locked" type="button" disabled aria-disabled="true">
                WHODUNNIT
                <span class="option-badge">W.I.P.</span>
              </button>
            </div>
          </div>

          <div class="setup-field">
            <span class="setup-label">Release Year</span>
            <div class="stepper" aria-label="Release year">
              <button class="stepper-btn" type="button" data-stepper="releaseYear-decrease" aria-label="Decrease release year" data-tex-backdrop data-tex-hover>-</button>
              <div class="stepper-value" data-stepper-value="releaseYear">${state.meta.releaseYear}</div>
              <button class="stepper-btn" type="button" data-stepper="releaseYear-increase" aria-label="Increase release year" data-tex-backdrop data-tex-hover>+</button>
            </div>
          </div>

          <div class="setup-field">
            <span class="setup-label">MPAA Rating</span>
            <div class="option-group" role="group" aria-label="MPAA rating">
              <button class="option-btn is-active" type="button" aria-pressed="true" data-tex-backdrop data-tex-hover data-tex-selection>R</button>
            </div>
          </div>

          <div class="setup-field">
            <span class="setup-label">Cast Size</span>
            <div class="stepper" aria-label="Cast size">
              <button class="stepper-btn" type="button" data-stepper="castSize-decrease" aria-label="Decrease cast size" data-tex-backdrop data-tex-hover>-</button>
              <div class="stepper-value" data-stepper-value="castSize">${state.meta.castSize}</div>
              <button class="stepper-btn" type="button" data-stepper="castSize-increase" aria-label="Increase cast size" data-tex-backdrop data-tex-hover>+</button>
            </div>
          </div>

          <p class="setup-feedback is-error" id="setup-meta-error" aria-live="polite"></p>

          <button class="menu-button setup-next" id="setup-next" type="submit" data-tex-backdrop data-tex-hover>NEXT</button>
        </form>
      </section>
    </main>
  `

  applySetupLayoutVars()
  applyTextures(app)

  const backButton = app.querySelector('#setup-back')
  const form = app.querySelector('#setup-form')
  const titleInput = app.querySelector('#setup-film-title')

  titleInput?.addEventListener('input', (event) => {
    patchGameState({
      meta: {
        filmTitle: event.currentTarget.value,
      },
    })
  })

  backButton?.addEventListener('click', () => {
    showScreen('menu')
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await handleNext(app)
  })

  createStepper(app, 'releaseYear', 1980, 1989)
  createStepper(app, 'castSize', 4, 12)

  if (!shouldShowTweakPane()) {
    return null
  }

  const pane = new Pane({ title: 'Setup Layout' })
  pane.addBinding(setupLayout, 'setupWidth', { min: 280, max: 560, step: 1, label: 'panel width' })
  pane.addBinding(setupLayout, 'setupGap', { min: 8, max: 32, step: 1, label: 'field gap' })
  pane.addBinding(setupLayout, 'setupTitleSize', { min: 28, max: 72, step: 1, label: 'title size' })
  pane.addBinding(setupLayout, 'setupFieldLabelSize', { min: 12, max: 24, step: 1, label: 'label size' })
  pane.addBinding(setupLayout, 'setupFieldTextSize', { min: 16, max: 36, step: 1, label: 'field size' })
  pane.on('change', applySetupLayoutVars)

  return () => {
    pane.dispose()
  }
}