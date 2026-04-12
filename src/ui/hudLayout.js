// HUD layout zone system — computes pixel rects for each UI zone based on viewport size.
// zones are plain objects with { x, y, w, h } that get recalculated on resize.

import { TAB_BAR_W } from './tabStrip.js'

const SIDEBAR_W = 220
const HUD_PAD = 8

export const DEFAULT_HUD_PARAMS = {
  sidebarW: SIDEBAR_W,
  hudPad: HUD_PAD,
}

// computes layout zones from viewport dimensions + tunable params.
// returns an object of { x, y, w, h } rects for each zone.
export function computeLayout(vw, vh, p = DEFAULT_HUD_PARAMS) {
  const pad = p.hudPad

  // narrow icon-only tab bar on the left edge
  const tabBar = {
    x: 0,
    y: 0,
    w: TAB_BAR_W,
    h: vh,
  }

  // right sidebar — full height, only top/bottom padding
  const rightSidebar = {
    x: vw - p.sidebarW - pad,
    y: pad,
    w: p.sidebarW,
    h: vh - pad * 2,
  }

  // top-left HUD strip — offset right by the tab bar only
  const topLeftHud = {
    x: TAB_BAR_W + pad,
    y: pad,
    w: 300,
    h: 60,
  }

  // map viewport fills the entire screen — panels overlay it
  const mapViewport = {
    x: 0,
    y: 0,
    w: vw,
    h: vh,
  }

  return { mapViewport, topLeftHud, rightSidebar, tabBar }
}
