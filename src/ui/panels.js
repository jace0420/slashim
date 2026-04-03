import { Container, Graphics, Text } from 'pixi.js'

const TITLE_H     = 20
const CONTENT_PAD = 6
const SCROLLBAR_W = 4
const ROW_GAP     = 14
const ENTRY_GAP   = 4
const CORNER_R    = 8

const TEXT_STYLE = {
  fontFamily: 'NothingYouCouldDo',
  fontSize: 11,
  fill: 0xbbccdd,
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
    setLabel(nextLabel) { titleText.text = nextLabel },
    getContentW() { return ctW() },
    setTotalContentH(v) { totalContentH = v },
    getTotalContentH() { return totalContentH },
  }
}

// lists cast members. entries can have optional { color, room } for live sim state:
//   color — hex color matching their '@' on the map; renders "@  name" in that color
//   room  — current room label shown as a subtitle under the name
// falls back to the original "name · archetype" single-line format if color is absent.
export function buildCastPanel(p, castEntries = [], options = {}) {
  const base = buildScrollablePanel('CAST', p)
  const onSelect = options.onSelect ?? (() => {})
  const onBack = options.onBack ?? (() => {})

  let activeEntries = castEntries
  let activeDetail = null

  function drawRowBackground(graphics, width, height, hovered) {
    graphics.clear()
    graphics.roundRect(0, 0, width, height, CORNER_R)
      .fill({ color: hovered ? 0x1d2432 : 0x141821, alpha: hovered ? 0.9 : 0.68 })
      .stroke({ color: hovered ? 0x91a7be : 0x556677, alpha: hovered ? 0.75 : 0.45, width: 1 })
  }

  function addTextLine(text, style, y, parent) {
    const line = new Text({ text, style })
    line.y = y
    parent.addChild(line)
    return line
  }

  function drawMeter(y, need) {
    const meter = new Container()
    meter.y = y

    const label = new Text({
      text: `${need.label}`,
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0xaebccc, letterSpacing: 0.5 },
    })
    meter.addChild(label)

    const value = new Text({
      text: `${need.value}`.padStart(3, ' '),
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0xd5dfeb, letterSpacing: 0.5 },
    })
    value.x = base.getContentW() - value.width
    meter.addChild(value)

    const barY = 12
    const trackW = base.getContentW()

    const track = new Graphics()
    track.roundRect(0, barY, trackW, 6, 3)
      .fill({ color: 0x1a2230, alpha: 0.9 })
    meter.addChild(track)

    const fillRatio = Math.max(0.04, Math.min(1, need.value / 100))
    const fillColor = need.accumulating ? 0xc46d6d : 0x78bba3
    const fill = new Graphics()
    fill.roundRect(0, barY, trackW * fillRatio, 6, 3)
      .fill({ color: fillColor, alpha: 0.92 })
    meter.addChild(fill)

    const cue = new Text({
      text: need.cue,
      style: { fontFamily: 'NothingYouCouldDo', fontSize: 10, fill: 0x7e90a3 },
    })
    cue.y = 20
    meter.addChild(cue)

    return meter
  }

  function populateList(entries) {
    let y = 0
    const rowW = base.getContentW()

    for (const entry of entries) {
      const row = new Container()
      row.y = y
      row.eventMode = 'static'
      row.cursor = 'pointer'

      const hasStatus = entry.color != null && entry.health != null
      const rowH = hasStatus ? 54 : (entry.color != null ? 38 : 20)
      const bg = new Graphics()
      row.addChild(bg)

      let hovered = false
      const syncBg = () => drawRowBackground(bg, rowW, rowH, hovered)
      syncBg()

      row.on('pointerover', () => {
        hovered = true
        syncBg()
      })
      row.on('pointerout', () => {
        hovered = false
        syncBg()
      })
      row.on('pointerdown', () => onSelect(entry.castIndex))

      const inner = new Container()
      inner.x = 8
      inner.y = 6
      row.addChild(inner)

      if (entry.color != null) {
        addTextLine(`@ ${entry.name}`, {
          fontFamily: 'monospace', fontSize: 11, fill: entry.color,
        }, 0, inner)

        const subtitle = entry.room
          ? `${entry.archetype}  ·  ${entry.room}`
          : entry.archetype
        addTextLine(subtitle, {
          fontFamily: 'NothingYouCouldDo', fontSize: 9, fill: 0x778899,
        }, ROW_GAP, inner)

        if (entry.health != null) {
          addTextLine(`${entry.health}  ·  ${entry.mood}`, {
            fontFamily: 'monospace', fontSize: 9, fill: 0x556677,
          }, ROW_GAP * 2, inner)
        }
      } else {
        addTextLine(`${entry.name}  ·  ${entry.archetype}`, { ...TEXT_STYLE }, 0, inner)
      }

      base.contentContainer.addChild(row)
      y += rowH + 6
    }

    base.setTotalContentH(y)
  }

  function populateDetail(detail) {
    const rowW = base.getContentW()
    let y = 0

    const backRow = new Container()
    backRow.eventMode = 'static'
    backRow.cursor = 'pointer'
    const backBg = new Graphics()
    backRow.addChild(backBg)
    drawRowBackground(backBg, rowW, 22, false)
    const backText = new Text({
      text: '< BACK TO CAST',
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0xc0ccd9, letterSpacing: 0.5 },
    })
    backText.x = 8
    backText.y = 6
    backRow.addChild(backText)
    backRow.on('pointerover', () => drawRowBackground(backBg, rowW, 22, true))
    backRow.on('pointerout', () => drawRowBackground(backBg, rowW, 22, false))
    backRow.on('pointerdown', onBack)
    base.contentContainer.addChild(backRow)
    y += 30

    const nameLine = new Text({
      text: `@ ${detail.name}`,
      style: { fontFamily: 'monospace', fontSize: 14, fill: detail.color ?? 0xd9dfe6 },
    })
    nameLine.y = y
    base.contentContainer.addChild(nameLine)
    y += 20

    const identityLine = new Text({
      text: detail.room ? `${detail.archetype}  ·  ${detail.room}` : detail.archetype,
      style: { fontFamily: 'NothingYouCouldDo', fontSize: 11, fill: 0x8ea0b3 },
    })
    identityLine.y = y
    base.contentContainer.addChild(identityLine)
    y += 18

    const summaryLine = new Text({
      text: `${detail.health}  ·  ${detail.mood}`,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0x66798d, letterSpacing: 0.5 },
    })
    summaryLine.y = y
    base.contentContainer.addChild(summaryLine)
    y += 20

    const quickNeeds = new Text({
      text: detail.topNeedCues.join('  ·  '),
      style: { fontFamily: 'NothingYouCouldDo', fontSize: 11, fill: 0xb7c4d0 },
    })
    quickNeeds.y = y
    base.contentContainer.addChild(quickNeeds)
    y += 26

    const sectionLabel = new Text({
      text: 'NEEDS',
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0x7a8a99, letterSpacing: 1 },
    })
    sectionLabel.y = y
    base.contentContainer.addChild(sectionLabel)
    y += 16

    for (const need of detail.needSummaries) {
      const meter = drawMeter(y, need)
      base.contentContainer.addChild(meter)
      y += 38
    }

    base.setTotalContentH(y)
  }

  function populate(entries = activeEntries, detail = activeDetail) {
    activeEntries = entries
    activeDetail = detail
    base.contentContainer.removeChildren()
    if (detail) {
      base.setLabel('DETAILS')
      populateDetail(detail)
    } else {
      base.setLabel('CAST')
      populateList(entries)
    }
    base.redraw()
  }

  populate(castEntries)

  return {
    container: base.container,
    redraw: base.redraw,
    scroll: base.scroll,
    refresh: populate,
    showDetails(detail) { populate(activeEntries, detail) },
    clearDetails() { populate(activeEntries, null) },
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

export function buildCharacterTooltip() {
  const container = new Container()
  container.visible = false

  const bg = new Graphics()
  container.addChild(bg)

  const content = new Container()
  content.x = 10
  content.y = 8
  container.addChild(content)

  function render(data) {
    content.removeChildren()

    let y = 0
    let maxW = 0
    const lines = [
      new Text({
        text: `@ ${data.name}`,
        style: { fontFamily: 'monospace', fontSize: 12, fill: data.color ?? 0xdbe5f0 },
      }),
      ...data.topNeedCues.map((cue) => new Text({
        text: cue,
        style: { fontFamily: 'NothingYouCouldDo', fontSize: 11, fill: 0xbfccda },
      })),
    ]

    for (const line of lines) {
      line.y = y
      content.addChild(line)
      y += line.height + 2
      maxW = Math.max(maxW, line.width)
    }

    const boxW = Math.ceil(maxW + 20)
    const boxH = Math.ceil(y + 12)
    bg.clear()
    bg.roundRect(0, 0, boxW, boxH, CORNER_R)
      .fill({ color: 0x101721, alpha: 0.94 })
      .stroke({ color: 0x93a8bf, alpha: 0.72, width: 1 })

    return { boxW, boxH }
  }

  function show(data, anchor, clampBounds) {
    const { boxW, boxH } = render(data)
    const offset = 14
    const maxX = clampBounds.x + clampBounds.w - boxW - 4
    const maxY = clampBounds.y + clampBounds.h - boxH - 4
    container.x = Math.max(clampBounds.x + 4, Math.min(maxX, anchor.x + offset))
    container.y = Math.max(clampBounds.y + 4, Math.min(maxY, anchor.y + offset))
    container.visible = true
  }

  function hide() {
    container.visible = false
  }

  return {
    container,
    show,
    hide,
  }
}
