import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { devices } from './devices.js';
import { createLab } from './lab.js';
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

  const scene = new THREE.Scene();
  const { lab, walls, devices: models } = createLab(scene);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minPolarAngle = .33;
  controls.maxPolarAngle = 1.37;
  controls.rotateSpeed = .79;
  controls.target.set(0, 1.17, -.18);

  const initialDirection = new THREE.Vector3(.42, .51, 1).normalize();
  const framePoints = [
    [-5.43, -.44, -3.92], [5.43, -.44, -3.92], [-5.43, -.44, 3.92], [5.43, -.44, 3.92],
    [-5.34, 3.9, -3.73], [5.34, 3.9, -3.73], [-5.34, 3.44, .41],
  ].map(point => new THREE.Vector3(...point));
  const horizontal = new THREE.Vector3().crossVectors(camera.up, initialDirection).normalize();
  const vertical = new THREE.Vector3().crossVectors(initialDirection, horizontal);
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

  function render() {
    frame = null;
    walls.back.visible = camera.position.z > -3.65;
    walls.left.visible = camera.position.x > -5.16;
    renderer.render(scene, camera);
    for (const [id, model] of models) {
      projected.copy(model.anchor).project(camera);
      const label = labels.get(id);
      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      label.hidden = projected.z < -1 || projected.z > 1 || x < 46 || x > width - 46 || y < 74 || y > height - 18;
      if (!label.hidden) {
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
      }
    }
    canvas.dataset.sceneReady = 'true';
    message.hidden = true;
    for (const button of cameraButtons) button.disabled = false;
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
    for (const { object } of raycaster.intersectObject(lab, true)) {
      let deviceId;
      let visible = true;
      for (let node = object; node; node = node.parent) {
        deviceId ??= node.userData.deviceId;
        visible &&= node.visible;
      }
      if (!visible) continue;
      if (deviceId) selectDevice(deviceId);
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
      for (const [modelId, model] of models) {
        model.highlight.emissiveIntensity = modelId === id ? .70 : 0;
      }
      requestRender();
    },
  };
}

function showSceneMessage(text) {
  message.textContent = text;
  message.hidden = false;
  for (const button of cameraButtons) button.disabled = true;
  for (const label of labels.values()) label.hidden = true;
}

showSceneMessage('Загрузка 3D-сцены…');
try {
  viewer = initViewer();
} catch (error) {
  console.error(error);
  showSceneMessage('Не удалось запустить 3D-сцену. Включите WebGL 2 или откройте страницу в другом браузере.');
}
selectDevice(devices[0].id);
