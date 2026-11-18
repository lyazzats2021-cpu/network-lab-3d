import { createIncidentState, incidents, inspectPorts, networkIssues, probeIncident, setAccessCable } from './detective-network.js';
import { interfaceId, networks, routingDevices, routingName } from './routing-network.js';

export function createDetective(panel, view, assessment) {
  const $ = name => panel.querySelector(`#detective-${name}`);
  const selector = $('case');
  const form = $('config');
  const settings = $('settings');
  const ping = $('ping');
  const result = $('result');
  const log = $('log');
  const cable = $('cable');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const sessions = new Map();
  const deviceButtons = new Map();
  let incident = incidents[0];
  let entry;
  let frame = null;
  let playback = null;

  for (const [index, item] of incidents.entries()) {
    selector.add(new Option(`Ситуация ${index + 1}`, item.id));
  }
  for (const id of routingDevices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.device = id;
    button.textContent = routingName(id);
    button.addEventListener('click', () => selectDevice(id));
    $('devices').append(button);
    deviceButtons.set(id, button);
  }

  function makeLogItem({ title, detail, kind }) {
    const item = document.createElement('li');
    item.dataset.kind = kind;
    const name = document.createElement('strong');
    const body = document.createElement('p');
    name.textContent = title;
    body.textContent = detail;
    item.append(name, body);
    return item;
  }

  function record(title, detail, kind = 'info') {
    const event = { title, detail, kind };
    entry.logs.push(event);
    log.append(makeLogItem(event));
    log.scrollTop = log.scrollHeight;
  }

  function report(message, kind = 'info') {
    result.textContent = message;
    result.dataset.kind = kind;
  }

  function renderProgress() {
    const count = [...sessions.values()].filter(item => item.complete).length;
    $('progress').textContent = `Восстановлено ситуаций: ${count} из ${incidents.length}`;
    for (const [index, item] of incidents.entries()) {
      selector.options[index].text = `Ситуация ${index + 1}${sessions.get(item.id)?.complete ? ' · восстановлено' : ''}`;
    }
  }

  function command() {
    const [from, to] = incident.pair;
    return `${routingName(from)} › ping ${entry.state.hosts.get(to).address || '—'}`;
  }

  function refreshScene() {
    const { state, selected, scanned } = entry;
    const status = new Map([...scanned].map(id => [id, inspectPorts(state, id).every(port => port.up)]));
    for (const [id, button] of deviceButtons) {
      button.setAttribute('aria-pressed', String(selected === id));
      const present = status.has(id);
      button.dataset.link = present ? (status.get(id) ? 'up' : 'down') : '';
      button.setAttribute('aria-label', present
        ? `${routingName(id)} · ${status.get(id) ? 'порты в работе' : 'есть неактивный порт'}`
        : routingName(id));
    }
    view.select(selected, status);
  }

  function refreshPorts() {
    const { state, selected, scanned } = entry;
    const ports = $('port-list');
    ports.replaceChildren();
    const checked = selected && scanned.has(selected);
    cable.hidden = !checked || !state.hosts.has(selected);
    if (checked) {
      const readings = inspectPorts(state, selected);
      for (const item of readings) {
        const row = document.createElement('li');
        row.dataset.link = item.up ? 'up' : 'down';
        row.textContent = `${item.label} — ${item.detail}`;
        ports.append(row);
      }
      if (!cable.hidden) {
        cable.textContent = readings[0].up ? 'Отсоединить кабель' : 'Подключить кабель';
      }
    }
    refreshScene();
  }

  function addField(parent, labelText, name, value, type = 'text') {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    if (type === 'checkbox') input.checked = value;
    else {
      input.value = value;
      input.autocomplete = 'off';
      input.spellcheck = false;
    }
    label.append(input);
    parent.append(label);
  }

  function addressFields(parent, prefix, config) {
    addField(parent, 'IPv4-адрес', prefix + 'address', config.address);
    addField(parent, 'Маска подсети', prefix + 'mask', config.mask);
  }

  function selectDevice(id) {
    if (id !== null && !deviceButtons.has(id)) return;
    entry.selected = id;
    $('inspection').hidden = !id;
    $('device-title').textContent = id ? routingName(id) : '';
    settings.open = false;
    form.replaceChildren();
    const host = entry.state.hosts.get(id);
    settings.hidden = !host && id !== 'router';
    if (host) {
      addressFields(form, '', host);
      addField(form, 'Шлюз по умолчанию', 'gateway', host.gateway);
    } else if (id === 'router') {
      for (const side of networks) {
        const config = entry.state.interfaces.get(interfaceId(side));
        const group = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = routingName(interfaceId(side));
        group.append(legend);
        addressFields(group, `${side}-`, config);
        addField(group, 'Интерфейс включён', `${side}-up`, config.up, 'checkbox');
        form.append(group);
      }
    }
    if (!settings.hidden) {
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Сохранить настройки';
      form.append(save);
    }
    refreshPorts();
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    playback = null;
    ping.disabled = false;
    $('finish').disabled = false;
    view.animate(null);
  }

  function showCables() {
    view.cables([...entry.state.access, ...entry.state.uplinks]);
  }

  function open(id, reset = false) {
    stop();
    incident = incidents.find(item => item.id === id);
    if (reset || !sessions.has(id)) {
      sessions.set(id, {
        state: createIncidentState(id), selected: null, scanned: new Set(), logs: [],
        latest: null, complete: false,
      });
    }
    entry = sessions.get(id);
    selector.value = id;
    $('finish').dataset.grade = `detective/${id}`;
    $('symptom').textContent = incident.symptom;
    $('command').textContent = command();
    log.replaceChildren(...entry.logs.map(makeLogItem));
    if (entry.complete) report('Диагностика завершена. Связь восстановлена.', 'success');
    else if (entry.latest === 'success') report('Получен ответ. Можно завершить диагностику.', 'success');
    else if (entry.latest === 'failure') report('Ответа нет. Изучите журнал событий.', 'error');
    else report('Запустите проверку и осмотрите устройства.');
    selectDevice(entry.selected);
    showCables();
    renderProgress();
    if (reset) record('Ситуация начата заново', 'Восстановлена исходная конфигурация этой заявки.');
  }

  function changed(title, detail) {
    stop();
    entry.latest = null;
    entry.complete = false;
    $('command').textContent = command();
    report('Изменения применены. Повторите проверку связи.');
    record(title, detail);
    refreshPorts();
    renderProgress();
  }

  function completePing() {
    const { steps, index } = playback;
    if (motion.matches) {
      for (const step of steps.slice(index + 1)) record(step.title, step.detail);
      view.animate(steps.at(-1), 1, true);
    }
    playback = null;
    ping.disabled = false;
    $('finish').disabled = false;
    entry.latest = 'success';
    report('Получен ответ. Можно завершить диагностику.', 'success');
    record('Ответ получен', 'Путь запроса и ответа проверен в обоих направлениях.', 'success');
  }

  function playStep(index) {
    const step = playback.steps[index];
    record(step.title, step.detail);
    view.animate(step, 0, motion.matches);
  }

  function tick(now) {
    frame = null;
    if (!playback) return;
    const step = playback.steps[playback.index];
    const elapsed = now - (playback.started ??= now);
    const duration = step.duration * 410;
    if (elapsed >= duration) {
      if (playback.index === playback.steps.length - 1) {
        completePing();
        return;
      }
      playback.index += 1;
      playback.started = now;
      playStep(playback.index);
    } else view.animate(step, elapsed / duration, false);
    frame = requestAnimationFrame(tick);
  }

  selector.addEventListener('change', () => {
    open(selector.value);
    assessment.render();
  });
  $('reset').addEventListener('click', () => open(incident.id, true));
  $('ports').addEventListener('click', () => {
    entry.scanned.add(entry.selected);
    const readings = inspectPorts(entry.state, entry.selected);
    refreshPorts();
    record(`Осмотр портов · ${routingName(entry.selected)}`, readings.map(port => `${port.label}: ${port.detail}`).join('. '));
  });

  cable.addEventListener('click', () => {
    const attached = !inspectPorts(entry.state, entry.selected)[0].up;
    setAccessCable(entry.state, entry.selected, attached);
    changed('Состояние кабеля изменено', `${routingName(entry.selected)} · ${attached ? 'кабель подключён' : 'кабель отсоединён'}.`);
    showCables();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const text = name => String(data.get(name)).trim();
    const address = (prefix = '') => ({ address: text(prefix + 'address'), mask: text(prefix + 'mask') });
    if (entry.selected === 'router') {
      for (const side of networks) {
        entry.state.interfaces.set(interfaceId(side), { ...address(`${side}-`), up: data.has(`${side}-up`) });
      }
    } else entry.state.hosts.set(entry.selected, { ...address(), gateway: text('gateway') });
    changed('Настройки сохранены', routingName(entry.selected));
  });

  ping.addEventListener('click', () => {
    stop();
    entry.latest = null;
    $('journal').open = true;
    record('Виртуальная проверка связи', command());
    const { errors, steps } = probeIncident(entry.state, incident.pair);
    if (errors.length) {
      entry.latest = 'failure';
      report('Ответа нет. Изучите журнал событий.', 'error');
      for (const error of errors) {
        const detail = assessment.control()
          ? error.replace('укажите корректную маску /24 (255.255.255.0).', 'маска не соответствует адресному плану.')
            .replace(' Включите его в настройках маршрутизатора.', '')
          : error;
        record('Диагностика', detail, 'error');
      }
      return;
    }
    playback = { steps, index: 0, started: null };
    ping.disabled = true;
    $('finish').disabled = true;
    report('Проверяется путь запроса и ответа.');
    playStep(0);
    if (motion.matches) completePing();
    else frame = requestAnimationFrame(tick);
  });

  $('finish').addEventListener('click', () => {
    const latestSuccess = entry.latest === 'success';
    const problems = latestSuccess ? networkIssues(entry.state) : [];
    const success = latestSuccess && !problems.length;
    const message = !latestSuccess ? 'Сначала получите успешный ответ после последнего изменения.'
      : problems.length ? 'Ответ получен, но в сети остались неисправности.'
      : 'Диагностика завершена. Связь восстановлена.';
    if (!assessment.submit('detective', incident.id, success ? 4 : 0, [message, ...problems].join(' '))) return;
    if (!success) {
      report(message, 'error');
      if (problems.length) $('journal').open = true;
      for (const problem of problems) record('Итоговая проверка', problem, 'error');
      return;
    }
    entry.complete = true;
    renderProgress();
    report('Диагностика завершена. Связь восстановлена.', 'success');
    record('Заявка закрыта', 'Запрос и ответ доставлены, настройки и кабели проверены.', 'success');
  });

  motion.addEventListener('change', () => {
    if (!motion.matches || !playback) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    completePing();
  });

  return {
    enter() { open(incident.id); },
    leave() {
      stop();
      view.select(null, new Map());
    },
    selectDevice,
  };
}
