import { Container, Graphics, Text } from 'pixi.js'

// FA 6 Free Solid unicode codepoints mapped to behavior states
const ICON_BY_KEY = {
  wandering: '\uf554', // fa-person-walking
  explore:   '\uf14e', // fa-compass
  rest:      '\uf186', // fa-moon
  social:    '\uf086', // fa-comments
}

// phase can override the behavior-key icon when it's more specific
const ICON_BY_PHASE = {
  resting:   '\uf186', // fa-moon
  conversing: '\uf086', // fa-comments
}

function behaviorIcon(character) {
  const phase = character.behavior?.phase
  if (phase && ICON_BY_PHASE[phase]) return ICON_BY_PHASE[phase]
  return ICON_BY_KEY[character.behavior?.key] ?? '\uf128' // fa-question fallback
}

// kick off a font load so the first update renders correctly
export function loadFontAwesome() {
  return document.fonts.load('900 12px "Font Awesome 6 Free"')
}

// creates a PixiJS container holding small FA icon badges, one per character.
// the container lives in mapVP.content so it auto-scales/pans with the map.
// call update(characters) after every tick to reposition and sync icons.
export function createCharacterIconLayer(mapW, mapH, gridW, gridH) {
  const cellW = gridW / mapW
  const cellH = gridH / mapH
  const iconFontSize = Math.max(6, Math.floor(cellH * 0.46))
  const pad = 1

  const container = new Container()

  // castIndex → { wrapper, bg, label }
  const icons = new Map()

  function getOrCreate(castIndex) {
    if (icons.has(castIndex)) return icons.get(castIndex)

    const wrapper = new Container()
    const bg = new Graphics()
    const label = new Text({
      text: '',
      style: {
        fontFamily: '"Font Awesome 6 Free"',
        fontWeight: '900',
        fontSize: iconFontSize,
        fill: 0xffffff,
      },
    })

    wrapper.addChild(bg)
    wrapper.addChild(label)
    container.addChild(wrapper)
    icons.set(castIndex, { wrapper, bg, label })
    return { wrapper, bg, label }
  }

  function update(characters) {
    const seen = new Set()

    for (const char of characters) {
      seen.add(char.castIndex)
      const { wrapper, bg, label } = getOrCreate(char.castIndex)

      label.text = behaviorIcon(char)
      label.x = pad
      label.y = pad

      const bw = Math.max(10, Math.ceil(label.width) + pad * 2)
      const bh = Math.max(10, Math.ceil(label.height) + pad * 2)
      bg.clear()
      bg.roundRect(0, 0, bw, bh, 2).fill({ color: 0x000000, alpha: 0.62 })

      wrapper.x = char.x * cellW
      wrapper.y = char.y * cellH
    }

    // prune icons for characters that no longer exist
    for (const [idx, { wrapper }] of icons) {
      if (!seen.has(idx)) {
        container.removeChild(wrapper)
        wrapper.destroy({ children: true })
        icons.delete(idx)
      }
    }
  }

  function destroy() {
    container.destroy({ children: true })
  }

  return { container, update, destroy }
}
