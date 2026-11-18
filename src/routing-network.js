import { lessonMask, parseIPv4, parseSubnetMask } from './ipv4.js';
import { computers, portLabel } from './topology.js';

export const networks = ['a', 'b'];
export const subnetOf = id => ['pc-01', 'pc-02', 'if-a'].includes(id) ? 'a' : 'b';
export const switchId = side => `switch-${side}`;
export const interfaceId = side => `if-${side}`;
export const routingDevices = [...computers, ...networks.map(switchId), 'router'];
export const gatewayFor = side => `192.168.${networks.indexOf(side) + 1}.1`;

export function routingName(id) {
  if (computers.includes(id)) return portLabel(id);
  if (id === 'router') return 'Маршрутизатор';
  const side = id.at(-1).toUpperCase();
  return id.startsWith('switch') ? `Коммутатор ${side}` : `Интерфейс ${side}`;
}

export function createRoutingState() {
  return {
    hosts: new Map(computers.map((id, index) => [
      id, { address: `192.168.${index < 2 ? 1 : 2}.${index % 2 === 0 ? 10 : 20}`, mask: lessonMask, gateway: '' },
    ])),
    interfaces: new Map(networks.map(side => [interfaceId(side), { address: gatewayFor(side), mask: lessonMask, up: true }])),
    forwarding: true,
    access: computers.map(id => [id, switchId(subnetOf(id))]),
    uplinks: [],
  };
}

export function connectUplink(uplinks, sw, intf) {
  if (!networks.map(switchId).includes(sw) || !networks.map(interfaceId).includes(intf)) {
    return 'Выберите коммутатор и интерфейс маршрутизатора.';
  }
  if (uplinks.some(([left, right]) => left === sw || right === intf)) {
    return 'Один из портов уже занят. Удалите старый кабель перед подключением.';
  }
  uplinks.push([sw, intf]);
}

export function wiringErrors(state, sides = networks) {
  return sides.flatMap(side => {
    const sw = switchId(side);
    const required = interfaceId(side);
    const link = state.uplinks.find(([id]) => id === sw);
    if (!link) return [`${routingName(sw)} не подключён к маршрутизатору.`];
    if (link[1] !== required) return [`${routingName(sw)} подключён к неверному интерфейсу. Для этой сети нужен интерфейс ${side.toUpperCase()}.`];
    return [];
  });
}

function addressErrors(id, config) {
  const ip = parseIPv4(config.address);
  const side = subnetOf(id);
  const title = routingName(id);
  const errors = [];
  if (ip === null) {
    errors.push(`${title}: неверный формат IPv4-адреса.`);
  } else if ((ip >>> 8) !== (parseIPv4(gatewayFor(side)) >>> 8)) {
    errors.push(`${title}: адрес вне подсети ${gatewayFor(side).replace(/1$/, '0')}/24.`);
  } else if ((ip & 255) === 0 || (ip & 255) === 255) {
    errors.push(`${title}: адрес сети и широковещательный адрес нельзя назначить устройству.`);
  }
  if (parseSubnetMask(config.mask) !== parseSubnetMask(lessonMask)) {
    errors.push(`${title}: укажите корректную маску /24 (255.255.255.0).`);
  }
  if (id.startsWith('if-')) {
    if (ip !== null && ip !== parseIPv4(gatewayFor(side))) {
      errors.push(`${title}: по плану нужен адрес ${gatewayFor(side)}.`);
    }
    if (!config.up) errors.push(`${title} выключен. Включите его в настройках маршрутизатора.`);
  }
  return errors;
}

function conflictErrors(state, scope) {
  const groups = new Map();
  for (const [id, config] of [...state.hosts, ...state.interfaces]) {
    const ip = parseIPv4(config.address);
    if (ip === null) continue;
    if (!groups.has(ip)) groups.set(ip, []);
    groups.get(ip).push(id);
  }
  return [...groups.values()]
    .filter(group => group.length > 1 && group.some(id => scope.includes(id)))
    .map(group => `Конфликт IP-адресов: ${group.map(routingName).join(', ')} используют один адрес.`);
}

export function gatewayErrors(state, hosts = computers) {
  return hosts.flatMap(id => {
    const side = subnetOf(id);
    const { gateway } = state.hosts.get(id);
    const parsed = parseIPv4(gateway);
    if (parsed === null) return [`${routingName(id)}: укажите IPv4-адрес шлюза по умолчанию.`];
    const router = state.interfaces.get(interfaceId(side));
    if (parsed !== parseIPv4(router.address) || parsed !== parseIPv4(gatewayFor(side))) {
      return [`${routingName(id)}: шлюз ${gateway} не совпадает с адресом интерфейса ${side.toUpperCase()} в локальной подсети.`];
    }
    return [];
  });
}

