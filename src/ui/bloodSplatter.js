import gsap from 'gsap'
import { Howl } from 'howler'
import Chance from 'chance'

const chance = new Chance()

// Vite asset URLs — public/ files are served at root, referenced via static URLs only
// (import.meta.glob can't import public/ assets as modules; use static fallbacks directly)

// Fallbacks for when glob comes up empty (dev vs. prod path differences)
const TEXTURE_FALLBACKS = [
  '/assets/textures/gore/screen-blood/screen_blood1.png',
  '/assets/textures/gore/screen-blood/screen_blood2.png',
  '/assets/textures/gore/screen-blood/screen_blood3.png',
]
const AUDIO_FALLBACKS = [
  '/assets/audio/sfx/gore/splatters/splatter1.mp3',
  '/assets/audio/sfx/gore/splatters/splatter2.mp3',
  '/assets/audio/sfx/gore/splatters/splatter3.mp3',
]

const texPool = TEXTURE_FALLBACKS
const audPool = AUDIO_FALLBACKS

let layer = null
let img = null
let booted = false

export function initBloodSplatter() {
  if (layer) return

  layer = document.createElement('div')
  layer.id = 'splatter-layer'
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
  })

  img = document.createElement('img')
  img.id = 'splatter-img'
  Object.assign(img.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: '0',
    willChange: 'transform, clip-path, opacity',
  })

  layer.appendChild(img)

  // Insert before #app so DOM order is: body > #splatter-layer > #app
  const app = document.getElementById('app')
  document.body.insertBefore(layer, app)
}

export function playSplatter() {
  // Skip the very first call (initial boot)
  if (!booted) {
    booted = true
    return
  }

  if (!layer || !img) return

  // Kill any running tween
  gsap.killTweensOf(img)

  // --- Pick assets ---
  const texSrc = chance.pickone(texPool)
  const audSrc = chance.pickone(audPool)

  // --- Randomize transforms ---
  const rotation = chance.floating({ min: -12, max: 12 })
  const baseScale = chance.floating({ min: 0.92, max: 1.1 })
  const scaleX = chance.bool() ? -baseScale : baseScale
  const scaleY = chance.bool() ? -baseScale : baseScale
  const xOffset = chance.floating({ min: -0.04, max: 0.04 }) * window.innerWidth
  const yOffset = chance.floating({ min: -0.03, max: 0.03 }) * window.innerHeight

  // --- Reveal style ---
  const useRadial = chance.bool()

  let clipStart, clipEnd, duration, ease

  if (useRadial) {
    const cx = chance.floating({ min: 30, max: 70 })
    const cy = chance.floating({ min: 25, max: 65 })
    clipStart = `circle(0% at ${cx}% ${cy}%)`
    clipEnd = `circle(150% at ${cx}% ${cy}%)`
    duration = chance.floating({ min: 0.12, max: 0.22 })
    ease = 'power2.out'
  } else {
    const edge = chance.pickone(['left', 'right', 'top', 'bottom'])
    const edgeClips = {
      left:   { start: 'inset(0 100% 0 0)',   end: 'inset(0 0% 0 0)' },
      right:  { start: 'inset(0 0 0 100%)',   end: 'inset(0 0 0 0%)' },
      top:    { start: 'inset(0 0 100% 0)',   end: 'inset(0% 0 0 0)' },
      bottom: { start: 'inset(100% 0 0 0)',   end: 'inset(0% 0 0 0)' },
    }
    clipStart = edgeClips[edge].start
    clipEnd = edgeClips[edge].end
    duration = chance.floating({ min: 0.2, max: 0.32 })
    ease = 'power3.in'
  }

  // --- Snap to start state before animating ---
  img.src = texSrc
  gsap.set(img, {
    opacity: 0,
    clipPath: clipStart,
    rotation,
    scaleX,
    scaleY,
    x: xOffset,
    y: yOffset,
  })

  // --- Fire audio ---
  new Howl({ src: [audSrc], volume: 0.8 }).play()

  // --- Animate reveal ---
  gsap.timeline().to(img, {
    opacity: 1,
    duration: duration * 0.4,
    ease: 'power2.out',
  }, 0).to(img, {
    clipPath: clipEnd,
    duration,
    ease,
  }, 0)
}
