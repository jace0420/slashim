import { Container, Graphics, Text } from 'pixi.js'

const FILTER_BAR_H = 32
const SCROLLBAR_W  = 5
const CONTENT_PAD  = 8
const ROW_MIN_H    = 18   // minimum row height (single-line messages)

// timestamp is always 8 chars wide (" 8:42 PM") at 6px/char → ~48px
// badge starts after that gap, longest is "[SOCIAL]" = 8 chars → ~48px
// message starts after badge + gap
const TS_X    = CONTENT_PAD
const BADGE_X = CONTENT_PAD + 56
const MSG_X   = CONTENT_PAD + 112

const FILTERS = [
  { key: 'all',      label: 'ALL',    color: 0x8899aa },
  { key: 'movement', label: 'MOVE',   color: 0x78b4bb },
  { key: 'behavior', label: 'ACT',    color: 0xbb9f78 },
  { key: 'social',   label: 'SOCIAL', color: 0xa078bb },
]

const CAT_COLORS = {
  movement: 0x78b4bb,
  behavior: 0xbb9f78,
  social:   0xa078bb,
  other:    0x8899aa,
}

const CAT_BADGE_LABELS = {
  movement: '[MOVE]',
  behavior: '[ACT]',
  social:   '[SOCIAL]',
  other:    '[???]',
}

const CATEGORY_KEYS = ['movement', 'behavior', 'social']

