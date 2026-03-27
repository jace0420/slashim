import { playSplatter } from './ui/bloodSplatter'

const screens = new Map()

let currentScreen = null
let currentCleanup = null

export function registerScreen(name, mount) {
  screens.set(name, mount)
}

export function showScreen(name, props = {}) {
  playSplatter()

  const app = document.querySelector('#app')
  const mount = screens.get(name)

  if (!app) {
    throw new Error('App root not found.')
  }

  if (!mount) {
    throw new Error(`Screen "${name}" is not registered.`)
  }

  if (typeof currentCleanup === 'function') {
    currentCleanup()
  }

  app.innerHTML = ''
  currentScreen = name
  currentCleanup = mount(app, props) ?? null
}

export function getCurrentScreen() {
  return currentScreen
}