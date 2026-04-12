import { Container, Graphics, Text } from 'pixi.js'

// narrow icon-only tab bar on the left edge.
// panels float as independent overlays — any subset can be open simultaneously.

export const TAB_BAR_W = 44   // width of the icon bar itself
export const PANEL_W   = 320  // width of each panel overlay

const BTN_SIZE = 36   // square button size
const BTN_GAP  = 4    // gap between buttons
const BTN_X    = Math.floor((TAB_BAR_W - BTN_SIZE) / 2)  // center button in bar

const TOOLTIP_OFFSET_X = 6  // gap between bar right edge and tooltip left edge

export function createTabStrip(vh) {
  const container = new Container()
  container.x = 0
  container.y = 0

  // the bar itself — thin dark column on the left edge
  const barBg = new Graphics()
  container.addChild(barBg)

  // tooltip sits on top of everything else in the bar container
  const tooltipContainer = new Container()
  tooltipContainer.visible = false
  container.addChild(tooltipContainer)

  const tooltipBg = new Graphics()
  tooltipContainer.addChild(tooltipBg)
  const tooltipText = new Text({
    text: '',
    style: { fontSize: 10, fill: 0xccd8e4, fontFamily: 'monospace', letterSpacing: 0.5 },
  })
  tooltipText.x = 8
  tooltipText.y = 6
  tooltipContainer.addChild(tooltipText)

  let tabs = []
  let barH = vh

  function drawBar() {
    barBg.clear()
    barBg.rect(0, 0, TAB_BAR_W, barH)
      .fill({ color: 0x0a0a12, alpha: 0.92 })
    // right border separating bar from map
    barBg.moveTo(TAB_BAR_W - 1, 0).lineTo(TAB_BAR_W - 1, barH)
      .stroke({ color: 0x445566, alpha: 0.5, width: 1 })
  }

  function drawBtn(tab) {
    const { btnBg, iconText, open } = tab
    btnBg.clear()
    btnBg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6)
      .fill({ color: open ? 0x1a2640 : 0x111118, alpha: open ? 0.95 : 0.75 })
      .stroke({ color: open ? 0x8899aa : 0x445566, alpha: open ? 0.8 : 0.45, width: 1 })
    iconText.style.fill = open ? 0xd0dce8 : 0x778899
  }

  function showTooltip(label, btnY) {
    tooltipText.text = label
    const boxW = Math.ceil(tooltipText.width) + 16
    const boxH = Math.ceil(tooltipText.height) + 12
    tooltipBg.clear()
    tooltipBg.roundRect(0, 0, boxW, boxH, 5)
      .fill({ color: 0x10171f, alpha: 0.94 })
      .stroke({ color: 0x6a7e90, alpha: 0.65, width: 1 })
    tooltipContainer.x = TAB_BAR_W + TOOLTIP_OFFSET_X
    tooltipContainer.y = Math.round(btnY + BTN_SIZE / 2 - boxH / 2)
    tooltipContainer.visible = true
    // ensure tooltip is above bar bg but below panel content
    container.setChildIndex(tooltipContainer, container.children.length - 1)
  }

  function hideTooltip() {
    tooltipContainer.visible = false
  }

  function addTab(key, iconCodepoint, tooltipLabel, content) {
    const tabIndex = tabs.length
    const btnY = BTN_GAP + tabIndex * (BTN_SIZE + BTN_GAP)

    const btn = new Container()
    btn.x = BTN_X
    btn.y = btnY
    btn.eventMode = 'static'
    btn.cursor = 'pointer'

    const btnBg = new Graphics()
    btn.addChild(btnBg)

    const iconText = new Text({
      text: iconCodepoint,
      style: {
        fontFamily: '"Font Awesome 6 Free"',
        fontWeight: '900',
        fontSize: 16,
        fill: 0x778899,
      },
    })
    // center icon in button
    iconText.x = Math.floor((BTN_SIZE - iconText.width) / 2)
    iconText.y = Math.floor((BTN_SIZE - iconText.height) / 2)
    btn.addChild(iconText)

    const tab = { key, iconCodepoint, tooltipLabel, content, open: false, btn, btnBg, iconText, btnY }
    tabs.push(tab)

    drawBtn(tab)

    // position panel: each tab slot = TAB_BAR_W + tabIndex * PANEL_W
    content.x = TAB_BAR_W + tabIndex * PANEL_W
    content.y = 0
    content.visible = false
    container.addChild(content)

    // ensure tooltip stays on top after adding content
    container.setChildIndex(tooltipContainer, container.children.length - 1)

    btn.on('pointerdown', () => {
      tab.open = !tab.open
      content.visible = tab.open
      drawBtn(tab)
    })

    btn.on('pointerover', () => showTooltip(tooltipLabel, btnY))
    btn.on('pointerout', () => hideTooltip())

    container.addChildAt(btn, 1)  // just above barBg, below tooltip and panels

    drawBar()
    return tab
  }

  function resize(newVh) {
    barH = newVh
    drawBar()
  }

  function isOpen(key) {
    return tabs.find(t => t.key === key)?.open ?? false
  }

  function destroy() {
    container.destroy({ children: true })
  }

  drawBar()

  return { container, addTab, resize, isOpen, destroy }
}
