import { Filter, GlProgram } from 'pixi.js'

// default PixiJS filter vertex shader — no custom vertex logic needed
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
  lightPos: { x: 0.5, y: 0.5 },
  lightColor: { r: 1.0, g: 0.85, b: 0.6 },  // warm candlelight-ish
  lightIntensity: 1.8,
  lightRadius: 0.55,
  lightFalloff: 2.2,
  ambientColor: { r: 0.08, g: 0.05, b: 0.12 },  // deep dark purple-ish
  ambientIntensity: 0.35,
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
