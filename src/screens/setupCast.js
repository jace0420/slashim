import { showScreen } from '../router'
import { saveGame } from '../store/db'
import { createDefaultCharacter, patchGameState, state } from '../store/gameState'
import { applyTextures } from '../ui/textures'
import namePool from '../data/names.json'

const ARCHETYPE_MODIFIERS = {
  'the-nerd':       { str: -1, cha: -1, int: 3 },
  'the-jock':       { str: 2, con: 1, int: -2 },
  'the-hero':       { dex: 1, cha: 1, str: 1 },
  'the-outcast':    { cha: -3, wis: 1 },
  'the-final-girl': { wis: 3, dex: 1, con: 1 },
}

const ARCHETYPES = [
  { value: 'the-nerd',       label: 'THE NERD' },
  { value: 'the-jock',       label: 'THE JOCK' },
  { value: 'the-hero',       label: 'THE HERO' },
  { value: 'the-outcast',    label: 'THE OUTCAST' },
  { value: 'the-final-girl', label: 'THE FINAL GIRL' },
]

const STATS = ['str', 'con', 'dex', 'wis', 'int', 'cha']
const PERSONALITY_TRAITS = ['openness', 'neuroticism', 'conscientiousness', 'agreeableness', 'extraversion']

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomAge() {
  // 70% chance of 18–30, 30% chance of 31–100
  return Math.random() < 0.7
    ? Math.floor(Math.random() * 13) + 18
    : Math.floor(Math.random() * 70) + 31
}

function randomizeChar(index) {
  const sex = Math.random() < 0.5 ? 'male' : 'female'
  const firstName = pick(namePool.first[sex])
  const lastName = pick(namePool.last)
  const archetype = pick(ARCHETYPES).value
  const personality = {}
  for (const trait of PERSONALITY_TRAITS) {
    personality[trait] = Math.floor(Math.random() * 5) + 1
  }
  const attributes = {}
  for (const stat of STATS) {
    attributes[stat] = Math.floor(Math.random() * 20) + 1
  }
  state.cast[index] = {
    name: `${firstName} ${lastName}`,
    sex,
    age: randomAge(),
    archetype,
    personality,
    attributes,
  }
}

function syncCardToState(cardEl, index) {
  const char = state.cast[index]

  const nameInput = cardEl.querySelector('[data-card-field="name"]')
  if (nameInput) nameInput.value = char.name

  const sexButtons = [...cardEl.querySelectorAll('[data-card-option="sex"]')]
  sexButtons.forEach((btn) => {
    const active = btn.dataset.value === char.sex
    btn.classList.toggle('is-active', active)
    btn.setAttribute('aria-pressed', String(active))
  })

  const ageValue = cardEl.querySelector('[data-card-stepper-value="age"]')
  if (ageValue) ageValue.textContent = String(char.age)

  const archetypeSelect = cardEl.querySelector('[data-card-select="archetype"]')
  if (archetypeSelect) archetypeSelect.value = char.archetype

  for (const trait of PERSONALITY_TRAITS) {
    const slider = cardEl.querySelector(`[data-card-personality="${trait}"]`)
    const display = cardEl.querySelector(`[data-card-personality-value="${trait}"]`)
    if (slider) slider.value = String(char.personality[trait])
    if (display) display.textContent = String(char.personality[trait])
  }

  for (const stat of STATS) {
    const slider = cardEl.querySelector(`[data-card-attribute="${stat}"]`)
    if (slider) slider.value = String(char.attributes[stat])
    renderAttrDisplay(cardEl, index, stat)
  }
}

function setFeedback(app, message, tone = 'success') {
  const feedbackNode = app.querySelector('#setup-cast-feedback')
  if (!feedbackNode) return
  feedbackNode.textContent = message
  feedbackNode.className = `setup-feedback ${tone === 'error' ? 'is-error' : 'is-success'}`
}

function getModifier(archetype, stat) {
  return (ARCHETYPE_MODIFIERS[archetype] ?? {})[stat] ?? 0
}

function formatModifier(mod) {
  if (mod === 0) return ''
  return mod > 0 ? `+${mod}` : String(mod)
}

function renderAttrDisplay(cardEl, index, stat) {
  const char = state.cast[index]
  const base = char.attributes[stat]
  const mod = getModifier(char.archetype, stat)
  const effective = base + mod

  const baseEl = cardEl.querySelector(`[data-card-attr-base="${stat}"]`)
  const modEl = cardEl.querySelector(`[data-card-attr-mod="${stat}"]`)
  const effectiveEl = cardEl.querySelector(`[data-card-attr-effective="${stat}"]`)

  if (baseEl) baseEl.textContent = String(base)
  if (modEl) modEl.textContent = formatModifier(mod)
  if (effectiveEl) effectiveEl.textContent = String(effective)
}

