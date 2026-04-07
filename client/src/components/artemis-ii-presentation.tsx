import { useRef, useState, useEffect, useCallback, useMemo, Component } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import recoveryImage from '@assets/image_1775514439355.png';

// ─── Error Boundary ────────────────────────────────────────────────────────────

class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'orbit' | 'chase' | 'cockpit';
type LookTarget = 'auto' | 'moon' | 'earth';

interface ShipStatus {
  heatShield: string;
  oxygenLevel: number;
  propellantRemaining: number;
  powerOutput: number;
  communicationSignal: string;
  crewStatus: string;
  trajectoryDeviation: string;
}

interface AICommentary {
  headline: string;
  subtitle: string;
  commentary: string;
  riskLevel: string;
  riskDescription: string;
  shipStatus: ShipStatus;
  technicalNote: string;
}

// ─── Mission Data ──────────────────────────────────────────────────────────────

const CREW = [
  { name: 'Reid Wiseman', role: 'Commander', agency: 'NASA' },
  { name: 'Victor Glover', role: 'Pilot', agency: 'NASA' },
  { name: 'Christina Koch', role: 'Mission Specialist', agency: 'NASA' },
  { name: 'Jeremy Hansen', role: 'Mission Specialist', agency: 'CSA' },
];

interface Waypoint {
  id: string;
  label: string;
  day: string;
  description: string;
  details: string;
  t: number;
  color: string;
}

const WAYPOINTS: Waypoint[] = [
  {
    id: 'launch',
    label: 'LAUNCH',
    day: 'Day 1 – Apr 1, 2026',
    description: 'Liftoff from Kennedy Space Center',
    details: 'SLS rocket ignites at 6:35 PM EDT from Launch Pad 39B. Orion deploys solar arrays. 4-person crew begins the historic journey — the first crewed deep-space mission in 50 years.',
    t: 0.04,
    color: '#FF6B35',
  },
  {
    id: 'tli',
    label: 'TLI BURN',
    day: 'Day 2 – Apr 2, 2026',
    description: 'Translunar Injection',
    details: "A 6-minute engine firing accelerates Orion to break free of Earth's orbit, reaching the speed needed to travel to the Moon. The spacecraft is now on its free-return trajectory.",
    t: 0.14,
    color: '#FFD700',
  },
  {
    id: 'proximity',
    label: 'PROXIMITY OPS',
    day: 'Day 1–2',
    description: 'Manual Piloting Demo',
    details: 'Crew performs manual spacecraft control tests using the ICPS upper stage as a proxy target. This validates piloting procedures for future rendezvous and docking missions.',
    t: 0.09,
    color: '#4ECDC4',
  },
  {
    id: 'outbound',
    label: 'OUTBOUND COAST',
    day: 'Days 3–4',
    description: 'Deep Space Transit',
    details: "Outbound trajectory correction burn #1 was cancelled — Orion's trajectory was already precisely on target. Crew conducts suit evaluations and habitability assessments.",
    t: 0.31,
    color: '#A8DADC',
  },
  {
    id: 'soi',
    label: "LUNAR SOI",
    day: 'Day 5',
    description: "Lunar Sphere of Influence",
    details: "Orion enters the Moon's gravitational sphere of influence. The spacecraft transitions from Earth-dominated to Moon-dominated gravity. No lunar orbit insertion burn is performed.",
    t: 0.46,
    color: '#C7B8EA',
  },
  {
    id: 'closest',
    label: 'CLOSEST APPROACH',
    day: 'Day 6 – Apr 6, 2026',
    description: '4,070 miles from Lunar Surface',
    details: "Orion makes its closest pass — just 4,070 miles above the lunar surface. The crew witnesses the Moon up close before swinging around the far side. A 7-hour lunar observation period begins.",
    t: 0.52,
    color: '#F0E6D3',
  },
  {
    id: 'blackout',
    label: 'RADIO BLACKOUT',
    day: 'Day 6',
    description: 'Far Side of the Moon',
    details: 'Orion passes behind the lunar far side, breaking radio contact with Earth for the first time. The crew is completely isolated in deep space — a profound moment of solitude.',
    t: 0.59,
    color: '#666666',
  },
  {
    id: 'record',
    label: 'DISTANCE RECORD',
    day: 'Day 6 – 1:56 PM EDT',
    description: '252,760 Miles from Earth',
    details: 'The crew surpasses the record set by Apollo 13 — previously the farthest humans had ever traveled from Earth at 248,655 miles. Artemis II reaches 252,760 miles — 4,105 miles farther.',
    t: 0.64,
    color: '#FFD700',
  },
  {
    id: 'return',
    label: 'RETURN TRANSIT',
    day: 'Days 7–9',
    description: 'Homeward Bound',
    details: "Earth's gravity pulls Orion back without requiring a major engine burn — the beauty of the free-return trajectory. Crew practices emergency procedures and studies re-entry sequences.",
    t: 0.77,
    color: '#90EE90',
  },
  {
    id: 'reentry',
    label: 'RE-ENTRY',
    day: 'Day 10',
    description: 'Atmospheric Entry at 25,000 mph',
    details: "Orion hits Earth's atmosphere at approximately 25,000 mph. The heat shield endures temperatures up to 5,000°F — hotter than the surface of the Sun. Parachutes deploy for splashdown.",
    t: 0.94,
    color: '#FF4500',
  },
  {
    id: 'splashdown',
    label: 'SPLASHDOWN',
    day: 'Day 10 – ~Apr 11, 2026',
    description: 'Pacific Ocean, San Diego',
    details: 'Orion splashes down off the coast of San Diego, completing a 695,081-mile journey. The crew is recovered by the USS San Diego. Mission duration: approximately 10 days.',
    t: 0.99,
    color: '#1E90FF',
  },
];

// ─── Audio Engine ──────────────────────────────────────────────────────────────

class SpaceAudio {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  ambientOsc: OscillatorNode | null = null;
  cockpitInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);
  }

  startAmbient() {
    if (!this.ctx || !this.masterGain) return;
    const ambientGain = this.ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(this.masterGain);
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    osc1.connect(ambientGain);
    osc1.start();
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82.5;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    osc2.connect(g2);
    g2.connect(ambientGain);
    osc2.start();
    ambientGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 3);
    this.ambientOsc = osc1;
  }

  startCockpitSounds() {
    if (!this.ctx || !this.masterGain || this.cockpitInterval) return;
    const ctx = this.ctx;
    const master = this.masterGain;

    const playBeep = () => {
      const now = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.02, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08 + Math.random() * 0.06);
      g.connect(master);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800 + Math.random() * 1600;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.15);
    };

    const playChirp = () => {
      const now = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.015, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      g.connect(master);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 2000 + Math.random() * 2000;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.05);
    };

    this.cockpitInterval = setInterval(() => {
      const r = Math.random();
      if (r < 0.35) playBeep();
      else if (r < 0.5) { playBeep(); setTimeout(playChirp, 80 + Math.random() * 40); }
      else if (r < 0.6) playChirp();
    }, 1800 + Math.random() * 3000);
  }

  setVolume(v: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(v * 0.4, this.ctx.currentTime + 0.2);
    }
  }
}

const audioEngine = new SpaceAudio();

// ─── Trajectory Curve ──────────────────────────────────────────────────────────

const EARTH_POS = new THREE.Vector3(-9, 0, 0);
const MOON_POS = new THREE.Vector3(21, 0, 0);

function buildTrajectory(): THREE.CatmullRomCurve3 {
  const pts = [
    new THREE.Vector3(-9, 3, 0),
    new THREE.Vector3(-7, 5, 0.5),
    new THREE.Vector3(-4, 7, 1),
    new THREE.Vector3(0, 8, 1.5),
    new THREE.Vector3(5, 7, 1.5),
    new THREE.Vector3(9, 5, 1),
    new THREE.Vector3(13, 3, 0.5),
    new THREE.Vector3(16, 1, 0),
    new THREE.Vector3(18, 0, -0.5),
    new THREE.Vector3(20, -1, -1),
    new THREE.Vector3(21, -5, -1.5),
    new THREE.Vector3(22, -7, -1),
    new THREE.Vector3(24, -8, -0.5),
    new THREE.Vector3(27, -7, 0),
    new THREE.Vector3(29, -5, 1),
    new THREE.Vector3(30, -2, 2),
    new THREE.Vector3(29, 2, 2.5),
    new THREE.Vector3(26, 5, 2),
    new THREE.Vector3(22, 7, 1.5),
    new THREE.Vector3(16, 8, 1),
    new THREE.Vector3(9, 7, 0.5),
    new THREE.Vector3(3, 6, 0),
    new THREE.Vector3(-2, 5, -0.5),
    new THREE.Vector3(-6, 4, -0.5),
    new THREE.Vector3(-8.5, 3.2, 0),
    new THREE.Vector3(-9, 2.5, 0),
  ];
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

const TRAJECTORY = buildTrajectory();

// ─── 3D Components ────────────────────────────────────────────────────────────

function StarField() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const count = 6000;
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 180 + Math.random() * 60;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const brightness = 0.5 + Math.random() * 0.5;
      const tint = Math.random();
      colors[i * 3] = tint < 0.2 ? brightness * 0.7 : brightness;
      colors[i * 3 + 1] = tint > 0.8 ? brightness * 0.7 : brightness;
      colors[i * 3 + 2] = tint > 0.6 ? brightness : brightness * 0.8;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.003;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial vertexColors size={0.5} sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

function EarthMesh() {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, '/textures/earth.jpg');

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.05;
  });

  return (
    <group position={EARTH_POS.toArray()}>
      <mesh ref={ref}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshPhongMaterial map={texture} shininess={25} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.08, 48, 48]} />
        <meshPhongMaterial color="#4488ff" emissive="#1133aa" transparent opacity={0.08} side={THREE.FrontSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshBasicMaterial color="#6699ff" transparent opacity={0.04} side={THREE.FrontSide} />
      </mesh>
      <Text position={[0, -2.8, 0]} fontSize={0.4} color="#88ccff" anchorX="center" anchorY="middle" fontWeight="bold">
        EARTH
      </Text>
    </group>
  );
}

