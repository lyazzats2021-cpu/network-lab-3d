import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { devices } from './devices.js';
import { createLab, makePracticeCable } from './lab.js';
import { createPractice } from './practice.js';
import { createIpPractice } from './ip-practice.js';
import { createPacketJourney } from './packet-journey.js';
import { createPacketVisual } from './packet-visual.js';
import { computers, portLabel } from './topology.js';
import './style.css';

const paths = {
  network: '<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 7.5v4.5M5 16v-4h14v4"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 20V12M3 7l9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  rotate: '<path d="M3 12a9 9 0 1 1 2.7 6.4M3 12V5m0 7h7"/>',
  hand: '<path d="M8 13V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8a8 8 0 0 1-8 8c-2.2 0-4.2-1-5.6-2.5L3 15a2 2 0 0 1 3-2.6L8 15"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  pointer: '<path d="m4 3 15 9-7 1.5-3 6.5L4 3Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
  switch: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M6 12h2m3 0h2m3 0h2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  cable: '<path d="M5 2v4m4-4v4M4 6h6v3l-3 2-3-2V6Zm3 5v4a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4v-2m-3-5h6v3l-3 2-3-2V8Zm1-4v4m4-4v4"/>',
};

function icon(name) {
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

document.querySelectorAll('[data-icon]').forEach(element => {
  element.innerHTML = icon(element.dataset.icon);
});

const host = document.querySelector('#render-host');
const markers = document.querySelector('#markers');
const message = document.querySelector('#scene-message');
const info = document.querySelector('#device-info');
const list = document.querySelector('#device-list');
const zoomIn = document.querySelector('#zoom-in');
const zoomOut = document.querySelector('#zoom-out');
const reset = document.querySelector('#reset');
const cameraButtons = [zoomIn, zoomOut, reset];

const buttons = new Map();
const labels = new Map();
const practiceLabels = new Map();
const pcPortMarker = document.createElement('button');
pcPortMarker.type = 'button';
pcPortMarker.className = 'marker';
pcPortMarker.dataset.port = '';
pcPortMarker.hidden = true;
pcPortMarker.textContent = 'RJ‑45';
markers.append(pcPortMarker);
let mode = 'overview';
let ipState;
let packetSender;
let practiceState;
let selection;
let viewer;

for (const device of devices) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'device-button';
  button.innerHTML = `
    <span class="device-icon" data-icon>${icon(device.icon)}</span>
    <span><strong>${device.label}</strong><small>${device.type}</small></span>
    <span class="device-chevron">${icon('chevron')}</span>`;
  button.addEventListener('click', () => selectDevice(device.id));
  list.append(button);
  buttons.set(device.id, button);

  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'marker';
  marker.hidden = true;
  marker.innerHTML = `${icon(device.icon)}<span>${device.label}</span>`;
  marker.addEventListener('click', () => selectDevice(device.id));
  markers.append(marker);
  labels.set(device.id, marker);
}

const practicePanel = document.querySelector('#practice-panel');
const practice = createPractice(practicePanel, state => {
  practiceState = state;
  refreshPracticeScene();
}, () => viewer?.resetCamera());

const ipPanel = document.querySelector('#ip-panel');
const ipPractice = createIpPractice(ipPanel, () => practiceState.links, state => {
  ipState = state;
  refreshPracticeScene();
}, path => viewer?.showProbe(path));

const packetTasks = document.querySelector('#packet-tasks');
const packetJourney = createPacketJourney(
  document.querySelector('#packet-panel'), packetTasks,
  ipPractice.getSaved, () => practiceState.links,
  (step, progress, reduced) => viewer?.showPacket(step, progress, reduced),
  from => {
    packetSender = from;
    refreshPracticeScene();
  },
);

function refreshPracticeScene() {
  const ip = mode === 'ip';
  const selected = mode === 'packet' ? packetSender : ip ? ipState.selected : practiceState.selected;
  for (const [id, label] of practiceLabels) {
    const status = ip ? ipState.statuses.get(id) : null;
    label.setAttribute('aria-pressed', String(id === selected));
    if (status) {
      label.dataset.ipStatus = status.state;
      label.setAttribute('aria-label', `${portLabel(id)} · ${status.label}`);
    } else {
      delete label.dataset.ipStatus;
      label.removeAttribute('aria-label');
    }
    if (id !== 'switch') {
      label.dataset.connected = String(!ip && practiceState.links.some(link => link.includes(id)));
    }
  }
  viewer?.updatePractice({
    selected,
    source: mode === 'practice' ? practiceState.source : null,
    links: practiceState.links,
  });
}