function renderModifiers(cardEl, index) {
  for (const stat of STATS) {
    renderAttrDisplay(cardEl, index, stat)
  }
}

function mountCard(cardEl, index) {
  const char = state.cast[index]

  // NAME
  const nameInput = cardEl.querySelector('[data-card-field="name"]')
  nameInput?.addEventListener('input', (event) => {
    state.cast[index].name = event.currentTarget.value
  })

  // SEX option group
  const sexButtons = [...cardEl.querySelectorAll('[data-card-option="sex"]')]
  const renderSex = () => {
    sexButtons.forEach((btn) => {
      const active = btn.dataset.value === state.cast[index].sex
      btn.classList.toggle('is-active', active)
      btn.setAttribute('aria-pressed', String(active))
    })
  }
  sexButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cast[index].sex = btn.dataset.value
      renderSex()
    })
  })
  renderSex()

  // AGE stepper
  const ageDecrease = cardEl.querySelector('[data-card-stepper="age-decrease"]')
  const ageIncrease = cardEl.querySelector('[data-card-stepper="age-increase"]')
  const ageValue = cardEl.querySelector('[data-card-stepper-value="age"]')
  const renderAge = () => {
    if (ageValue) ageValue.textContent = String(state.cast[index].age)
  }
  ageDecrease?.addEventListener('click', () => {
    state.cast[index].age = clamp(state.cast[index].age - 1, 18, 100)
    renderAge()
  })
  ageIncrease?.addEventListener('click', () => {
    state.cast[index].age = clamp(state.cast[index].age + 1, 18, 100)
    renderAge()
  })
  renderAge()

  // ARCHETYPE select
  const archetypeSelect = cardEl.querySelector('[data-card-select="archetype"]')
  archetypeSelect?.addEventListener('change', (event) => {
    state.cast[index].archetype = event.currentTarget.value
    renderModifiers(cardEl, index)
  })

  // PERSONALITY sliders
  for (const trait of PERSONALITY_TRAITS) {
    const slider = cardEl.querySelector(`[data-card-personality="${trait}"]`)
    const valueDisplay = cardEl.querySelector(`[data-card-personality-value="${trait}"]`)
    slider?.addEventListener('input', (event) => {
      state.cast[index].personality[trait] = Number(event.currentTarget.value)
      if (valueDisplay) valueDisplay.textContent = event.currentTarget.value
    })
  }

  // ATTRIBUTE sliders
  for (const stat of STATS) {
    const slider = cardEl.querySelector(`[data-card-attribute="${stat}"]`)
    slider?.addEventListener('input', (event) => {
      state.cast[index].attributes[stat] = Number(event.currentTarget.value)
      renderAttrDisplay(cardEl, index, stat)
    })
  }

  // initial modifier render
  renderModifiers(cardEl, index)
}

function buildCardHTML(index) {
  const char = state.cast[index]
  const n = index + 1

  const archetypeOptions = ARCHETYPES.map(({ value, label }) =>
    `<option value="${value}"${value === char.archetype ? ' selected' : ''}>${label}</option>`
  ).join('\n')

  const personalityRows = PERSONALITY_TRAITS.map((trait) => `
    <div class="cast-slider-row">
      <span class="cast-slider-label">${trait.toUpperCase()}</span>
      <input
        class="cast-slider"
        type="range"
        min="1"
        max="5"
        step="1"
        value="${char.personality[trait]}"
        data-card-personality="${trait}"
        aria-label="${trait}"
      />
      <span class="cast-slider-value" data-card-personality-value="${trait}">${char.personality[trait]}</span>
    </div>
  `).join('\n')

  const attributeRows = STATS.map((stat) => {
    const base = char.attributes[stat]
    const mod = getModifier(char.archetype, stat)
    const effective = base + mod
    return `
      <div class="cast-attr-row">
        <span class="cast-attr-label">${stat.toUpperCase()}</span>
        <input
          class="cast-slider"
          type="range"
          min="1"
          max="20"
          step="1"
          value="${base}"
          data-card-attribute="${stat}"
          aria-label="${stat}"
        />
        <span class="cast-attr-score">
          <span class="cast-attr-base" data-card-attr-base="${stat}">${base}</span>
          <span class="cast-attr-mod" data-card-attr-mod="${stat}">${formatModifier(mod)}</span>
          <span class="cast-attr-effective" data-card-attr-effective="${stat}">${effective}</span>
        </span>
      </div>
    `
  }).join('\n')

  return `
    <div class="cast-card" data-card-index="${index}">
      <p class="cast-card-label">CHARACTER ${n}</p>

      <div class="setup-field">
        <span class="setup-label">Name</span>
        <input
          class="setup-text-input"
          type="text"
          maxlength="40"
          autocomplete="off"
          spellcheck="false"
          value="${char.name}"
          data-card-field="name"
          aria-label="Character ${n} name"
        />
      </div>

      <div class="setup-field">
        <span class="setup-label">Sex</span>
        <div class="option-group" role="group" aria-label="Sex">
          <button class="option-btn${char.sex === 'male' ? ' is-active' : ''}" type="button" data-card-option="sex" data-value="male" aria-pressed="${String(char.sex === 'male')}" data-tex-backdrop data-tex-hover data-tex-selection>MALE</button>
          <button class="option-btn${char.sex === 'female' ? ' is-active' : ''}" type="button" data-card-option="sex" data-value="female" aria-pressed="${String(char.sex === 'female')}" data-tex-backdrop data-tex-hover data-tex-selection>FEMALE</button>
        </div>
      </div>

      <div class="setup-field">
        <span class="setup-label">Age</span>
        <div class="stepper" aria-label="Age">
          <button class="stepper-btn" type="button" data-card-stepper="age-decrease" aria-label="Decrease age" data-tex-backdrop data-tex-hover>-</button>
          <div class="stepper-value" data-card-stepper-value="age">${char.age}</div>
          <button class="stepper-btn" type="button" data-card-stepper="age-increase" aria-label="Increase age" data-tex-backdrop data-tex-hover>+</button>
        </div>
      </div>

      <div class="setup-field">
        <span class="setup-label">Archetype</span>
        <div class="cast-select-wrap">
          <select class="cast-select" data-card-select="archetype" aria-label="Archetype">
            ${archetypeOptions}
          </select>
        </div>
      </div>

      <div class="setup-field">
        <span class="setup-label">Personality</span>
        ${personalityRows}
      </div>

      <div class="setup-field">
        <span class="setup-label">Attributes</span>
        ${attributeRows}
      </div>
    </div>
  `
}

