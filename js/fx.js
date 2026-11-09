// Particles (sparks, blood, acid, dust in the beam), decals, shell casings and the post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { dotTex, holeTex, bloodTex } from './textures.js';

const N = 900;
export class FX {
  constructor(scene) {
    this.scene = scene;
    const mk = (blending) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const m = new THREE.PointsMaterial({ size: 0.06, map: dotTex(), vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true });
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
      return { p, g, parts: [], i: 0 };
    };
    this.glow = mk(THREE.AdditiveBlending);   // sparks, acid
    this.gore = mk(THREE.NormalBlending);      // blood
    this.gore.p.material.size = 0.07;
    this.holeMat = new THREE.MeshBasicMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.bloodMat = new THREE.MeshStandardMaterial({ map: bloodTex(), transparent: true, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -3 });
    this.plane = new THREE.PlaneGeometry(1, 1);
    // decals are two instanced ring buffers: one draw call each however many there are
    const ring = (mat, n) => { const m = new THREE.InstancedMesh(this.plane, mat, n); m.count = 0; m.visible = false; m.frustumCulled = false; scene.add(m); return { m, n, i: 0 }; };
    this.holes = ring(this.holeMat, 90); this.bloods = ring(this.bloodMat, 60); this._o = new THREE.Object3D(); this._t = new THREE.Vector3();
    // dust motes in the flashlight
    const dg = new THREE.BufferGeometry(), dp = new Float32Array(260 * 3);
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.018, color: 0xfff2dd, map: dotTex(), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; scene.add(this.dust); this.dustV = new Float32Array(260 * 3); this.dustInit = false;
    // brass
    this.brass = []; this.brassGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6);
    this.brassMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.9, roughness: 0.3 });
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x9a2418, metalness: 0.4, roughness: 0.5 });
  }

  emit(sys, pos, n, { col = [1, 1, 1], speed = 3, spread = 1, dir = null, life = 0.6, grav = 9, up = 1 }) {
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * up, (Math.random() - 0.5) * 2).normalize().multiplyScalar(spread);
      if (dir) v.add(dir);
      v.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const p = { pos: pos.clone(), vel: v, life: life * (0.5 + Math.random() * 0.7), max: life, col, grav, slot: sys.i };
      sys.parts[sys.i] = p; sys.i = (sys.i + 1) % N;
    }
    sys.idle = false; sys.p.visible = true;
  }
  sparks(pos, normal) { this.emit(this.glow, pos, 10, { col: [1, 0.75, 0.35], speed: 5, spread: 0.7, dir: normal, life: 0.35, grav: 12 }); this.emit(this.gore, pos, 6, { col: [0.25, 0.25, 0.24], speed: 1.2, spread: 0.6, dir: normal, life: 0.8, grav: 3 }); }
  blood(pos, dir, n = 14) { this.emit(this.gore, pos, n, { col: [0.32, 0.01, 0.01], speed: 3.5, spread: 0.8, dir: dir.clone().multiplyScalar(0.6), life: 0.8, grav: 11 }); }
  splash(pos, hex) { const c = new THREE.Color(hex); this.emit(this.glow, pos, 18, { col: [c.r, c.g, c.b], speed: 3, spread: 1, life: 0.5, grav: 8 }); }

  decal(point, normal, kind = 'hole', size = 0.13) {
    const R = kind === 'hole' ? this.holes : this.bloods, m = this._o;
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(this._t.copy(point).add(normal)); m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    m.updateMatrix(); R.m.setMatrixAt(R.i, m.matrix); R.m.instanceMatrix.needsUpdate = true;
    R.i = (R.i + 1) % R.n; R.m.count = Math.min(R.n, R.m.count + 1); R.m.visible = true;
  }
  bloodPool(pos, s = 1) { this.decal(new THREE.Vector3(pos.x, 0.005, pos.z), new THREE.Vector3(0, 1, 0), 'blood', 1.6 * s); }

  casing(origin, right, shotgun) {
    const m = new THREE.Mesh(this.brassGeo, shotgun ? this.shellMat : this.brassMat);
    if (shotgun) m.scale.set(1.8, 1.6, 1.8);
    m.position.copy(origin);
    const vel = right.clone().multiplyScalar(1.8 + Math.random()).add(new THREE.Vector3(0, 2 + Math.random(), 0));
    this.scene.add(m); this.brass.push({ m, vel, spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), life: 6, bounced: 0 });
    if (this.brass.length > 30) { this.scene.remove(this.brass[0].m); this.brass.shift(); }
  }

  clear() {
    for (const R of [this.holes, this.bloods]) { R.m.count = 0; R.i = 0; R.m.visible = false; }
    for (const b of this.brass) this.scene.remove(b.m); this.brass = [];
    for (const s of [this.glow, this.gore]) { s.parts = []; s.idle = false; }
  }

  update(dt, cam, flashOn) {
    for (const sys of [this.glow, this.gore]) {
      // nothing alive: the buffers were already parked out of sight, skip the re-upload
      if (sys.idle) continue;
      const pa = sys.g.attributes.position.array, ca = sys.g.attributes.color.array;
      let live = 0;
      for (let i = 0; i < N; i++) {
        const p = sys.parts[i];
        if (!p || p.life <= 0) { pa[i * 3 + 1] = -100; continue; }
        live++;
        p.life -= dt; p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.01) { p.pos.y = 0.01; p.vel.multiplyScalar(0.3); }
        pa[i * 3] = p.pos.x; pa[i * 3 + 1] = p.pos.y; pa[i * 3 + 2] = p.pos.z;
        const f = Math.min(1, p.life / p.max * 2);
        ca[i * 3] = p.col[0] * f; ca[i * 3 + 1] = p.col[1] * f; ca[i * 3 + 2] = p.col[2] * f;
      }
      sys.g.attributes.position.needsUpdate = true; sys.g.attributes.color.needsUpdate = true;
      sys.idle = live === 0; sys.p.visible = !sys.idle;
    }
    for (let i = this.brass.length - 1; i >= 0; i--) {
      const b = this.brass[i]; b.life -= dt;
      if (b.m.position.y > 0.02 || b.vel.y > 0) {
        b.vel.y -= 12 * dt; b.m.position.addScaledVector(b.vel, dt);
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt;
        if (b.m.position.y < 0.02) { b.m.position.y = 0.02; if (b.bounced++ < 2) { b.vel.y = -b.vel.y * 0.35; b.vel.x *= 0.5; b.vel.z *= 0.5; } else b.vel.set(0, 0, 0); b.m.rotation.x = Math.PI / 2; }
      }
      if (b.life <= 0) { this.scene.remove(b.m); this.brass.splice(i, 1); }
    }
    // dust drifts in a box ahead of the camera and only shows with the light on
    this.dust.visible = flashOn;
    if (flashOn) {
      const a = this.dust.geometry.attributes.position.array, f = new THREE.Vector3(); cam.getWorldDirection(f);
      const c = cam.position;
      for (let i = 0; i < 260; i++) {
        const k = i * 3;
        const dx = a[k] - c.x, dy = a[k + 1] - c.y, dz = a[k + 2] - c.z, fwd = dx * f.x + dy * f.y + dz * f.z;
        if (!this.dustInit || fwd < 0.3 || fwd > 6 || dx * dx + dy * dy + dz * dz > 40) {
          const d = 0.5 + Math.random() * 5.5, s = d * 0.35;
          a[k] = c.x + f.x * d + (Math.random() - 0.5) * s; a[k + 1] = c.y + f.y * d + (Math.random() - 0.5) * s; a[k + 2] = c.z + f.z * d + (Math.random() - 0.5) * s;
          this.dustV[k] = (Math.random() - 0.5) * 0.05; this.dustV[k + 1] = (Math.random() - 0.5) * 0.03; this.dustV[k + 2] = (Math.random() - 0.5) * 0.05;
        }
        a[k] += this.dustV[k] * dt; a[k + 1] += this.dustV[k + 1] * dt; a[k + 2] += this.dustV[k + 2] * dt;
      }
      this.dustInit = true; this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// ---------- post ----------
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, low: { value: 0 }, acid: { value: 0 },
    grain: { value: 0.06 }, vig: { value: 1.0 }, ca: { value: 0.0015 }, fade: { value: 0 }, fmode: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, hurt, low, acid, grain, vig, ca, fade, fmode; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*7.0) * 43758.5453); }
    void main(){
      vec2 uv = vUv, d = uv - 0.5; float r = length(d);
      // VHS: line jitter and a rolling tracking band
      if (fmode > 0.5 && fmode < 1.5) { float band = 1.0 - smoothstep(0.0, 0.03, abs(fract(uv.y * 0.6 - time * 0.11) - 0.5)); uv.x += (h(vec2(floor(uv.y * 200.0), floor(time * 24.0))) - 0.5) * 0.003 + band * 0.012; }
      float shift = ca + hurt * 0.006 + acid * 0.004 + (fmode > 0.5 && fmode < 1.5 ? 0.005 : 0.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + d * shift).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * shift).b);
      float grey = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(grey), low * 0.65);
      col *= 1.0 - smoothstep(0.35, 0.95, r) * 0.85 * vig;
      col = mix(col, col * vec3(1.6,0.25,0.2) + vec3(0.12,0.0,0.0), hurt * smoothstep(0.15, 0.75, r));
      col = mix(col, col * vec3(0.6,1.4,0.3) + vec3(0.02,0.08,0.0), acid * smoothstep(0.1, 0.8, r));
      if (fmode > 0.5 && fmode < 1.5) { col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.3) * vec3(1.06, 0.97, 0.86); col *= 0.9 + 0.1 * sin(vUv.y * 1100.0); }
      // noir: black and white, but blood and emergency light stay red
      if (fmode > 1.5) { float g = dot(col, vec3(0.3, 0.59, 0.11)); float red = clamp((col.r - max(col.g, col.b)) * 2.5, 0.0, 1.0); col = mix(vec3(pow(g, 0.9) * 1.2), col * vec3(1.4, 0.35, 0.35), red); }
      col += (h(uv * 900.0) - 0.5) * grain * (fmode > 0.5 && fmode < 1.5 ? 1.8 : 1.0);
      col *= 1.0 - fade;
      gl_FragColor = vec4(col, 1.0);
      // tone mapping + sRGB here instead of a separate OutputPass (one less full-screen pass)
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function makeComposer(renderer, scene, cam, vmScene, vmCam, quality) {
  const comp = new EffectComposer(renderer);
  comp.addPass(new RenderPass(scene, cam));
  const vm = new RenderPass(vmScene, vmCam); vm.clear = false; vm.clearDepth = true; comp.addPass(vm);
  let bloom = null;
  if (quality !== 'low') {
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 0.85);
    // the glow is a soft blur anyway: run it at a quarter of the screen size instead of half
    // (the pass halves whatever it is given), which makes it about 4x cheaper
    const setSize = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => setSize(Math.max(1, w / 2), Math.max(1, h / 2));
    comp.addPass(bloom);
  }
  const fin = new ShaderPass(FinalShader); comp.addPass(fin);
  return { comp, fin, bloom };
}
