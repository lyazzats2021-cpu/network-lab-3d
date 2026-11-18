import { computers, connectionPath, portLabel } from './topology.js';

export const lessonMask = '255.255.255.0';
const plannedSubnet = '192.168.1.0';
const hostFor = id => `192.168.1.${Number(id.slice(-2)) * 10}`;

export function parseIPv4(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) {
    return null;
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
}

export function parseSubnetMask(text) {
  const mask = parseIPv4(text);
  if (mask === null) return null;
  const hostBits = ~mask >>> 0;
  return (hostBits & (hostBits + 1)) === 0 ? mask : null;
}

const network = (address, mask) => (address & mask) >>> 0;
const expectedMask = parseSubnetMask(lessonMask);
const expectedNetwork = parseIPv4(plannedSubnet);

function parseSettings(id, settings) {
  if (!settings) return { errors: [`${portLabel(id)}: сохраните IP-адрес и маску.`] };
  const address = parseIPv4(settings.address);
  const mask = parseSubnetMask(settings.mask);
  const errors = [];
  if (address === null) errors.push(`${portLabel(id)}: неверный формат IPv4. Нужны четыре числа от 0 до 255 через точки.`);
  if (mask === null) errors.push(`${portLabel(id)}: неверная маска. В двоичной записи единицы маски должны идти подряд слева.`);
  return { address, mask, errors };
}

function isReserved(address, mask) {
  // /31 and /32 do not reserve the first and last addresses.
  const hostBits = ~mask >>> 0;
  const host = (address & hostBits) >>> 0;
  return hostBits > 1 && (host === 0 || host === hostBits);
}

function addressGroups(configurations) {
  const groups = new Map();
  for (const [id, config] of configurations) {
    const address = parseIPv4(config.address);
    if (address === null) continue;
    if (!groups.has(address)) groups.set(address, []);
    groups.get(address).push(id);
  }
  return groups;
}

export function checkAssignment(configurations) {
  const problems = new Map();
  for (const id of computers) {
    const { address, mask, errors } = parseSettings(id, configurations.get(id));
    if (mask != null && mask !== expectedMask) {
      errors.push(`${portLabel(id)}: для сети /24 нужна маска ${lessonMask}.`);
    }

    if (address != null) {
      if (network(address, expectedMask) !== expectedNetwork) {
        errors.push(`${portLabel(id)}: адрес находится вне сети 192.168.1.0/24. Для обмена между разными подсетями нужна маршрутизация.`);
      } else if (isReserved(address, expectedMask)) {
        errors.push(`${portLabel(id)}: это адрес сети или широковещательный адрес. Его нельзя назначить компьютеру.`);
      }
      if (address !== parseIPv4(hostFor(id))) {
        errors.push(`${portLabel(id)}: по адресному плану нужен адрес ${hostFor(id)}.`);
      }
    }
    if (errors.length) problems.set(id, errors);
  }
  for (const group of addressGroups(configurations).values()) {
    if (group.length < 2) continue;
    const address = configurations.get(group[0]).address;
    const conflict = `Конфликт адресов: ${group.map(portLabel).join(', ')} используют ${address}.`;
    for (const id of group) problems.set(id, [...(problems.get(id) ?? []), conflict]);
  }
  return problems;
}

export function checkConnection(configurations, links, from, to) {
  if (from === to || !computers.includes(from) || !computers.includes(to)) {
    return { errors: ['Выберите два разных компьютера.'], path: [] };
  }
  const path = connectionPath(links, from, to);
  const first = parseSettings(from, configurations.get(from));
  const last = parseSettings(to, configurations.get(to));
  const errors = [...first.errors, ...last.errors];
  if (!path.length) {
    errors.push(`Между ${portLabel(from)} и ${portLabel(to)} нет физического пути. Подключите оба ПК к коммутатору на первом уровне.`);
  }

  for (const [id, config] of [[from, first], [to, last]]) {
    if (!config.errors.length && isReserved(config.address, config.mask)) {
      errors.push(`${portLabel(id)}: для указанной маски это адрес сети или широковещательный адрес.`);
    }
  }
  if (!first.errors.length && !last.errors.length && [first.mask, last.mask].some(mask =>
    network(first.address, mask) !== network(last.address, mask)
  )) {
    errors.push('Компьютеры видят друг друга в разных подсетях при указанных масках. Для обмена между подсетями нужны маршрутизатор и настроенный шлюз.');
  }

  for (const [address, group] of addressGroups(configurations)) {
    if (group.length < 2) continue;
    const conflicts = new Set();
    for (const [id, config] of [[from, first], [to, last]]) {
      if (config.address !== address) continue;
      const peers = group.filter(peer => peer === id || connectionPath(links, id, peer).length);
      if (peers.length > 1) conflicts.add(`Конфликт адресов: ${peers.map(portLabel).join(', ')} используют ${configurations.get(id).address}.`);
    }
    errors.push(...conflicts);
  }
  return { errors, path };
}
