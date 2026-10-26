import { useEffect, useRef, useState } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { EMPRESS_ASSETS, EMPRESS_POSTER } from './config';

/** The supplied character stays intact; the halo and embers are a separate 3D layer. */
export function EmpressScene({ compact = false, paused = false, intensity = 0.6 }: { compact?: boolean; paused?: boolean; intensity?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useMotionPreference();
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const still = reduced || paused || saveData;
  const running = !still && visible && !hidden;
  const playing = useRef(running);
  playing.current = running;
  const animation = useRef<((active: boolean) => void) | null>(null);
  const settings = useRef({ intensity });
  settings.current = { intensity };
  // No media request or WebGL context is created in reduced motion or data saver.
  const [source, setSource] = useState<string>();
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    const sync = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    if (running && !source) setSource(`${EMPRESS_ASSETS}${compact || innerWidth < 768 ? 'empress-mobile.mp4' : 'empress-scene.mp4'}`);
  }, [compact, running, source]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (running && source && !failed) void el.play().catch(() => setReady(false));
    else el.pause();
    return () => el.pause();
  }, [failed, running, source]);
  useEffect(() => { animation.current?.(running); }, [running]);

  useEffect(() => {
    if (!source || still || !canvasHost.current || compact) return;
    const mount = canvasHost.current;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // Lazy import keeps Three.js out of every other profile and the static fallback.
    void import('three').then(THREE => {
      if (cancelled) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' }); }
      catch { return; } // The poster/video is a complete usable fallback.
      const mobile = innerWidth < 768;
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.25));
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
      camera.position.z = 9;
      const crown = new THREE.Group();
      crown.position.set(0, 0.45, 0);
      crown.scale.setScalar(1.65);
      scene.add(crown);
      const metal = new THREE.MeshBasicMaterial({ color: 0xbcb7b7, transparent: true, opacity: 0.32, wireframe: true });
      const thornGeometry = new THREE.OctahedronGeometry(0.11);
      const ringGeometry = new THREE.TorusGeometry(1.46, 0.009, 3, 80);
      const ring = new THREE.Mesh(ringGeometry, metal);
      const orbit = new THREE.Mesh(ringGeometry, metal);
      orbit.scale.setScalar(1.13);
      orbit.rotation.x = 0.45;
      crown.add(ring, orbit);
      // All 16 thorns share one instanced draw instead of 16 independent draws.
      const thorns = new THREE.InstancedMesh(thornGeometry, metal, 16);
      const thorn = new THREE.Object3D();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        thorn.position.set(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0);
        thorn.scale.set(0.5, i % 4 === 0 ? 3.5 : 1.8, 0.5);
        thorn.rotation.z = a - Math.PI / 2;
        thorn.updateMatrix();
        thorns.setMatrixAt(i, thorn.matrix);
      }
      thorns.instanceMatrix.needsUpdate = true;
      crown.add(thorns);
      const count = mobile ? 32 : 80;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = Math.sin(i * 127.1) * 8;
        positions[i * 3 + 1] = Math.cos(i * 311.7) * 4;
        positions[i * 3 + 2] = Math.sin(i * 74.7) * 2;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, strength: { value: settings.current.intensity } },
        vertexShader: 'uniform float time; void main(){vec3 p=position; p.y=mod(p.y+4.+time*(.08+abs(p.z)*.025),8.)-4.; p.x+=sin(time*.2+p.y)*.16; vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v; gl_PointSize=clamp(22./-v.z,1.,5.);}',
        fragmentShader: 'uniform float strength; void main(){float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d); gl_FragColor=vec4(1.,.12,.22,a*strength);}',
      });
      scene.add(new THREE.Points(geometry, particles));
      const pointer = new THREE.Vector2();
      const target = new THREE.Vector3();
      const surface = host.current?.parentElement;
      // Cache bounds on resize/scroll; pointer events never force a layout read.
      let bounds = mount.getBoundingClientRect();
      const readBounds = () => { bounds = mount.getBoundingClientRect(); };
      const move = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
        target.set(pointer.x * 4, pointer.y * 3, 0);
      };
      const leave = () => target.set(0, 0, 0);
      surface?.addEventListener('pointermove', move, { passive: true });
      surface?.addEventListener('pointerleave', leave);
      window.addEventListener('scroll', readBounds, { passive: true });
      const resize = new ResizeObserver(() => {
        const { width, height } = mount.getBoundingClientRect();
        readBounds();
        renderer.setSize(width, height);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        crown.position.x = 0;
      });
      resize.observe(mount);
      const timer = new THREE.Timer();
      timer.connect(document);
      const frameInterval = 1000 / (mobile ? 24 : 30);
      let lastFrame = -frameInterval;
      const animate = (now: number) => {
        if (now - lastFrame < frameInterval) return;
        lastFrame = now - (now - lastFrame) % frameInterval;
        timer.update();
        const dt = Math.min(timer.getDelta(), 0.05);
        const t = timer.getElapsed();
        particles.uniforms.time.value = t;
        particles.uniforms.strength.value = settings.current.intensity;
        crown.rotation.y = THREE.MathUtils.damp(crown.rotation.y, target.x * 0.025, 3, dt);
        crown.rotation.x = THREE.MathUtils.damp(crown.rotation.x, -target.y * 0.025, 3, dt);
        ring.rotation.z = t * 0.025;
        orbit.rotation.z = -t * 0.04;
        renderer.render(scene, camera);
      };
      animation.current = active => renderer.setAnimationLoop(active ? animate : null);
      animation.current(playing.current);
      const lost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); };
      renderer.domElement.addEventListener('webglcontextlost', lost);
      dispose = () => {
        animation.current = null;
        renderer.setAnimationLoop(null);
        surface?.removeEventListener('pointermove', move);
        surface?.removeEventListener('pointerleave', leave);
        window.removeEventListener('scroll', readBounds);
        resize.disconnect(); timer.dispose();
        thorns.dispose(); thornGeometry.dispose(); ringGeometry.dispose(); metal.dispose(); geometry.dispose(); particles.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
    }).catch(() => { /* The artwork remains visible if the optional chunk fails. */ });
    return () => { cancelled = true; dispose?.(); };
  }, [compact, source, still]);

  return <div ref={host} className="ge-scene" aria-hidden="true" data-live={ready && !failed && !still || undefined}>
    <img src={EMPRESS_POSTER} alt="" className="ge-scene-poster" fetchPriority={compact ? 'auto' : 'high'} />
    <video ref={video} src={still ? undefined : source} muted loop playsInline preload="none" disablePictureInPicture tabIndex={-1} onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />
    <div className="ge-scene-shade" /><div ref={canvasHost} className="ge-three" />
  </div>;
}
