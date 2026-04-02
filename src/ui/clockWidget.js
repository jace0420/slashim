import { Container, Graphics, Text } from 'pixi.js'

// analog clock HUD widget drawn entirely in PixiJS.
// p = { x, y, radius } — all three are live (mutated by tweakpane) so redraw() always reflects them.
// call update(clock) whenever the sim clock advances to redraw the hands.
export function buildClockWidget(p) {
  const container = new Container()

  const faceGfx  = new Graphics() // static: ring + tick marks — only redrawn on radius change
  const handsGfx = new Graphics() // dynamic: hour + minute hands + center dot
  const timeText = new Text({
    text: '',
    style: { fontSize: 9, fill: 0x8899aa, fontFamily: 'monospace', letterSpacing: 1, align: 'center' },
  })

  container.addChild(faceGfx)
  container.addChild(handsGfx)
  container.addChild(timeText)

  function drawFace(r) {
    faceGfx.clear()

    // face background
    faceGfx.circle(0, 0, r)
      .fill({ color: 0x07070f, alpha: 0.78 })
      .stroke({ color: 0x8899aa, alpha: 0.5, width: 1 })

    // subtle inner ring
    faceGfx.circle(0, 0, r * 0.87).stroke({ color: 0x445566, alpha: 0.25, width: 0.5 })

    // minor tick marks (non-quarter hours)
    for (let h = 0; h < 12; h++) {
      if (h % 3 === 0) continue
      const angle = (h / 12) * Math.PI * 2 - Math.PI / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      faceGfx.moveTo(cos * r * 0.81, sin * r * 0.81).lineTo(cos * r * 0.90, sin * r * 0.90)
    }
    faceGfx.stroke({ color: 0x556677, alpha: 0.6, width: 0.75 })

    // major tick marks at 3, 6, 9, 12
    for (let h = 0; h < 12; h += 3) {
      const angle = (h / 12) * Math.PI * 2 - Math.PI / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      faceGfx.moveTo(cos * r * 0.72, sin * r * 0.72).lineTo(cos * r * 0.90, sin * r * 0.90)
    }
    faceGfx.stroke({ color: 0x99aabb, alpha: 0.85, width: 1.5 })
  }

  function drawHands(clock, r) {
    handsGfx.clear()

    const minuteAngle = (clock.minute / 60) * Math.PI * 2 - Math.PI / 2
    const hourAngle   = ((clock.hour % 12 + clock.minute / 60) / 12) * Math.PI * 2 - Math.PI / 2

    // minute hand — long, thin
    handsGfx
      .moveTo(0, 0)
      .lineTo(Math.cos(minuteAngle) * r * 0.70, Math.sin(minuteAngle) * r * 0.70)
      .stroke({ color: 0xaabbcc, alpha: 0.8, width: 1 })

    // hour hand — short, heavier
    handsGfx
      .moveTo(0, 0)
      .lineTo(Math.cos(hourAngle) * r * 0.48, Math.sin(hourAngle) * r * 0.48)
      .stroke({ color: 0xccdde8, alpha: 0.9, width: 2 })

    // center dot on top of both hands
    handsGfx.circle(0, 0, 2).fill({ color: 0xaabbcc })
  }

  function positionTimeText(r) {
    timeText.anchor.set(0.5, 0)
    timeText.x = 0
    timeText.y = r + 5
  }

  let lastClock = null

  function update(clock) {
    lastClock = clock
    drawHands(clock, p.radius)
    const mm = String(clock.minute).padStart(2, '0')
    timeText.text = `${clock.hour}:${mm} ${clock.meridiem.toUpperCase()}`
  }

  // call when p.x / p.y / p.radius change (e.g. from tweakpane)
  function redraw() {
    container.x = p.x
    container.y = p.y
    drawFace(p.radius)
    positionTimeText(p.radius)
    if (lastClock) drawHands(lastClock, p.radius)
  }

  redraw()

  return { container, update, redraw }
}
