import * as THREE from 'three';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...options });

const palette = {
  navy: material(0x162c45),
  dark: material(0x223a53),
  steel: material(0x47657a),
  pale: material(0xd3e6e2),
  white: material(0xf3f4e5),
  wall: material(0x274b5e),
  rail: material(0x365d68),
  base: material(0x135a65),
  floor: material(0x457779),
  teal: material(0x32bcac),
  green: material(0x73d59b),
  aqua: material(0x77e3ee),
  gold: material(0xffcb55),
  black: material(0x102334),
  light: material(0xa4fff1, { emissive: 0x54e6db, emissiveIntensity: .65 }),
  led: material(0x94fa9a, { emissive: 0x67fa82, emissiveIntensity: 1.05 }),
};

function block(parent, surface, size, center, shadows = true) {
  const mesh = new THREE.Mesh(boxGeometry, surface);
  mesh.position.set(...center);
  mesh.scale.set(...size);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function rod(parent, surface, radius, from, to) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(cylinderGeometry, surface);
  mesh.position.copy(start.lerp(end, .5));
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
  mesh.scale.set(radius, direction.length(), radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function graphic(parent, size, center, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round(canvas.width * size[1] / size[0]);
  const context = canvas.getContext('2d');
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set(...center);
  parent.add(mesh);
  return mesh;
}

function makeRoom(lab) {
  block(lab, palette.black, [10.75, .19, 7.75], [0, -.34, 0], false);
  block(lab, palette.base, [10.85, .30, 7.85], [0, -.17, 0], false);
  block(lab, palette.floor, [10.63, .06, 7.63], [0, -.03, 0], false);
  block(lab, palette.teal, [10.7, .036, .035], [0, -.12, 3.93], false);
  block(lab, palette.teal, [.035, .036, 7.82], [5.43, -.12, 0], false);

  const gridPoints = [];
  for (let x = -5; x <= 5; x++) gridPoints.push(x, .006, -3.81, x, .006, 3.81);
  for (let z = -3.5; z <= 3.5; z++) gridPoints.push(-5.30, .006, z, 5.30, .006, z);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  lab.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0xbedbd0, transparent: true, opacity: .25 })));

  const back = new THREE.Group();
  const left = new THREE.Group();
  lab.add(back, left);
  block(back, palette.wall, [10.7, 3.85, .18], [0, 1.92, -3.73], false);
  block(back, palette.teal, [10.73, .07, .22], [0, 3.87, -3.73], false);
  block(back, palette.base, [10.61, .29, .10], [0, .15, -3.60], false);
  block(back, palette.rail, [10.65, .075, .058], [0, 2.72, -3.60], false);
  block(back, palette.light, [9.80, .027, .043], [0, 3.52, -3.613], false);
  block(left, palette.rail, [.18, 3.4, 4.1], [-5.24, 1.71, -1.65], false);
  block(left, palette.teal, [.22, .07, 4.12], [-5.24, 3.43, -1.65], false);
  block(left, palette.base, [.09, .28, 4], [-5.11, .15, -1.66], false);
  block(left, palette.light, [.040, .033, 3.64], [-5.13, 3.16, -1.68], false);

  for (let i = 0; i < 7; i++) {
    block(left, palette.wall, [.045, 1.68, .13], [-5.13, 1.91, -.15 - i * .28], false);
  }

  for (const x of [-3.25, 3.25]) {
    block(back, palette.navy, [2.85, 1.57, .05], [x, 1.84, -3.57], false);
    block(back, palette.base, [2.69, 1.42, .03], [x, 1.84, -3.53], false);
    for (let i = 0; i < 8; i++) {
      block(back, i % 2 ? palette.rail : palette.floor, [.095, 1.17, .06], [x - 1.09 + i * .31, 1.84, -3.49], false);
    }
  }

  block(back, palette.navy, [3.48, 1.15, .10], [0, 2.87, -3.56], false);
  graphic(back, [3.37, 1.04], [0, 2.87, -3.502], (ctx, width, height) => {
    ctx.fillStyle = '#16364a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#47807d';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.strokeStyle = '#7ae0ab';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(68, 82);
    ctx.lineTo(114, 120);
    ctx.lineTo(68, 158);
    ctx.stroke();
    ctx.fillStyle = '#a4f0bd';
    for (const [x, y] of [[68, 82], [114, 120], [68, 158]]) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#eefaf1';
    ctx.font = 'bold 57px sans-serif';
    ctx.fillText('NETWORK LAB', 151, 118);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#a0dcb9';
    ctx.fillText('ЛОКАЛЬНАЯ СЕТЬ  /  LAN', 156, 162);
  });
  return { back, left };
}

