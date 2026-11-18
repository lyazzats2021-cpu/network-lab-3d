import * as THREE from 'three';

const colors = { arp: 0xffd461, frame: 0x7aeaff };
const focusColors = { source: 0x72e8ff, switch: 0xffd461, target: 0xffd461, delivered: 0x63ff9d };

export function createPacketVisual(room, cables) {
  const cableMaterials = Object.fromEntries(Object.entries(colors).map(([kind, color]) => [
    kind, new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  ]));
  const shapes = { arp: new THREE.OctahedronGeometry(.105), frame: new THREE.BoxGeometry(.145, .145, .145) };
  const haloGeometry = new THREE.SphereGeometry(.19, 12, 8);
  const pool = Array.from({ length: room.ports.size / 2 }, () => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(shapes.frame, new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false }));
    const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
      toneMapped: false, transparent: true, opacity: .23, depthTest: false, depthWrite: false,
    }));
    core.renderOrder = 5;
    halo.renderOrder = 4;
    group.add(halo, core);
    group.visible = false;
    room.scene.add(group);
    return { group, core, halo };
  });
  let previous;
  let trajectories = [];
  let originalFocus;
  const originalMaterials = new Map();

  function enter(step) {
    for (const [mesh, material] of originalMaterials) mesh.material = material;
    originalMaterials.clear();
    if (originalFocus) {
      const { material, color, intensity } = originalFocus;
      material.emissive.setHex(color);
      material.emissiveIntensity = intensity;
      originalFocus = null;
    }
    previous = step;
    trajectories = [];
    if (!step) return;

    const model = room.devices.get(step.focus);
    if (model) {
      const material = model.highlight;
      originalFocus = { material, color: material.emissive.getHex(), intensity: material.emissiveIntensity };
      material.emissive.setHex(focusColors[step.role]);
      material.emissiveIntensity = step.role === 'delivered' ? 1.55 : 1.22;
    }

    for (const move of step.moves) {
      const mesh = cables.get(move.link)?.mesh;
      if (!mesh) continue;
      originalMaterials.set(mesh, mesh.material);
      mesh.material = cableMaterials[step.kind];
      trajectories.push({ curve: mesh.geometry.parameters.path, reverse: move.reverse });
    }
    for (const [index, trajectory] of trajectories.entries()) {
      const { core, halo } = pool[index];
      core.geometry = shapes[step.kind];
      core.material.color.setHex(colors[step.kind]);
      halo.material.color.setHex(colors[step.kind]);
      // Cache the arc length once before the animation starts.
      trajectory.curve.getLengths();
    }
  }

  return {
    show(step, progress = 0, reduced = false) {
      if (step !== previous) enter(step);
      for (const [index, packet] of pool.entries()) {
        const trajectory = trajectories[index];
        packet.group.visible = Boolean(trajectory);
        if (!trajectory) continue;
        const fraction = reduced ? .5 : trajectory.reverse ? 1 - progress : progress;
        trajectory.curve.getPointAt(fraction, packet.group.position);
        packet.group.position.y = Math.max(.055, packet.group.position.y);
        packet.group.rotation.set(0, reduced ? 0 : progress * Math.PI * 2, .2);
      }
    },
  };
}