for (const id of [...computers, 'switch']) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'marker';
  marker.hidden = true;
  marker.innerHTML = id === 'switch' ? `${icon('switch')} Коммутатор` : `${icon('monitor')} ${portLabel(id)}`;
  marker.setAttribute('aria-pressed', 'false');
  marker.addEventListener('click', () => selectPracticeDevice(id));
  markers.append(marker);
  practiceLabels.set(id, marker);
}
pcPortMarker.addEventListener('click', () => practice.selectPort(practiceState.selected));

function selectPracticeDevice(id) {
  if (mode === 'ip') ipPractice.selectDevice(id);
  else if (mode === 'packet') packetJourney.chooseSender(id);
  else practice.selectDevice(id);
}

function selectDevice(id) {
  if (selection === id) return;
  selection = id;
  const device = devices.find(device => device.id === id);
  for (const item of devices) {
    const pressed = String(item.id === id);
    buttons.get(item.id).setAttribute('aria-pressed', pressed);
    labels.get(item.id).setAttribute('aria-pressed', pressed);
  }
  info.innerHTML = `
    <p class="info-kicker">${device.type.toLocaleUpperCase('ru')}</p>
    <h3>${device.label}</h3>
    <p class="info-description">${device.description}</p>
    <dl>
      <div><dt>Роль</dt><dd>${device.role}</dd></div>
      <div><dt>Подключение</dt><dd>${device.connection}</dd></div>
    </dl>`;
  viewer?.highlight(id);
}