async function handleNext(app, submitButton) {
  setFeedback(app, '')

  const firstEmpty = state.cast.findIndex((c) => !c.name.trim())
  if (firstEmpty !== -1) {
    setFeedback(app, 'All characters need a name.', 'error')
    const input = app.querySelector(`[data-card-index="${firstEmpty}"] [data-card-field="name"]`)
    input?.focus()
    return
  }

  submitButton.disabled = true

  try {
    patchGameState({ cast: [...state.cast] })
    await saveGame(structuredClone(state))
    console.info('CAST setup saved.', state)
    showScreen('setup-killer')
  } catch (error) {
    console.error('Failed to save CAST setup.', error)
    setFeedback(app, 'Could not save right now. Try again.', 'error')
  } finally {
    submitButton.disabled = false
  }
}

export function mountSetupCast(app) {
  if (state.cast.length !== state.meta.castSize) {
    patchGameState({
      cast: Array.from({ length: state.meta.castSize }, createDefaultCharacter),
    })
  }

  const cardHTML = Array.from({ length: state.cast.length }, (_, i) => buildCardHTML(i)).join('\n')

  app.innerHTML = `
    <main class="setup-screen cast-setup-screen" aria-label="Cast setup">
      <button class="setup-back" id="setup-cast-back" type="button">&lt; BACK</button>
      <section class="cast-panel" aria-labelledby="setup-title">
        <header class="setup-header">
          <p class="setup-kicker">SETUP NEW GAME</p>
          <h1 id="setup-title">CAST</h1>
        </header>

        <form class="cast-form" id="setup-cast-form" novalidate>
          <div class="cast-grid">
            ${cardHTML}
          </div>

          <div class="cast-form-actions">
            <button class="menu-button" id="setup-cast-randomize-all" type="button" data-tex-backdrop data-tex-hover>RANDOMIZE ALL</button>
          </div>

          <p class="setup-feedback" id="setup-cast-feedback" aria-live="polite"></p>

          <button class="menu-button setup-next" id="setup-cast-next" type="submit" data-tex-backdrop data-tex-hover>NEXT</button>
        </form>
      </section>
    </main>
  `

  applyTextures(app)

  const backButton = app.querySelector('#setup-cast-back')
  const form = app.querySelector('#setup-cast-form')
  const submitButton = app.querySelector('#setup-cast-next')

  backButton?.addEventListener('click', () => {
    showScreen('setup-setting')
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!submitButton) return
    await handleNext(app, submitButton)
  })

  const randomizeAllBtn = app.querySelector('#setup-cast-randomize-all')
  randomizeAllBtn?.addEventListener('click', () => {
    const cardEls = [...app.querySelectorAll('[data-card-index]')]
    cardEls.forEach((cardEl) => {
      const index = Number(cardEl.dataset.cardIndex)
      randomizeChar(index)
      syncCardToState(cardEl, index)
    })
  })

  const cards = [...app.querySelectorAll('[data-card-index]')]
  cards.forEach((cardEl) => {
    const index = Number(cardEl.dataset.cardIndex)
    mountCard(cardEl, index)
  })

  return null
}
