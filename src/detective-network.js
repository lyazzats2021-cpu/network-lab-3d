import {
  checkAddressing, connectUplink, createRoutingState, gatewayFor, interfaceId,
  networks, planRoute, routingName, subnetOf, switchId, wiringErrors,
} from './routing-network.js';

import { parseIPv4, parseSubnetMask } from './ipv4.js';

const cases = [
  {
    id: 'cable',
    pair: ['pc-01', 'pc-03'],
    symptom: 'В кабинете A не могут получить ответ от рабочего места в кабинете B. Проверьте связь между ПК 01 и ПК 03.',
    seed(state) { setAccessCable(state, 'pc-03', false); },
  },
  {
    id: 'duplicate',
    pair: ['pc-01', 'pc-02'],
    symptom: 'Две рабочие станции кабинета A перестали обмениваться данными. Проверьте связь между ПК 01 и ПК 02.',
    seed(state) { state.hosts.get('pc-02').address = state.hosts.get('pc-01').address; },
  },
  {
    id: 'mask',
    pair: ['pc-01', 'pc-02'],
    symptom: 'Рабочее место в кабинете A настроили заново. Теперь ПК 01 не получает ответ от ПК 02.',
    // With /28, .10 is in 192.168.1.0/28, while .20 is in 192.168.1.16/28.
    seed(state) { state.hosts.get('pc-01').mask = '255.255.255.240'; },
  },
  {
    id: 'gateway',
    pair: ['pc-01', 'pc-03'],
    symptom: 'ПК 01 доступен из своей сети, но не получает ответ от ПК 03 в другом кабинете.',
    seed(state) { state.hosts.get('pc-01').gateway = '192.168.1.254'; },
  },
  {
    id: 'interface',
    pair: ['pc-04', 'pc-02'],
    symptom: 'Между ПК 04 в кабинете B и ПК 02 в кабинете A пропала связь.',
    seed(state) { state.interfaces.get('if-b').up = false; },
  },
];

export const incidents = cases.map(({ id, pair, symptom }) => ({ id, pair, symptom }));

export function createIncidentState(id) {
  const incident = cases.find(item => item.id === id);
  if (!incident) throw new RangeError(`Unknown incident: ${id}`);
  const state = createRoutingState();
  for (const [pc, config] of state.hosts) config.gateway = gatewayFor(subnetOf(pc));
  for (const side of networks) connectUplink(state.uplinks, switchId(side), interfaceId(side));
  incident.seed(state);
  return state;
}

export function setAccessCable(state, pc, attached) {
  if (!state.hosts.has(pc)) return;
  const index = state.access.findIndex(([id]) => id === pc);
  if (attached && index === -1) state.access.push([pc, switchId(subnetOf(pc))]);
  else if (!attached && index !== -1) state.access.splice(index, 1);
}

export function inspectPorts(state, device) {
  const accessPort = (pc, id = pc, label = 'RJ‑45') => {
    const peer = state.access.find(([item]) => item === pc);
    return {
      id, label, up: Boolean(peer),
      detail: peer ? `Кабель подключён · ${routingName(id === pc ? peer[1] : pc)}` : 'Кабель отсутствует',
    };
  };
  const uplinkPort = (id, link, peer) => {
    const up = link ? state.interfaces.get(link[1]).up : false;
    const label = id.startsWith('if-') ? routingName(id) : 'Порт к маршрутизатору';
    return {
      id, label, up,
      detail: !link ? 'Кабель отсутствует' : up ? `Кабель подключён · ${routingName(peer)}` : 'Кабель подключён · интерфейс маршрутизатора выключен',
    };
  };
  if (state.hosts.has(device)) return [accessPort(device)];
  if (device === 'router') {
    return networks.map(side => {
      const id = interfaceId(side);
      const link = state.uplinks.find(([, port]) => port === id);
      return uplinkPort(id, link, link?.[0]);
    });
  }
  const side = device.at(-1);
  const pcs = [...state.hosts.keys()].filter(id => subnetOf(id) === side);
  const link = state.uplinks.find(([sw]) => sw === device);
  return [
    ...pcs.map((pc, index) => accessPort(pc, `sw-${side}-${index + 1}`, `Порт ${index + 1}`)),
    uplinkPort(device, link, link?.[1]),
  ];
}

export function probeIncident(state, [from, to]) {
  const request = planRoute(state, from, to);
  const reply = planRoute(state, to, from);
  const errors = [...new Set([...request.errors, ...reply.errors])];
  if (errors.length) {
    if (from !== to && state.hosts.has(from) && state.hosts.has(to) && subnetOf(from) === subnetOf(to)) {
      for (const [id, peer] of [[from, to], [to, from]]) {
        const host = state.hosts.get(id);
        const destination = state.hosts.get(peer).address;
        const mask = parseSubnetMask(host.mask);
        const sourceIP = parseIPv4(host.address);
        const destinationIP = parseIPv4(destination);
        if (mask !== null && sourceIP !== null && destinationIP !== null && (sourceIP & mask) !== (destinationIP & mask)) {
          errors.push(`${routingName(id)} с маской ${host.mask} считает адрес ${destination} внешним для своей подсети.`);
        }
      }
    }
    return { errors, steps: [] };
  }
  const steps = [
    ...request.steps.map(step => ({ ...step, title: `Запрос · ${step.title}` })),
    ...reply.steps.map(step => ({ ...step, title: `Ответ · ${step.title}` })),
  ];
  return { errors, steps };
}

export function networkIssues(state) {
  return [
    ...checkAddressing(state),
    ...wiringErrors(state),
    ...[...state.hosts.keys()]
      .filter(id => !state.access.some(([pc, sw]) => pc === id && sw === switchId(subnetOf(id))))
      .map(id => `${routingName(id)}: восстановите кабель к коммутатору своей подсети.`),
    ...(!state.forwarding ? ['Маршрутизация выключена.'] : []),
  ];
}
