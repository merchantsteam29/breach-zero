// The player: movement, flashlight, health, and the two weapons with their first-person models.
import * as THREE from 'three';
import * as A from './audio.js';
import { flashTex } from './textures.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const WEAPONS = {
  pistol: { mag: 12, dmg: 34, head: 2.4, pellets: 1, spread: 0.014, ads: 0.004, rate: 0.14, hold: 0.24, reload: 1.35, kick: 0.035, noise: 13 },
  shotgun: { mag: 6, dmg: 17, head: 1.6, pellets: 9, spread: 0.075, ads: 0.055, rate: 0.85, hold: 0.85, reload: 0.55, kick: 0.11, noise: 18 },
};

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.buildFlashlight(); this.buildViewmodel();
    this.resetAll();
  }

  resetAll() {
    this.hp = 100; this.medkits = 1; this.stamina = 100; this.battery = 100;
    this.ammo = { pistol: { mag: 12, reserve: 36 }, shotgun: { mag: 6, reserve: 6 } };
    this.hasShotgun = false; this.weapon = 'pistol';
    this.spawn();
  }

  // the parts of the player that carry over between floors
  save() { return { hp: this.hp, medkits: this.medkits, ammo: JSON.parse(JSON.stringify(this.ammo)), hasShotgun: this.hasShotgun, weapon: this.weapon }; }
  load(s) { Object.assign(this, JSON.parse(JSON.stringify(s))); this.spawn(); }

  spawn() {
    this.alive = true; this.vel.set(0, 0, 0); this.pos.y = 0; this.onGround = true; this.eyeH = 1.62; this.crouch = false;
    this.fireCd = 0; this.reloadT = 0; this.switchT = 0; this.healT = 0; this.recoil = 0; this.kickV = 0; this.trauma = 0; this.hurtFx = 0; this.acidFx = 0;
    this.bobPh = 0; this.land = 0; this.ads = 0; this.sprinting = false; this.flashOn = true; this.flashDead = false; this.deathT = 0; this.roll = 0; this.lastFoot = 0;
    this.heartT = 0; this.flicker = 0; this.staminaLock = false; this.muzzleT = 0; this.pumpT = 0; this.shellLoad = false;
    this.lightDir = null;
  }

  // ---------- flashlight ----------
  buildFlashlight() {
    const G = this.G;
    const L = new THREE.SpotLight(0xfff1dc, 260, 45, 0.5, 0.5, 1.6);
    L.castShadow = true; L.shadow.bias = -0.0004; L.shadow.normalBias = 0.02; L.shadow.camera.near = 0.2; L.shadow.camera.far = 38;
    L.map = G.cookie;
    G.scene.add(L); G.scene.add(L.target);
    this.light = L;
    // a weak fill so the area right around you is never pure black when the light is on
    this.fill = new THREE.PointLight(0xffe8d0, 0.6, 6, 2); G.scene.add(this.fill);
    this.muzzle = new THREE.PointLight(0xffb060, 0, 14, 2); G.scene.add(this.muzzle);
  }
  setShadowRes(n) { this.light.shadow.mapSize.set(n, n); if (this.light.shadow.map) { this.light.shadow.map.dispose(); this.light.shadow.map = null; } }

  // is the beam pointed at this spot?
  aimingAt(p, range) {
    const c = this.G.camera.position, dx = p.x - c.x, dy = 1.2 - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d > range || !this.flashOn) return false;
    const f = this.fwd; return (dx * f.x + dy * f.y + dz * f.z) / d > Math.cos(0.36);
  }

  // ---------- viewmodel ----------
  buildViewmodel() {
    const G = this.G, S = G.vmScene;
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.35, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.55, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.7 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x39423a, roughness: 0.95 });
    const box = (w, h, d, m, x = 0, y = 0, z = 0, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); (p || this).add?.(o); return o; };
    const cyl = (r, l, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); p.add(o); return o; };

    if (G.renderer) { const pm = new THREE.PMREMGenerator(G.renderer); S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; }
    for (const m of [metal, dark, wood, glove, sleeve]) m.envMapIntensity = 0.12;
    this.vmRoot = new THREE.Group(); S.add(this.vmRoot);
    // a sleeve/forearm running from a to b (local coords of parent)
    const limb = (parent, a, b, r0, r1, m) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 10), m);
      o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(o); return o;
    };
    const fist = (parent, x, y, z, m = glove) => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), m); o.scale.set(1, 1.25, 1.1); o.position.set(x, y, z); parent.add(o); return o; };
    // pistol (origin = top of the grip)
    const p = new THREE.Group(); this.vmRoot.add(p); this.pistol = p;
    const slide = new THREE.Group(); p.add(slide); this.slide = slide;
    slide.add(box(0.032, 0.034, 0.19, metal, 0, 0.017, -0.06));
    slide.add(box(0.005, 0.009, 0.01, dark, 0, 0.038, -0.145)); slide.add(box(0.022, 0.009, 0.01, dark, 0, 0.038, 0.025));
    for (let i = 0; i < 5; i++) slide.add(box(0.034, 0.03, 0.003, dark, 0, 0.017, 0.0 + i * 0.006));
    p.add(box(0.028, 0.022, 0.16, dark, 0, -0.011, -0.055));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 8), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.017, -0.158); p.add(barrel);
    const grip = box(0.029, 0.105, 0.042, dark, 0, -0.06, 0.008); grip.rotation.x = 0.28; p.add(grip);
    const guard = box(0.006, 0.006, 0.05, dark, 0, -0.035, -0.035); p.add(guard);
    this.pistolMag = box(0.022, 0.03, 0.03, metal, 0, -0.105, 0.022, p);
    fist(p, 0.004, -0.06, 0.012); fist(p, -0.022, -0.068, 0.0);
    limb(p, [0.01, -0.09, 0.03], [0.07, -0.26, 0.26], 0.034, 0.045, sleeve);
    limb(p, [-0.03, -0.095, 0.02], [-0.16, -0.27, 0.22], 0.032, 0.044, sleeve);
    p.userData.tip = new THREE.Vector3(0, 0.017, -0.17);
    // shotgun (origin = receiver)
    const s = new THREE.Group(); this.vmRoot.add(s); this.shotgun = s;
    cyl(0.016, 0.56, metal, 0, 0.012, -0.36, s);
    cyl(0.012, 0.46, dark, 0, -0.018, -0.31, s);
    s.add(box(0.046, 0.066, 0.18, metal, 0, -0.002, -0.0));
    const pumpG = new THREE.Group(); s.add(pumpG); this.pump = pumpG;
    pumpG.add(box(0.044, 0.042, 0.15, wood, 0, -0.022, -0.3));
    const stock = box(0.042, 0.075, 0.26, wood, 0, -0.035, 0.2, s); stock.rotation.x = 0.12;
    const sgr = box(0.033, 0.085, 0.042, wood, 0, -0.065, 0.09, s); sgr.rotation.x = 0.4;
    fist(s, 0, -0.07, 0.095);
    limb(s, [0.01, -0.1, 0.12], [0.08, -0.27, 0.32], 0.034, 0.045, sleeve);
    fist(pumpG, -0.004, -0.05, -0.3);
    limb(pumpG, [-0.01, -0.07, -0.29], [-0.17, -0.27, -0.02], 0.032, 0.044, sleeve);
    s.userData.tip = new THREE.Vector3(0, 0.012, -0.65);
    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.flash.scale.setScalar(0.16); S.add(this.flash);
    this.shotgun.visible = false;
    // lights for the viewmodel scene
    S.add(new THREE.HemisphereLight(0x8090a0, 0x101010, 1.1));
    this.vmLight = new THREE.PointLight(0xfff1dc, 0, 4, 2); this.vmLight.position.set(0.45, 0.35, -0.1); S.add(this.vmLight);
    this.vmMuzzle = new THREE.PointLight(0xffb060, 0, 2, 2); this.vmMuzzle.position.set(0, 0, -0.5); S.add(this.vmMuzzle);
  }

  get W() { return WEAPONS[this.weapon]; }
  get gun() { return this.weapon === 'pistol' ? this.pistol : this.shotgun; }

  // ---------- combat ----------
  tryFire(pressed) {
    const G = this.G, w = this.W, a = this.ammo[this.weapon];
    if (!this.alive || this.switchT > 0 || this.healT > 0 || this.fireCd > 0) return;
    if (this.reloadT > 0) {
      if (this.weapon === 'shotgun' && a.mag > 0) { this.reloadT = 0; this.shellLoad = false; } else return;
    }
    if (!pressed && this.weapon === 'pistol' && this.holdT < w.hold) return;
    if (a.mag <= 0) { if (pressed) { A.empty(); if (a.reserve > 0) this.reload(); } this.fireCd = 0.25; return; }
    a.mag--; this.fireCd = w.rate; this.holdT = 0; this.sprinting = false;
    A.shot(this.weapon);
    G.stats.shots++;
    const cam = G.camera, eye = cam.position.clone(), base = this.fwd.clone();
    const right = new THREE.Vector3().crossVectors(base, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, base);
    const moving = Math.hypot(this.vel.x, this.vel.z) / 7;
    const spread = THREE.MathUtils.lerp(w.spread, w.ads, this.ads) * (1 + moving * 1.2 + (this.onGround ? 0 : 1.5));
    let anyHit = false, ric = false;
    const tally = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const a1 = Math.random() * Math.PI * 2, r1 = Math.sqrt(Math.random()) * spread;
      const dir = base.clone().addScaledVector(right, Math.cos(a1) * r1).addScaledVector(up, Math.sin(a1) * r1).normalize();
      const wall = G.world.raycast(eye, dir, 80);
      const hit = G.enemies.hitTest(eye, dir, wall.dist);
      if (hit) {
        let dmg = w.dmg * (hit.head ? w.head : 1);
        if (this.weapon === 'shotgun') dmg *= THREE.MathUtils.clamp(1.25 - hit.dist / 14, 0.25, 1.15);
        const t = tally.get(hit.e) || { dmg: 0, head: false, point: hit.point, dir }; t.dmg += dmg; t.head ||= hit.head; tally.set(hit.e, t);
        G.fx.blood(hit.point, dir.clone().multiplyScalar(-1).add(dir.clone().multiplyScalar(2)), this.weapon === 'shotgun' ? 5 : 12);
        if (wall.point && wall.dist - hit.dist < 2.5 && Math.random() < 0.5) G.fx.decal(wall.point, wall.normal, 'blood', 0.5);
      } else if (wall.point) {
        G.fx.sparks(wall.point, wall.normal); G.fx.decal(wall.point, wall.normal, 'hole', this.weapon === 'shotgun' ? 0.09 : 0.12);
        if (!ric) { A.ricochet(wall.point); ric = true; }
      }
    }
    for (const [e, t] of tally) {
      anyHit = true; G.stats.hits++;
      A.fleshHit(t.point);
      const killed = G.enemies.damage(e, t.dmg, t.dir, t.head, this.weapon === 'shotgun' || t.head);
      G.ui.hitmarker(killed, t.head);
    }
    // feedback
    this.recoil += w.kick; this.kickV = 1; this.pitch += w.kick * (0.5 + Math.random() * 0.3) * (1 - this.ads * 0.4); this.yaw += (Math.random() - 0.5) * w.kick * 0.3;
    this.trauma = Math.min(1, this.trauma + (this.weapon === 'shotgun' ? 0.35 : 0.12));
    this.muzzleT = 0.06;
    G.enemies.noise(w.noise);
    if (this.weapon === 'pistol') { G.fx.casing(eye.clone().addScaledVector(right, 0.25).addScaledVector(up, -0.1).addScaledVector(base, 0.4), right, false); A.brass(); }
    else { this.pumpT = 0.55; setTimeout(() => this.alive && A.pump(), 330); }
    if (a.mag === 0 && a.reserve > 0) setTimeout(() => this.reloadT <= 0 && this.ammo[this.weapon].mag === 0 && this.reload(), 350);
  }

  reload() {
    const a = this.ammo[this.weapon], w = this.W;
    if (this.reloadT > 0 || this.switchT > 0 || this.healT > 0 || a.mag >= w.mag || a.reserve <= 0 || !this.alive) return;
    this.sprinting = false;
    if (this.weapon === 'pistol') { this.reloadT = w.reload; this.reloadMax = w.reload; A.reloadSeq('pistol'); }
    else { this.reloadT = w.reload + 0.3; this.reloadMax = this.reloadT; this.shellLoad = true; }
  }

  switchTo(name) {
    if (name === this.weapon || !this.alive || this.healT > 0) return;
    if (name === 'shotgun' && !this.hasShotgun) return;
    this.weapon = name; this.reloadT = 0; this.shellLoad = false; this.switchT = 0.45; A.click(900, 0.3); A.click(1500, 0.2, 0.15);
    this.pistol.visible = name === 'pistol'; this.shotgun.visible = name === 'shotgun';
  }

  useMedkit() {
    if (this.medkits <= 0 || this.hp >= 100 || this.healT > 0 || !this.alive) return;
    this.medkits--; this.healT = 1.2; this.reloadT = 0; this.sprinting = false; A.click(700, 0.3); A.click(500, 0.2, 0.2);
  }

  damage(amt, from, knock = 2, kind) {
    if (!this.alive || this.G.god) return;
    this.hp -= amt; this.trauma = Math.min(1, this.trauma + 0.45 + amt / 60); this.hurtFx = Math.min(1, this.hurtFx + 0.5 + amt / 40);
    if (kind === 'acid') this.acidFx = 1;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x += dx / d * knock; this.vel.z += dz / d * knock;
    this.roll += (Math.random() - 0.5) * 0.12;
    A.hurt();
    this.G.ui.damageDir(from);
    this.G.stats.taken += amt;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.deathT = 0; this.G.onDeath(); }
  }

  // ---------- frame ----------
  update(dt, I) {
    const G = this.G, S = G.settings, cam = G.camera;
    // look
    if (this.alive && I.locked) {
      const sens = 0.0021 * S.sens;
      this.yaw -= I.dx * sens * (1 - this.ads * 0.35); this.pitch -= I.dy * sens * (S.invert ? -1 : 1) * (1 - this.ads * 0.35);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    }
    // recoil recovers
    const rec = Math.min(this.recoil, dt * 0.35); this.recoil -= rec; this.pitch -= rec * 0.35;

    const fwd2 = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right2 = new THREE.Vector3(-fwd2.z, 0, fwd2.x);
    const k = I.keys;
    let mx = 0, mz = 0;
    if (this.alive && G.state === 'play') { if (k.KeyW) mz += 1; if (k.KeyS) mz -= 1; if (k.KeyD) mx += 1; if (k.KeyA) mx -= 1; }
    const wish = fwd2.clone().multiplyScalar(mz).addScaledVector(right2, mx); if (wish.lengthSq() > 0) wish.normalize();
    this.crouch = this.alive && k.KeyC && G.state === 'play';
    this.ads = THREE.MathUtils.damp(this.ads, I.rmb && this.alive && this.reloadT <= 0 && this.healT <= 0 && !this.sprinting ? 1 : 0, 14, dt);
    // sprint
    const wantSprint = k.ShiftLeft && mz > 0 && !this.crouch && this.alive;
    if (this.stamina <= 0) this.staminaLock = true; if (this.stamina > 25) this.staminaLock = false;
    this.sprinting = wantSprint && !this.staminaLock && this.reloadT <= 0 && this.healT <= 0;
    let speed = this.crouch ? 2.3 : this.sprinting ? 7.4 : 4.5;
    speed *= 1 - this.ads * 0.35;
    if (this.healT > 0) speed *= 0.55;
    if (this.sprinting && Math.hypot(this.vel.x, this.vel.z) > 3) { this.stamina -= dt * 20; this.staminaRegenT = 0.9; }
    else { this.staminaRegenT = (this.staminaRegenT || 0) - dt; if (this.staminaRegenT <= 0) this.stamina += dt * (this.crouch ? 26 : 17); }
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);
    // accelerate
    const acc = this.onGround ? (wish.lengthSq() ? 11 : 9) : 1.8;
    this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x * speed, acc, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z * speed, acc, dt);
    // jump + gravity
    if (I.jump && this.onGround && this.alive && this.stamina >= 6 && !this.crouch) { this.vel.y = 6.0; this.onGround = false; this.stamina -= 6; A.footstep(0.6); G.enemies.noise(2); }
    I.jump = false;
    this.vel.y -= 17 * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    const ground = G.world.collide(this.pos, 0.36, this.pos.y);
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -3) { this.land = Math.min(1, -this.vel.y / 10); A.land(this.land); if (this.vel.y < -6) G.enemies.noise(3); }
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) this.onGround = false;
    if (this.pos.y < ground + 0.3 && this.vel.y <= 0 && this.pos.y > ground) { this.pos.y = THREE.MathUtils.damp(this.pos.y, ground, 25, dt); }

    // head bob + footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bobPh += dt * hs * (this.sprinting ? 1.55 : 1.85);
      const step = Math.floor(this.bobPh / Math.PI);
      if (step !== this.lastFoot) {
        this.lastFoot = step;
        A.footstep(this.crouch ? 0.35 : this.sprinting ? 1.3 : 0.8);
        G.enemies.noise(this.crouch ? 0 : this.sprinting ? 4 : 1);
      }
    }
    this.land = Math.max(0, this.land - dt * 3);
    const targetEye = !this.alive ? 0.25 : this.crouch ? 1.05 : 1.62;
    this.eyeH = THREE.MathUtils.damp(this.eyeH, targetEye, !this.alive ? 3 : 12, dt);
    const bobAmt = S.bob ? Math.min(1, hs / 5) : 0;
    const bobY = Math.abs(Math.sin(this.bobPh)) * 0.055 * bobAmt, bobX = Math.cos(this.bobPh) * 0.03 * bobAmt;

    // camera
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * (S.reduceFlash ? 0.4 : 1), t = performance.now() / 1000;
    const shx = (Math.sin(t * 37) + Math.sin(t * 61)) * 0.5 * sh * 0.05, shy = (Math.sin(t * 43 + 1) + Math.sin(t * 71)) * 0.5 * sh * 0.05;
    this.roll = THREE.MathUtils.damp(this.roll, 0, 4, dt);
    if (!this.alive) { this.deathT += dt; this.roll = THREE.MathUtils.damp(this.roll, 1.2, 2, dt); }
    cam.position.set(this.pos.x + right2.x * bobX, this.pos.y + this.eyeH + bobY - this.land * 0.18, this.pos.z + right2.z * bobX);
    cam.rotation.set(this.pitch + shy, this.yaw + shx, this.roll - mx * 0.012 * (1 - this.ads), 'YXZ');
    const fov = S.fov * (1 - this.ads * 0.18) + (this.sprinting ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = THREE.MathUtils.damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }
    this.fwd = cam.getWorldDirection(this.fwd || new THREE.Vector3());

    // flashlight: drains on, recharges off; flickers when low
    if (this.flashOn) { this.battery -= dt * 0.85; if (this.battery <= 0) { this.battery = 0; this.flashOn = false; this.flashDead = true; A.flashlight(false); } }
    else { this.battery = Math.min(100, this.battery + dt * (this.flashDead ? 7 : 5)); if (this.flashDead && this.battery > 20) this.flashDead = false; }
    let fl = this.flashOn ? 1 : 0;
    if (this.flashOn && this.battery < 22) { this.flicker -= dt; if (this.flicker <= 0) this.flicker = Math.random() < 0.08 ? 0.12 : 0.05; if (this.flicker > 0.06) fl *= 0.15; else fl *= 0.55 + this.battery / 50; }
    if (G.blackout > 0 && Math.random() < 0.4) fl *= 0.2;
    const off = new THREE.Vector3(0.22, -0.18, 0).applyEuler(cam.rotation);
    // the bulb sits a little behind the eye so things right in your face do not white out
    this.light.position.copy(cam.position).add(off).addScaledVector(this.fwd, -0.7);
    if (!this.lightDir) this.lightDir = this.fwd.clone();
    this.lightDir.lerp(this.fwd, Math.min(1, dt * 16)).normalize();
    this.light.target.position.copy(cam.position).addScaledVector(this.lightDir, 10);
    this.aimDist = THREE.MathUtils.damp(this.aimDist || 6, G.world ? Math.min(G.world.raycast(cam.position, this.fwd, 12).dist, G.enemies.hitTest(cam.position, this.fwd, 12)?.dist ?? 12) : 6, 10, dt);
    const near = THREE.MathUtils.clamp(Math.pow((this.aimDist + 0.7) / 6.7, 1.6), 0.08, 1);
    this.light.intensity = 260 * fl * near; this.fill.intensity = 1.6 * fl; this.fill.position.copy(cam.position);
    this.vmLight.intensity = 0.6 * fl;
    this.light.visible = true;

    // timers
    this.fireCd -= dt; this.switchT = Math.max(0, this.switchT - dt); this.holdT = (this.holdT || 0) + dt;
    if (this.muzzleT > 0) this.muzzleT -= dt;
    const mz2 = this.muzzleT > 0 ? 1 : 0;
    this.muzzle.intensity = mz2 * (this.weapon === 'shotgun' ? 70 : 40) * (S.reduceFlash ? 0.3 : 1);
    this.muzzle.position.copy(cam.position).addScaledVector(this.fwd, 0.8);
    this.vmMuzzle.intensity = mz2 * 1.5;
    if ((I.lmb || I.lmbEdge) && G.state === 'play') this.tryFire(I.lmbEdge); I.lmbEdge = false;
    // reload progress
    if (this.reloadT > 0) {
      this.reloadT -= dt; const a = this.ammo[this.weapon];
      if (this.reloadT <= 0) {
        if (this.weapon === 'pistol') { const n = Math.min(12 - a.mag, a.reserve); a.mag += n; a.reserve -= n; }
        else if (this.shellLoad) { a.mag++; a.reserve--; A.shell(); if (a.mag < 6 && a.reserve > 0) { this.reloadT = WEAPONS.shotgun.reload; this.reloadMax = this.reloadT; } else { this.shellLoad = false; A.pump(); } }
      }
    }
    if (this.healT > 0) { this.healT -= dt; if (this.healT <= 0) { this.hp = Math.min(100, this.hp + 45); A.heal(); G.ui.flash('+45 HEALTH'); } }
    this.pumpT = Math.max(0, this.pumpT - dt);
    // low health heartbeat
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.2); this.acidFx = Math.max(0, this.acidFx - dt * 0.8);
    if (this.alive && this.hp < 40) { this.heartT -= dt; if (this.heartT <= 0) { A.heartbeat(1 - this.hp / 40 + 0.3); this.heartT = 0.55 + this.hp / 60; } }
    if (this.alive && this.stamina < 25 && Math.random() < dt * 1.5) A.breath(1);

    this.animateViewmodel(dt, hs, bobAmt, I);
  }

  animateViewmodel(dt, hs, bobAmt, I) {
    const g = this.gun, t = performance.now() / 1000;
    const base = this.weapon === 'pistol' ? new THREE.Vector3(0.13, -0.135, -0.36) : new THREE.Vector3(0.14, -0.15, -0.34);
    const adsPos = this.weapon === 'pistol' ? new THREE.Vector3(0, -0.055, -0.3) : new THREE.Vector3(0, -0.06, -0.26);
    const p = base.lerp(adsPos, this.ads);
    // sway with mouse
    this.swayX = THREE.MathUtils.damp(this.swayX || 0, THREE.MathUtils.clamp(-I.dx * 0.0006, -0.04, 0.04), 8, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY || 0, THREE.MathUtils.clamp(I.dy * 0.0006, -0.04, 0.04), 8, dt);
    const bob = 1 - this.ads * 0.85;
    p.x += this.swayX + Math.cos(this.bobPh) * 0.012 * bobAmt * bob;
    p.y += this.swayY - Math.abs(Math.sin(this.bobPh)) * 0.014 * bobAmt * bob + Math.sin(t * 1.3) * 0.002 - this.land * 0.04;
    // kick
    this.kickV = THREE.MathUtils.damp(this.kickV, 0, 14, dt);
    const kick = this.kickV * (this.weapon === 'shotgun' ? 1.6 : 1);
    p.z += kick * 0.06;
    let rx = kick * 0.22, ry = 0, rz = 0;
    // sprint pose / switch / reload / heal dip
    const sprint = this.sprinting ? 1 : 0;
    this.sprintPose = THREE.MathUtils.damp(this.sprintPose || 0, sprint, 8, dt);
    p.y -= this.sprintPose * 0.05; p.x -= this.sprintPose * 0.02; rx -= this.sprintPose * 0.35; ry += this.sprintPose * 0.6;
    if (this.switchT > 0) { const s = this.switchT / 0.45; p.y -= s * 0.25; rx -= s * 0.6; }
    if (this.reloadT > 0) {
      const r = 1 - this.reloadT / this.reloadMax, s = Math.sin(Math.min(1, r) * Math.PI);
      if (this.weapon === 'pistol') { rz += s * 0.6; rx += s * 0.25; p.y -= s * 0.04; this.pistolMag.position.y = -0.105 - Math.sin(Math.min(1, r * 1.6) * Math.PI) * 0.12; }
      else { rz -= 0.35; rx += 0.15; p.y -= 0.03; this.pump.position.z = 0; }
    } else this.pistolMag.position.y = -0.105;
    if (this.healT > 0) { const s = Math.sin((1 - this.healT / 1.2) * Math.PI); p.y -= s * 0.3; rx -= s * 0.7; }
    if (!this.alive) p.y -= 0.5;
    // slide / pump
    this.slide.position.z = this.weapon === 'pistol' ? (this.muzzleT > 0 ? 0.04 : THREE.MathUtils.damp(this.slide.position.z, this.ammo.pistol.mag === 0 ? 0.035 : 0, 20, dt)) : 0;
    if (this.weapon === 'shotgun' && this.reloadT <= 0) { const pt = this.pumpT > 0 && this.pumpT < 0.3 ? Math.sin((0.3 - this.pumpT) / 0.3 * Math.PI) : 0; this.pump.position.z = pt * 0.09; }
    g.position.copy(p); g.rotation.set(rx, ry, rz);
    // muzzle flash sprite at the barrel tip
    const tip = g.userData.tip.clone(); g.localToWorld(tip);
    this.flash.position.copy(tip);
    this.flash.material.opacity = this.muzzleT > 0 ? 1 : 0;
    this.flash.material.rotation = Math.random() * 6;
    this.flash.scale.setScalar((this.weapon === 'shotgun' ? 0.28 : 0.17) * (0.8 + Math.random() * 0.4));
  }
}
