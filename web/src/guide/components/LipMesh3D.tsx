import { useEffect, useRef } from "react";
import * as THREE from "three";
import { INNER_LIP, OUTER_LIP, lipMeshes3D, type Point } from "../lips";
import { mediapipePoseForViseme } from "../training/visemePoses";

type LipMesh3DProps = {
  landmarks: Point[] | null;
  tracking: boolean;
  emptyHint?: string;
};

const OUTER_N = OUTER_LIP.length;
const INNER_N = INNER_LIP.length;
/** Higher = snappier; lower = smoother / less jitter */
const SMOOTH = 0.78;
const REST_POSE = mediapipePoseForViseme("rest");

/**
 * Soft MediaPipe lip surface — same mesh for live camera and Watch poses.
 * Pose data must be real MediaPipe-topology landmarks (see visemePoses.ts).
 */
export function LipMesh3D({ landmarks, tracking, emptyHint }: LipMesh3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const landmarksRef = useRef(landmarks);
  const trackingRef = useRef(tracking);
  landmarksRef.current = landmarks;
  trackingRef.current = tracking;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 280;
    const height = mount.clientHeight || 220;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 40);
    camera.position.set(0, 0.02, 1.55);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xfff0e0, 1.15);
    const key = new THREE.DirectionalLight(0xffe8d4, 0.95);
    key.position.set(0.5, 0.7, 1.5);
    const fill = new THREE.DirectionalLight(0xd4a574, 0.28);
    fill.position.set(-0.7, -0.15, 0.5);
    scene.add(ambient, key, fill);

    const lipMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c24a38"),
      emissive: new THREE.Color("#4a1812"),
      emissiveIntensity: 0.12,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const cavityMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1a1210"),
      roughness: 1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
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
    let rotY = 0.12;
    let rotX = -0.06;
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
      rotY = Math.max(-1.1, Math.min(1.1, rotY));
      rotX = Math.max(-0.55, Math.min(0.55, rotX));
    };
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointermove", onPointerMove);

    const lerpBuf = (cur: Float32Array, target: Float32Array, t: number) => {
      let maxDelta = 0;
      for (let i = 0; i < cur.length; i += 1) {
        maxDelta = Math.max(maxDelta, Math.abs(target[i] - cur[i]));
      }
      const alpha = Math.min(1, t + maxDelta * 2.5);
      for (let i = 0; i < cur.length; i += 1) {
        cur[i] += (target[i] - cur[i]) * alpha;
      }
    };

    const setTargetFromLandmarks = (lms: Point[]) => {
      const mesh = lipMeshes3D(lms, true);
      if (!mesh) return;
      const { outer, inner } = mesh;
      if (outer.length < OUTER_N * 3 || inner.length < INNER_N * 3) return;

      ribbonTarget.set(outer);
      ribbonTarget.set(inner, OUTER_N * 3);

      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < INNER_N; i += 1) {
        cx += inner[i * 3];
        cy += inner[i * 3 + 1];
        cz += inner[i * 3 + 2];
      }
      cx /= INNER_N;
      cy /= INNER_N;
      cz /= INNER_N;
      cavityTarget[0] = cx;
      cavityTarget[1] = cy;
      cavityTarget[2] = cz - 0.015;
      cavityTarget.set(inner, 3);

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

      const lms = landmarksRef.current;
      if (trackingRef.current && lms?.length) {
        setTargetFromLandmarks(lms);
      } else {
        setTargetFromLandmarks(REST_POSE);
      }
      if (seeded) {
        lerpBuf(
          ribbonPos,
          ribbonTarget,
          trackingRef.current ? SMOOTH : 0.14,
        );
        lerpBuf(
          cavityPos,
          cavityTarget,
          trackingRef.current ? SMOOTH : 0.14,
        );
        ribbonGeo.attributes.position.needsUpdate = true;
        cavityGeo.attributes.position.needsUpdate = true;
        ribbonGeo.computeVertexNormals();
        cavityGeo.computeVertexNormals();
      }

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

  return (
    <div className="lip-mesh3d" ref={mountRef}>
      {!tracking && emptyHint ? (
        <p className="lip-mesh3d-empty">{emptyHint}</p>
      ) : null}
    </div>
  );
}
