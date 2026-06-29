// ── Viewer.jsx ────────────────────────────────────────────────────────────────
// Three.js r128 3D viewer. Handles:
//   • Indexed geometry mesh display with smooth normals
//   • Point cloud overlay (THREE.Points)
//   • Wireframe toggle
//   • Orbit controls (drag rotate, scroll zoom)
//   • Auto-fit camera on new geometry
//   • LOD-aware: large meshes skip smooth shading

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

const CORAL    = 0xD85A30;
const WIRE_CLR = 0x1a1a1a;
const PT_CLR   = 0x2563EB;
const BG_CLR   = 0xf7f4ee;

const Viewer = forwardRef(function Viewer(
  { geometry, pointCloud, showWireframe = false, showPoints = false, style = {} },
  ref
) {
  const containerRef = useRef(null);
  const threeRef     = useRef(null); // { scene, camera, renderer, controls, meshObj, wireObj, ptObj }
  const [ready, setReady]   = useState(false);
  const [info,  setInfo]    = useState('');

  // ── Initialise Three.js ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let animId;

    const init = async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (!mounted || !containerRef.current) return;

      const el = containerRef.current;
      const W  = el.clientWidth  || 600;
      const H  = el.clientHeight || 400;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(BG_CLR, 1);
      renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG_CLR);

      // Subtle grid
      const grid = new THREE.GridHelper(6, 30, 0xd0d0d0, 0xe8e8e8);
      grid.position.y = -1.1;
      scene.add(grid);

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 0.85);
      sun.position.set(5, 10, 7);
      sun.castShadow = true;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xfff0e0, 0.3);
      fill.position.set(-6, -3, -5);
      scene.add(fill);
      const rim = new THREE.PointLight(0xffddc8, 0.4, 30);
      rim.position.set(0, 6, -4);
      scene.add(rim);

      // Camera
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.001, 500);
      camera.position.set(0, 0.8, 3.5);
      camera.lookAt(0, 0, 0);

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping  = true;
      controls.dampingFactor  = 0.06;
      controls.minDistance    = 0.05;
      controls.maxDistance    = 100;
      controls.target.set(0, 0, 0);

      // Animate
      const animate = () => {
        if (!mounted) return;
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize
      const onResize = () => {
        if (!containerRef.current) return;
        const nw = containerRef.current.clientWidth;
        const nh = containerRef.current.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(el);

      threeRef.current = { THREE, scene, camera, renderer, controls, ro, grid,
        meshObj: null, wireObj: null, ptObj: null };
      setReady(true);
    };

    init();

    return () => {
      mounted = false;
      cancelAnimationFrame(animId);
      if (threeRef.current) {
        const { renderer, ro } = threeRef.current;
        ro?.disconnect();
        renderer?.dispose();
        if (containerRef.current && renderer?.domElement) {
          try { containerRef.current.removeChild(renderer.domElement); } catch(_) {}
        }
        threeRef.current = null;
      }
      setReady(false);
    };
  }, []);

  // ── Imperative API ────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    resetCamera() {
      if (!threeRef.current) return;
      const { camera, controls } = threeRef.current;
      camera.position.set(0, 0.8, 3.5);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    fitToGeometry() { fitCamera(); },
  }));

  // Auto-fit helpers
  const fitCamera = () => {
    const t = threeRef.current;
    if (!t || !t.meshObj) return;
    const { THREE, camera, controls, meshObj } = t;
    const box    = new THREE.Box3().setFromObject(meshObj);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const c = sphere.center;
    const r = sphere.radius || 1;
    camera.position.set(c.x, c.y + r * 0.5, c.z + r * 2.2);
    controls.target.copy(c);
    controls.update();
    // Lower grid to just below object
    t.grid.position.y = box.min.y - 0.05;
  };

  // ── Update mesh geometry ──────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    const { THREE, scene } = t;

    // Dispose old mesh + wire
    if (t.meshObj) { scene.remove(t.meshObj); t.meshObj.geometry.dispose(); t.meshObj.material.dispose(); t.meshObj = null; }
    if (t.wireObj) { scene.remove(t.wireObj); t.wireObj.geometry.dispose(); t.wireObj.material.dispose(); t.wireObj = null; }

    if (!geometry || !geometry.positions || geometry.positions.length === 0) return;

    const triCount = (geometry.indices?.length || 0) / 3;

    // Buffer geometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
    if (geometry.normals)   geo.setAttribute('normal', new THREE.BufferAttribute(geometry.normals, 3));
    if (geometry.indices)   geo.setIndex(new THREE.BufferAttribute(geometry.indices, 1));
    if (!geometry.normals)  geo.computeVertexNormals();

    // Material — physically based
    const mat = new THREE.MeshStandardMaterial({
      color:     CORAL,
      roughness: 0.45,
      metalness: 0.05,
      side:      THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    t.meshObj = mesh;
    scene.add(mesh);

    // Wireframe overlay
    if (showWireframe) {
      const wGeo  = new THREE.WireframeGeometry(geo);
      const wMat  = new THREE.LineBasicMaterial({ color: WIRE_CLR, transparent: true, opacity: 0.12 });
      const wire  = new THREE.LineSegments(wGeo, wMat);
      t.wireObj = wire;
      scene.add(wire);
    }

    setInfo(`${triCount.toLocaleString()} triangles`);
    setTimeout(fitCamera, 50);
  }, [geometry, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle wireframe without rebuilding ───────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !t.meshObj) return;
    const { THREE, scene } = t;

    if (t.wireObj) { scene.remove(t.wireObj); t.wireObj.geometry.dispose(); t.wireObj.material.dispose(); t.wireObj = null; }

    if (showWireframe) {
      const wGeo = new THREE.WireframeGeometry(t.meshObj.geometry);
      const wMat = new THREE.LineBasicMaterial({ color: WIRE_CLR, transparent: true, opacity: 0.12 });
      t.wireObj = new THREE.LineSegments(wGeo, wMat);
      scene.add(t.wireObj);
    }
  }, [showWireframe, ready]);

  // ── Update point cloud ────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    const { THREE, scene } = t;

    if (t.ptObj) { scene.remove(t.ptObj); t.ptObj.geometry.dispose(); t.ptObj.material.dispose(); t.ptObj = null; }

    if (!pointCloud || !showPoints || pointCloud.length === 0) return;

    // Subsample large clouds for display (max 200K points)
    const display = pointCloud.length > 200_000
      ? pointCloud.filter((_, i) => i % Math.ceil(pointCloud.length / 200_000) === 0)
      : pointCloud;

    const positions = new Float32Array(display.length * 3);
    display.forEach((p, i) => { positions[i*3] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = p.z; });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: PT_CLR, size: 0.005, sizeAttenuation: true });
    t.ptObj = new THREE.Points(geo, mat);
    scene.add(t.ptObj);

    setInfo(`${pointCloud.length.toLocaleString()} points`);
  }, [pointCloud, showPoints, ready]);

  // ── Visibility toggles ────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    if (t.meshObj) t.meshObj.visible = !showPoints || !!geometry;
  }, [showPoints, geometry]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', background: `#${BG_CLR.toString(16)}`, ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f4ee', color: '#aaa', fontSize: 12 }}>
          Initializing viewer…
        </div>
      )}

      {!geometry && !pointCloud && ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#bbb' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>◻</div>
            <div style={{ fontSize: 12 }}>No model yet</div>
          </div>
        </div>
      )}

      {/* Info overlay */}
      {info && ready && (
        <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: '#aaa', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
          {info}
        </div>
      )}

      {/* Controls hint */}
      {ready && (geometry || pointCloud) && (
        <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 10, color: '#bbb', pointerEvents: 'none' }}>
          Drag to rotate · Scroll to zoom
        </div>
      )}
    </div>
  );
});

export default Viewer;
