/**
 * Interactive point-cloud retainer (expo-gl + three.js).
 *
 * Gestures: one-finger drag rotates (with inertia), pinch zooms, double-tap
 * resets, tap selects a sensing region or a tooth. Idle: a slow drift and
 * float that yields immediately to the user.
 */
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, GestureResponderEvent, LayoutChangeEvent, PanResponder, Platform, StyleProp, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { frameFor } from '../domain/arch';
import type { Arch } from '../domain/teeth';
import { buildRetainerCloud, PointCloud } from './retainerGeometry';
import { paintCloud, Region } from './regions';

export interface CameraState {
  theta: number;
  phi: number;
  radius: number;
  target: THREE.Vector3;
  vTheta: number;
  vPhi: number;
  /** View that last took control (so shared cameras apply inertia once). */
  owner?: number;
}

export const DEFAULT_CAMERA = { theta: 0.16, phi: 0.86, radius: 112 };

export function makeCamera(): CameraState {
  return { ...DEFAULT_CAMERA, target: new THREE.Vector3(0, 0, 0), vTheta: 0, vPhi: 0 };
}

export interface Selection {
  tooth?: number;
  siteId?: string;
}

interface Props {
  /** Which retainer to draw. Changing it requires a remount (use `key={arch}`). */
  arch?: Arch;
  regions: Region[];
  /** Hide physical markers and chemistry overlays while retaining attention shading. */
  showSensors?: boolean;
  style?: StyleProp<ViewStyle>;
  selectedTooth?: number | null;
  selectedSiteId?: string | null;
  onSelect?: (s: Selection | null) => void;
  /** Move the camera toward this tooth. */
  focusTooth?: number | null;
  interactive?: boolean;
  autoRotate?: boolean;
  /** Fade the cloud in on mount. */
  reveal?: boolean;
  /** Share one camera between several views (before/after comparison). */
  sharedCamera?: CameraState;
  /** Receives the screen position of the selected region (for a floating label). */
  labelPos?: Animated.ValueXY;
  resetSignal?: number;
  active?: boolean;
  /** Initial zoom multiplier (1 = default). */
  zoom?: number;
}

