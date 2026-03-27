// random texture assignment for UI elements
// queries data-tex-* attributes and sets CSS custom properties per element

function globToUrls(globResult) {
  return Object.values(globResult)
}

const discoveredBackdrops = globToUrls(
  import.meta.glob('/public/assets/ui/button-backdrops/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    import: 'default',
  }),
)

const discoveredHovers = globToUrls(
  import.meta.glob('/public/assets/ui/hover-elements/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    import: 'default',
  }),
)

const discoveredSelections = globToUrls(
  import.meta.glob('/public/assets/ui/selection-elements/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    import: 'default',
  }),
)

const TEXTURES = {
  backdrop: discoveredBackdrops.length
    ? discoveredBackdrops
    : [
      '/assets/ui/button-backdrops/button_backdrop1.png',
      '/assets/ui/button-backdrops/button_backdrop2.png',
    ],
  hover: discoveredHovers.length
    ? discoveredHovers
    : [
      '/assets/ui/hover-elements/hover1.png',
      '/assets/ui/hover-elements/hover2.png',
    ],
  selection: discoveredSelections.length
    ? discoveredSelections
    : [
      '/assets/ui/selection-elements/check1.png',
    ],
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function applyTextures(root) {
  root.querySelectorAll('[data-tex-backdrop]:not([disabled])').forEach((el) => {
    el.style.setProperty('--backdrop-tex', `url("${pickRandom(TEXTURES.backdrop)}")`)
  })

  root.querySelectorAll('[data-tex-hover]:not([disabled])').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const base = Math.min(rect.width, rect.height)
    const hoverPad = clamp(Math.round(base * 0.3), 10, 28)

    el.style.setProperty('--hover-tex', `url("${pickRandom(TEXTURES.hover)}")`)
    el.style.setProperty('--hover-pad', `${hoverPad}px`)
  })

  root.querySelectorAll('[data-tex-selection]:not([disabled])').forEach((el) => {
    el.style.setProperty('--selection-tex', `url("${pickRandom(TEXTURES.selection)}")`)
  })
}
