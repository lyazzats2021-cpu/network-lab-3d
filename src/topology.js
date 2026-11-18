export const computers = ['pc-01', 'pc-02', 'pc-03', 'pc-04'];
export const switchPorts = ['sw-1', 'sw-2', 'sw-3', 'sw-4'];

export function portLabel(id) {
  return computers.includes(id) ? `ПК ${id.slice(-2)}` : `Порт ${id.at(-1)}`;
}

export function connect(links, first, second) {
  if (!computers.includes(first) || !(computers.includes(second) || switchPorts.includes(second))) {
    return 'Начните соединение с порта RJ‑45 компьютера.';
  }
  if (first === second) return 'Выберите другой порт для второго конца кабеля.';
  const occupied = [first, second].find(id => links.some(link => link.includes(id)));
  if (occupied) return `${portLabel(occupied)} уже занят. Сначала удалите его кабель.`;
  links.push([first, second]);
}

export function checkStar(links) {
  const errors = [];
  const attached = new Set();
  for (const [first, second] of links) {
    if (switchPorts.includes(second)) {
      attached.add(first);
    } else {
      errors.push(`${portLabel(first)} и ${portLabel(second)} соединены напрямую. Удалите этот кабель и подключите оба ПК к коммутатору.`);
    }
  }
  const missing = computers.filter(id => !links.some(link => link.includes(id)));
  if (missing.length) {
    errors.push(`Подключите к свободным портам коммутатора: ${missing.map(portLabel).join(', ')}.`);
  }
  return { attached: attached.size, errors };
}

// Each PC has one RJ-45 port. A path is one direct cable or two cables via the switch.
export function connectionPath(links, from, to) {
  if (from === to || !computers.includes(from) || !computers.includes(to)) return [];
  const first = links.find(link => link.includes(from));
  const last = links.find(link => link.includes(to));
  if (!first || !last) return [];
  if (first === last) return [{ link: first, reverse: first[1] === from }];
  if (switchPorts.includes(first[1]) && switchPorts.includes(last[1])) {
    return [{ link: first, reverse: false }, { link: last, reverse: true }];
  }
  return [];
}