// p is the live bounds object ({ x, y, w, h }) — mutated by applyLayout, read on each redraw.
// eventLog is the createEventLog() instance.
export function buildEventLogPanel(p, eventLog) {
  // empty set = all categories visible (same as ALL)
  let activeFilters = new Set()
  let scrollOffset = 0
  let atBottom = true
  let totalContentH = 0

  const container = new Container()

  const bg = new Graphics()
  container.addChild(bg)

  // filter buttons row
  const filterRow = new Container()
  filterRow.y = 2
  container.addChild(filterRow)

  // scroll area
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

  // filter button draw callbacks keyed by filter key
  const filterDrawFns = {}

  function buildFilterBar() {
    filterRow.removeChildren()
    let fx = CONTENT_PAD
    for (const f of FILTERS) {
      const btnW = Math.max(38, f.label.length * 7 + 16)
      const btnH = FILTER_BAR_H - 6

      const btn = new Container()
      btn.x = fx
      btn.eventMode = 'static'
      btn.cursor = 'pointer'

      const btnBg = new Graphics()
      btn.addChild(btnBg)

      const btnTxt = new Text({
        text: f.label,
        style: { fontSize: 9, fill: 0xcccccc, fontFamily: 'monospace', letterSpacing: 1 },
      })
      btn.addChild(btnTxt)

      function draw(isActive) {
        btnBg.clear()
        btnBg.rect(0, 0, btnW, btnH)
          .fill({ color: isActive ? 0x1e2c3a : 0x111118, alpha: 0.9 })
          .stroke({ color: isActive ? f.color : 0x445566, alpha: isActive ? 0.85 : 0.5, width: 1 })
        btnTxt.x = Math.floor((btnW - btnTxt.width) / 2)
        btnTxt.y = Math.floor((btnH - btnTxt.height) / 2)
      }

      draw(activeFilters.size === 0 || (f.key !== 'all' && activeFilters.has(f.key)))
      filterDrawFns[f.key] = { draw, color: f.color }

      btn.on('pointerdown', () => {
        if (f.key === 'all') {
          // ALL clears the set — everything visible again
          activeFilters.clear()
        } else {
          // toggle this category; if the set becomes full (all cats selected), clear it instead
          if (activeFilters.has(f.key)) {
            activeFilters.delete(f.key)
          } else {
            activeFilters.add(f.key)
          }
          if (activeFilters.size === CATEGORY_KEYS.length) activeFilters.clear()
        }
        atBottom = true
        for (const [k, { draw: d }] of Object.entries(filterDrawFns)) {
          d(activeFilters.size === 0 || (k !== 'all' && activeFilters.has(k)))
        }
        fullRebuild()
        if (atBottom) scrollToBottom()
        drawScrollbar()
      })

      filterRow.addChild(btn)
      fx += btnW + 4
    }
  }

  function vpH() { return p.h - FILTER_BAR_H }
  function maxScroll() { return Math.max(0, totalContentH - vpH()) }

  function shouldShowEntry(entry) {
    return activeFilters.size === 0 || activeFilters.has(entry.category)
  }

  function formatTimestamp(ts) {
    if (!ts) return '        '
    const h = String(ts.hour).padStart(2, ' ')
    const m = String(ts.minute).padStart(2, '0')
    return `${h}:${m} ${ts.meridiem.toUpperCase()}`
  }

  function makeRow(entry) {
    const row = new Container()
    const catColor = CAT_COLORS[entry.category] ?? 0x8899aa
    const badge = CAT_BADGE_LABELS[entry.category] ?? '[???]'

    const tsText = new Text({
      text: formatTimestamp(entry.timestamp),
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0x445566 },
    })
    tsText.x = TS_X
    tsText.y = 3
    row.addChild(tsText)

    const badgeText = new Text({
      text: badge,
      style: { fontFamily: 'monospace', fontSize: 9, fill: catColor },
    })
    badgeText.x = BADGE_X
    badgeText.y = 3
    row.addChild(badgeText)

    const msgWrapW = Math.max(60, p.w - MSG_X - SCROLLBAR_W - CONTENT_PAD)
    const msgText = new Text({
      text: entry.text,
      style: {
        fontFamily: 'monospace',
        fontSize: 9,
        fill: 0xaabbcc,
        wordWrap: true,
        wordWrapWidth: msgWrapW,
      },
    })
    msgText.x = MSG_X
    msgText.y = 3
    row.addChild(msgText)

    // expose row height for variable-stride layout
    row._rowH = Math.max(ROW_MIN_H, Math.ceil(msgText.height) + 6)

    return row
  }

  function positionContent() {
    if (atBottom) scrollOffset = maxScroll()
    scrollOffset = Math.min(scrollOffset, maxScroll())
    contentContainer.y = -scrollOffset
  }

  function scrollToBottom() {
    scrollOffset = maxScroll()
    atBottom = true
    contentContainer.y = -scrollOffset
  }

  function fullRebuild() {
    contentContainer.removeChildren()
    const entries = activeFilters.size === 0
      ? eventLog.entries
      : eventLog.entries.filter(e => activeFilters.has(e.category))

    let y = CONTENT_PAD / 2
    for (const entry of entries) {
      const row = makeRow(entry)
      row.y = y
      contentContainer.addChild(row)
      y += row._rowH
    }
    totalContentH = y + CONTENT_PAD / 2
    positionContent()
  }

  function appendRow(entry) {
    // compute y from last child's position + height
    let y = CONTENT_PAD / 2
    const children = contentContainer.children
    if (children.length > 0) {
      const last = children[children.length - 1]
      y = last.y + (last._rowH ?? ROW_MIN_H)
    }
    const row = makeRow(entry)
    row.y = y
    contentContainer.addChild(row)
    totalContentH = y + row._rowH + CONTENT_PAD / 2
    positionContent()
  }

  function drawScrollbar() {
    const tx = p.w - SCROLLBAR_W - 2
    const ty = FILTER_BAR_H
    const th = vpH()

    scrollTrack.clear()
    scrollTrack.rect(tx, ty, SCROLLBAR_W, th)
      .fill({ color: 0x8899aa, alpha: 0.28 })

    const ms = maxScroll()
    if (ms <= 0) { scrollThumb.clear(); return }

    const thumbH = Math.max(14, (vpH() / totalContentH) * th)
    const thumbY = ty + (th - thumbH) * (scrollOffset / ms)

    scrollThumb.clear()
    scrollThumb.rect(tx, thumbY, SCROLLBAR_W, thumbH)
      .fill({ color: 0x8899aa, alpha: 0.55 })
  }

  function redraw() {
    bg.clear()
    bg.rect(0, 0, p.w, p.h)
      .fill({ color: 0x111118, alpha: 0.55 })
      .stroke({ color: 0x8899aa, alpha: 0.45, width: 1 })

    contentMask.clear()
    contentMask.rect(0, FILTER_BAR_H, p.w - SCROLLBAR_W - 2, vpH())
      .fill({ color: 0xffffff, alpha: 1 })

    scrollViewport.y = FILTER_BAR_H
    drawScrollbar()
  }

  // called by the eventLog subscriber — entry is null on clear(), otherwise the new entry
  function onNewEntry(entry, purgedCount) {
    if (entry === null) {
      fullRebuild()
      drawScrollbar()
      return
    }
    // ring buffer purged from front — full rebuild to stay consistent
    if (purgedCount > 0) {
      fullRebuild()
      if (atBottom) scrollToBottom()
      drawScrollbar()
      return
    }
    if (shouldShowEntry(entry)) {
      appendRow(entry)
      if (atBottom) scrollToBottom()
      drawScrollbar()
    }
  }

  function scroll(delta) {
    scrollOffset = Math.max(0, Math.min(maxScroll(), scrollOffset + delta))
    atBottom = scrollOffset >= maxScroll() - 2
    positionContent()
    drawScrollbar()
  }

  function resize() {
    redraw()
    fullRebuild()
    if (atBottom) scrollToBottom()
    drawScrollbar()
  }

  buildFilterBar()
  redraw()

  return { container, onNewEntry, scroll, resize }
}
