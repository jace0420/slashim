// HUD layout zone system — computes pixel rects for each UI zone based on viewport size.
// zones are plain objects with { x, y, w, h } that get recalculated on resize.

const SIDEBAR_W = 220
const TAB_STRIP_H = 140
const HUD_PAD = 8       // padding from screen edges
const NARRATIVE_W = 280
const NARRATIVE_H = 200

export const DEFAULT_HUD_PARAMS = {
  sidebarW: SIDEBAR_W,
  tabStripH: TAB_STRIP_H,
  narrativeW: NARRATIVE_W,
  narrativeH: NARRATIVE_H,
  hudPad: HUD_PAD,
}

// computes layout zones from viewport dimensions + tunable params.
// returns an object of { x, y, w, h } rects for each zone.
export function computeLayout(vw, vh, p = DEFAULT_HUD_PARAMS) {
  const pad = p.hudPad

  // bottom tab strip spans full width, sits at the bottom
  const tabStrip = {
    x: 0,
    y: vh - p.tabStripH,
    w: vw,
    h: p.tabStripH,
  }

  // right sidebar — full height above the tab strip
  const rightSidebar = {
    x: vw - p.sidebarW - pad,
    y: pad,
    w: p.sidebarW,
    h: vh - p.tabStripH - pad,
  }

  // narrative log — bottom-left, above the tab strip
  const narrative = {
    x: pad,
    y: vh - p.tabStripH - p.narrativeH - pad,
    w: p.narrativeW,
    h: p.narrativeH,
  }

  // top-left HUD strip for clock + sim controls
  const topLeftHud = {
    x: pad,
    y: pad,
    w: 300,
    h: 60,
  }

  // map viewport fills everything — it's the background layer so it spans the whole screen.
  // the map container itself is clipped/masked to avoid drawing under the tab strip.
  const mapViewport = {
    x: 0,
    y: 0,
    w: vw,
    h: vh - p.tabStripH,
  }

  return { mapViewport, topLeftHud, rightSidebar, narrative, tabStrip }
}