function initViewer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;

  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', '3D-лаборатория. Стрелки вращают камеру. Плюс и минус меняют масштаб. Home сбрасывает камеру.');
  host.append(canvas);

  function makeView(practical) {
    const scene = new THREE.Scene();
    return { ...createLab(scene, practical), scene };
  }
  const overview = makeView(false);
  let practiceView;
  let active = overview;
  const cables = new Map();
  let packetVisual;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const signal = new THREE.Mesh(
    new THREE.SphereGeometry(.095, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffed83, toneMapped: false, depthTest: false }),
  );
  signal.visible = false;
  signal.renderOrder = 1;
  let probe;
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minPolarAngle = .33;
  controls.maxPolarAngle = 1.37;
  controls.rotateSpeed = .79;
  controls.target.set(0, 1.17, -.18);

  const initialDirection = new THREE.Vector3();
  const horizontal = new THREE.Vector3();
  const vertical = new THREE.Vector3();
  const framePoints = [
    [-5.43, -.44, -3.92], [5.43, -.44, -3.92], [-5.43, -.44, 3.92], [5.43, -.44, 3.92],
    [-5.34, 3.9, -3.73], [5.34, 3.9, -3.73], [-5.34, 3.44, .41],
  ].map(point => new THREE.Vector3(...point));
  const relative = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointers = new Set();
  let tap;
  let frame = null;
  let contextLost = false;
  let width = 0;
  let height = 0;

  function resetCamera() {
    if (mode !== 'overview') {
      controls.target.set(0, 1.12, -.35);
      initialDirection.set(.26, .96, 1);
    } else {
      controls.target.set(0, 1.17, -.18);
      initialDirection.set(.42, .51, 1);
    }
    initialDirection.normalize();
    horizontal.crossVectors(camera.up, initialDirection).normalize();
    vertical.crossVectors(initialDirection, horizontal);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(...framePoints.map(point => {
      relative.subVectors(point, controls.target);
      return relative.dot(initialDirection) + Math.max(
        Math.abs(relative.dot(horizontal)) / (tangent * camera.aspect * .87),
        Math.abs(relative.dot(vertical)) / (tangent * .85),
      );
    }));
    controls.minDistance = 5.8;
    controls.maxDistance = Math.max(distance * 1.45, 23);
    camera.position.copy(controls.target).addScaledVector(initialDirection, distance);
    controls.update();
    requestRender();
  }

  function resize() {
    const nextWidth = host.clientWidth;
    const nextHeight = host.clientHeight;
    if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
    const shouldFit = !width || Math.abs(nextWidth / nextHeight - width / height) > .15;
    width = nextWidth;
    height = nextHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (shouldFit) resetCamera();
    requestRender();
  }

  function placeLabel(label, anchor, minY = 74) {
    projected.copy(anchor).project(camera);
    const x = (projected.x + 1) * width / 2;
    const y = (1 - projected.y) * height / 2;
    const edge = mode === 'overview' ? 46 : 34;
    label.hidden = projected.z < -1 || projected.z > 1 || x < edge || x > width - edge || y < minY || y > height - 18;
    if (!label.hidden) {
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
    }
  }

  function render(now) {
    frame = null;
    active.walls.back.visible = camera.position.z > -3.65;
    active.walls.left.visible = camera.position.x > -5.16;
    if (mode !== 'overview') {
      for (const cable of cables.values()) {
        const progress = reducedMotion.matches ? 1 : Math.min(1, (now - cable.started) / 360);
        const count = cable.mesh.geometry.index.count;
        cable.mesh.geometry.setDrawRange(0, progress >= 1 ? count : Math.floor(count * progress / 48) * 48);
        if (progress < 1) requestRender();
      }
    }
    drawProbe(now);
    renderer.render(active.scene, camera);
    const activeLabels = mode === 'overview' ? labels : practiceLabels;
    for (const [id, model] of active.devices) {
      const label = activeLabels.get(id);
      if (mode === 'ip' && id === 'switch') label.hidden = true;
      else placeLabel(label, model.anchor);
    }
    const selectedPort = mode === 'practice' && active.ports.get(practiceState.selected);
    if (selectedPort) {
      pcPortMarker.setAttribute('aria-label', `${portLabel(practiceState.selected)} · выбрать RJ‑45`);
      placeLabel(pcPortMarker, selectedPort.endpoint, 55);
    } else {
      pcPortMarker.hidden = true;
    }
    canvas.dataset.sceneReady = 'true';
    message.hidden = true;
    for (const button of cameraButtons) button.disabled = false;
  }

  function drawProbe(now) {
    if (!probe || reducedMotion.matches) {
      signal.visible = false;
      probe = null;
      return;
    }

    const time = Math.max(0, now - probe.started) / 470;
    const step = probe.steps[Math.floor(time)];
    signal.visible = Boolean(step);
    if (!step) {
      probe = null;
      return;
    }
    const progress = time % 1;
    step.curve.getPointAt(step.reverse ? 1 - progress : progress, signal.position);
    requestRender();
  }

  function requestRender() {
    if (frame === null && !contextLost && width && height) frame = requestAnimationFrame(render);
  }

  function zoom(factor) {
    relative.subVectors(camera.position, controls.target);
    const distance = THREE.MathUtils.clamp(relative.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(relative.setLength(distance));
    controls.update();
  }

  function pickDevice(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    for (const { object } of raycaster.intersectObject(active.lab, true)) {
      let deviceId;
      let portId;
      let visible = true;
      for (let node = object; node; node = node.parent) {
        deviceId ??= node.userData.deviceId;
        portId ??= node.userData.portId;
        visible &&= node.visible;
      }
      if (!visible) continue;
      if (mode === 'practice' && portId) practice.selectPort(portId);
      else if (deviceId && mode !== 'overview') selectPracticeDevice(deviceId);
      else if (deviceId) selectDevice(deviceId);
      break;
    }
  }

  canvas.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId);
    tap = pointers.size === 1 && event.button === 0 ? event : null;
  });
  canvas.addEventListener('pointermove', event => {
    if (tap && Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) > 5) tap = null;
  });
  canvas.addEventListener('pointerup', event => {
    if (tap?.pointerId === event.pointerId && Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) <= 5) {
      pickDevice(event);
    }
    pointers.delete(event.pointerId);
    tap = null;
  });
  canvas.addEventListener('pointercancel', event => {
    pointers.delete(event.pointerId);
    tap = null;
  });
  canvas.addEventListener('keydown', event => {
    switch (event.key) {
      case '+':
      case '=': zoom(.84); break;
      case '-': zoom(1 / .84); break;
      case 'Home': resetCamera(); break;
      case 'ArrowLeft': controls.rotateLeft(.14); break;
      case 'ArrowRight': controls.rotateLeft(-.14); break;
      case 'ArrowUp': controls.rotateUp(.14); break;
      case 'ArrowDown': controls.rotateUp(-.14); break;
      default: return;
    }
    event.preventDefault();
  });
  zoomIn.addEventListener('click', () => zoom(.84));
  zoomOut.addEventListener('click', () => zoom(1 / .84));
  reset.addEventListener('click', resetCamera);
  controls.addEventListener('change', requestRender);

  canvas.addEventListener('webglcontextlost', () => {
    contextLost = true;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    delete canvas.dataset.sceneReady;
    showSceneMessage('Отрисовка прервана. Если сцена не восстановится, обновите страницу.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    requestRender();
  });

  new ResizeObserver(resize).observe(host);
  resize();
  return {
    highlight(id) {
      for (const [modelId, model] of overview.devices) {
        model.highlight.emissiveIntensity = modelId === id ? .70 : 0;
      }
      requestRender();
    },
    showMode() {
      if (mode !== 'overview' && !practiceView) {
        practiceView = makeView(true);
        practiceView.scene.add(signal);
      }
      const previous = active;
      active = mode === 'overview' ? overview : practiceView;
      for (const label of [...labels.values(), ...practiceLabels.values(), pcPortMarker]) label.hidden = true;
      if (previous !== active) {
        renderer.shadowMap.needsUpdate = true;
        resize();
        resetCamera();
      }
      requestRender();
    },
    showPacket(step, progress, reduced) {
      if (!packetVisual && step) packetVisual = createPacketVisual(practiceView, cables);
      packetVisual?.show(step, progress, reduced);
      requestRender();
    },
    showProbe(path) {
      const steps = path.map(({ link, reverse }) => ({
        curve: cables.get(link)?.mesh.geometry.parameters.path,
        reverse,
      }));
      const available = steps.length > 0 && steps.every(step => step.curve) && !reducedMotion.matches;
      probe = available ? {
        started: performance.now(),
        steps: [...steps, ...steps.slice().reverse().map(step => ({ ...step, reverse: !step.reverse }))],
      } : null;
      requestRender();
    },
    resetCamera,
    updatePractice({ selected, source, links }) {
      if (!practiceView) return;
      const occupied = new Set(links.flat());
      for (const [id, model] of practiceView.devices) {
        const connected = id === 'switch' ? links.some(([, end]) => end.startsWith('sw-')) : occupied.has(id);
        model.highlight.emissive.setHex(connected ? 0x55ffad : 0xffa756);
        model.highlight.emissiveIntensity = selected === id ? 1.10 : .45;
      }
      for (const [id, port] of practiceView.ports) {
        const color = source === id ? 0xfce07b : occupied.has(id) ? 0x55ffad : 0x3891af;
        port.border.emissive.setHex(color);
        port.border.emissiveIntensity = source === id ? 1.3 : .62;
      }
      for (const [link, cable] of cables) {
        if (links.includes(link)) continue;
        cable.group.removeFromParent();
        cable.mesh.geometry.dispose();
        cables.delete(link);
      }
      for (const link of links) {
        if (cables.has(link)) continue;
        const cable = makePracticeCable(practiceView, ...link);
        cable.started = performance.now();
        cables.set(link, cable);
      }
      requestRender();
    },
  };
}

