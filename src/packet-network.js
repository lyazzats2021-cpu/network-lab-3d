import { checkConnection } from './ipv4.js';
import { computers, portLabel, switchPorts } from './topology.js';

export function macAddress(id) {
  return `02:00:00:00:00:${id.slice(-2)}`;
}

export function networkKey(settings, links) {
  return JSON.stringify([
    computers.map(id => settings.get(id)),
    links.map(link => link.join(':')).sort(),
  ]);
}

export function createPacketMemory() {
  return { arp: new Map(), ports: new Map() };
}

export function planTransmission(settings, links, from, to, memory = createPacketMemory()) {
  const invalid = from === to || !computers.includes(from) || !computers.includes(to);
  if (invalid) return { errors: ['Выберите два разных компьютера.'], steps: [] };

  const attached = new Map();
  const occupied = new Set();
  for (const link of links) {
    const [pc, port] = link;
    if (!computers.includes(pc) || !(switchPorts.includes(port) || computers.includes(port))) continue;
    if (pc === port || occupied.has(pc) || occupied.has(port)) {
      return { errors: ['Обнаружено неисправное соединение: один из портов занят несколькими кабелями.'], steps: [] };
    }
    occupied.add(pc);
    occupied.add(port);
    if (switchPorts.includes(port)) attached.set(pc, link);
  }

  const { errors } = checkConnection(settings, links, from, to);
  for (const pc of [from, to]) {
    if (!attached.has(pc)) errors.push(`${portLabel(pc)} не подключён к коммутатору. Проверьте кабель на первом уровне.`);
  }
  if (errors.length) return { errors, steps: [] };

  const senderLink = attached.get(from);
  const recipientLink = attached.get(to);
  const otherLinks = [...attached.values()].filter(link => link !== senderLink);
  const sourceIp = settings.get(from).address;
  const targetIp = settings.get(to).address;
  const sourceMac = macAddress(from);
  const targetMac = macAddress(to);
  const arpKey = `${from}/${targetIp}`;
  const cachedMac = memory.arp.get(arpKey);
  const knownPort = cachedMac === targetMac && memory.ports.get(targetMac) === recipientLink[1];
  const steps = [];
  const record = (title, detail, focus, role, kind = 'system', moves = [], duration = 0.68) =>
    steps.push({ title, detail, focus, role, kind, moves, duration });
  const up = link => ({ link, reverse: false });
  const down = link => ({ link, reverse: true });

  record('Отправитель и назначение', `${portLabel(from)} (${sourceIp}) → ${portLabel(to)} (${targetIp}). Оба ПК подключены к коммутатору.`, from, 'source');
  if (cachedMac !== targetMac) {
    record('ARP-запрос', `${portLabel(from)} ищет MAC для ${targetIp}. Ethernet-кадр с ARP отправляется на широковещательный MAC FF:FF:FF:FF:FF:FF.`, from, 'source', 'arp', [up(senderLink)], 0.95);
    record('Широковещательная рассылка', `Коммутатор запоминает MAC отправителя за портом ${senderLink[1].at(-1)} и пересылает ARP-запрос на все остальные подключённые порты.`, 'switch', 'switch', 'arp', otherLinks.map(down), 1.0);
    record('ARP-ответ', `${portLabel(to)} сообщает свой MAC ${targetMac}. Остальные ПК не отвечают.`, to, 'target', 'arp', [up(recipientLink)], 0.95);
    record('Обновление таблиц', `Коммутатор запоминает MAC получателя за портом ${recipientLink[1].at(-1)}. Отправитель получает ARP-ответ и сохраняет соответствие IP и MAC.`, 'switch', 'switch', 'arp', [down(senderLink)], 0.95);
  } else {
    record('MAC найден в ARP-кэше', `${targetIp} → ${cachedMac}. Повторный ARP-запрос не требуется.`, from, 'source', 'arp');
  }

  record('Отправка кадра', `IP-пакет с назначением ${targetIp} вложен в Ethernet-кадр с MAC назначения ${targetMac}.`, from, 'source', 'frame', [up(senderLink)], 1.05);
  const flood = cachedMac === targetMac && !knownPort;
  if (flood) {
    record('MAC отсутствует в таблице коммутатора', 'Коммутатор рассылает неизвестный одноадресный кадр на все остальные подключённые порты. Только нужный ПК принимает кадр.', 'switch', 'switch', 'frame', [], 0.82);
  } else {
    record('Обработка коммутатором', `По таблице MAC коммутатор выбирает порт ${recipientLink[1].at(-1)}.`, 'switch', 'switch', 'frame', [], 0.82);
  }
  record('Пересылка к получателю', flood ? 'Кадр уходит на остальные подключённые порты.' : `Кадр уходит только через порт ${recipientLink[1].at(-1)}.`, 'switch', 'switch', 'frame', flood ? otherLinks.map(down) : [down(recipientLink)], 1.05);
  record('Пакет доставлен', `${portLabel(to)} (${targetIp}) принимает кадр и извлекает IP-пакет. Передача завершена.`, to, 'delivered', 'frame');

  const nextMemory = { arp: new Map(memory.arp), ports: new Map(memory.ports) };
  nextMemory.arp.set(arpKey, targetMac);
  nextMemory.ports.set(sourceMac, senderLink[1]);
  if (cachedMac !== targetMac) nextMemory.ports.set(targetMac, recipientLink[1]);
  return { errors: [], steps, nextMemory };
}