function table(lab, x, z) {
  const table = new THREE.Group();
  table.position.set(x, 0, z);
  lab.add(table);
  block(table, palette.pale, [3.32, .16, 1.82], [0, 1.43, 0]);
  block(table, palette.teal, [3.33, .059, .043], [0, 1.41, .91]);
  for (const side of [-1, 1]) {
    const legX = side * 1.47;
    for (const legZ of [-.69, .69]) {
      block(table, palette.dark, [.13, 1.35, .13], [legX, .69, legZ]);
      block(table, palette.black, [.16, .06, .16], [legX, .035, legZ]);
    }
    block(table, palette.steel, [.12, .10, 1.47], [legX, .33, 0]);
  }
  block(table, palette.steel, [2.93, .14, .10], [0, 1.04, -.68]);
}

function chair(lab, x, z, accent, angle) {
  const chair = new THREE.Group();
  chair.position.set(x, 0, z);
  chair.rotation.y = angle;
  lab.add(chair);
  rod(chair, palette.steel, .069, [0, .11, 0], [0, .70, 0]);
  for (let spoke = 0; spoke < 5; spoke++) {
    const angle = spoke * Math.PI * .4;
    const x = Math.cos(angle) * .44;
    const z = Math.sin(angle) * .44;
    rod(chair, palette.navy, .035, [0, .15, 0], [x, .10, z]);
    block(chair, palette.black, [.09, .12, .09], [x, .06, z]);
  }
  block(chair, palette.navy, [.91, .14, .76], [0, .70, 0]);
  block(chair, accent, [.85, .087, .68], [0, .79, -.025]);
  for (const x of [-.25, .25]) {
    rod(chair, palette.dark, .042, [x, .70, .28], [x, 1.27, .41]);
  }
  block(chair, palette.dark, [.91, .55, .12], [0, 1.28, .45]);
  block(chair, accent, [.82, .45, .065], [0, 1.29, .38]);
}

function deviceGroup(lab, objects, id, position, color) {
  const group = new THREE.Group();
  group.position.set(...position);
  group.userData.deviceId = id;
  lab.add(group);
  const highlight = material(color, { emissive: 0x71ffae, emissiveIntensity: 0 });
  const device = { group, highlight, anchor: new THREE.Vector3() };
  objects.set(id, device);
  return device;
}

function computer(lab, objects, id, x, side, accent) {
  const z = -1.75;
  table(lab, x, z);
  chair(lab, x - side * .27, .28, accent, side * .19);
  const { group, highlight, anchor } = deviceGroup(lab, objects, id, [x, 1.51, z], accent.color);
  const screenX = -side * .29;
  const caseX = side * 1.04;
  block(group, highlight, [2.94, .039, 1.58], [0, .025, .012], false);
  block(group, palette.dark, [2.87, .047, 1.51], [0, .054, .012], false);
  block(group, palette.navy, [.64, .07, .39], [screenX, .111, -.21]);
  block(group, palette.steel, [.16, .42, .12], [screenX, .29, -.23]);
  block(group, highlight, [1.76, 1.04, .115], [screenX, .98, -.25]);
  block(group, palette.navy, [1.68, .96, .065], [screenX, .98, -.179]);
  graphic(group, [1.55, .84], [screenX, .993, -.144], (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#102a47');
    gradient.addColorStop(1, side < 0 ? '#087986' : '#1b6361');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#a2f5d72b';
    ctx.lineWidth = 2;
    for (let x = 32; x < width; x += 52) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 32; y < height; y += 52) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#9beec1';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('ETHERNET / LAN', 49, 79);
    ctx.fillStyle = '#f0fff7';
    ctx.font = 'bold 105px sans-serif';
    ctx.fillText(side < 0 ? 'ПК 01' : 'ПК 02', 44, 221);
    ctx.fillStyle = '#b3e6de';
    ctx.font = '29px sans-serif';
    ctx.fillText('●  ПОДКЛЮЧЁН', 49, 302);
    ctx.strokeStyle = '#abf3d1';
    ctx.lineWidth = 7;
    ctx.strokeRect(563, 119, 130, 90);
    ctx.fillRect(620, 212, 16, 43);
    ctx.fillRect(586, 253, 84, 7);
  });
  block(group, palette.led, [.075, .014, .015], [screenX + .66, .531, -.136]);

  block(group, palette.navy, [.51, .91, .69], [caseX, .526, -.23]);
  block(group, highlight, [.52, .044, .70], [caseX, .994, -.23]);
  block(group, palette.steel, [.44, .78, .035], [caseX, .52, .128]);
  block(group, palette.black, [.38, .65, .019], [caseX, .55, .154]);
  for (let slot = 0; slot < 5; slot++) {
    block(group, palette.rail, [.25, .023, .016], [caseX, .39 + slot * .073, .169]);
  }
  block(group, palette.led, [.075, .025, .015], [caseX, .80, .169]);
  block(group, palette.dark, [.18, .15, .047], [caseX, .46, -.595]);

  block(group, palette.navy, [1.13, .058, .34], [screenX, .113, .48]);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 11; column++) {
      block(group, palette.steel, [.076, .012, .061], [screenX - .46 + column * .091, .147, .39 + row * .081], false);
    }
  }
  block(group, palette.navy, [.21, .083, .31], [screenX + side * .78, .122, .50]);
  block(group, accent, [.027, .014, .100], [screenX + side * .78, .166, .50]);
  anchor.set(x + screenX, 3.13, z - .19);
  return [x + caseX, 1.97, z - .63];
}

