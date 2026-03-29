import { Filter, GlProgram } from 'pixi.js'

// default PixiJS filter vertex shader no custom vertex logic needed
const FILTER_VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec2 filterVertexPosition() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return position;
}

vec2 filterTextureCoord() {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main() {
  gl_Position = vec4(filterVertexPosition(), 0.0, 1.0);
  vTextureCoord = filterTextureCoord();
}
`

// single point-light fragment shader
// all light params come in as uniforms so tweakpane can mutate them at 60fps
const POINT_LIGHT_FRAG = `
in vec2 vTextureCoord;

uniform sampler2D uTexture;

// point light
uniform vec2  uLightPos;       // 0..1 UV space
uniform vec3  uLightColor;     // linear RGB
uniform float uLightIntensity;
uniform float uLightRadius;    // in UV units (1.0 = full width)
uniform float uLightFalloff;   // exponent — higher = sharper edge

// ambient
uniform vec3  uAmbientColor;   // linear RGB
uniform float uAmbientIntensity;

// aspect ratio correction so the light looks circular regardless of viewport shape
uniform float uAspectRatio;    // width / height

void main() {
  vec4 diffuse = texture(uTexture, vTextureCoord);

  // aspect-corrected distance from fragment to light
  vec2 delta = vTextureCoord - uLightPos;
  delta.x *= uAspectRatio;
  float dist = length(delta);

  float attenuation = pow(max(0.0, 1.0 - dist / uLightRadius), uLightFalloff);
  vec3 light = uLightColor * uLightIntensity * attenuation;

  vec3 ambient = uAmbientColor * uAmbientIntensity;

  vec3 lit = diffuse.rgb * (ambient + light);
  gl_FragColor = vec4(lit, diffuse.a);
}
`

export const DEFAULT_LIGHT_PARAMS = {
  lightPos: { x: 0.196, y: 0.228 },
  lightColor: { r: 1.0, g: 0.85, b: 0.6 },  // warm candlelight-ish
  lightIntensity: 1.74,
  lightRadius: 2.00,
  lightFalloff: 2.4,
  ambientColor: { r: 0.08, g: 0.05, b: 0.12 },  // deep dark purple-ish
  ambientIntensity: 0.70,
}

// three-layer value noise — smooth random signal at a given frequency band
// lerpPerSec controls how quickly it chases new targets (higher = snappier)
class ValueNoise {
  constructor(minMs, maxMs, lerpPerSec) {
    this._min = minMs
    this._max = maxMs
    this._lerpPerSec = lerpPerSec
    this.value = 0
    this._target = 0
    this._timer = 0
    this._schedule()
  }

  _schedule() {
    this._timer = this._min + Math.random() * (this._max - this._min)
    this._target = Math.random() * 2 - 1  // -1..1
  }

  tick(dt) {
    this._timer -= dt
    if (this._timer <= 0) this._schedule()
    this.value += (this._target - this.value) * Math.min(1, this._lerpPerSec * dt / 1000)
    return this.value
  }
}

export const DEFAULT_FLICKER_PARAMS = {
  enabled: true,
  intensityScale: 0.06,  // fraction of base intensity — max variation range
  radiusScale: 0.15,     // fraction of base radius — max variation range
  swayScale: 0.010,      // UV units of max position sway
  speed: 2.0,            // overall animation speed multiplier
}

// attaches a flicker animation to an existing lighting object via the PixiJS ticker
// liveBase is the live params.light object from game.js — read each frame so tweaks propagate
// returns { stop() } to remove the tick listener on cleanup
export function createFlicker(lighting, ticker, liveBase, flickerParams = DEFAULT_FLICKER_PARAMS) {
  const fp = flickerParams

  // three intensity layers: slow drift, mid flutter, fast twitch
  const slowI = new ValueNoise(700, 1400, 2)
  const midI  = new ValueNoise(140, 320, 13)
  const fastI = new ValueNoise(45, 110, 38)

  // independent x/y sway — slower and gentler than intensity layers
  const swayX = new ValueNoise(500, 1100, 1.5)
  const swayY = new ValueNoise(550, 1200, 1.4)

  // dip state — sporadic sharp drops that recover organically
  let dipOffset = 0
  let dipTimer = _nextDipInterval()

  function _nextDipInterval() {
    return 5000 + Math.random() * 10000  // 5–15s between dips
  }

  function tick(t) {
    if (!fp.enabled) return

    const dt = t.deltaMS * fp.speed
    const realDt = t.deltaMS  // dip timer uses unscaled time

    // combine three noise layers into a -1..1 intensity signal
    const noise = slowI.tick(dt) * 0.50 + midI.tick(dt) * 0.35 + fastI.tick(dt) * 0.15

    // dip event: occasional sudden drop, then smooth organic recovery
    dipTimer -= realDt
    if (dipTimer <= 0) {
      dipOffset = -(0.45 + Math.random() * 0.40)
      dipTimer = _nextDipInterval()
    }
    dipOffset += (0 - dipOffset) * Math.min(1, 7 * realDt / 1000)

    const intensityMod = noise * fp.intensityScale + dipOffset * fp.intensityScale * 3
    lighting.uniforms.uLightIntensity = Math.max(0.02, liveBase.intensity + liveBase.intensity * intensityMod)

    // radius pulses gently — driven mainly by the slow layer
    const rNoise = slowI.value * 0.6 + midI.value * 0.4
    lighting.uniforms.uLightRadius = Math.max(0.05, liveBase.radius + liveBase.radius * rNoise * fp.radiusScale)

    // position sway — much slower cadence, fractional UV drift
    const swayDt = t.deltaMS * fp.speed * 0.4
    const sx = swayX.tick(swayDt)
    const sy = swayY.tick(swayDt)
    lighting.setLightPos(
      liveBase.x + sx * fp.swayScale,
      liveBase.y + sy * fp.swayScale,
    )
  }

  ticker.add(tick)

  return {
    stop() {
      ticker.remove(tick)
    },
  }
}

// converts a { r, g, b } object (0..1 floats) to a [r, g, b] array for the uniform
function rgbToArray(color) {
  return [color.r, color.g, color.b]
}

export function createLightingFilter(params = DEFAULT_LIGHT_PARAMS) {
  const glProgram = new GlProgram({ vertex: FILTER_VERT, fragment: POINT_LIGHT_FRAG })

  const filter = new Filter({
    glProgram,
    resources: {
      lightUniforms: {
        uLightPos:        { value: [params.lightPos.x, params.lightPos.y], type: 'vec2<f32>' },
        uLightColor:      { value: rgbToArray(params.lightColor),           type: 'vec3<f32>' },
        uLightIntensity:  { value: params.lightIntensity,                   type: 'f32' },
        uLightRadius:     { value: params.lightRadius,                      type: 'f32' },
        uLightFalloff:    { value: params.lightFalloff,                     type: 'f32' },
        uAmbientColor:    { value: rgbToArray(params.ambientColor),         type: 'vec3<f32>' },
        uAmbientIntensity:{ value: params.ambientIntensity,                 type: 'f32' },
        uAspectRatio:     { value: 1.0,                                     type: 'f32' },
      },
    },
  })

  // expose direct uniform mutation helpers so callers don't need to know the internals
  const uniforms = filter.resources.lightUniforms.uniforms

  return {
    filter,
    uniforms,
    setLightPos(x, y) {
      uniforms.uLightPos = [x, y]
    },
    setLightColor(color) {
      uniforms.uLightColor = rgbToArray(color)
    },
    setAmbientColor(color) {
      uniforms.uAmbientColor = rgbToArray(color)
    },
    setAspectRatio(ratio) {
      uniforms.uAspectRatio = ratio
    },
  }
}
