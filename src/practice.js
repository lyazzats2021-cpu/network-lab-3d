import { checkStar, computers, connect, portLabel, switchPorts } from './topology.js';

export function createPractice(panel, onUpdate, onReset, submit) {
  const links = [];
  let selected = null;
  let source = null;

  const picker = panel.querySelector('#practice-devices');
  const pcPort = panel.querySelector('#practice-pc-port');
  const portGrid = panel.querySelector('#practice-switch-ports');
  const progress = panel.querySelector('#practice-progress');
  const guidance = panel.querySelector('#practice-guidance');
  const feedback = panel.querySelector('#practice-feedback');
  const connections = panel.querySelector('#practice-links');
  const removeButtons = new Map();

  function makeButton(container, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', handler);
    container.append(button);
    return button;
  }

  const deviceButtons = new Map(computers.map(id => {
    const label = portLabel(id);
    const button = makeButton(picker, label, () => selectDevice(id));
    return [id, button];
  }));

  const switchButtons = new Map(switchPorts.map(id => [id, makeButton(portGrid, portLabel(id), () => selectPort(id))]));

  function linkFor(id) {
    return links.find(link => link.includes(id));
  }

  function update() {
    progress.textContent = `${checkStar(links).attached} из 4 ПК подключены к коммутатору`;
    for (const [id, button] of deviceButtons) {
      button.dataset.connected = String(Boolean(linkFor(id)));
      button.setAttribute('aria-pressed', String(selected === id));
      button.setAttribute('aria-label', `${portLabel(id)}, ${linkFor(id) ? 'есть кабель' : 'без кабеля'}`);
    }
    for (const [id, button] of switchButtons) {
      const link = linkFor(id);
      button.textContent = `${portLabel(id)} · ${link ? portLabel(link[0]) : 'свободен'}`;
      button.dataset.connected = String(Boolean(link));
    }
    pcPort.disabled = !computers.includes(selected);
    pcPort.textContent = pcPort.disabled
      ? 'Выберите компьютер'
      : `${portLabel(selected)} · RJ‑45 · ${linkFor(selected) ? 'занят' : 'свободен'}`;
    pcPort.setAttribute('aria-pressed', String(Boolean(source && source === selected)));
    guidance.textContent = source
      ? `Кабель от ${portLabel(source)}. Выберите свободный порт коммутатора.`
      : 'Выберите ПК, затем его порт RJ‑45 и свободный порт коммутатора.';

    for (const [link, button] of removeButtons) {
      if (!links.includes(link)) {
        button.parentElement.remove();
        removeButtons.delete(link);
      }
    }
    for (const link of links) {
      if (removeButtons.has(link)) continue;
      const [first, second] = link;
      const item = document.createElement('li');
      item.textContent = `${portLabel(first)} ↔ ${portLabel(second)}`;
      const button = makeButton(item, 'Удалить', () => {
        const items = [...removeButtons.values()];
        const index = items.indexOf(button);
        const nextFocus = items[index + 1] ?? items[index - 1] ?? panel.querySelector('#practice-check');
        links.splice(links.indexOf(link), 1);
        update();
        nextFocus.focus();
        report('Кабель удалён. Оба порта снова свободны.');
      });
      button.setAttribute('aria-label', `Удалить кабель ${portLabel(first)} — ${portLabel(second)}`);
      connections.append(item);
      removeButtons.set(link, button);
    }
    onUpdate({ selected, source, links });
  }

  function report(title, errors = []) {
    feedback.hidden = !title;
    feedback.dataset.error = String(Boolean(errors.length));
    feedback.replaceChildren();
    if (!title) return;
    const text = document.createElement('strong');
    text.textContent = title;
    feedback.append(text);
    if (errors.length) {
      const list = document.createElement('ul');
      for (const error of errors) {
        const item = document.createElement('li');
        item.textContent = error;
        list.append(item);
      }
      feedback.append(list);
    }
  }

  function selectDevice(id) {
    selected = id;
    update();
  }

  function selectPort(id) {
    if (computers.includes(id)) selected = id;
    if (source) {
      if (source === id) {
        source = null;
        report('Выбор первого конца отменён.');
      } else {
        const error = connect(links, source, id);
        if (error) {
          report('Порт нельзя использовать', [error]);
        } else {
          report(`Кабель подключён: ${portLabel(source)} ↔ ${portLabel(id)}.`);
          source = null;
        }
      }
    } else if (!computers.includes(id)) {
      report('Выберите первый конец кабеля', ['Сначала выберите порт RJ‑45 компьютера.']);
    } else if (linkFor(id)) {
      report('Порт уже занят', ['Удалите его кабель в списке соединений, чтобы освободить порт.']);
    } else {
      source = id;
      report('');
    }
    update();
  }

  pcPort.addEventListener('click', () => selectPort(selected));
  panel.querySelector('#practice-check').addEventListener('click', () => {
    const { attached, errors } = checkStar(links);
    const title = errors.length ? 'Исправьте схему' : 'Топология «звезда» собрана';
    const feedback = [`${attached} из 4 ПК подключены к коммутатору.`, ...errors].join(' ');
    if (submit('practice', 'topology', attached * 5, feedback)) report(title, errors);
  });
  panel.querySelector('#practice-reset').addEventListener('click', () => {
    links.length = 0;
    selected = null;
    source = null;
    update();
    report('Уровень начат заново. Все порты свободны.');
    onReset();
  });

  update();
  return { selectDevice, selectPort };
}
