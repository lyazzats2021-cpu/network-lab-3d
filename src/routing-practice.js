import { computers } from './topology.js';
import {
  checkAddressing, connectUplink, createRoutingState, interfaceId, networks, planRoute,
  routingDevices, routingName, subnetOf, switchId, wiringErrors,
} from './routing-network.js';

export function createRoutingPractice(panel, tasks, view, submit) {
  const state = createRoutingState();
  const $ = name => panel.querySelector(`#routing-${name}`);
  const form = $('config');
  const info = $('device-info');
  const linkList = $('links');
  const sw = $('switch');
  const intf = $('interface');
  const from = $('from');
  const to = $('to');
  const status = $('status');
  const journal = $('log');
  const pause = $('pause');
  const repeat = $('repeat');
  const send = $('send');
  const faultNote = tasks.querySelector('#routing-fault-note');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const deviceButtons = new Map();
  let selected = computers[0];
  let lastPair;
  let run;
  let frame = null;
  let fault = null;
  let faultSolved = false;

  for (const side of networks) {
    sw.add(new Option(side.toUpperCase(), switchId(side)));
    intf.add(new Option(side.toUpperCase(), interfaceId(side)));
  }
  for (const id of computers) {
    from.add(new Option(routingName(id), id));
    to.add(new Option(routingName(id), id));
  }
  to.value = 'pc-03';
  for (const id of routingDevices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = routingName(id);
    button.dataset.device = id;
    button.addEventListener('click', () => selectDevice(id));
    $('devices').append(button);
    deviceButtons.set(id, button);
  }

  function field(parent, title, name, value, type = 'text') {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    if (type === 'checkbox') input.checked = value;
    else {
      input.value = value;
      input.autocomplete = 'off';
      input.spellcheck = false;
    }
    label.append(input);
    parent.append(label);
  }

  function selectDevice(id) {
    if (!deviceButtons.has(id)) return;
    selected = id;
    for (const [item, button] of deviceButtons) button.setAttribute('aria-pressed', String(item === id));
    $('device-title').textContent = routingName(id);
    $('saved').textContent = '';
    form.replaceChildren();
    const host = state.hosts.get(id);
    form.hidden = !host && id !== 'router';
    if (host) {
      info.textContent = `Подсеть ${subnetOf(id).toUpperCase()} · RJ‑45 · передаёт и принимает данные.`;
      field(form, 'IPv4-адрес', 'address', host.address);
      field(form, 'Маска', 'mask', host.mask);
      field(form, 'Шлюз по умолчанию', 'gateway', host.gateway);
    } else if (id === 'router') {
      info.textContent = 'Соединяет подсети A и B. Интерфейсы можно настраивать независимо.';
      for (const side of networks) {
        const config = state.interfaces.get(interfaceId(side));
        const group = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = routingName(interfaceId(side));
        group.append(legend);
        field(group, 'IPv4-адрес', `${side}-address`, config.address);
        field(group, 'Маска', `${side}-mask`, config.mask);
        field(group, 'Интерфейс включён', `${side}-up`, config.up, 'checkbox');
        form.append(group);
      }
      field(form, 'Маршрутизация включена', 'forwarding', state.forwarding, 'checkbox');
    } else {
      sw.value = id;
      const link = state.uplinks.find(([device]) => device === id);
      info.textContent = `Порты 1 и 2 служат для ПК подсети ${id.at(-1).toUpperCase()}. Порт к маршрутизатору: ${link ? routingName(link[1]) : 'свободен'}.`;
    }
    if (!form.hidden) {
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Сохранить настройки';
      form.append(save);
    }
    view.select(id);
  }

  function setControls() {
    pause.disabled = !run;
    from.disabled = to.disabled = send.disabled = Boolean(run);
    repeat.disabled = !lastPair;
    pause.textContent = run?.paused ? 'Продолжить' : 'Пауза';
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    run = null;
    setControls();
  }

  function resetPlayback() {
    stop();
    view.animate(null);
    journal.replaceChildren();
    status.textContent = 'Выберите два ПК и отправьте пакет.';
    status.dataset.error = 'false';
  }

  function append(title, detail) {
    journal.lastElementChild?.removeAttribute('aria-current');
    const item = document.createElement('li');
    const heading = document.createElement('strong');
    const body = document.createElement('p');
    heading.textContent = title;
    body.textContent = detail;
    item.append(heading, body);
    item.setAttribute('aria-current', 'step');
    journal.append(item);
    journal.scrollTop = journal.scrollHeight;
  }

  function announce() {
    const step = run.steps[run.index];
    status.textContent = step.title;
    append(step.title, step.detail);
    view.animate(step, 0, reduced.matches);
  }

  function tick(now) {
    frame = null;
    if (!run || run.paused) return;
    run.elapsed += Math.min((now - (run.previous ?? now)) / 1000, .12) * (reduced.matches ? 2 : 1);
    run.previous = now;
    const step = run.steps[run.index];
    if (run.elapsed >= step.duration) {
      run.elapsed -= step.duration;
      if (++run.index === run.steps.length) {
        if (fault?.attempted && lastPair[0] === 'pc-01' && lastPair[1] === 'pc-03') {
          fault = null;
          faultSolved = true;
          faultNote.textContent = 'Выполнено. ПК 01 снова передаёт данные в подсеть B.';
        }
        stop();
        return;
      }
      announce();
    } else view.animate(step, run.elapsed / step.duration, reduced.matches);
    frame = requestAnimationFrame(tick);
  }

  function transmit(pair) {
    resetPlayback();
    lastPair = pair;
    [from.value, to.value] = pair;
    const plan = planRoute(state, ...pair);
    if (plan.errors.length) {
      for (const error of plan.errors) append('Передача остановлена', error);
      if (fault && pair[0] === 'pc-01' && pair[1] === 'pc-03' && state.hosts.get('pc-01').gateway === fault.address) {
        fault.attempted = true;
        faultNote.textContent = 'Сбой обнаружен. Исправьте указанную в журнале причину и отправьте пакет снова.';
      }
      status.textContent = 'Пакет не отправлен';
      status.dataset.error = 'true';
      setControls();
      return;
    }
    run = { steps: plan.steps, index: 0, elapsed: 0 };
    setControls();
    announce();
    frame = requestAnimationFrame(tick);
  }

  function updateLinks() {
    linkList.replaceChildren();
    for (const link of state.uplinks) {
      const item = document.createElement('li');
      const label = `${routingName(link[0])} ↔ ${routingName(link[1])}`;
      item.textContent = label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', `Удалить кабель: ${label}`);
      remove.addEventListener('click', () => {
        resetPlayback();
        state.uplinks.splice(state.uplinks.indexOf(link), 1);
        updateLinks();
        $('wire-note').textContent = 'Кабель удалён. Оба порта свободны.';
        $('connect').focus();
      });
      item.append(remove);
      linkList.append(item);
    }
    if (selected.startsWith('switch-')) selectDevice(selected);
    view.cables([...state.access, ...state.uplinks]);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const value = name => String(data.get(name)).trim();
    if (selected === 'router') {
      for (const side of networks) {
        state.interfaces.set(interfaceId(side), {
          address: value(`${side}-address`), mask: value(`${side}-mask`), up: data.has(`${side}-up`),
        });
      }
      state.forwarding = data.has('forwarding');
    } else state.hosts.set(selected, { address: value('address'), mask: value('mask'), gateway: value('gateway') });
    resetPlayback();
    $('saved').textContent = `Настройки сохранены · ${routingName(selected)}.`;
  });

  $('connect').addEventListener('click', () => {
    const error = connectUplink(state.uplinks, sw.value, intf.value);
    $('wire-note').textContent = error || 'Кабель подключён.';
    if (error) return;
    resetPlayback();
    updateLinks();
  });
  send.addEventListener('click', () => transmit([from.value, to.value]));
  repeat.addEventListener('click', () => transmit(lastPair));
  pause.addEventListener('click', () => {
    run.paused = !run.paused;
    run.previous = null;
    if (run.paused) {
      cancelAnimationFrame(frame);
      frame = null;
      status.textContent = 'Передача на паузе';
    } else {
      status.textContent = run.steps[run.index].title;
      frame = requestAnimationFrame(tick);
    }
    setControls();
  });
  reduced.addEventListener('change', () => {
    if (run) {
      const step = run.steps[run.index];
      view.animate(step, run.elapsed / step.duration, reduced.matches);
    }
  });

  const quizzes = {
    subnet: ['02', 'ПК 01 и ПК 02 находятся в сети 192.168.1.0/24. ПК 03 и ПК 04 принадлежат сети 192.168.2.0/24.'],
    path: ['router', 'ПК 01 передаёт кадр через коммутатор A к шлюзу. Маршрутизатор отправляет пакет через B к ПК 03.'],
  };
  for (const quiz of tasks.querySelectorAll('[data-route-quiz]')) {
    const id = quiz.dataset.routeQuiz;
    quiz.querySelector('button').dataset.grade = `routing/${id}`;
    quiz.addEventListener('submit', event => {
      event.preventDefault();
      const [answer, explanation] = quizzes[id];
      const correct = quiz.querySelector('select').value === answer;
      const feedback = `${correct ? 'Верно.' : 'Проверьте ответ.'} ${explanation}`;
      if (submit('routing', id, correct ? 4 : 0, feedback)) quiz.querySelector('[role="status"]').textContent = feedback;
    });
  }
  for (const [id, verify, success] of [
    ['wires', wiringErrors, 'Оба коммутатора подключены к нужным интерфейсам.'],
    ['gateways', checkAddressing, 'Адреса, маски и шлюзы настроены верно.'],
  ]) {
    const button = tasks.querySelector(`#routing-check-${id}`);
    button.addEventListener('click', () => {
      const errors = verify(state);
      const feedback = errors.length ? errors.join(' ') : success;
      if (submit('routing', id, errors.length ? 0 : 4, feedback)) {
        button.parentElement.querySelector('[role="status"]').textContent = feedback;
      }
    });
  }
  tasks.querySelector('#routing-grade-fault').addEventListener('click', () => {
    const verified = faultSolved && !planRoute(state, 'pc-01', 'pc-03').errors.length;
    const feedback = verified
      ? 'Учебный сбой обнаружен, после ремонта пакет доставлен.'
      : 'Сбой и успешный повторный тест не подтверждены. Для восстановления нужен корректный шлюз и рабочий маршрут.';
    if (submit('routing', 'fault', verified ? 4 : 0, feedback)) faultNote.textContent = feedback;
  });
  tasks.querySelector('#routing-fault').addEventListener('click', () => {
    resetPlayback();
    faultSolved = false;
    fault = { address: '192.168.1.254', attempted: false };
    state.hosts.get('pc-01').gateway = fault.address;
    selectDevice(selected);
    faultNote.textContent = 'Ошибка внесена. Проверьте передачу от ПК 01 к ПК 03.';
  });

  resetPlayback();
  return {
    enter() { selectDevice(selected); updateLinks(); },
    leave() { resetPlayback(); },
    selectDevice,
    selectPort(id, device) {
      if (id.startsWith('if-')) {
        intf.value = id;
        selectDevice('router');
      } else selectDevice(device);
    },
  };
}
