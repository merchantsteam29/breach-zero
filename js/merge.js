// Merge a node's direct mesh children that share a material into one mesh (one draw call).
// Children in `keep` (animated parts, things other code holds on to) are left alone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeChildren(node, keep = new Set()) {
  const byMat = new Map();
  for (const c of node.children) {
    if (!c.isMesh || keep.has(c) || c.children.length) continue;
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(c);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((c) => { c.updateMatrix(); const g = c.geometry.clone().applyMatrix4(c.matrix); return g.index ? g.toNonIndexed() : g; });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = list.some((c) => c.castShadow); mesh.receiveShadow = list.some((c) => c.receiveShadow);
    for (const c of list) node.remove(c);
    node.add(mesh);
  }
}