function MoonMesh() {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, '/textures/moon.jpg');

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.015;
  });

  return (
    <group position={MOON_POS.toArray()}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.95, 48, 48]} />
        <meshPhongMaterial map={texture} shininess={3} />
      </mesh>
      <Text position={[0, -1.4, 0]} fontSize={0.35} color="#ccccaa" anchorX="center" anchorY="middle" fontWeight="bold">
        MOON
      </Text>
    </group>
  );
}

function TrajectoryLine() {
  const points = useMemo(() => TRAJECTORY.getPoints(300), []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const colors = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      if (t < 0.15) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.4 + t * 4; colors[i * 3 + 2] = 0.1;
      } else if (t < 0.5) {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1;
      } else if (t < 0.65) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0;
      } else {
        colors[i * 3] = 0.3; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [points]);

  const lineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [geo]);

  return <primitive object={lineMesh} />;
}

function WaypointBeacon({ wp, active, onClick }: { wp: Waypoint; active: boolean; onClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(Math.random() * Math.PI * 2);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;
    if (dotRef.current) {
      const s = active ? 1.3 + Math.sin(t * 3) * 0.15 : 1 + Math.sin(t * 1.5) * 0.05;
      dotRef.current.scale.setScalar(s);
    }
  });

  const color = new THREE.Color(wp.color);

  return (
    <group ref={groupRef}>
      <mesh ref={dotRef} onClick={onClick}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 1 : 0.7} />
      </mesh>
      <mesh onClick={onClick} renderOrder={-1}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Billboard position={[0, 0.45, 0]}>
        <Text
          fontSize={active ? 0.28 : 0.2}
          color={wp.color}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.02}
          outlineColor="#000000"
          renderOrder={999}
          material-depthTest={false}
        >
          {wp.label}
        </Text>
      </Billboard>
    </group>
  );
}

function WaypointMarkers({ activeId, onSelect }: { activeId: string | null; onSelect: (id: string) => void }) {
  const { gl } = useThree();
  return (
    <>
      {WAYPOINTS.map(wp => {
        const pos = TRAJECTORY.getPoint(wp.t);
        return (
          <group
            key={wp.id}
            position={pos.toArray()}
            onPointerOver={() => { gl.domElement.style.cursor = 'pointer'; }}
            onPointerOut={() => { gl.domElement.style.cursor = 'auto'; }}
          >
            <WaypointBeacon wp={wp} active={activeId === wp.id} onClick={() => onSelect(wp.id)} />
          </group>
        );
      })}
    </>
  );
}

function Spacecraft({ progress }: { progress: number }) {
  const meshRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (!meshRef.current) return;
    const pos = TRAJECTORY.getPoint(progress);
    const tangent = TRAJECTORY.getTangent(progress);
    meshRef.current.position.copy(pos);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
    meshRef.current.quaternion.copy(quaternion);
    meshRef.current.rotation.z += Math.sin(timeRef.current * 2) * 0.002;
  });

  return (
    <group ref={meshRef}>
      <mesh>
        <capsuleGeometry args={[0.12, 0.3, 8, 16]} />
        <meshPhongMaterial color="#c8d0d8" emissive="#203050" shininess={120} />
      </mesh>
      <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.08, 0.7, 0.35]} />
        <meshPhongMaterial color="#1a3a7a" emissive="#001020" shininess={80} />
      </mesh>
      <mesh position={[-0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.08, 0.7, 0.35]} />
        <meshPhongMaterial color="#1a3a7a" emissive="#001020" shininess={80} />
      </mesh>
      <mesh position={[0, -0.28, 0]}>
        <coneGeometry args={[0.1, 0.15, 16]} />
        <meshPhongMaterial color="#888888" emissive="#111111" shininess={60} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color="#88ccff" transparent opacity={0.06} />
      </mesh>
      {(progress > 0.1 && progress < 0.18) && (
        <mesh position={[0, -0.4, 0]}>
          <coneGeometry args={[0.08, 0.35, 8]} />
          <meshBasicMaterial color="#ff8844" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function SunMesh() {
  const sunRef = useRef<THREE.Group>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const coronaMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color('#fff8e0') },
      color2: { value: new THREE.Color('#ffaa22') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        float noise = sin(vPosition.x * 8.0 + time * 2.0) * sin(vPosition.y * 6.0 + time * 1.5) * sin(vPosition.z * 7.0 + time * 1.8);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.5);
        float pattern = 0.5 + 0.5 * noise;
        vec3 col = mix(color1, color2, pattern * 0.4 + fresnel * 0.3);
        float alpha = 0.9 + 0.1 * sin(time * 3.0 + noise * 5.0);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
  }), []);

  const glowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      glowColor: { value: new THREE.Color('#ffcc44') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.5);
        float pulse = 0.8 + 0.2 * sin(time * 1.5);
        float alpha = fresnel * pulse * 0.6;
        gl_FragColor = vec4(glowColor * 1.5, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((_, delta) => {
    timeRef.current += delta;
    coronaMat.uniforms.time.value = timeRef.current;
    glowMat.uniforms.time.value = timeRef.current;
  });

  return (
    <group ref={sunRef} position={[50, 30, 20]}>
      <mesh>
        <sphereGeometry args={[3, 48, 48]} />
        <meshBasicMaterial color="#fffcf0" />
      </mesh>
      <mesh ref={coronaRef} material={coronaMat}>
        <sphereGeometry args={[3.15, 48, 48]} />
      </mesh>
      <mesh ref={glowRef} material={glowMat}>
        <sphereGeometry args={[5.5, 48, 48]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color="#ffdd66" transparent opacity={0.06} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[12, 32, 32]} />
        <meshBasicMaterial color="#ffcc33" transparent opacity={0.025} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight intensity={5} color="#fff5e0" distance={120} />
    </group>
  );
}

function SunLight() {
  return (
    <>
      <directionalLight position={[50, 30, 20]} intensity={2.5} color="#fffaf0" />
      <ambientLight intensity={0.08} color="#112244" />
      <pointLight position={[50, 30, 20]} intensity={1} color="#fff5e0" distance={200} />
      <SunMesh />
    </>
  );
}

function CameraRig({ progress, viewMode, lookTarget: manualLook }: { progress: number; viewMode: ViewMode; lookTarget: LookTarget }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(5, 15, 35));
  const targetLook = useRef(new THREE.Vector3(5, 0, 0));
  const timeRef = useRef(0);
  const manualBlendRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (viewMode === 'orbit') return;

    const pos = TRAJECTORY.getPoint(progress);
    const tangent = TRAJECTORY.getTangent(progress).normalize();

    const manualTarget = manualLook === 'moon' ? MOON_POS.clone() : manualLook === 'earth' ? EARTH_POS.clone() : null;
    const wantManual = manualTarget !== null ? 1 : 0;
    manualBlendRef.current += (wantManual - manualBlendRef.current) * Math.min(1, delta * 4);

    if (viewMode === 'cockpit') {
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
      const sway = Math.sin(timeRef.current * 0.4) * 0.003;
      const camPos = pos.clone().add(up.clone().multiplyScalar(0.08));
      camera.position.copy(camPos);

      let autoLook: THREE.Vector3;
      if (progress > 0.36 && progress < 0.70) {
        const moonBlend = progress < 0.40 ? (progress - 0.36) / 0.04 : progress > 0.66 ? 1 - (progress - 0.66) / 0.04 : 1;
        const smoothBlend = moonBlend * moonBlend * (3 - 2 * moonBlend);
        autoLook = pos.clone().lerp(MOON_POS.clone(), smoothBlend);
      } else if (progress > 0.74) {
        const earthBlend = Math.min(1, (progress - 0.74) / 0.10);
        const smoothBlend = earthBlend * earthBlend * (3 - 2 * earthBlend);
        autoLook = pos.clone().add(tangent.clone().multiplyScalar(12)).lerp(EARTH_POS.clone(), smoothBlend);
      } else {
        autoLook = pos.clone().add(tangent.clone().multiplyScalar(12)).add(right.clone().multiplyScalar(sway));
      }

      if (manualTarget && manualBlendRef.current > 0.01) {
        autoLook.lerp(manualTarget, manualBlendRef.current);
      }
      camera.lookAt(autoLook);
    } else {
      const backVec = tangent.clone().negate().multiplyScalar(8);
      const upVec = new THREE.Vector3(0, 5, 0);
      const idealCamPos = pos.clone().add(backVec).add(upVec);
      targetPos.current.lerp(idealCamPos, delta * 2.5);

      let autoPoint: THREE.Vector3;
      if (progress > 0.36 && progress < 0.70) {
        const moonBlend = progress < 0.40 ? (progress - 0.36) / 0.04 : progress > 0.66 ? 1 - (progress - 0.66) / 0.04 : 1;
        const smoothBlend = moonBlend * moonBlend * (3 - 2 * moonBlend);
        const ahead = TRAJECTORY.getPoint(Math.min(progress + 0.06, 1));
        autoPoint = ahead.clone().lerp(MOON_POS.clone(), smoothBlend * 0.85);
      } else if (progress > 0.74) {
        const earthBlend = Math.min(1, (progress - 0.74) / 0.10);
        const smoothBlend = earthBlend * earthBlend * (3 - 2 * earthBlend);
        const ahead = TRAJECTORY.getPoint(Math.min(progress + 0.06, 1));
        autoPoint = ahead.clone().lerp(EARTH_POS.clone(), smoothBlend * 0.85);
      } else {
        autoPoint = TRAJECTORY.getPoint(Math.min(progress + 0.06, 1));
      }

      if (manualTarget && manualBlendRef.current > 0.01) {
        autoPoint.lerp(manualTarget, manualBlendRef.current * 0.85);
      }
      targetLook.current.lerp(autoPoint, delta * 3);
      camera.position.copy(targetPos.current);
      camera.lookAt(targetLook.current);
    }
  });

  return null;
}

