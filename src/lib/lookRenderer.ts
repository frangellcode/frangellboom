import { LUT_SIZE } from "./looks";

/**
 * The live preview's film look, on the GPU: each video frame through the
 * look's colour table (the same one the export uses, from looks.ts), then
 * the vignette and a fresh patch of grain — as FrameEffects does in
 * LoopEnginePlugin.swift. Draws into its own canvas, which the preview's
 * painter then lays out (and mirrors, or trails for echo).
 */
export interface LookRenderer {
  setLut(lut: Float32Array): void;
  /** One frame of `video`, `width`×`height`; returns the canvas holding it. */
  render(video: HTMLVideoElement, width: number, height: number, overlays: { grain: number; vignette: number }): HTMLCanvasElement;
  dispose(): void;
}

const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D u_video;
uniform sampler3D u_lut;
uniform float u_size;
uniform vec2 u_res;
uniform float u_vignette;
uniform float u_grain;
uniform float u_seed;
uniform float u_dot;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed) * 43758.5453);
}

void main() {
  vec3 c = texture(u_video, v_uv).rgb;
  c = texture(u_lut, (c * (u_size - 1.0) + 0.5) / u_size).rgb;

  // PolarGrid's vignette: clear to 55% of the way out, then black up to
  // 0.35 x strength at 80% and 0.75 x strength at the corners.
  float d = length((v_uv - 0.5) * u_res) / (length(u_res) * 0.5);
  float a = d < 0.55 ? 0.0 : d < 0.8 ? mix(0.0, 0.35, (d - 0.55) / 0.25) : mix(0.35, 0.75, (d - 0.8) / 0.2);
  c *= 1.0 - a * u_vignette;

  // Grey noise laid over with "overlay" at half the grain's strength.
  if (u_grain > 0.0) {
    float n = 0.5 + (hash(floor(gl_FragCoord.xy / u_dot)) - 0.5) * u_grain * 0.5;
    c = mix(2.0 * c * n, 1.0 - 2.0 * (1.0 - c) * (1.0 - n), step(0.5, c));
  }
  outColor = vec4(c, 1.0);
}`;

/** Null where WebGL 2 isn't available: the preview then shows the video as it is. */
export function createLookRenderer(): LookRenderer | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) return null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch (err) {
    console.error(err);
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform("u_video"), 0);
  gl.uniform1i(uniform("u_lut"), 1);
  gl.uniform1f(uniform("u_size"), LUT_SIZE);

  const videoTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ]) {
    gl.texParameteri(gl.TEXTURE_2D, key, value);
  }

  const lutTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, lutTexture);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE],
  ]) {
    gl.texParameteri(gl.TEXTURE_3D, key, value);
  }

  return {
    setLut(lut) {
      // 8 bits a channel: plenty on screen, and filterable everywhere.
      const bytes = new Uint8Array(lut.length);
      for (let i = 0; i < lut.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, lut[i])) * 255);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, LUT_SIZE, LUT_SIZE, LUT_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    },
    render(video, width, height, { grain, vignette }) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.uniform2f(uniform("u_res"), width, height);
      gl.uniform1f(uniform("u_vignette"), vignette);
      gl.uniform1f(uniform("u_grain"), grain);
      gl.uniform1f(uniform("u_seed"), Math.random() * 1000);
      gl.uniform1f(uniform("u_dot"), Math.max(1, (2.4 * Math.min(width, height)) / 1080));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
    dispose() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