const CLOUDS: Partial<Record<Arch, PointCloud>> = {};
const getCloud = (a: Arch) => (CLOUDS[a] ??= buildRetainerCloud(a));

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aTooth;
attribute float aRand;
attribute float aRegion;
attribute float aOutline;
uniform float uTime;
uniform float uSize;
uniform float uScale;
uniform float uSelTooth;
uniform float uSelRegion;
uniform float uReveal;
uniform float uNear;
uniform float uFar;
varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
void main() {
  vGlow = 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 nv = normalize(normalMatrix * normal);
  vec3 L = normalize(vec3(0.35, 0.85, 0.55));
  float diff = max(dot(nv, L), 0.0);
  float rim = pow(1.0 - abs(nv.z), 2.0);
  float light = 0.5 + 0.38 * diff + 0.32 * rim;
  float depth = -mv.z;
  float fog = clamp(1.0 - (depth - uNear) / (uFar - uNear), 0.28, 1.0);
  vec3 col = aColor;
  float colored = step(0.0, aRegion);
  float a = light * fog;
  float size = uSize * (0.82 + 0.36 * aRand);
  if (uSelTooth > 0.0) {
    float sel = 1.0 - step(0.5, abs(aTooth - uSelTooth));
    a *= mix(0.42, 1.18, sel);
  }
  if (uSelRegion >= 0.0) {
    float sr = (1.0 - step(0.5, abs(aRegion - uSelRegion))) * step(0.0, aRegion);
    a *= mix(uSelTooth > 0.0 ? 1.0 : 0.7, 1.6, sr);
    size *= mix(1.0, 1.35, sr);
  }
  size *= 1.0 + aOutline * 0.55;
  a *= 1.0 + aOutline * 0.35;
  size *= 1.0 + colored * 0.55;
  a *= 1.0 + colored * 0.45;
  vGlow = colored;
  float rv = smoothstep(aRand * 0.75, aRand * 0.75 + 0.25, uReveal);
  a *= rv;
  a *= 0.93 + 0.07 * sin(uTime * 1.2 + aRand * 40.0);
  gl_PointSize = max(1.0, size * uScale / depth);
  vColor = col;
  vAlpha = a;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.15, d);
  // Coloured (measured) points carry a soft halo so regions read as light, not paint.
  float halo = vGlow * smoothstep(0.5, 0.0, d) * 0.35;
  gl_FragColor = vec4(vColor * (0.85 + 0.3 * min(vAlpha, 1.2)), max(core * 0.75, halo + core) * clamp(vAlpha, 0.0, 1.0));
}
`;

// Discrete SPOT markers keep every configured location visible, including uncalibrated sites.
const SENSOR_VERT = `
attribute vec3 aSensorColor;
attribute float aReference;
varying vec3 vSensorColor;
varying float vReference;
void main() {
  vSensorColor = aSensorColor;
  vReference = aReference;
  gl_PointSize = aReference > 0.5 ? 9.0 : 7.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SENSOR_FRAG = `
varying vec3 vSensorColor;
varying float vReference;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.48 || (vReference > 0.5 && d < 0.29)) discard;
  gl_FragColor = vec4(d > 0.38 && vReference < 0.5 ? vec3(0.04) : vSensorColor, 1.0);
}`;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function RetainerView(props: Props) {
  const p = useRef(props);
  p.current = props;
  const cloud = useMemo(() => getCloud(props.arch ?? 'upper'), [props.arch]);
  const cam = useRef<CameraState>(props.sharedCamera ?? makeCamera());
  if (props.sharedCamera) cam.current = props.sharedCamera;
  const layout = useRef({ w: 1, h: 1 });
  const viewId = useRef(Math.random()).current;
  const interaction = useRef({ last: 0, active: false });
  const focusAnim = useRef<null | { from: Omit<CameraState, 'vTheta' | 'vPhi'>; to: Omit<CameraState, 'vTheta' | 'vPhi'>; t0: number; dur: number }>(null);
  const colorBuf = useRef({
    current: new Float32Array(cloud.count * 3).fill(0.86),
    target: new Float32Array(cloud.count * 3),
    region: new Float32Array(cloud.count).fill(-1),
    outline: new Float32Array(cloud.count),
    dirty: true,
    mixT: 1,
  });
  const regionIds = useRef<string[]>([]);
  const projector = useRef<{ camera?: THREE.PerspectiveCamera; group?: THREE.Group }>({});
  const raf = useRef<number | null>(null);

  // Repaint target colours whenever the measurement overlay changes.
  useEffect(() => {
    const b = colorBuf.current;
    paintCloud(cloud, props.showSensors === false ? props.regions.map(r => r.markerColor ? r : { ...r, intensity: 0, outline: false }) : props.regions, { color: b.target, region: b.region, outline: b.outline });
    regionIds.current = props.regions.map((r) => r.id);
    b.dirty = true;
    b.mixT = 0;
  }, [props.regions, props.showSensors, cloud]);

  // Camera focus on a tooth.
  useEffect(() => {
    const c = cam.current;
    const from = { theta: c.theta, phi: c.phi, radius: c.radius, target: c.target.clone() };
    let to: Omit<CameraState, 'vTheta' | 'vPhi'>;
    if (props.focusTooth) {
      const f = frameFor(props.focusTooth);
      const center = cloud.toothCenters.get(props.focusTooth);
      if (!f || !center) return;
      const theta = Math.atan2(f.normal[0], f.normal[2]);
      to = { theta, phi: 0.92, radius: 58 * (props.zoom ?? 1), target: new THREE.Vector3(center[0] * 0.75, center[1], center[2] * 0.75) };
    } else {
      to = { theta: c.theta, phi: DEFAULT_CAMERA.phi, radius: DEFAULT_CAMERA.radius * (props.zoom ?? 1), target: new THREE.Vector3() };
    }
    // Take the short way round.
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2;
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2;
    c.vTheta = 0;
    c.vPhi = 0;
    focusAnim.current = { from, to, t0: Date.now(), dur: 950 };
  }, [props.focusTooth, cloud, props.zoom]);

  useEffect(() => {
    if (!props.resetSignal) return;
    const c = cam.current;
    focusAnim.current = {
      from: { theta: c.theta, phi: c.phi, radius: c.radius, target: c.target.clone() },
      to: { ...DEFAULT_CAMERA, radius: DEFAULT_CAMERA.radius * (props.zoom ?? 1), target: new THREE.Vector3() },
      t0: Date.now(),
      dur: 900,
    };
  }, [props.resetSignal, props.zoom]);

  useEffect(() => {
    if (props.zoom && !props.sharedCamera) cam.current.radius = DEFAULT_CAMERA.radius * props.zoom;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  // ── Picking ──
  const pick = (x: number, y: number) => {
    const { camera, group } = projector.current;
    if (!camera || !group || !p.current.onSelect) return;
    const v = new THREE.Vector3();
    const toScreen = (pt: [number, number, number]) => {
      v.set(pt[0], pt[1], pt[2]).applyMatrix4(group.matrixWorld).project(camera);
      return { x: ((v.x + 1) / 2) * layout.current.w, y: ((1 - v.y) / 2) * layout.current.h, z: v.z };
    };
    let best: { d: number; id: string; tooth: number } | null = null;
    for (const r of p.current.showSensors === false ? [] : p.current.regions) {
      const s = toScreen([r.anchor[0] + cloud.offset[0], r.anchor[1] + cloud.offset[1], r.anchor[2] + cloud.offset[2]]);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 30 && (!best || d < best.d)) best = { d, id: r.id, tooth: r.tooth };
    }
    if (best) {
      p.current.onSelect({ tooth: best.tooth, siteId: best.id });
      return;
    }
    let bt: { d: number; tooth: number } | null = null;
    for (const [tooth, c] of cloud.toothCenters) {
      const s = toScreen(c);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 34 && (!bt || d < bt.d)) bt = { d, tooth };
    }
    p.current.onSelect(bt ? { tooth: bt.tooth } : null);
  };

  // ── Gestures ──
  const g = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, lastT: 0, pinch: 0, startR: 0, t0: 0, lastTap: 0, moved: false });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => p.current.interactive !== false,
        onMoveShouldSetPanResponder: () => p.current.interactive !== false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          Object.assign(g.current, { startX: locationX, startY: locationY, lastX: e.nativeEvent.pageX, lastY: e.nativeEvent.pageY, lastT: Date.now(), t0: Date.now(), moved: false, pinch: 0 });
          interaction.current.active = true;
          interaction.current.last = Date.now();
          cam.current.vTheta = 0;
          cam.current.vPhi = 0;
          cam.current.owner = viewId;
          focusAnim.current = null;
        },
        onPanResponderMove: (e, gs) => {
          const touches = e.nativeEvent.touches ?? [];
          const c = cam.current;
          interaction.current.last = Date.now();
          if (touches.length >= 2) {
            const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
            if (!g.current.pinch) {
              g.current.pinch = d;
              g.current.startR = c.radius;
            } else {
              c.radius = Math.min(220, Math.max(38, g.current.startR * (g.current.pinch / d)));
            }
            g.current.moved = true;
            return;
          }
          if (Math.abs(gs.dx) + Math.abs(gs.dy) > 6) g.current.moved = true;
          const now = Date.now();
          const dx = e.nativeEvent.pageX - g.current.lastX;
          const dy = e.nativeEvent.pageY - g.current.lastY;
          const dt = Math.max(1, now - g.current.lastT);
          c.theta -= dx * 0.0085;
          c.phi = Math.min(Math.PI - 0.12, Math.max(0.12, c.phi - dy * 0.0085));
          c.vTheta = (-dx * 0.0085 * 16) / dt;
          c.vPhi = (-dy * 0.0085 * 16) / dt;
          g.current.lastX = e.nativeEvent.pageX;
          g.current.lastY = e.nativeEvent.pageY;
          g.current.lastT = now;
        },
        onPanResponderRelease: (e) => {
          interaction.current.active = false;
          interaction.current.last = Date.now();
          const now = Date.now();
          if (!g.current.moved && now - g.current.t0 < 300) {
            cam.current.vTheta = 0;
            cam.current.vPhi = 0;
            if (now - g.current.lastTap < 300) {
              g.current.lastTap = 0;
              const c = cam.current;
              focusAnim.current = {
                from: { theta: c.theta, phi: c.phi, radius: c.radius, target: c.target.clone() },
                to: { ...DEFAULT_CAMERA, radius: DEFAULT_CAMERA.radius * (p.current.zoom ?? 1), target: new THREE.Vector3() },
                t0: now,
                dur: 900,
              };
              p.current.onSelect?.(null);
            } else {
              g.current.lastTap = now;
              pick(g.current.startX, g.current.startY);
            }
          }
          // Stale velocity if the finger paused before lifting.
          if (now - g.current.lastT > 80) {
            cam.current.vTheta = 0;
            cam.current.vPhi = 0;
          }
          void e;
        },
        onPanResponderTerminate: () => {
          interaction.current.active = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    layout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const webCanvas = (gl as unknown as { canvas?: HTMLCanvasElement }).canvas;
    const canvas =
      Platform.OS === 'web' && webCanvas
        ? webCanvas
        : ({
            width: W,
            height: H,
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
            clientHeight: H,
            getContext: () => gl,
          } as unknown as HTMLCanvasElement);
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);

    if (Platform.OS === 'web' && webCanvas) {
      webCanvas.addEventListener(
        'wheel',
        (ev: WheelEvent) => {
          ev.preventDefault();
          const c = cam.current;
          c.radius = Math.min(220, Math.max(38, c.radius * (1 + ev.deltaY * 0.001)));
          interaction.current.last = Date.now();
        },
        { passive: false },
      );
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 1, 1000);
    const group = new THREE.Group();
    scene.add(group);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(cloud.normals, 3));
    const aColor = new THREE.BufferAttribute(colorBuf.current.current, 3);
    const aRegion = new THREE.BufferAttribute(colorBuf.current.region, 1);
    const aOutline = new THREE.BufferAttribute(colorBuf.current.outline, 1);
    geo.setAttribute('aColor', aColor);
    geo.setAttribute('aRegion', aRegion);
    geo.setAttribute('aOutline', aOutline);
    geo.setAttribute('aTooth', new THREE.BufferAttribute(cloud.tooth, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(cloud.rand, 1));

    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0.33 },
      uScale: { value: H / (2 * Math.tan((camera.fov * Math.PI) / 360)) },
      uSelTooth: { value: 0 },
      uSelRegion: { value: -1 },
      uReveal: { value: p.current.reveal ? 0 : 1 },
      uNear: { value: 60 },
      uFar: { value: 180 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    group.add(new THREE.Points(geo, mat));

    const sensorGeometry = new THREE.BufferGeometry();
    const sensorMaterial = new THREE.ShaderMaterial({ vertexShader: SENSOR_VERT, fragmentShader: SENSOR_FRAG, transparent: true, depthTest: false, depthWrite: false });
    const sensorPoints = new THREE.Points(sensorGeometry, sensorMaterial);
    sensorPoints.frustumCulled = false;
    sensorPoints.renderOrder = 2;
    group.add(sensorPoints);
    let lastSensorRegions: Region[] | undefined;

    projector.current = { camera, group };
    const t0 = Date.now();
    let lastW = W;
    let lastH = H;
    const v = new THREE.Vector3();

    const loop = () => {
      raf.current = requestAnimationFrame(loop);
      const pr = p.current;
      if (pr.active === false) return;
      sensorPoints.visible = pr.showSensors !== false;
      if (pr.regions !== lastSensorRegions) {
        lastSensorRegions = pr.regions;
        const positions: number[] = [];
        const markerColors: number[] = [];
        for (const region of pr.regions) {
          positions.push(region.anchor[0] + cloud.offset[0], region.anchor[1] + cloud.offset[1], region.anchor[2] + cloud.offset[2]);
          const rgb = Number.parseInt((region.markerColor ?? region.color).slice(1), 16);
          markerColors.push(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255);
        }
        sensorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        sensorGeometry.setAttribute('aSensorColor', new THREE.Float32BufferAttribute(markerColors, 3));
        sensorGeometry.setAttribute('aReference', new THREE.Float32BufferAttribute(pr.regions.map(region => region.intensity === 0 ? 1 : 0), 1));
      }
      const now = Date.now();
      const t = (now - t0) / 1000;

      const bw = gl.drawingBufferWidth;
      const bh = gl.drawingBufferHeight;
      if (bw !== lastW || bh !== lastH) {
        lastW = bw;
        lastH = bh;
        renderer.setSize(bw, bh, false);
        uniforms.uScale.value = bh / (2 * Math.tan((camera.fov * Math.PI) / 360));
      }
      camera.aspect = bw / Math.max(1, bh);

      const c = cam.current;
      const fa = focusAnim.current;
      if (fa) {
        const k = Math.min(1, (now - fa.t0) / fa.dur);
        const e = ease(k);
        c.theta = fa.from.theta + (fa.to.theta - fa.from.theta) * e;
        c.phi = fa.from.phi + (fa.to.phi - fa.from.phi) * e;
        c.radius = fa.from.radius + (fa.to.radius - fa.from.radius) * e;
        c.target.lerpVectors(fa.from.target, fa.to.target, e);
        if (k >= 1) focusAnim.current = null;
      } else if (!interaction.current.active && (c.owner == null || c.owner === viewId)) {
        // Inertia
        c.theta += c.vTheta;
        c.phi = Math.min(Math.PI - 0.12, Math.max(0.12, c.phi + c.vPhi));
        c.vTheta *= 0.93;
        c.vPhi *= 0.9;
        const idle = now - interaction.current.last > 3500;
        if (idle && pr.autoRotate !== false && !pr.selectedTooth && !pr.focusTooth && !pr.sharedCamera) {
          c.theta += 0.0016;
          c.phi += (DEFAULT_CAMERA.phi - c.phi) * 0.004;
        }
      }
      // Fit the arch's width on narrow (portrait) viewports.
      const fit = Math.max(1, 1.5 / Math.max(0.3, camera.aspect));
      const dist = c.radius * fit;
      camera.position.set(
        c.target.x + dist * Math.sin(c.phi) * Math.sin(c.theta),
        c.target.y + dist * Math.cos(c.phi),
        c.target.z + dist * Math.sin(c.phi) * Math.cos(c.theta),
      );
      camera.lookAt(c.target);
      camera.updateProjectionMatrix();
      uniforms.uNear.value = dist - 40;
      uniforms.uFar.value = dist + 50;

      // Ambient float
      group.position.y = Math.sin(t * 0.7) * 0.6;
      group.rotation.z = Math.sin(t * 0.4) * 0.012;
      group.updateMatrixWorld();

      // Colour transition
      const b = colorBuf.current;
      if (b.dirty) {
        b.mixT = Math.min(1, b.mixT + 0.06);
        const k = 0.18 + b.mixT * 0.5;
        const cur = b.current;
        const tgt = b.target;
        for (let i = 0; i < cur.length; i++) cur[i] += (tgt[i] - cur[i]) * k;
        aColor.needsUpdate = true;
        aRegion.needsUpdate = true;
        aOutline.needsUpdate = true;
        if (b.mixT >= 1) {
          cur.set(tgt);
          b.dirty = false;
        }
      }

      uniforms.uTime.value = t;
      uniforms.uSelTooth.value = pr.selectedTooth ?? 0;
      uniforms.uSelRegion.value = pr.selectedSiteId ? regionIds.current.indexOf(pr.selectedSiteId) : -1;
      if (pr.reveal && uniforms.uReveal.value < 1) uniforms.uReveal.value = Math.min(1, uniforms.uReveal.value + 0.012);
      // Floating label position
      if (pr.labelPos && pr.selectedSiteId) {
        const r = pr.regions.find((x) => x.id === pr.selectedSiteId);
        if (r) {
          v.set(r.anchor[0] + cloud.offset[0], r.anchor[1] + cloud.offset[1], r.anchor[2] + cloud.offset[2])
            .applyMatrix4(group.matrixWorld)
            .project(camera);
          pr.labelPos.setValue({ x: ((v.x + 1) / 2) * layout.current.w, y: ((1 - v.y) / 2) * layout.current.h });
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    loop();
  };

  return (
    <View style={props.style} onLayout={onLayout} {...pan.panHandlers}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} msaaSamples={4} />
    </View>
  );
}