function showSceneMessage(text) {
  message.textContent = text;
  message.hidden = false;
  for (const button of cameraButtons) button.disabled = true;
  for (const label of [...labels.values(), ...practiceLabels.values(), pcPortMarker]) label.hidden = true;
}

showSceneMessage('Загрузка 3D-сцены…');
try {
  viewer = initViewer();
} catch (error) {
  console.error(error);
  showSceneMessage('Не удалось запустить 3D-сцену. Включите WebGL 2 или откройте страницу в другом браузере.');
}
selectDevice(devices[0].id);

const sections = ['overview', 'practice', 'ip', 'packet'].map(id => ({
  id,
  panel: document.querySelector(`#${id}-panel`),
  intro: document.querySelector(`#${id}-intro`),
  link: document.querySelector(`#${id}-link`),
}));
const viewport = document.querySelector('#viewport');

function syncMode() {
  const hash = location.hash.slice(1);
  const next = sections.some(section => section.id === hash) ? hash : 'overview';
  if (next !== mode) {
    if (mode === 'ip') ipPractice.clearProbe();
    if (mode === 'packet') packetJourney.leave();
    mode = next;
    for (const section of sections) {
      section.panel.hidden = section.intro.hidden = section.id !== mode;
    }
    packetTasks.hidden = mode !== 'packet';
    viewport.dataset.mode = mode;
    viewer?.showMode();
    if (mode === 'packet') packetJourney.enter();
    else refreshPracticeScene();
  }
  for (const section of sections) {
    section.link.setAttribute('aria-current', section.id === mode ? 'page' : 'false');
  }
}
window.addEventListener('hashchange', syncMode);
syncMode();
