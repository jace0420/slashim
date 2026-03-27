import { showScreen } from '../router'
import { saveGame } from '../store/db'
import { patchGameState, state } from '../store/gameState'
import { applyTextures } from '../ui/textures'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function setFeedback(app, message, tone = 'success') {
  const feedbackNode = app.querySelector('#setup-setting-feedback')

  if (!feedbackNode) {
    return
  }

  feedbackNode.textContent = message
  feedbackNode.className = `setup-feedback ${tone === 'error' ? 'is-error' : 'is-success'}`
}

function bindOptionGroup(app, fieldName) {
  const buttons = [...app.querySelectorAll(`[data-setting-option="${fieldName}"]`)]

  const render = () => {
    buttons.forEach((button) => {
      const isActive = button.dataset.value === String(state.meta[fieldName])
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', String(isActive))
    })
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      patchGameState({
        meta: {
          [fieldName]: button.dataset.value,
        },
      })
      setFeedback(app, '')
      render()
    })
  })

  render()
}

function bindHourStepper(app) {
  const decreaseButton = app.querySelector('[data-stepper="startingHour-decrease"]')
  const increaseButton = app.querySelector('[data-stepper="startingHour-increase"]')
  const valueNode = app.querySelector('[data-stepper-value="startingHour"]')

  const renderValue = () => {
    if (valueNode) {
      valueNode.textContent = String(state.meta.startingHour)
    }
  }

  const adjustValue = (delta) => {
    patchGameState({
      meta: {
        startingHour: clamp(state.meta.startingHour + delta, 1, 12),
      },
    })
    setFeedback(app, '')
    renderValue()
  }

  decreaseButton?.addEventListener('click', () => adjustValue(-1))
  increaseButton?.addEventListener('click', () => adjustValue(1))
  renderValue()
}

async function handleNext(app, submitButton) {
  setFeedback(app, '')
  submitButton.disabled = true

  try {
    await saveGame(structuredClone(state))
    console.info('SETTING setup saved.', state)
    setFeedback(app, 'Setting saved. More setup options are coming soon.')
  } catch (error) {
    console.error('Failed to save SETTING setup.', error)
    setFeedback(app, 'Could not save right now. Try again.', 'error')
  } finally {
    submitButton.disabled = false
  }
}

export function mountSetupSetting(app) {
  app.innerHTML = `
    <main class="setup-screen" aria-label="New game setting setup">
      <button class="setup-back" id="setup-setting-back" type="button">&lt; BACK</button>
      <section class="setup-panel" aria-labelledby="setup-title">
        <header class="setup-header">
          <p class="setup-kicker">SETUP NEW GAME</p>
          <h1 id="setup-title">SETTING</h1>
        </header>

        <form class="setup-form" id="setup-setting-form" novalidate>
          <div class="setup-field">
            <span class="setup-label">Location</span>
            <div class="option-group" role="group" aria-label="Location">
              <button
                class="option-btn is-active"
                type="button"
                data-setting-option="location"
                data-value="manor"
                aria-pressed="true"
                data-tex-backdrop
                data-tex-hover
                data-tex-selection
              >
                MANOR
              </button>
              <button class="option-btn is-locked" type="button" disabled aria-disabled="true">
                CAMPGROUND
                <span class="option-badge">W.I.P.</span>
              </button>
              <button class="option-btn is-locked" type="button" disabled aria-disabled="true">
                RURAL
                <span class="option-badge">W.I.P.</span>
              </button>
            </div>
            <p class="setup-description">An old, decrepit, but rich mansion far from civilization.</p>
          </div>

          <div class="setup-field">
            <span class="setup-label">Season</span>
            <div class="option-group" role="group" aria-label="Season">
              <button class="option-btn" type="button" data-setting-option="season" data-value="spring" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>SPRING</button>
              <button class="option-btn" type="button" data-setting-option="season" data-value="summer" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>SUMMER</button>
              <button class="option-btn" type="button" data-setting-option="season" data-value="fall" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>FALL</button>
              <button class="option-btn" type="button" data-setting-option="season" data-value="winter" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>WINTER</button>
            </div>
          </div>

          <div class="setup-field">
            <span class="setup-label">Starting Weather</span>
            <div class="option-group" role="group" aria-label="Starting weather">
              <button class="option-btn" type="button" data-setting-option="startingWeather" data-value="clear" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>CLEAR</button>
              <button class="option-btn" type="button" data-setting-option="startingWeather" data-value="foggy" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>FOGGY</button>
              <button class="option-btn" type="button" data-setting-option="startingWeather" data-value="raining" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>RAINING</button>
              <button class="option-btn" type="button" data-setting-option="startingWeather" data-value="snowing" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>SNOWING</button>
            </div>
          </div>

          <div class="setup-field">
            <span class="setup-label">Starting Time</span>
            <div class="setup-time-group">
              <div class="stepper" aria-label="Starting hour">
                <button class="stepper-btn" type="button" data-stepper="startingHour-decrease" aria-label="Decrease starting hour" data-tex-backdrop data-tex-hover>-</button>
                <div class="stepper-value" data-stepper-value="startingHour">${state.meta.startingHour}</div>
                <button class="stepper-btn" type="button" data-stepper="startingHour-increase" aria-label="Increase starting hour" data-tex-backdrop data-tex-hover>+</button>
              </div>

              <div class="option-group" role="group" aria-label="Starting meridiem">
                <button class="option-btn" type="button" data-setting-option="startingMeridiem" data-value="am" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>AM</button>
                <button class="option-btn" type="button" data-setting-option="startingMeridiem" data-value="pm" aria-pressed="false" data-tex-backdrop data-tex-hover data-tex-selection>PM</button>
              </div>
            </div>
          </div>

          <p class="setup-feedback is-success" id="setup-setting-feedback" aria-live="polite"></p>

          <button class="menu-button setup-next" id="setup-setting-next" type="submit" data-tex-backdrop data-tex-hover>NEXT</button>
        </form>
      </section>
    </main>
  `

  const backButton = app.querySelector('#setup-setting-back')
  const form = app.querySelector('#setup-setting-form')
  const submitButton = app.querySelector('#setup-setting-next')

  applyTextures(app)

  backButton?.addEventListener('click', () => {
    showScreen('setup')
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (!submitButton) {
      return
    }

    await handleNext(app, submitButton)
  })

  bindOptionGroup(app, 'location')
  bindOptionGroup(app, 'season')
  bindOptionGroup(app, 'startingWeather')
  bindOptionGroup(app, 'startingMeridiem')
  bindHourStepper(app)

  return null
}