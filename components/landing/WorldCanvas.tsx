"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/layout/theme-provider";

// ── Shaders ──────────────────────────────────────────────────────────────
// Same flowing-glow technique as the original mockup, but recolored to
// BuildMind's actual brand set instead of an invented palette: gold accent,
// indigo, and teal — the same three hues already used for the static
// .bm-hero-glow radial orbs in LandingPageClient.tsx. This just makes that
// existing color story move.

const VERT = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAG = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec3 colorGold;
  uniform vec3 colorIndigo;
  uniform vec3 colorTeal;
  uniform float intensity;

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    float t = time * 0.03;
    float lineWidth = 0.0016;
    float glow = 0.0;
    for (int i = 0; i < 5; i++) {
      glow += lineWidth * float(i * i) / abs(fract(t - 0.01 + float(i) * 0.012) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
    }

    // Three-way blend across the frame, echoing the gold (top-right) /
    // indigo (bottom-left) / teal (accent) orb layout already used behind
    // the hero window.
    float angle = atan(uv.y, uv.x);
    float mixA = smoothstep(-1.0, 1.0, sin(angle));
    float mixB = smoothstep(-1.0, 1.0, cos(angle * 0.7));
    vec3 col = mix(colorIndigo, colorGold, mixA);
    col = mix(col, colorTeal, mixB * 0.35);
    col *= glow;

    float alpha = clamp(glow * intensity, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

interface WorldCanvasProps {
  className?: string;
}

/**
 * Ambient WebGL glow for the landing hero. Drop this in as a replacement
 * (or an added layer) for the static .bm-hero-glow orbs in
 * components/landing/LandingPageClient.tsx.
 *
 * Colors and intensity respond to the app's dark/light-mode toggle via
 * useTheme() — no separate light-theme shader to maintain.
 */
export function WorldCanvas({ className }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, "resolution");
    const timeLoc = gl.getUniformLocation(program, "time");
    const goldLoc = gl.getUniformLocation(program, "colorGold");
    const indigoLoc = gl.getUniformLocation(program, "colorIndigo");
    const tealLoc = gl.getUniformLocation(program, "colorTeal");
    const intensityLoc = gl.getUniformLocation(program, "intensity");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Same hex values already in use in LandingPageClient.tsx's hero glow
    // orbs — dark-mode accent gold (#E8C547), indigo (#5B6CF0), teal
    // (#4AB8B0 from .gradient-text). Light mode swaps in the darker
    // light-mode accent (#B5920A) and dims everything, since it now sits
    // on a bright surface instead of near-black.
    function applyColors() {
      if (theme === "light") {
        gl!.uniform3f(goldLoc, 181 / 255, 146 / 255, 10 / 255);
        gl!.uniform3f(indigoLoc, 91 / 255, 108 / 255, 240 / 255);
        gl!.uniform3f(tealLoc, 26 / 255, 122 / 255, 74 / 255);
        gl!.uniform1f(intensityLoc, 0.16);
      } else {
        gl!.uniform3f(goldLoc, 232 / 255, 197 / 255, 71 / 255);
        gl!.uniform3f(indigoLoc, 91 / 255, 108 / 255, 240 / 255);
        gl!.uniform3f(tealLoc, 74 / 255, 184 / 255, 176 / 255);
        gl!.uniform1f(intensityLoc, 0.32);
      }
    }
    applyColors();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = canvas!.clientWidth * dpr;
      canvas!.height = canvas!.clientHeight * dpr;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(resLoc, canvas!.width, canvas!.height);
    }
    window.addEventListener("resize", resize);
    resize();

    let raf = 0;
    let start = 0;
    function frame(ts: number) {
      if (!start) start = ts;
      gl!.uniform1f(timeLoc, (ts - start) / 1000);
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      gl!.deleteProgram(program);
      gl!.deleteShader(vs);
      gl!.deleteShader(fs);
      gl!.deleteBuffer(buf);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