function networkSwitch(lab, objects) {
  const z = .56;
  const { group, highlight, anchor } = deviceGroup(lab, objects, 'switch', [0, .94, z], 0x73d59b);
  block(lab, palette.navy, [2.43, .14, 1.41], [0, .077, z]);
  block(lab, palette.dark, [2.22, .78, 1.19], [0, .49, z]);
  block(lab, palette.rail, [1.91, .66, .041], [0, .48, z + .604]);
  block(lab, palette.navy, [1.79, .56, .03], [0, .48, z + .629]);
  block(lab, palette.pale, [2.41, .105, 1.36], [0, .898, z]);
  block(lab, palette.teal, [2.42, .040, .04], [0, .89, z + .68]);
  for (const x of [-.77, .77]) {
    block(lab, palette.teal, [.045, .37, .047], [x, .48, z + .656]);
  }

  block(group, palette.navy, [2.15, .32, .91], [0, .19, 0]);
  block(group, highlight, [2.16, .06, .91], [0, .36, 0]);
  block(group, palette.dark, [2.09, .27, .04], [0, .19, .462]);
  for (let port = 0; port < 8; port++) {
    const x = -.84 + port * .214;
    block(group, palette.steel, [.175, .145, .028], [x, .17, .49]);
    block(group, palette.black, [.125, .096, .022], [x, .17, .508]);
    block(group, port < 2 ? palette.led : palette.rail, [.070, .025, .022], [x, .275, .492]);
  }
  for (let slot = 0; slot < 5; slot++) {
    block(group, palette.base, [.038, .016, .23], [.58 + slot * .077, .394, -.18], false);
  }
  graphic(group, [.92, .20], [-.40, .394, -.15], (ctx, width, height) => {
    ctx.fillStyle = '#20554c';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e9fff0';
    ctx.font = 'bold 82px sans-serif';
    ctx.fillText('LAN SWITCH', 93, 109);
  }).rotation.x = -Math.PI / 2;
  anchor.set(0, 1.52, z + .46);
  return [[-.84, 1.11, z + .54], [-.626, 1.11, z + .54]];
}

function cable(lab, surface, points) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, .043, 8), surface);
  mesh.castShadow = true;
  lab.add(mesh);
  block(lab, surface, [.111, .085, .14], points[0]);
  block(lab, surface, [.111, .085, .15], points.at(-1));
}

export function createLab(scene) {
  const lab = new THREE.Group();
  scene.add(lab);
  const walls = makeRoom(lab);
  const devices = new Map();
  const pc1 = computer(lab, devices, 'pc-01', -2.96, -1, palette.aqua);
  const pc2 = computer(lab, devices, 'pc-02', 2.96, 1, palette.gold);
  const [port1, port2] = networkSwitch(lab, devices);
  cable(lab, palette.aqua, [port1, [-.84, 1.09, 1.33], [-.96, .86, 1.42], [-1.18, .14, 1.49], [-1.47, .065, 1.39], [-2.30, .065, .99], [-3.79, .065, .93], [-4.61, .065, .60], [-4.84, .065, -.37], [-4.83, .065, -2.42], [-4.61, .34, -2.84], [-4.33, 1.54, -2.81], [-4.04, 1.97, -2.58], pc1]);
  cable(lab, palette.gold, [port2, [-.62, 1.11, 1.39], [-.46, .77, 1.55], [-.19, .16, 1.61], [.17, .065, 1.60], [1.56, .065, 1.45], [2.72, .065, .99], [4.22, .065, .80], [4.79, .065, .21], [4.86, .065, -2.20], [4.65, .30, -2.76], [4.41, 1.45, -2.80], [4.04, 1.97, -2.58], pc2]);

  const plant = new THREE.Group();
  plant.position.set(4.69, 0, -2.99);
  lab.add(plant);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.25, .18, .40, 12), palette.gold);
  pot.position.y = .21;
  pot.castShadow = true;
  plant.add(pot);
  for (const [x, y, z] of [[.16, .84, .01], [-.28, .70, -.08], [.12, .70, .23], [0, .93, -.19], [-.19, .61, .19]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), palette.green);
    leaf.position.set(x, y, z);
    leaf.scale.set(.115, .29, .082);
    leaf.rotation.z = -x * 3;
    rod(plant, palette.teal, .023, [0, .38, 0], [x, y, z]);
    plant.add(leaf);
  }

  const hemi = new THREE.HemisphereLight(0xdaf6ff, 0x8faab5, 2.15);
  const key = new THREE.DirectionalLight(0xfff4d8, 2.7);
  key.position.set(-3, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, far: 23 });
  key.shadow.normalBias = .022;
  const fill = new THREE.DirectionalLight(0x93dfff, .65);
  fill.position.set(7, 4, -3);
  scene.add(hemi, key, fill);
  return { lab, walls, devices };
}
