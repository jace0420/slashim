import { Container, Graphics, Text } from 'pixi.js'

// bottom tab strip — horizontal tab bar with collapsible content area above it.
// each tab has a label, and the content area shows the active tab's PixiJS container.

const TAB_H = 28          // height of the clickable tab labels row
const TAB_MIN_W = 90
const TAB_GAP = 2
const TAB_PAD_X = 12

export function createTabStrip(bounds) {
  const container = new Container()
  container.x = bounds.x
  container.y = bounds.y

  // background covers the whole strip area
  const bg = new Graphics()
  container.addChild(bg)

  // the tab labels row sits at the top of the strip
  const tabRow = new Container()
  container.addChild(tabRow)

  // content area sits below the tab row
  const contentArea = new Container()
  contentArea.y = TAB_H
  container.addChild(contentArea)

  // content mask clips the content area
  const contentMask = new Graphics()
  container.addChild(contentMask)
  contentArea.mask = contentMask

  let tabs = []       // { key, label, tabBtn, content }
  let activeKey = null
  let collapsed = false

  function drawBg() {
    bg.clear()
    bg.rect(0, 0, bounds.w, bounds.h)
      .fill({ color: 0x0c0c14, alpha: 0.88 })

    // top border line
    bg.moveTo(0, 0).lineTo(bounds.w, 0)
      .stroke({ color: 0x556677, alpha: 0.4, width: 1 })
  }

  function drawContentMask() {
    const ch = collapsed ? 0 : bounds.h - TAB_H
    contentMask.clear()
    contentMask.rect(0, TAB_H, bounds.w, ch)
      .fill({ color: 0xffffff })
  }

  function drawTabs() {
    // clear old tab buttons
    tabRow.removeChildren()
    let tx = TAB_GAP

    for (const tab of tabs) {
      const isActive = tab.key === activeKey
      const btn = new Container()
      btn.x = tx
      btn.y = 0
      btn.eventMode = 'static'
      btn.cursor = 'pointer'

      const btnBg = new Graphics()
      const btnW = Math.max(TAB_MIN_W, tab.label.length * 8 + TAB_PAD_X * 2)

      btnBg.rect(0, 0, btnW, TAB_H)
        .fill({ color: isActive ? 0x1a1a2e : 0x111118, alpha: isActive ? 0.95 : 0.7 })
        .stroke({ color: isActive ? 0x8899aa : 0x445566, alpha: 0.5, width: 1 })
      btn.addChild(btnBg)

      const btnTxt = new Text({
        text: tab.label,
        style: {
          fontSize: 10,
          fill: isActive ? 0xcccccc : 0x778899,
          fontFamily: 'monospace',
          letterSpacing: 1,
        },
      })
      btnTxt.x = Math.floor((btnW - btnTxt.width) / 2)
      btnTxt.y = Math.floor((TAB_H - btnTxt.height) / 2)
      btn.addChild(btnTxt)

      btn.on('pointerdown', () => {
        if (tab.key === activeKey) {
          // clicking active tab toggles collapse
          collapsed = !collapsed
        } else {
          activeKey = tab.key
          collapsed = false
        }
        refresh()
      })

      tab.tabBtn = btn
      tabRow.addChild(btn)
      tx += btnW + TAB_GAP
    }
  }

  function showActiveContent() {
    // hide all, show active
    for (const tab of tabs) {
      if (tab.content) tab.content.visible = tab.key === activeKey && !collapsed
    }
  }

  function refresh() {
    drawBg()
    drawTabs()
    drawContentMask()
    showActiveContent()
  }

  // adds a tab. content is a PixiJS Container that gets added to the content area.
  function addTab(key, label, content) {
    contentArea.addChild(content)
    // position the content inside the content area with some padding
    content.x = 8
    content.y = 4
    tabs.push({ key, label, tabBtn: null, content })

    // auto-select first tab
    if (!activeKey) activeKey = key
    refresh()
  }

  function resize(newBounds) {
    bounds = newBounds
    container.x = bounds.x
    container.y = bounds.y
    refresh()
  }

  function destroy() {
    container.destroy({ children: true })
  }

  refresh()

  return {
    container,
    addTab,
    resize,
    destroy,
    get contentH() { return collapsed ? 0 : bounds.h - TAB_H },
  }
}