export function checkAddressing(state) {
  const addresses = [...state.hosts, ...state.interfaces];
  return [
    ...addresses.flatMap(([id, config]) => addressErrors(id, config)),
    ...conflictErrors(state, addresses.map(([id]) => id)),
    ...gatewayErrors(state),
  ];
}

export function planRoute(state, from, to) {
  if (!computers.includes(from) || !computers.includes(to) || from === to) {
    return { errors: ['Выберите два разных компьютера.'], steps: [], path: [] };
  }
  const src = subnetOf(from);
  const dst = subnetOf(to);
  const local = src === dst;
  const source = state.hosts.get(from);
  const target = state.hosts.get(to);
  const ids = local ? [from, to] : [from, to, interfaceId(src), interfaceId(dst)];
  const errors = ids.flatMap(id => addressErrors(id, state.hosts.get(id) ?? state.interfaces.get(id)));
  errors.push(...conflictErrors(state, ids));

  const first = state.access.find(([pc, sw]) => pc === from && sw === switchId(src));
  const last = state.access.find(([pc, sw]) => pc === to && sw === switchId(dst));
  if (!first) errors.push(`Нет кабеля от ${routingName(from)} к локальному коммутатору.`);
  if (!last) errors.push(`Нет кабеля от ${routingName(to)} к локальному коммутатору.`);
  if (!local) {
    errors.push(...gatewayErrors(state, [from]), ...wiringErrors(state, [src, dst]));
    if (!state.forwarding) errors.push('Маршрутизация выключена на маршрутизаторе.');
  }
  if (errors.length) return { errors, steps: [], path: [] };

  const steps = [];
  const path = [from, switchId(src)];
  const step = (title, detail, focus, role, moves = [], ports = [], duration = .75) =>
    steps.push({ title, detail, focus, role, kind: 'frame', moves, ports, duration });

  step('Отправитель и получатель', `${routingName(from)} ${source.address} → ${routingName(to)} ${target.address}. ${local ? 'Одна подсеть, шлюз не используется.' : `Разные подсети. Шлюз отправителя: ${source.gateway}.`}`, from, 'source');
  step('Кадр к коммутатору', local
    ? `IP-пакет помещён в Ethernet-кадр с MAC получателя и идёт к ${routingName(switchId(src))}.`
    : `IP назначения остаётся ${target.address}. На первом участке Ethernet-кадр адресован на MAC-адрес шлюза (IP ${source.gateway}).`,
  from, 'source', [{ link: first, reverse: false }], [from], 1.15);

  if (!local) {
    const inbound = state.uplinks.find(([sw]) => sw === switchId(src));
    const outbound = state.uplinks.find(([sw]) => sw === switchId(dst));
    path.push('router', switchId(dst));
    step('Кадр к шлюзу', `${routingName(switchId(src))} пересылает кадр на интерфейс ${src.toUpperCase()} (${source.gateway}).`,
      switchId(src), 'switch', [{ link: inbound, reverse: false }], inbound, 1.1);
    step('Выбор маршрута', `Вход — интерфейс ${src.toUpperCase()}, выход — интерфейс ${dst.toUpperCase()} (${state.interfaces.get(outbound[1]).address}). Сеть назначения напрямую подключена. Маршрутизатор извлекает IP-пакет и помещает его в новый Ethernet-кадр.`,
      'router', 'switch', [], [inbound[1], outbound[1]], 1.35);
    step('Выход из маршрутизатора', `Интерфейс ${dst.toUpperCase()} отправляет новый кадр со своим MAC источника и MAC получателя. IP назначения остаётся ${target.address}.`,
      'router', 'switch', [{ link: outbound, reverse: true }], outbound, 1.1);
  }

  path.push(to);
  step('Кадр к получателю', `${routingName(switchId(dst))} пересылает кадр на порт ${routingName(to)}.`,
    switchId(dst), 'switch', [{ link: last, reverse: true }], [to], 1.15);
  step('Пакет доставлен', `${routingName(to)} (${target.address}) извлекает IP-пакет из кадра.`, to, 'delivered');
  return { errors, steps, path };
}
