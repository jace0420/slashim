import { Container, Graphics, Text } from 'pixi.js'

const TITLE_H     = 20
const CONTENT_PAD = 6
const SCROLLBAR_W = 4
const ROW_GAP     = 14
const ENTRY_GAP   = 4

const TEXT_STYLE = {
  fontFamily: 'NothingYouCouldDo',
  fontSize: 11,
  fill: 0x000000,
}

// shared base — scrollable panel with a title row, clipped viewport, and a visible scrollbar thumb
// p is the live params object (mutated by tweakpane) so redraw() always reads current values
function buildScrollablePanel(label, p) {
  let scrollOffset = 0
  let totalContentH = 0

  const container = new Container()

  const bg = new Graphics()
  container.addChild(bg)

  // mask shape is in panelContainer local space — clips scrollViewport only
  const contentMask = new Graphics()
  container.addChild(contentMask)

  const scrollViewport = new Container()
  scrollViewport.mask = contentMask
  container.addChild(scrollViewport)

  const contentContainer = new Container()
  scrollViewport.addChild(contentContainer)

  const scrollTrack = new Graphics()
  const scrollThumb = new Graphics()
  container.addChild(scrollTrack)
  container.addChild(scrollThumb)

  // title sits above the clip region — always visible
  const titleText = new Text({
    text: label,
    style: { fontSize: 9, fill: 0x888888, fontFamily: 'monospace', letterSpacing: 1 },
  })
  titleText.x = CONTENT_PAD
  titleText.y = 5
  container.addChild(titleText)

  // helpers — read p each call so tweakpane resize propagates automatically
  function vpH() { return p.h - TITLE_H - CONTENT_PAD }
  function ctW() { return p.w - CONTENT_PAD * 2 - SCROLLBAR_W - 4 }
  function maxScroll() { return Math.max(0, totalContentH - vpH()) }

  function drawScrollbar() {
    const tx = p.w - SCROLLBAR_W - 2
    const ty = TITLE_H
    const th = vpH()

    scrollTrack.clear()
    scrollTrack.rect(tx, ty, SCROLLBAR_W, th)
      .fill({ color: 0x8899aa, alpha: 0.18 })

    const ms = maxScroll()
    if (ms <= 0) {
      scrollThumb.clear()
      return
    }

    const thumbH = Math.max(14, (vpH() / totalContentH) * th)
    const thumbY = ty + (th - thumbH) * (scrollOffset / ms)

    scrollThumb.clear()
    scrollThumb.rect(tx, thumbY, SCROLLBAR_W, thumbH)
      .fill({ color: 0x8899aa, alpha: 0.55 })
  }

  function positionContent() {
    contentContainer.x = CONTENT_PAD
    contentContainer.y = TITLE_H + Math.floor(CONTENT_PAD * 0.5) - scrollOffset
  }

  function redraw() {
    container.x = p.x
    container.y = p.y

    bg.clear()
    bg.rect(0, 0, p.w, p.h)
      .fill({ color: 0x111118, alpha: 0.55 })
      .stroke({ color: 0x8899aa, alpha: 0.45, width: 1 })

    // clip mask covers the content + scrollbar column
    contentMask.clear()
    contentMask.rect(0, TITLE_H, p.w, vpH() + CONTENT_PAD)
      .fill({ color: 0xffffff, alpha: 1 })

    positionContent()
    drawScrollbar()
  }

  function scroll(delta) {
    scrollOffset = Math.max(0, Math.min(maxScroll(), scrollOffset + delta))
    positionContent()
    drawScrollbar()
  }

  function scrollToBottom() {
    scrollOffset = maxScroll()
    positionContent()
    drawScrollbar()
  }

  redraw()

  return {
    container,
    redraw,
    scroll,
    scrollToBottom,
    contentContainer,
    getContentW() { return ctW() },
    setTotalContentH(v) { totalContentH = v },
    getTotalContentH() { return totalContentH },
  }
}

// lists cast members. entries can have optional { color, room } for live sim state:
//   color — hex color matching their '@' on the map; renders "@  name" in that color
//   room  — current room label shown as a subtitle under the name
// falls back to the original "name · archetype" single-line format if color is absent.
export function buildCastPanel(p, castEntries = []) {
  const base = buildScrollablePanel('CAST', p)

  function populate(entries) {
    base.contentContainer.removeChildren()
    let y = 0

    for (const entry of entries) {
      if (entry.color != null) {
        // colored @ + name in character's palette color (monospace so @ matches the map glyph)
        const nameLine = new Text({
          text: `@ ${entry.name}`,
          style: { fontFamily: 'monospace', fontSize: 11, fill: entry.color },
        })
        nameLine.y = y
        base.contentContainer.addChild(nameLine)
        y += ROW_GAP

        // archetype · room subtitle
        const subtitle = entry.room
          ? `${entry.archetype}  ·  ${entry.room}`
          : entry.archetype
        const subLine = new Text({
          text: subtitle,
          style: { fontFamily: 'NothingYouCouldDo', fontSize: 9, fill: 0x778899 },
        })
        subLine.y = y
        base.contentContainer.addChild(subLine)
        y += ROW_GAP + 4 // extra gap between entries in two-line mode
      } else {
        // fallback — original single-line format used before characters spawn
        const row = new Text({
          text: `${entry.name}  ·  ${entry.archetype}`,
          style: { ...TEXT_STYLE },
        })
        row.y = y
        base.contentContainer.addChild(row)
        y += ROW_GAP
      }
    }

    base.setTotalContentH(y)
    base.redraw()
  }

  populate(castEntries)

  return {
    container: base.container,
    redraw: base.redraw,
    scroll: base.scroll,
    refresh: populate,
  }
}

// append log entries one at a time; auto-scrolls to bottom on each append
export function buildNarrativePanel(p) {
  const base = buildScrollablePanel('NARRATIVE', p)

  function appendEntry(text) {
    const entry = new Text({
      text,
      style: {
        ...TEXT_STYLE,
        wordWrap: true,
        wordWrapWidth: base.getContentW(),
        breakWords: true,
        lineHeight: 14,
      },
    })
    entry.y = base.getTotalContentH()
    base.contentContainer.addChild(entry)
    // use measured height with a safe minimum in case the text hasn't rendered yet
    base.setTotalContentH(base.getTotalContentH() + Math.max(entry.height, 14) + ENTRY_GAP)
    base.scrollToBottom()
  }

  return {
    container: base.container,
    redraw: base.redraw,
    scroll: base.scroll,
    appendEntry,
  }
}
