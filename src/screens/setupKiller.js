import { showScreen } from '../router'
import { saveGame } from '../store/db'
import { patchGameState, state } from '../store/gameState'
import { applyTextures } from '../ui/textures'

function setFeedback(app, message, tone = 'success') {
  const feedbackNode = app.querySelector('#setup-killer-feedback')
  if (!feedbackNode) return
  feedbackNode.textContent = message
  feedbackNode.className = `setup-feedback ${tone === 'error' ? 'is-error' : 'is-success'}`
}

async function handleStart(app, submitButton) {
  setFeedback(app, '')

  const nameInput = app.querySelector('#setup-killer-name')
  const killerName = nameInput?.value.trim() ?? ''

  if (!killerName) {
    setFeedback(app, 'Killer name is required.', 'error')
    nameInput?.focus()
    return
  }

  submitButton.disabled = true

  patchGameState({ meta: { killerName } })

  try {
    await saveGame(structuredClone(state))
    console.info('KILLER setup saved.', state)
    showScreen('game')
  } catch (error) {
    console.error('Failed to save KILLER setup.', error)
    setFeedback(app, 'Could not save right now. Try again.', 'error')
  } finally {
    submitButton.disabled = false
  }
}

export function mountSetupKiller(app) {
  app.innerHTML = `
    <main class="setup-screen" aria-label="New game killer setup">
      <button class="setup-back" id="setup-killer-back" type="button">&lt; BACK</button>
      <section class="setup-panel" aria-labelledby="setup-title">
        <header class="setup-header">
          <p class="setup-kicker">SETUP NEW GAME</p>
          <h1 id="setup-title">KILLER</h1>
        </header>

        <form class="setup-form" id="setup-killer-form" novalidate>
          <label class="setup-field" for="setup-killer-name">
            <span class="setup-label">Name</span>
            <input
              class="setup-text-input"
              id="setup-killer-name"
              type="text"
              maxlength="40"
              autocomplete="off"
              placeholder="e.g. The Slasher"
              value="${state.meta.killerName}"
            />
          </label>

          <p class="setup-description">More killer customization is coming eventually</p>

          <p class="setup-feedback is-success" id="setup-killer-feedback" aria-live="polite"></p>

          <button class="menu-button setup-next" id="setup-killer-start" type="submit" data-tex-backdrop data-tex-hover>START</button>
        </form>
      </section>
    </main>
  `

  const backButton = app.querySelector('#setup-killer-back')
  const form = app.querySelector('#setup-killer-form')
  const submitButton = app.querySelector('#setup-killer-start')

  applyTextures(app)

  backButton?.addEventListener('click', () => {
    showScreen('setup-cast')
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!submitButton) return
    await handleStart(app, submitButton)
  })

  return null
}
