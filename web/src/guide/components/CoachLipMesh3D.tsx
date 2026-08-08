import { useEffect, useRef } from "react";
import * as THREE from "three";

type CoachLipMesh3DProps = {
  openness: number;
  width: number;
  roundness: number;
};

const OUTER_N = 24;
const INNER_N = 20;
const SMOOTH = 0.22;

/**
 * Parametric 3D coach mouth for Watch phase.
 * Does NOT use MediaPipe landmarks — builds a clean lip ribbon from
 * openness / width / roundness so shapes stay readable.
 */
export function CoachLipMesh3D({
  openness,
  width,
  roundness,
}: CoachLipMesh3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const shapeRef = useRef({ openness, width, roundness });
  shapeRef.current = { openness, width, roundness };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const widthPx = mount.clientWidth || 280;
    const heightPx = mount.clientHeight || 220;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, widthPx / heightPx, 0.01, 40);
    camera.position.set(0, 0.02, 1.65);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(widthPx, heightPx);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xfff0e0, 1.2);
    const key = new THREE.DirectionalLight(0xffe8d4, 1.0);
    key.position.set(0.45, 0.8, 1.4);
    const fill = new THREE.DirectionalLight(0xd4a574, 0.32);
    fill.position.set(-0.8, -0.2, 0.6);
    const rim = new THREE.DirectionalLight(0xffc9a8, 0.22);
    rim.position.set(0, 0.2, -1.2);
    scene.add(ambient, key, fill, rim);

    const lipMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c24a38"),
      emissive: new THREE.Color("#4a1812"),
      emissiveIntensity: 0.14,
      roughness: 0.55,
      metalness: 0.03,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const cavityMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1a1210"),
      roughness: 1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    });

    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonPos = new Float32Array((OUTER_N + INNER_N) * 3);
    const ribbonTarget = new Float32Array(ribbonPos.length);
    const ribbonIdx: number[] = [];
    for (let i = 0; i < OUTER_N; i += 1) {
      const next = (i + 1) % OUTER_N;
      const j = Math.floor((i / OUTER_N) * INNER_N) % INNER_N;
      const jNext = Math.floor((next / OUTER_N) * INNER_N) % INNER_N;
      ribbonIdx.push(i, OUTER_N + j, next, next, OUTER_N + j, OUTER_N + jNext);
    }
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(ribbonPos, 3));
    ribbonGeo.setIndex(ribbonIdx);
    const ribbon = new THREE.Mesh(ribbonGeo, lipMat);

    const cavityGeo = new THREE.BufferGeometry();
    const cavityPos = new Float32Array((INNER_N + 1) * 3);
    const cavityTarget = new Float32Array(cavityPos.length);
    const cavityIdx: number[] = [];
    for (let i = 0; i < INNER_N; i += 1) {
      cavityIdx.push(0, i + 1, ((i + 1) % INNER_N) + 1);
    }
    cavityGeo.setAttribute("position", new THREE.BufferAttribute(cavityPos, 3));
    cavityGeo.setIndex(cavityIdx);
    const cavity = new THREE.Mesh(cavityGeo, cavityMat);

    const group = new THREE.Group();
    group.add(cavity, ribbon);
    scene.add(group);

    let dragging = false;
    let prevX = 0;
    let prevY = 0;
    let rotY = 0.15;
    let rotX = -0.08;
    let seeded = false;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      mount.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      try {
        mount.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      rotY += dx * 0.012;
      rotX += dy * 0.01;
      rotY = Math.max(-1.0, Math.min(1.0, rotY));
      rotX = Math.max(-0.5, Math.min(0.45, rotX));
    };
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerUp);

    const lerpBuf = (cur: Float32Array, target: Float32Array, alpha: number) => {
      for (let i = 0; i < cur.length; i += 1) {
        cur[i] += (target[i] - cur[i]) * alpha;
      }
    };

    /** Build lip curves in local 3D space (already camera-facing units). */
    const writeShape = (
      o: number,
      w: number,
      r: number,
      outOuter: Float32Array,
      outInner: Float32Array,
    ) => {
      const open = Math.min(1, Math.max(0, o));
      const wide = Math.min(1, Math.max(0, w));
      const round = Math.min(1, Math.max(0, r));

      // Base mouth size in scene units
      const rx = 0.28 + wide * 0.32 - round * 0.08;
      const upperRy = 0.04 + open * 0.22;
      const lowerRy = 0.05 + open * 0.28;
      // Round vowels push lips forward and make opening more circular
      const zPush = 0.02 + round * 0.16;
      const circleBlend = round * 0.55;

      const ring = (
        n: number,
        scaleX: number,
        upY: number,
        loY: number,
        zBase: number,
        dest: Float32Array,
      ) => {
        for (let i = 0; i < n; i += 1) {
          const u = i / n;
          // Left → upper → right → lower (readable lip loop)
          const a = Math.PI - u * Math.PI * 2;
          const x = Math.cos(a) * scaleX;
          const s = Math.sin(a);
          const ey = s >= 0 ? s * upY : s * loY;
          const circY = s * ((upY + loY) * 0.5);
          const y = ey * (1 - circleBlend) + circY * circleBlend;
          const bow =
            s > 0.2 ? -0.018 * (1 - round) * Math.pow(Math.cos(a), 2) : 0;
          const z =
            zBase +
            zPush * (0.35 + 0.65 * (1 - Math.abs(x) / Math.max(scaleX, 0.01))) -
            Math.abs(s) * 0.01;

          dest[i * 3] = x;
          dest[i * 3 + 1] = y + bow;
          dest[i * 3 + 2] = z;
        }
      };

      ring(OUTER_N, rx, upperRy, lowerRy, 0.02, outOuter);
      ring(
        INNER_N,
        rx * (0.55 + open * 0.12),
        upperRy * 0.62,
        lowerRy * 0.62,
        -0.01,
        outInner,
      );
    };

    const outerBuf = new Float32Array(OUTER_N * 3);
    const innerBuf = new Float32Array(INNER_N * 3);

    const applyTarget = () => {
      const { openness: o, width: w, roundness: rd } = shapeRef.current;
      writeShape(o, w, rd, outerBuf, innerBuf);
      ribbonTarget.set(outerBuf);
      ribbonTarget.set(innerBuf, OUTER_N * 3);

      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < INNER_N; i += 1) {
        cx += innerBuf[i * 3];
        cy += innerBuf[i * 3 + 1];
        cz += innerBuf[i * 3 + 2];
      }
      cx /= INNER_N;
      cy /= INNER_N;
      cz /= INNER_N;
      cavityTarget[0] = cx;
      cavityTarget[1] = cy;
      cavityTarget[2] = cz - 0.02;
      cavityTarget.set(innerBuf, 3);

      if (!seeded) {
        ribbonPos.set(ribbonTarget);
        cavityPos.set(cavityTarget);
        seeded = true;
      }
    };

    const onResize = () => {
      const w = mount.clientWidth || 280;
      const h = mount.clientHeight || 220;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(mount);

    let raf = 0;
    const tick = () => {
      group.rotation.y = rotY;
      group.rotation.x = rotX;

      applyTarget();
      lerpBuf(ribbonPos, ribbonTarget, SMOOTH);
      lerpBuf(cavityPos, cavityTarget, SMOOTH);
      ribbonGeo.attributes.position.needsUpdate = true;
      cavityGeo.attributes.position.needsUpdate = true;
      ribbonGeo.computeVertexNormals();
      cavityGeo.computeVertexNormals();

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointerup", onPointerUp);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerUp);
      ribbonGeo.dispose();
      cavityGeo.dispose();
      lipMat.dispose();
      cavityMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="lip-mesh3d" ref={mountRef} />;
}