// ─── Cockpit Overlay ──────────────────────────────────────────────────────────

function CockpitOverlay({ progress, shipStatus }: { progress: number; shipStatus: ShipStatus | null }) {
  const phase = progress > 0.95 ? 'SPLASHDOWN' : progress > 0.64 ? 'RETURN TRANSIT' : progress > 0.59 ? 'FAR SIDE' : progress > 0.5 ? 'LUNAR FLYBY' : progress > 0.14 ? 'OUTBOUND' : progress > 0.08 ? 'TLI BURN' : 'ASCENT';
  const phaseColor = progress > 0.95 ? '#4ade80' : progress > 0.64 ? '#38bdf8' : progress > 0.5 ? '#e5c97e' : progress > 0.14 ? '#a0c4ff' : '#ff8c4b';
  const vel = progress < 0.06 ? Math.round(progress * 160000 / 0.06) : progress < 0.19 ? 24800 + Math.round((progress - 0.06) * 1000) : 24500;

  const o2 = shipStatus?.oxygenLevel ?? Math.round(96 - progress * 8);
  const prop = shipStatus?.propellantRemaining ?? Math.round(95 - progress * 40);
  const power = shipStatus?.powerOutput ?? Math.round(92 + Math.sin(progress * 10) * 3);
  const signal = shipStatus?.communicationSignal ?? (progress > 0.55 && progress < 0.63 ? 'BLACKOUT' : 'STRONG');
  const heatShield = shipStatus?.heatShield ?? (progress > 0.92 ? 'HOT' : 'NOMINAL');

  const signalColor = signal === 'BLACKOUT' ? '#ff4444' : signal === 'WEAK' ? '#ffa500' : '#4ade80';
  const heatColor = heatShield === 'CRITICAL' ? '#ff0000' : heatShield === 'HOT' ? '#ff6600' : heatShield === 'WARM' ? '#ffd700' : '#4ade80';

  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)' }} />

      <div className="absolute inset-3 rounded-[2rem]" style={{
        border: '2px solid rgba(150,180,220,0.25)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(150,180,220,0.08)',
      }}>
        {(['tl','tr','bl','br'] as const).map(corner => (
          <div key={corner} className={`absolute w-8 h-8 ${corner === 'tl' ? 'top-2 left-2' : corner === 'tr' ? 'top-2 right-2' : corner === 'bl' ? 'bottom-2 left-2' : 'bottom-2 right-2'}`}>
            <div className={`absolute w-6 h-0.5 bg-blue-400/60 ${corner.includes('r') ? 'right-0' : 'left-0'} top-0`} />
            <div className={`absolute h-6 w-0.5 bg-blue-400/60 ${corner.includes('r') ? 'right-0' : 'left-0'} top-0`} />
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute w-8 h-px bg-blue-300/40" />
            <div className="absolute h-8 w-px bg-blue-300/40" />
            <div className="w-2.5 h-2.5 rounded-full border border-blue-300/50" />
          </div>
        </div>

        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
          <div className="text-xs tracking-[0.3em] text-blue-300/50 mb-0.5">ORION — ARTEMIS II</div>
          <div className="text-sm font-bold tracking-[0.25em]" style={{ color: phaseColor }}>{phase}</div>
        </div>

        <div className="absolute top-16 left-6 space-y-2.5">
          <TelemetryRow label="O₂" value={`${o2}%`} color={o2 < 80 ? '#ffa500' : '#4ade80'} />
          <TelemetryRow label="PROP" value={`${prop}%`} color={prop < 30 ? '#ff6600' : '#4ade80'} />
          <TelemetryRow label="PWR" value={`${power}%`} color={power < 85 ? '#ffd700' : '#4ade80'} />
        </div>

        <div className="absolute top-16 right-6 space-y-2.5 text-right">
          <TelemetryRowRight label="COMM" value={signal} color={signalColor} />
          <TelemetryRowRight label="SHIELD" value={heatShield} color={heatColor} />
          <TelemetryRowRight label="CREW" value={shipStatus?.crewStatus ?? 'NOMINAL'} color="#4ade80" />
        </div>

        <div className="absolute left-6 bottom-6 flex items-end gap-4">
          <GimbalCompass progress={progress} />
          <div>
            <div className="text-xs text-blue-300/50 tracking-wider mb-0.5">VELOCITY</div>
            <div className="text-lg font-mono font-bold text-blue-200/90">{vel.toLocaleString()} <span className="text-xs text-blue-300/50">mph</span></div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-56">
          <div className="text-xs text-center text-blue-300/50 tracking-wider mb-1">MISSION PROGRESS</div>
          <div className="h-1.5 bg-white/10 rounded-full">
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, #FF6B35, ${phaseColor})` }} />
          </div>
        </div>

        <div className="absolute right-6 bottom-6 flex items-end gap-4 text-right">
          <div>
            <div className="text-xs text-blue-300/50 tracking-wider mb-0.5">MISSION DAY</div>
            <div className="text-lg font-mono font-bold text-blue-200/90">DAY {Math.min(10, Math.ceil(progress * 10))} <span className="text-xs text-blue-300/50">/ 10</span></div>
          </div>
          <NavStatus progress={progress} />
        </div>

        <div className="absolute left-6 top-[130px]">
          <GravityMeter progress={progress} />
          <div className="mt-3">
            <BoosterStatus progress={progress} />
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 top-[72px]">
          <DistanceGauges progress={progress} />
        </div>

        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-px ${i === 2 ? 'w-4 bg-blue-400/50' : 'w-2 bg-blue-400/20'}`} />
          ))}
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-px ml-auto ${i === 2 ? 'w-4 bg-blue-400/50' : 'w-2 bg-blue-400/20'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TelemetryRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-blue-300/50 tracking-widest w-10">{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function TelemetryRowRight({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] text-blue-300/50 tracking-widest w-12 text-left">{label}</div>
    </div>
  );
}


// ─── Cockpit Instruments ─────────────────────────────────────────────────────

function GimbalCompass({ progress }: { progress: number }) {
  const roll = Math.sin(progress * Math.PI * 4) * 12 + Math.sin(progress * 7) * 3;
  const pitch = Math.cos(progress * Math.PI * 3) * 8 + (progress > 0.9 ? (progress - 0.9) * 150 : 0);
  const heading = Math.round((progress * 360 * 2.5) % 360);

  return (
    <div data-testid="instrument-gimbal" className="relative w-32 h-32">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(100,160,255,0.2)" strokeWidth="1" />
        <circle cx="50" cy="50" r="38" fill="rgba(0,0,20,0.6)" stroke="rgba(100,160,255,0.15)" strokeWidth="0.5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
          <line
            key={deg}
            x1={50 + 38 * Math.cos((deg - 90) * Math.PI / 180)}
            y1={50 + 38 * Math.sin((deg - 90) * Math.PI / 180)}
            x2={50 + 44 * Math.cos((deg - 90) * Math.PI / 180)}
            y2={50 + 44 * Math.sin((deg - 90) * Math.PI / 180)}
            stroke={deg % 90 === 0 ? 'rgba(100,180,255,0.6)' : 'rgba(100,180,255,0.25)'}
            strokeWidth={deg % 90 === 0 ? 1.5 : 0.8}
          />
        ))}
        {['N', 'E', 'S', 'W'].map((d, i) => (
          <text
            key={d}
            x={50 + 33 * Math.cos((i * 90 - 90) * Math.PI / 180)}
            y={50 + 33 * Math.sin((i * 90 - 90) * Math.PI / 180) + 2.5}
            textAnchor="middle"
            fill={d === 'N' ? '#ff6644' : 'rgba(100,180,255,0.5)'}
            fontSize="8"
            fontWeight="bold"
          >{d}</text>
        ))}
        <g transform={`rotate(${roll}, 50, 50)`}>
          <line x1="26" y1="50" x2="42" y2="50" stroke="#4ade80" strokeWidth="1.5" />
          <line x1="58" y1="50" x2="74" y2="50" stroke="#4ade80" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="2" fill="none" stroke="#4ade80" strokeWidth="1" />
          <line
            x1="50"
            y1={50 - pitch * 0.3}
            x2="50"
            y2={50 - pitch * 0.3 - 6}
            stroke="#ff6644"
            strokeWidth="1.5"
          />
        </g>
        <polygon points="50,8 47,14 53,14" fill="#ff6644" />
      </svg>
      <div className="absolute -bottom-1 left-0 right-0 text-center">
        <div className="text-[11px] font-mono font-bold text-blue-300/70">{heading}°</div>
      </div>
    </div>
  );
}

function GravityMeter({ progress }: { progress: number }) {
  const earthGrav = progress < 0.45
    ? 1 - progress * 1.8
    : progress > 0.7
    ? Math.min(1, (progress - 0.7) * 3)
    : 0.1;
  const moonGrav = progress > 0.35 && progress < 0.7
    ? Math.sin((progress - 0.35) / 0.35 * Math.PI)
    : 0;

  return (
    <div data-testid="instrument-gravity" className="w-28">
      <div className="text-[10px] tracking-[0.2em] text-blue-300/50 mb-1.5 text-center font-bold">GRAVITY</div>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] text-blue-400/60">EARTH</span>
            <span className="text-[11px] font-mono font-bold text-blue-200/70">{(earthGrav * 9.81).toFixed(1)}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${earthGrav * 100}%`, background: 'linear-gradient(90deg, #1e40af, #3b82f6)' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] text-yellow-400/60">MOON</span>
            <span className="text-[11px] font-mono font-bold text-yellow-200/70">{(moonGrav * 1.62).toFixed(2)}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${moonGrav * 100}%`, background: 'linear-gradient(90deg, #854d0e, #eab308)' }} />
          </div>
        </div>
      </div>
      <div className="text-[9px] text-blue-300/40 text-center mt-1">m/s²</div>
    </div>
  );
}

function BoosterStatus({ progress }: { progress: number }) {
  const srbActive = progress < 0.02;
  const srbSep = progress >= 0.02;
  const coreActive = progress < 0.04;
  const coreSep = progress >= 0.04;
  const icpsActive = progress >= 0.04 && progress < 0.16;
  const icpsSep = progress >= 0.16;

  const light = (active: boolean, separated: boolean) => {
    if (active) return '#4ade80';
    if (separated) return '#666';
    return '#333';
  };

  const label = (active: boolean, separated: boolean) => {
    if (active) return 'ACTIVE';
    if (separated) return 'SEP';
    return 'STBY';
  };

  return (
    <div data-testid="instrument-booster" className="w-28">
      <div className="text-[10px] tracking-[0.2em] text-blue-300/50 mb-2 text-center font-bold">BOOSTERS</div>
      <div className="space-y-1.5">
        {[
          { name: 'SRB L', active: srbActive, sep: srbSep },
          { name: 'SRB R', active: srbActive, sep: srbSep },
          { name: 'CORE', active: coreActive, sep: coreSep },
          { name: 'ICPS', active: icpsActive, sep: icpsSep },
        ].map(b => (
          <div key={b.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
              background: light(b.active, b.sep),
              boxShadow: b.active ? `0 0 6px ${light(b.active, b.sep)}` : 'none',
            }} />
            <span className="text-[10px] text-blue-300/60 w-10">{b.name}</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: light(b.active, b.sep) }}>{label(b.active, b.sep)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavStatus({ progress }: { progress: number }) {
  const mode = progress < 0.04 ? 'ASCENT' :
    progress < 0.09 ? 'PROX OPS' :
    progress < 0.16 ? 'TLI BURN' :
    progress < 0.45 ? 'COAST' :
    progress < 0.65 ? 'LUNAR FLY' :
    progress < 0.92 ? 'RETURN' :
    progress < 0.97 ? 'ENTRY' : 'RECOVERY';

  const modeColor = progress < 0.04 ? '#ff6b35' :
    progress < 0.16 ? '#ffd700' :
    progress < 0.45 ? '#38bdf8' :
    progress < 0.65 ? '#e5c97e' :
    progress < 0.92 ? '#4ade80' :
    '#ff4500';

  const attHold = progress > 0.16 && progress < 0.92;

  return (
    <div data-testid="instrument-nav" className="w-28">
      <div className="text-[10px] tracking-[0.2em] text-blue-300/50 mb-2 text-center font-bold">NAV MODE</div>
      <div className="bg-black/40 border border-blue-400/10 rounded px-2 py-1.5 text-center">
        <div className="text-xs font-bold font-mono tracking-wider" style={{ color: modeColor }}>{mode}</div>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-blue-300/50">ATT HOLD</span>
          <div className="w-2 h-2 rounded-full" style={{ background: attHold ? '#4ade80' : '#666', boxShadow: attHold ? '0 0 4px #4ade80' : 'none' }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-blue-300/50">FREE DFT</span>
          <div className="w-2 h-2 rounded-full" style={{ background: !attHold ? '#ffd700' : '#666', boxShadow: !attHold ? '0 0 4px #ffd700' : 'none' }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-blue-300/50">STAR TRK</span>
          <div className="w-2 h-2 rounded-full" style={{ background: progress > 0.05 ? '#4ade80' : '#666', boxShadow: progress > 0.05 ? '0 0 4px #4ade80' : 'none' }} />
        </div>
      </div>
    </div>
  );
}

function DistanceGauges({ progress }: { progress: number }) {
  const maxDistEarth = 252760;
  const earthMoonDist = 238900;
  const closestApproach = 4070;

  const distFromEarth = progress < 0.64
    ? Math.round(progress * maxDistEarth / 0.64)
    : Math.round(maxDistEarth * (1 - (progress - 0.64) / 0.36));

  const distToMoon = progress < 0.52
    ? Math.round(closestApproach + (earthMoonDist - closestApproach) * (1 - progress / 0.52))
    : Math.round(closestApproach + (progress - 0.52) / 0.48 * (earthMoonDist - closestApproach));

  const fmtDist = (d: number) => d >= 1000 ? `${(d / 1000).toFixed(1)}K` : `${d}`;

  return (
    <div data-testid="instrument-distance" className="w-40">
      <div className="text-[10px] tracking-[0.2em] text-blue-300/50 mb-2 text-center font-bold">DISTANCE</div>
      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-blue-400/60">⊕ EARTH</span>
            <span className="text-xs font-mono font-bold text-blue-200/90">{fmtDist(distFromEarth)} mi</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, distFromEarth / maxDistEarth * 100)}%`, background: 'linear-gradient(90deg, #2563eb, #60a5fa)' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-yellow-400/60">☽ MOON</span>
            <span className="text-xs font-mono font-bold text-yellow-200/90">{fmtDist(distToMoon)} mi</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (1 - distToMoon / earthMoonDist) * 100)}%`, background: 'linear-gradient(90deg, #a16207, #facc15)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InstrumentPanel({ progress }: { progress: number }) {
  return (
    <div data-testid="panel-instruments" className="absolute left-4 top-1/2 -translate-y-1/2 z-20 select-none">
      <div className="bg-black/60 border border-blue-400/15 backdrop-blur-sm rounded-lg p-4 space-y-4" style={{ maxHeight: '85vh' }}>
        <div className="text-[10px] tracking-[0.3em] text-blue-400/50 text-center font-bold">FLIGHT INSTRUMENTS</div>
        <div className="flex justify-center">
          <GimbalCompass progress={progress} />
        </div>
        <div className="h-px bg-blue-400/10" />
        <DistanceGauges progress={progress} />
        <div className="h-px bg-blue-400/10" />
        <GravityMeter progress={progress} />
        <div className="h-px bg-blue-400/10" />
        <BoosterStatus progress={progress} />
        <div className="h-px bg-blue-400/10" />
        <NavStatus progress={progress} />
      </div>
    </div>
  );
}

// ─── Floating Air Pointer ─────────────────────────────────────────────────────

const POINTER_DURATION = 18;

function AirPointer({
  waypoint,
  commentary,
  loading,
  onDismiss,
}: {
  waypoint: Waypoint | null;
  commentary: AICommentary | null;
  loading: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!waypoint) { setVisible(false); return; }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 500);
    }, POINTER_DURATION * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [waypoint]);

  if (!waypoint) return null;

  return (
    <div
      className="fixed right-4 z-30 select-none pointer-events-none transition-all duration-500"
      style={{
        top: '50%',
        transform: `translateY(-50%) translateX(${visible ? '0' : '40px'})`,
        opacity: visible ? 1 : 0,
        maxWidth: 340,
        width: '22%',
        minWidth: 260,
      }}
    >
      <div
        className="rounded-lg overflow-hidden pointer-events-auto"
        style={{
          background: 'rgba(0,2,8,0.75)',
          backdropFilter: 'blur(12px)',
          borderLeft: `3px solid ${waypoint.color}`,
          boxShadow: `0 0 30px ${waypoint.color}15`,
        }}
      >
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <div className="w-2 h-2 rotate-45 animate-pulse" style={{ background: waypoint.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-sm font-black tracking-wide" style={{ color: waypoint.color }}>
                {loading ? waypoint.label : (commentary?.headline ?? waypoint.label)}
              </span>
              <span className="text-[9px] text-gray-600 tracking-wider flex-shrink-0">{waypoint.day}</span>
            </div>
            {loading ? (
              <div className="h-3.5 bg-white/5 rounded w-3/4 animate-pulse" />
            ) : (
              <div className="text-gray-300 text-xs leading-relaxed">
                {commentary?.subtitle ?? waypoint.description}
              </div>
            )}
            {!loading && commentary?.commentary && (
              <div className="text-gray-500 text-[11px] leading-relaxed mt-1">
                {commentary.commentary}
              </div>
            )}
          </div>
          <button
            onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
            className="text-gray-700 hover:text-gray-400 text-[10px] transition-colors flex-shrink-0 pointer-events-auto"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

function SpaceScene({
  progress,
  viewMode,
  lookTarget,
  activeWaypointId,
  onWaypointSelect,
}: {
  progress: number;
  viewMode: ViewMode;
  lookTarget: LookTarget;
  activeWaypointId: string | null;
  onWaypointSelect: (id: string) => void;
}) {
  return (
    <>
      <color attach="background" args={['#000005']} />
      <fog attach="fog" args={['#000010', 80, 250]} />
      <SunLight />
      <StarField />
      <EarthMesh />
      <MoonMesh />
      <TrajectoryLine />
      <WaypointMarkers activeId={activeWaypointId} onSelect={onWaypointSelect} />
      {viewMode !== 'cockpit' && <Spacecraft progress={progress} />}
      <CameraRig progress={progress} viewMode={viewMode} lookTarget={lookTarget} />
      {viewMode === 'orbit' && (
        <OrbitControls enablePan enableZoom enableRotate minDistance={5} maxDistance={120} target={[5, 0, 0]} />
      )}
    </>
  );
}

// ─── UI Overlay Components ────────────────────────────────────────────────────

function CrewPanel() {
  return (
    <div className="absolute top-4 left-4 z-20 select-none">
      <div className="bg-black/70 border border-blue-500/40 backdrop-blur-sm rounded-lg p-3 w-64">
        <div className="text-xs font-bold tracking-[0.2em] text-blue-400 mb-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          ARTEMIS II CREW
        </div>
        {CREW.map(c => (
          <div key={c.name} className="flex items-center gap-2 py-1 border-b border-white/10 last:border-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {c.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div className="text-white text-xs font-semibold leading-tight">{c.name}</div>
              <div className="text-blue-300/70 text-[10px]">{c.role} · {c.agency}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionStats({ progress }: { progress: number }) {
  const maxDistance = 252760;
  const totalMiles = 695081;
  const distance = Math.round(progress < 0.64 ? progress * maxDistance / 0.64 : (1 - (progress - 0.64) / 0.36) * 190000 + 1000);
  const milesTraveled = Math.round(progress * totalMiles);

  return (
    <div className="absolute top-4 right-4 z-20 select-none">
      <div className="bg-black/70 border border-orange-500/40 backdrop-blur-sm rounded-lg p-3 w-52">
        <div className="text-xs font-bold tracking-[0.2em] text-orange-400 mb-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          MISSION STATUS
        </div>
        <div className="space-y-2">
          <StatRow label="MISSION DAY" value={`Day ${Math.min(10, Math.ceil(progress * 10))} / 10`} />
          <StatRow label="LAUNCH DATE" value="Apr 1, 2026" />
          <StatRow label="FROM EARTH" value={`${distance.toLocaleString()} mi`} />
          <StatRow label="MILES TRAVELED" value={`${(milesTraveled / 1000).toFixed(0)}K mi`} />
          <StatRow label="STATUS" value={progress > 0.95 ? 'SPLASHDOWN' : progress > 0.64 ? 'RETURN' : progress > 0.5 ? 'LUNAR FLYBY' : 'OUTBOUND'} color={progress > 0.95 ? '#4ade80' : '#fbbf24'} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color = '#e2e8f0' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-gray-500 tracking-wider">{label}</span>
      <span className="text-xs font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function Timeline({ progress, onSeek }: { progress: number; onSeek: (t: number) => void }) {
  const days = Array.from({ length: 10 }, (_, i) => i + 1);
  const currentDay = Math.ceil(progress * 10);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 select-none">
      <div className="bg-gradient-to-t from-black/90 to-transparent pt-8 pb-4 px-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400">MISSION TIMELINE</span>
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-gray-500">695,081 mile journey</span>
        </div>
        <div
          className="relative h-2 bg-white/10 rounded-full cursor-pointer mb-3 group"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = (e.clientX - rect.left) / rect.width;
            onSeek(Math.max(0, Math.min(1, t)));
          }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #FF6B35, #FFD700, #4ECDC4)' }}
          />
          {WAYPOINTS.map(wp => (
            <div
              key={wp.id}
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-black/50"
              style={{ left: `${wp.t * 100}%`, background: wp.color }}
              title={wp.label}
            />
          ))}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-blue-400 shadow-lg transition-all"
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between">
          {days.map(d => (
            <button
              key={d}
              onClick={() => onSeek((d - 0.5) / 10)}
              className={`text-[10px] font-mono transition-colors px-1 ${d === currentDay ? 'text-white font-bold' : 'text-gray-600 hover:text-gray-400'}`}
            >
              D{d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlBar({
  playing, viewMode, muted, speed, lookTarget,
  onPlayPause, onCycleView, onMute, onReset, onToggleSpeed, onLookMoon, onLookEarth,
}: {
  playing: boolean; viewMode: ViewMode; muted: boolean; speed: number; lookTarget: LookTarget;
  onPlayPause: () => void; onCycleView: () => void; onMute: () => void; onReset: () => void; onToggleSpeed: () => void;
  onLookMoon: () => void; onLookEarth: () => void;
}) {
  const viewLabel = viewMode === 'orbit' ? '🌍' : viewMode === 'chase' ? '🚀' : '👁';
  const viewTitle = viewMode === 'orbit' ? 'Overview' : viewMode === 'chase' ? 'Chase Cam' : 'Cockpit View';

  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 select-none">
      <div className="flex items-center gap-1 bg-black/80 border border-white/20 backdrop-blur-sm rounded-full px-3 py-2">
        <CtrlButton onClick={onReset} title="Reset to launch" label="⏮" />
        <CtrlButton onClick={onPlayPause} title={playing ? 'Pause' : 'Play'} label={playing ? '⏸' : '▶'} active />
        <CtrlButton onClick={onToggleSpeed} title={speed > 1 ? 'Normal speed' : 'Fast forward'} label={speed > 1 ? '⚡' : '→'} glow={speed > 1} />
        <div className="w-px h-5 bg-white/20 mx-1" />
        <CtrlButton onClick={onCycleView} title={viewTitle} label={viewLabel} glow={viewMode !== 'orbit'} />
        <CtrlButton onClick={onLookMoon} title="Look at Moon" label="☽" glow={lookTarget === 'moon'} />
        <CtrlButton onClick={onLookEarth} title="Look at Earth" label="⊕" glow={lookTarget === 'earth'} />
        <div className="w-px h-5 bg-white/20 mx-1" />
        <CtrlButton onClick={onMute} title={muted ? 'Unmute' : 'Mute'} label={muted ? '🔇' : '🔊'} />
        <div className="ml-1 text-[9px] text-gray-500 font-mono tracking-wider pr-1">
          {lookTarget !== 'auto' ? (lookTarget === 'moon' ? 'LOOK MOON' : 'LOOK EARTH') : viewMode === 'orbit' ? 'OVERVIEW' : viewMode === 'chase' ? 'CHASE CAM' : '1ST PERSON'}
        </div>
      </div>
    </div>
  );
}

function CtrlButton({ onClick, title, label, active, glow }: { onClick: () => void; title: string; label: string; active?: boolean; glow?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 ${active ? 'bg-blue-600/50 text-white' : glow ? 'bg-orange-600/50 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
    >
      {label}
    </button>
  );
}

function MissionTitle() {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 select-none text-center">
      <div className="text-[10px] tracking-[0.4em] text-blue-400/80 font-bold mb-0.5">NASA · SLS · ORION</div>
      <div className="text-2xl font-black tracking-[0.15em] text-white drop-shadow-lg">
        ARTEMIS <span className="text-blue-400">II</span>
      </div>
      <div className="text-[10px] tracking-[0.3em] text-gray-400 mt-0.5">LUNAR FREE-RETURN TRAJECTORY · 10 DAYS</div>
    </div>
  );
}

// ─── WebGL check ─────────────────────────────────────────────────────────────

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
        canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

// ─── 2D Canvas Fallback ────────────────────────────────────────────────────────

const STARS_2D = (() => {
  const stars: { x: number; y: number; r: number; a: number }[] = [];
  let s = 42;
  const rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  for (let i = 0; i < 400; i++) {
    stars.push({ x: rng(), y: rng(), r: rng() * 1.3 + 0.2, a: rng() * 0.5 + 0.5 });
  }
  return stars;
})();

function Canvas2DFallback({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = dims.w;
    const H = dims.h;
    const pts = TRAJECTORY.getPoints(200);
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 80;
    const toScreen = (x: number, y: number) => ({
      sx: pad + ((x - minX) / (maxX - minX)) * (W - pad * 2),
      sy: H - (pad + ((y - minY) / (maxY - minY)) * (H - pad * 2)),
    });
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, W, H);
    STARS_2D.forEach(st => {
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${st.a})`;
      ctx.fill();
    });
    pts.forEach((p, i) => {
      if (i === 0) return;
      const prev = pts[i - 1];
      const { sx: x1, sy: y1 } = toScreen(prev.x, prev.y);
      const { sx: x2, sy: y2 } = toScreen(p.x, p.y);
      const t = i / (pts.length - 1);
      const r = t < 0.15 ? 255 : t < 0.5 ? 180 : t < 0.65 ? 255 : 80;
      const g = t < 0.15 ? 100 : t < 0.5 ? 220 : t < 0.65 ? 215 : 220;
      const b = t < 0.15 ? 20 : t < 0.5 ? 255 : t < 0.65 ? 0 : 255;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.65)`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });
    const ep = toScreen(EARTH_POS.x, EARTH_POS.y);
    const earthGrad = ctx.createRadialGradient(ep.sx, ep.sy, 0, ep.sx, ep.sy, 30);
    earthGrad.addColorStop(0, '#4a9fd8');
    earthGrad.addColorStop(0.6, '#2255aa');
    earthGrad.addColorStop(1, '#0a1a44');
    ctx.beginPath();
    ctx.arc(ep.sx, ep.sy, 30, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ep.sx, ep.sy, 34, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,160,255,0.25)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#88bbff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EARTH', ep.sx, ep.sy + 50);
    const mp = toScreen(MOON_POS.x, MOON_POS.y);
    const moonGrad = ctx.createRadialGradient(mp.sx - 3, mp.sy - 3, 0, mp.sx, mp.sy, 16);
    moonGrad.addColorStop(0, '#d0c8b8');
    moonGrad.addColorStop(1, '#706858');
    ctx.beginPath();
    ctx.arc(mp.sx, mp.sy, 16, 0, Math.PI * 2);
    ctx.fillStyle = moonGrad;
    ctx.fill();
    ctx.fillStyle = '#ccccaa';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOON', mp.sx, mp.sy + 30);
    WAYPOINTS.forEach(wp => {
      const wpt = TRAJECTORY.getPoint(wp.t);
      const { sx, sy } = toScreen(wpt.x, wpt.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = wp.color;
      ctx.fill();
    });
    const spacecraftPt = TRAJECTORY.getPoint(progress);
    const sp = toScreen(spacecraftPt.x, spacecraftPt.y);
    const glow = ctx.createRadialGradient(sp.sx, sp.sy, 0, sp.sx, sp.sy, 14);
    glow.addColorStop(0, 'rgba(120,200,255,0.5)');
    glow.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.beginPath();
    ctx.arc(sp.sx, sp.sy, 14, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sp.sx, sp.sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }, [progress, dims]);

  return (
    <canvas
      ref={canvasRef}
      width={dims.w}
      height={dims.h}
      className="absolute inset-0"
      style={{ width: dims.w, height: dims.h }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const BRIEFING_NARRATION = "Welcome aboard NASA's Orion spacecraft. You are seated inside the most advanced crew capsule ever built, atop Launch Pad 39 B at Kennedy Space Center. Beneath you is the Space Launch System — 322 feet of engineering brilliance generating 8.8 million pounds of thrust. Four RS-25 engines and two solid rocket boosters will accelerate you from zero to 17,500 miles per hour in under eight minutes. Your crew today: Commander Reid Wiseman, Pilot Victor Glover, Mission Specialists Christina Koch and Jeremy Hansen. Your mission: a 10-day, 695,000-mile journey around the Moon and back. Humanity's first crewed deep-space flight in over 50 years. When you are ready, press the launch button.";

const COUNTDOWN_NARRATION = "Ten... Nine... Eight... Seven... Six... Five... Four... Three... Two... One... Ignition... Liftoff!";

export default function ArtemisIIPresentation() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cockpit');
  const [lookTarget, setLookTarget] = useState<LookTarget>('auto');
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [audioReady, setAudioReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);
  const [countdownPhase, setCountdownPhase] = useState<'intro' | 'countdown' | null>('intro');
  const [countdownReady, setCountdownReady] = useState(false);
  const briefingAudioRef = useRef<HTMLAudioElement | null>(null);
  const computerVoiceRef = useRef<HTMLAudioElement | null>(null);
  const moonLockAnnouncedRef = useRef(false);
  const earthLockAnnouncedRef = useRef(false);
  const midGapNarratedRef = useRef(false);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicLoadedRef = useRef(false);
  const stageSoundRef = useRef<HTMLAudioElement | null>(null);
  const stageSoundUrlRef = useRef<string>('');
  const bgMusicUrlRef = useRef<string>('');
  const currentStageRef = useRef<string>('');

  // Active briefing panel state
  const [briefingWaypoint, setBriefingWaypoint] = useState<Waypoint | null>(null);
  const [aiCommentary, setAiCommentary] = useState<AICommentary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);
  const [currentShipStatus, setCurrentShipStatus] = useState<ShipStatus | null>(null);
  const [missionComplete, setMissionComplete] = useState(false);

  const webglSupported = useMemo(() => isWebGLAvailable(), []);
  const animRef = useRef<number | null>(null);
  const lastTRef = useRef(0);
  const progressRef = useRef(0);
  const lastWaypointRef = useRef<string | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const speedRef = useRef(1);

  const BASE_SPEED = 0.005; // full mission ~200s at 1×, ~67s at 3×

  useEffect(() => { speedRef.current = speed; }, [speed]);

  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationQueueRef = useRef<AICommentary[]>([]);
  const isNarratingRef = useRef(false);
  const narrationGenRef = useRef(0);

  const stopNarration = useCallback(() => {
    narrationGenRef.current++;
    narrationQueueRef.current = [];
    isNarratingRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    if (computerVoiceRef.current) {
      computerVoiceRef.current.pause();
      computerVoiceRef.current.src = '';
      computerVoiceRef.current = null;
    }
  }, []);

  const playNarrationClip = useCallback(async (data: AICommentary) => {
    if (mutedRef.current) { isNarratingRef.current = false; return; }
    isNarratingRef.current = true;
    const gen = narrationGenRef.current;
    if (computerVoiceRef.current) {
      computerVoiceRef.current.pause();
      computerVoiceRef.current.src = '';
      computerVoiceRef.current = null;
    }
    const text = data.commentary;
    try {
      const res = await fetch('/api/mission/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (gen !== narrationGenRef.current) { isNarratingRef.current = false; return; }
      if (!res.ok) throw new Error(`Narrate ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (gen !== narrationGenRef.current) { URL.revokeObjectURL(url); isNarratingRef.current = false; return; }
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
        audio.play().catch(() => resolve());
      });
    } catch (err) {
      console.error('ElevenLabs narration failed:', err);
    }
    if (gen !== narrationGenRef.current) { isNarratingRef.current = false; return; }
    isNarratingRef.current = false;
    const next = narrationQueueRef.current.shift();
    if (next && !mutedRef.current) playNarrationClip(next);
  }, []);

  const speakCommentary = useCallback((data: AICommentary, force = false) => {
    if (mutedRef.current) return;
    if (force) {
      stopNarration();
      playNarrationClip(data);
      return;
    }
    if (isNarratingRef.current) {
      if (narrationQueueRef.current.length < 1) narrationQueueRef.current.push(data);
      return;
    }
    playNarrationClip(data);
  }, [stopNarration, playNarrationClip]);

  // Stable ref so the rAF loop can always call the latest speakCommentary
  const speakCommentaryRef = useRef(speakCommentary);
  useEffect(() => { speakCommentaryRef.current = speakCommentary; }, [speakCommentary]);

  const playComputerVoice = useCallback(async (text: string) => {
    if (mutedRef.current) return;
    if (isNarratingRef.current) return;
    if (computerVoiceRef.current) {
      computerVoiceRef.current.pause();
      computerVoiceRef.current.src = '';
    }
    try {
      const res = await fetch('/api/mission/computer-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 0.8;
      computerVoiceRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); computerVoiceRef.current = null; };
      audio.play().catch(() => {});
    } catch {}
  }, []);
  const playComputerVoiceRef = useRef(playComputerVoice);
  useEffect(() => { playComputerVoiceRef.current = playComputerVoice; }, [playComputerVoice]);

  const fetchAICommentary = useCallback(async (wp: Waypoint, currentProgress: number, force = false) => {
    setAiLoading(true);
    setAiCommentary(null);
    try {
      const res = await fetch('/api/mission/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypointId: wp.id,
          label: wp.label,
          description: wp.description,
          day: wp.day,
          details: wp.details,
          progress: currentProgress,
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data: AICommentary = await res.json();
      (window as any).__artemisCache = (window as any).__artemisCache ?? {};
      (window as any).__artemisCache[wp.id] = data;
      setAiCommentary(data);
      setCurrentShipStatus(data.shipStatus);
      speakCommentaryRef.current(data, force);
    } catch (err) {
      console.error('AI commentary fetch failed:', err);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const fetchAICommentaryRef = useRef(fetchAICommentary);
  useEffect(() => { fetchAICommentaryRef.current = fetchAICommentary; }, [fetchAICommentary]);

  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    lastTRef.current = 0;
    const step = (ts: number) => {
      const dt = lastTRef.current ? (ts - lastTRef.current) / 1000 : 0;
      lastTRef.current = ts;
      const cappedDt = Math.min(dt, 0.1);
      const p = progressRef.current;
      const slowdown = p > 0.92 ? 0.5 : p > 0.75 ? 0.6 : 1;
      const next = Math.min(1, progressRef.current + cappedDt * BASE_SPEED * speedRef.current * slowdown);
      progressRef.current = next;
      setProgress(next);

      if (next > 0.38 && next < 0.70 && !moonLockAnnouncedRef.current) {
        moonLockAnnouncedRef.current = true;
        playComputerVoiceRef.current("Locking lunar view. Moon tracking engaged.");
      }
      if (next > 0.72 && !earthLockAnnouncedRef.current) {
        earthLockAnnouncedRef.current = true;
        playComputerVoiceRef.current("Re-acquiring Earth. Home planet tracking engaged.");
      }

      const stageKey = next < 0.08 ? 'ascent' : next < 0.16 ? 'tli' : next < 0.45 ? 'outbound' : next < 0.55 ? 'lunar' : next < 0.65 ? 'farside' : next < 0.92 ? 'return' : next < 0.97 ? 'reentry' : 'splashdown';
      playStageSoundRef.current(stageKey);

      if (next > 0.84 && next < 0.90 && !midGapNarratedRef.current) {
        midGapNarratedRef.current = true;
        playComputerVoiceRef.current("Initiating pre-entry sequence. Heat shield status nominal.");
        setTimeout(() => {
          const midGapText = "Day eight. Earth grows larger in the forward windows. The crew runs final checks on the heat shield, the single component that will determine survival during re-entry. At twenty-five thousand miles per hour, friction will push temperatures past five thousand degrees. Inside Orion, the crew reviews splashdown procedures and secures loose equipment. Soon they will separate the service module and commit to atmospheric entry. There is no turning back.";
          speakCommentaryRef.current({
            headline: 'APPROACH PREPARATIONS',
            commentary: midGapText,
            subtitle: 'Pre-entry systems check',
            shipStatus: null as any,
          }, true);
        }, 4000);
      }

      const upcoming = WAYPOINTS.find(wp =>
        !prefetchedRef.current.has(wp.id) &&
        next >= wp.t - 0.06 && next < wp.t
      );
      if (upcoming) {
        prefetchedRef.current.add(upcoming.id);
        fetch('/api/mission/commentary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waypointId: upcoming.id,
            label: upcoming.label,
            description: upcoming.description,
            day: upcoming.day,
            details: upcoming.details,
            progress: next,
          }),
        }).then(r => r.json()).then(data => {
          (window as any).__artemisCache = (window as any).__artemisCache ?? {};
          (window as any).__artemisCache[upcoming.id] = data;
        }).catch(() => {});
      }

      const nowWp = WAYPOINTS.find(wp => Math.abs(wp.t - next) < 0.004);
      if (nowWp && nowWp.id !== lastWaypointRef.current) {
        lastWaypointRef.current = nowWp.id;
        setActiveWaypointId(nowWp.id);
        setBriefingWaypoint(nowWp);

        const cached = (window as any).__artemisCache?.[nowWp.id];
        if (cached) {
          setAiCommentary(cached);
          setCurrentShipStatus(cached.shipStatus);
          setAiLoading(false);
          if (!isNarratingRef.current) {
            speakCommentaryRef.current(cached);
          } else if (narrationQueueRef.current.length < 1) {
            narrationQueueRef.current.push(cached);
          }
        } else {
          fetchAICommentaryRef.current(nowWp, next);
        }
      }

      if (next < 1) animRef.current = requestAnimationFrame(step);
      else { setPlaying(false); setMissionComplete(true); }
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing]);

  const startBgMusic = useCallback(() => {
    if (bgMusicLoadedRef.current) {
      if (bgMusicRef.current && !mutedRef.current) {
        bgMusicRef.current.play().catch(() => {});
      }
      return;
    }
    bgMusicLoadedRef.current = true;
    fetch('/api/mission/background-music?v=3')
      .then(r => { if (!r.ok) throw new Error('music fetch failed'); return r.blob(); })
      .then(blob => {
        if (bgMusicUrlRef.current) URL.revokeObjectURL(bgMusicUrlRef.current);
        const url = URL.createObjectURL(blob);
        bgMusicUrlRef.current = url;
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = 0.15;
        bgMusicRef.current = audio;
        if (!mutedRef.current) audio.play().catch(() => {});
      })
      .catch(err => console.error('Background music failed:', err));
  }, []);

  const playStageSound = useCallback((stage: string) => {
    if (mutedRef.current) return;
    if (currentStageRef.current === stage) return;
    currentStageRef.current = stage;
    if (stageSoundRef.current) {
      stageSoundRef.current.pause();
      stageSoundRef.current.src = '';
    }
    if (stageSoundUrlRef.current) {
      URL.revokeObjectURL(stageSoundUrlRef.current);
      stageSoundUrlRef.current = '';
    }
    fetch(`/api/mission/stage-sound/${stage}`)
      .then(r => { if (!r.ok) throw new Error('stage sound failed'); return r.blob(); })
      .then(blob => {
        if (stageSoundUrlRef.current) URL.revokeObjectURL(stageSoundUrlRef.current);
        const url = URL.createObjectURL(blob);
        stageSoundUrlRef.current = url;
        const audio = new Audio(url);
        audio.volume = 0.25;
        audio.loop = true;
        stageSoundRef.current = audio;
        if (!mutedRef.current) audio.play().catch(() => {});
      })
      .catch(() => {});
  }, []);
  const playStageSoundRef = useRef(playStageSound);
  useEffect(() => { playStageSoundRef.current = playStageSound; }, [playStageSound]);

  const handlePlayPause = useCallback(() => {
    if (!audioReady) {
      audioEngine.init();
      audioEngine.startAmbient();
      audioEngine.startCockpitSounds();
      setAudioReady(true);
      startBgMusic();
    }
    if (!muted) audioEngine.setVolume(1);
    lastTRef.current = 0;
    setPlaying(p => {
      const next = !p;
      if (bgMusicRef.current) {
        if (next && !mutedRef.current) bgMusicRef.current.play().catch(() => {});
        else bgMusicRef.current.pause();
      }
      if (stageSoundRef.current) {
        if (next && !mutedRef.current) stageSoundRef.current.play().catch(() => {});
        else stageSoundRef.current.pause();
      }
      return next;
    });
  }, [audioReady, muted, startBgMusic]);

  const handleWaypointSelect = useCallback((id: string) => {
    const wp = WAYPOINTS.find(w => w.id === id);
    if (!wp) return;
    lastWaypointRef.current = id;
    setActiveWaypointId(id);
    setBriefingWaypoint(wp);
    const cached = (window as any).__artemisCache?.[id];
    if (cached) {
      setAiCommentary(cached);
      setCurrentShipStatus(cached.shipStatus);
      setAiLoading(false);
      speakCommentary(cached, true); // force — manual click always narrates
    } else {
      fetchAICommentary(wp, progressRef.current, true); // force
    }
  }, [muted, audioReady, fetchAICommentary, speakCommentary]);

  useEffect(() => {
    return () => {
      if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current.src = ''; }
      if (stageSoundRef.current) { stageSoundRef.current.pause(); stageSoundRef.current.src = ''; }
      if (bgMusicUrlRef.current) URL.revokeObjectURL(bgMusicUrlRef.current);
      if (stageSoundUrlRef.current) URL.revokeObjectURL(stageSoundUrlRef.current);
    };
  }, []);

  const handleReset = useCallback(() => {
    setPlaying(false);
    progressRef.current = 0;
    setProgress(0);
    lastWaypointRef.current = null;
    prefetchedRef.current.clear();
    moonLockAnnouncedRef.current = false;
    earthLockAnnouncedRef.current = false;
    midGapNarratedRef.current = false;
    launchingRef.current = false;
    (window as any).__artemisCache = {};
    setBriefingWaypoint(null);
    setActiveWaypointId(null);
    setAiCommentary(null);
    stopNarration();
    setMissionComplete(false);
    setLookTarget('auto');
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
    if (stageSoundRef.current) {
      stageSoundRef.current.pause();
      stageSoundRef.current.src = '';
      stageSoundRef.current = null;
    }
    if (stageSoundUrlRef.current) {
      URL.revokeObjectURL(stageSoundUrlRef.current);
      stageSoundUrlRef.current = '';
    }
    currentStageRef.current = '';
  }, [stopNarration]);

  const handleReturnHome = useCallback(() => {
    handleReset();
    setShowIntro(true);
    setCountdownPhase(null);
    setCountdownNum(null);
  }, [handleReset]);

  const handleSeek = useCallback((t: number) => {
    progressRef.current = t;
    setProgress(t);
    lastWaypointRef.current = null;
    setMissionComplete(false);
    // If user scrubs to within 3% of a waypoint, show its briefing
    const nearWp = WAYPOINTS.reduce<{ wp: Waypoint; dist: number } | null>((best, wp) => {
      const d = Math.abs(wp.t - t);
      if (d < 0.03 && (!best || d < best.dist)) return { wp, dist: d };
      return best;
    }, null);
    if (nearWp) {
      lastWaypointRef.current = nearWp.wp.id;
      setActiveWaypointId(nearWp.wp.id);
      setBriefingWaypoint(nearWp.wp);
      const cached = (window as any).__artemisCache?.[nearWp.wp.id];
      if (cached) {
        setAiCommentary(cached);
        setCurrentShipStatus(cached.shipStatus);
        setAiLoading(false);
        speakCommentary(cached, true); // force — manual scrub always narrates
      } else {
        fetchAICommentary(nearWp.wp, t, true); // force
      }
    }
  }, [fetchAICommentary, speakCommentary]);

  const handleMute = useCallback(() => {
    setMuted(m => {
      const nowMuted = !m;
      audioEngine.setVolume(nowMuted ? 0 : 1);
      if (nowMuted) {
        stopNarration();
        if (bgMusicRef.current) bgMusicRef.current.pause();
        if (stageSoundRef.current) stageSoundRef.current.pause();
      } else {
        if (bgMusicRef.current && playing) bgMusicRef.current.play().catch(() => {});
        if (stageSoundRef.current && playing) stageSoundRef.current.play().catch(() => {});
      }
      return nowMuted;
    });
  }, [stopNarration, playing]);

  useEffect(() => {
    if (!showIntro || countdownPhase !== 'intro') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/mission/narrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: BRIEFING_NARRATION }),
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        briefingAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); briefingAudioRef.current = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); briefingAudioRef.current = null; };
        audio.play().catch(() => {});
      } catch {}
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showIntro, countdownPhase]);

  const launchingRef = useRef(false);

  const handleStart = useCallback(async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;

    if (briefingAudioRef.current) {
      briefingAudioRef.current.pause();
      briefingAudioRef.current.src = '';
      briefingAudioRef.current = null;
    }

    setCountdownPhase('countdown');
    setCountdownReady(false);

    audioEngine.init();
    audioEngine.startAmbient();
    audioEngine.startCockpitSounds();
    setAudioReady(true);

    let countdownAudio: HTMLAudioElement | null = null;
    try {
      const res = await fetch('/api/mission/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: COUNTDOWN_NARRATION }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        countdownAudio = new Audio(url);
        countdownAudio.onended = () => URL.revokeObjectURL(url);
      }
    } catch {}

    setCountdownReady(true);
    setCountdownNum(10);
    if (countdownAudio) countdownAudio.play().catch(() => {});

    for (let i = 10; i >= 0; i--) {
      if (i < 10) await new Promise(r => setTimeout(r, 1050));
      setCountdownNum(i);
    }

    await new Promise(r => setTimeout(r, 1400));

    setCountdownPhase(null);
    setCountdownNum(null);
    setShowIntro(false);
    progressRef.current = 0;
    lastTRef.current = 0;
    setPlaying(true);
    startBgMusic();
  }, [startBgMusic]);

  const isCockpit = viewMode === 'cockpit';

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      {webglSupported ? (
        <Canvas
          camera={{ position: [5, 15, 38], fov: isCockpit ? 80 : 50, near: 0.05, far: 300 }}
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: 'low-power',
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
          }}
          dpr={[1, 1.5]}
          className="absolute inset-0"
          onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); }}
        >
          <SpaceScene
            progress={progress}
            viewMode={viewMode}
            lookTarget={lookTarget}
            activeWaypointId={activeWaypointId}
            onWaypointSelect={handleWaypointSelect}
          />
        </Canvas>
      ) : (
        <Canvas2DFallback progress={progress} />
      )}

      {isCockpit && <CockpitOverlay progress={progress} shipStatus={currentShipStatus} />}
      {!isCockpit && <MissionTitle />}
      {!isCockpit && <CrewPanel />}
      {!isCockpit && <MissionStats progress={progress} />}
      {!isCockpit && !showIntro && <InstrumentPanel progress={progress} />}

      <AirPointer
        waypoint={briefingWaypoint}
        commentary={aiCommentary}
        loading={aiLoading}
        onDismiss={() => {
          setBriefingWaypoint(null);
          setActiveWaypointId(null);
          setAiCommentary(null);
          stopNarration();
        }}
      />

      <Timeline progress={progress} onSeek={handleSeek} />

      <ControlBar
        playing={playing}
        viewMode={viewMode}
        muted={muted}
        speed={speed}
        lookTarget={lookTarget}
        onPlayPause={handlePlayPause}
        onCycleView={() => setViewMode(m => m === 'orbit' ? 'chase' : m === 'chase' ? 'cockpit' : 'orbit')}
        onMute={handleMute}
        onReset={handleReset}
        onToggleSpeed={() => setSpeed(s => s === 1 ? 3 : 1)}
        onLookMoon={() => setLookTarget(t => t === 'moon' ? 'auto' : 'moon')}
        onLookEarth={() => setLookTarget(t => t === 'earth' ? 'auto' : 'earth')}
      />


      {missionComplete && (
        <div
          data-testid="overlay-mission-complete"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center"
          style={{
            animation: 'missionEndFadeIn 2s ease-out forwards',
            background: 'radial-gradient(ellipse at center, rgba(0,0,10,0.85) 0%, rgba(0,0,10,0.97) 100%)',
          }}
        >
          <div className="text-[10px] tracking-[0.6em] text-blue-400/60 font-bold mb-4 animate-pulse">MISSION COMPLETE</div>

          <div className="relative rounded-lg overflow-hidden shadow-2xl shadow-blue-500/10 border border-white/10" style={{ maxWidth: '720px', width: '90%' }}>
            <img
              src={recoveryImage}
              alt="Orion capsule recovery in the Pacific Ocean"
              data-testid="img-recovery"
              className="w-full h-auto"
              style={{ animation: 'missionEndFadeIn 2.5s ease-out forwards' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' }} />
          </div>

          <div className="mt-6 text-center max-w-lg px-4">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">
              SPLASHDOWN <span className="text-blue-400">CONFIRMED</span>
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-1">
              Orion has safely returned to Earth, splashing down in the Pacific Ocean off the coast of San Diego.
            </p>
            <p className="text-gray-500 text-xs">695,081 miles traveled · 10-day mission · Crew safe and recovered</p>
          </div>

          <div className="mt-8 flex items-center gap-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-500/40" />
            <button
              onClick={handleReturnHome}
              data-testid="button-return-home"
              className="group relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold tracking-[0.2em] text-sm px-8 py-3 rounded transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
            >
              RETURN HOME
              <div className="absolute inset-0 rounded border border-blue-400/30 group-hover:border-blue-400/50 transition-colors" />
            </button>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-500/40" />
          </div>

          <style>{`
            @keyframes missionEndFadeIn {
              0% { opacity: 0; transform: scale(1.02); }
              100% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      {showIntro && (
        <div className="absolute inset-0 z-40 overflow-y-auto">
          <img
            src="/textures/launch-bg.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center center' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,10,0.55) 0%, rgba(0,0,10,0.7) 40%, rgba(0,0,10,0.88) 100%)' }} />
          {countdownPhase === 'countdown' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              {!countdownReady ? (
                <>
                  <div className="text-[10px] tracking-[0.6em] text-orange-400/60 font-bold mb-4 animate-pulse">INITIATING LAUNCH SEQUENCE</div>
                  <div className="w-12 h-12 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                </>
              ) : (
                <>
                  <div className="text-[10px] tracking-[0.6em] text-orange-400/60 font-bold mb-6 animate-pulse">LAUNCH SEQUENCE INITIATED</div>
                  <div
                    key={countdownNum}
                    className="font-black text-white leading-none"
                    style={{
                      fontSize: countdownNum === 0 ? '6rem' : '10rem',
                      textShadow: '0 0 80px rgba(255,107,53,0.5), 0 0 160px rgba(255,107,53,0.2)',
                      animation: 'countdownPulse 1s ease-out',
                    }}
                  >
                    {countdownNum === 0 ? 'LIFTOFF' : countdownNum}
                  </div>
                  <div className="mt-8 flex items-center gap-4">
                    <div className="h-px w-16 bg-gradient-to-r from-transparent to-orange-500/40" />
                    <div className="text-[9px] tracking-[0.4em] text-orange-300/40">ALL SYSTEMS GO</div>
                    <div className="h-px w-16 bg-gradient-to-l from-transparent to-orange-500/40" />
                  </div>
                </>
              )}
              <style>{`
                @keyframes countdownPulse {
                  0% { transform: scale(1.4); opacity: 0; }
                  25% { opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </div>
          ) : (
            <div className="min-h-full flex flex-col items-center justify-center py-12 px-6 relative z-10">
              <div className="max-w-2xl w-full">
                <div className="text-[10px] tracking-[0.6em] text-blue-500/60 mb-6 font-bold">DEEP SPACE BRIEFING</div>

                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-1 leading-none">
                  ARTEMIS <span className="text-blue-400">II</span>
                </h1>
                <div className="text-sm tracking-[0.2em] text-gray-500 mb-8">LUNAR FREE-RETURN MISSION</div>

                <div className="h-px bg-gradient-to-r from-blue-500/40 via-blue-400/20 to-transparent mb-8" />

                <div className="mb-8">
                  <div className="text-[10px] tracking-[0.3em] text-blue-400/60 font-bold mb-3">YOUR POSITION</div>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    You are seated inside NASA's <span className="text-white font-semibold">Orion MPCV</span> — the most advanced crew capsule ever built. The stars outside your window are not a projection. You are on <span className="text-white font-semibold">Launch Pad 39B</span> at Kennedy Space Center, Florida, atop the most powerful rocket in the world.
                  </p>
                </div>

                <div className="mb-8">
                  <div className="text-[10px] tracking-[0.3em] text-orange-400/60 font-bold mb-3">THE ROCKET</div>
                  <p className="text-gray-300 text-sm leading-relaxed mb-3">
                    Beneath you is the <span className="text-white font-semibold">Space Launch System (SLS)</span> — 322 feet tall, generating 8.8 million pounds of thrust. Two solid rocket boosters and four RS-25 engines (the same engines that powered the Space Shuttle) will accelerate you from zero to 17,500 mph in under eight minutes.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { val: '322 ft', label: 'ROCKET HEIGHT' },
                      { val: '8.8M lbs', label: 'THRUST' },
                      { val: '4 RS-25', label: 'ENGINES' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[0.03] rounded px-3 py-2 border border-white/[0.06]">
                        <div className="text-white font-bold text-sm font-mono">{s.val}</div>
                        <div className="text-gray-600 text-[9px] tracking-wider mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-8">
                  <div className="text-[10px] tracking-[0.3em] text-green-400/60 font-bold mb-3">CREW MANIFEST</div>
                  <div className="grid grid-cols-2 gap-2">
                    {CREW.map(c => (
                      <div key={c.name} className="flex items-center gap-2 bg-white/[0.03] rounded px-3 py-2 border border-white/[0.06]">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-700 to-indigo-900 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                          {c.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="text-white text-xs font-semibold leading-tight">{c.name}</div>
                          <div className="text-gray-500 text-[10px]">{c.role} · {c.agency}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-10">
                  <div className="text-[10px] tracking-[0.3em] text-purple-400/60 font-bold mb-3">THE MISSION</div>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    A <span className="text-white font-semibold">10-day, 695,081-mile</span> journey around the Moon and back — humanity's first crewed deep-space flight in over 50 years. You will fly to within <span className="text-white font-semibold">4,070 miles</span> of the lunar surface, set a new distance record of <span className="text-white font-semibold">252,760 miles</span> from Earth, and re-enter the atmosphere at <span className="text-white font-semibold">25,000 mph</span>.
                  </p>
                </div>

                <div className="h-px bg-gradient-to-r from-orange-500/30 via-orange-400/10 to-transparent mb-8" />

                <div className="text-center">
                  <div className="text-gray-600 text-[10px] tracking-wider mb-4">WHEN READY, INITIATE LAUNCH SEQUENCE</div>
                  <button
                    onClick={handleStart}
                    data-testid="button-launch-presentation"
                    className="group relative bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-black tracking-[0.3em] text-lg px-14 py-4 rounded transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-500/20"
                  >
                    LAUNCH
                    <div className="absolute inset-0 rounded border border-orange-400/30 group-hover:border-orange-400/50 transition-colors" />
                  </button>
                  <div className="mt-4 text-gray-700 text-[10px] tracking-wider">ENABLE AUDIO FOR MISSION NARRATION</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
