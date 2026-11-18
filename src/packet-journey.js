import { createPacketMemory, networkKey, planTransmission } from './packet-network.js';
import { computers, portLabel } from './topology.js';

const speedFactors = { slow: .55, normal: 1, fast: 2 };
const kindNames = { system: 'Этап', arp: 'ARP', frame: 'Кадр' };

const exercises = [
  {
    question: 'Что делает коммутатор, если знает, за каким портом находится MAC получателя?',
    answers: ['Выбирает порт получателя по таблице MAC.', 'Выдаёт компьютеру новый IP-адрес.', 'Отправляет кадр на все порты.'],
    correct: 0,
    explanation: 'Коммутатор использует таблицу MAC. Если порт получателя известен, кадр отправляется только через этот порт.',
  },
  {
    question: 'У ПК 03 верные IP и маска, но его кабель отсоединён. Почему передача останавливается?',
    answers: ['ПК 03 находится в другой подсети.', 'Кадру некуда пройти на физическом уровне.', 'ARP меняет IP компьютера.'],
    correct: 1,
    explanation: 'Кадру нужен непрерывный физический путь от отправителя через коммутатор к получателю. Верные IP-адреса не заменяют кабель.',
  },
  {
    question: 'Оба ПК подключены к коммутатору. У отправителя 192.0.2.10/24. Какая настройка получателя препятствует доставке?',
    answers: ['192.0.2.30/24', '192.0.2.103/24', '198.51.100.30/24'],
    correct: 2,
    explanation: 'С префиксом /24 адрес 198.51.100.30 находится в подсети 198.51.100.0/24. Для обмена между подсетями нужен маршрутизатор.',
  },
];

function setupExercises(root, assessment) {
  const first = root.querySelector('#packet-task-one');
  const list = root.querySelector('#packet-questions');
  for (const [index, task] of exercises.entries()) {
    const form = document.createElement('form');
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${index + 2}. ${task.question}`;
    group.append(legend);
    task.answers.forEach((answer, value) => {
      const label = document.createElement('label');
      const option = document.createElement('input');
      option.type = 'radio';
      option.name = 'answer';
      option.value = String(value);
      label.append(option, answer);
      group.append(label);
    });
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Проверить ответ';
    const id = ['switch', 'cable', 'subnet'][index];
    submit.dataset.grade = `packet/${id}`;
    const note = document.createElement('p');
    note.setAttribute('role', 'status');
    form.append(group, submit, note);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const selected = new FormData(form).get('answer');
      if (selected === null) {
        note.textContent = 'Выберите вариант ответа.';
        return;
      }
      const correct = Number(selected) === task.correct;
      const feedback = `${correct ? 'Верно.' : 'Проверьте свой ответ.'} ${task.explanation}`;
      if (assessment.submit('packet', id, correct ? 5 : 0, feedback)) note.textContent = feedback;
    });
    list.append(form);
  }

  return (from, to, delivered) => {
    if (first.dataset.complete === 'true' || from !== 'pc-01' || to !== 'pc-03') return;
    first.dataset.complete = String(delivered);
    first.textContent = delivered
      ? 'Выполнено. Кадр от ПК 01 доставлен на ПК 03.'
      : 'Попытка не завершена. Исправьте ошибки из журнала и повторите отправку.';
  };
}

export function createPacketJourney(panel, tasks, getSettings, getLinks, onVisual, onSelect, assessment) {
  const source = panel.querySelector('#packet-source');
  const target = panel.querySelector('#packet-target');
  const speed = panel.querySelector('#packet-speed');
  const send = panel.querySelector('#packet-send');
  const pause = panel.querySelector('#packet-pause');
  const repeat = panel.querySelector('#packet-repeat');
  const status = panel.querySelector('#packet-status');
  const journal = panel.querySelector('#packet-log');
  const journalDetails = panel.querySelector('#packet-journal');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const verifyExercise = setupExercises(tasks, assessment);
  let memory = createPacketMemory();
  let signature;
  let lastPair;
  let run;
  let frame = null;
  let paused = false;
  let previousTime = null;
  let currentEntry;

  for (const id of computers) {
    source.add(new Option(portLabel(id), id));
    target.add(new Option(portLabel(id), id));
  }
  target.value = 'pc-03';
  let controlChoices = false;

  function endpoints() {
    const settings = getSettings();
    panel.querySelector('#packet-source-ip').textContent = settings.get(source.value)?.address || 'IP не задан';
    panel.querySelector('#packet-target-ip').textContent = settings.get(target.value)?.address || 'IP не задан';
    onSelect(source.value, target.value);
  }

  function controls() {
    send.disabled = Boolean(run);
    source.disabled = target.disabled = Boolean(run);
    pause.disabled = !run;
    pause.textContent = paused ? 'Продолжить' : 'Пауза';
    repeat.disabled = !lastPair;
    status.dataset.playing = String(Boolean(run && !paused));
  }

  function append(title, detail, kind = 'system') {
    currentEntry?.removeAttribute('aria-current');
    const entry = document.createElement('li');
    entry.dataset.kind = kind;
    entry.setAttribute('aria-current', 'step');
    const heading = document.createElement('strong');
    heading.textContent = `${kindNames[kind]} · ${title}`;
    const description = document.createElement('p');
    description.textContent = detail;
    entry.append(heading, description);
    journal.append(entry);
    currentEntry = entry;
    journal.scrollTop = journal.scrollHeight;
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    run = null;
    paused = false;
    previousTime = null;
    controls();
  }

  function draw() {
    const step = run.plan.steps[run.index];
    const progress = run.elapsed / step.duration;
    onVisual(step, Math.min(1, progress), reducedMotion.matches);
  }

  function announceStep() {
    const step = run.plan.steps[run.index];
    append(step.title, step.detail, step.kind);
    status.textContent = `${run.index + 1}/${run.plan.steps.length} · ${step.title}`;
  }

  function tick(now) {
    frame = null;
    if (!run || paused) return;
    if (previousTime !== null) {
      // Cap the frame interval when the browser has suspended a background tab.
      const delta = Math.min((now - previousTime) / 1000, .1);
      run.elapsed += delta * speedFactors[speed.value];
    }
    previousTime = now;
    const step = run.plan.steps[run.index];
    if (run.elapsed >= step.duration) {
      if (run.index === run.plan.steps.length - 1) {
        memory = run.plan.nextMemory;
        verifyExercise(run.from, run.to, true);
        status.textContent = 'Пакет доставлен';
        stop();
        return;
      }
      run.elapsed -= step.duration;
      run.index += 1;
      announceStep();
    }
    draw();
    frame = requestAnimationFrame(tick);
  }

  function readNetwork() {
    const settings = getSettings();
    const links = getLinks();
    const key = networkKey(settings, links);
    if (key !== signature) {
      signature = key;
      memory = createPacketMemory();
    }
    return { settings, links };
  }

  function start(from, to, graded = false) {
    if (assessment.control() && graded && (!from || !to)) {
      status.textContent = 'Выберите отправителя и получателя.';
      return;
    }
    if (graded) {
      const plan = planTransmission(getSettings(), getLinks(), from, to, memory);
      const correct = !plan.errors.length && from === 'pc-01' && to === 'pc-03';
      const feedback = correct ? 'Выбрана нужная пара, маршрут доступен.'
        : ['Задание требует отправки от ПК 01 к ПК 03 по работающему маршруту.', ...plan.errors].join(' ');
      if (!assessment.submit('packet', 'delivery', correct ? 5 : 0, feedback)) return;
      if (assessment.control()) tasks.querySelector('#packet-task-one').textContent = feedback;
    }
    stop();
    onVisual(null);
    lastPair = [from, to];
    source.value = from;
    target.value = to;
    endpoints();
    journal.replaceChildren();
    currentEntry = null;
    journalDetails.open = true;
    const { settings, links } = readNetwork();
    const plan = planTransmission(settings, links, from, to, memory);
    if (plan.errors.length) {
      status.textContent = 'Пакет не отправлен';
      status.dataset.error = 'true';
      for (const error of plan.errors) append('Передача остановлена', error);
      verifyExercise(from, to, false);
      controls();
      return;
    }
    delete status.dataset.error;
    run = { plan, from, to, index: 0, elapsed: 0 };
    controls();
    announceStep();
    draw();
    frame = requestAnimationFrame(tick);
  }

  function select() {
    onVisual(null);
    status.textContent = 'Готово к отправке';
    delete status.dataset.error;
    endpoints();
  }

  source.addEventListener('change', select);
  target.addEventListener('change', select);
  send.addEventListener('click', () => start(source.value, target.value, assessment.control()));
  repeat.addEventListener('click', () => start(...lastPair));
  pause.addEventListener('click', () => {
    paused = !paused;
    previousTime = null;
    if (paused) {
      cancelAnimationFrame(frame);
      frame = null;
      status.textContent = 'Передача на паузе';
    } else {
      status.textContent = `${run.index + 1}/${run.plan.steps.length} · ${run.plan.steps[run.index].title}`;
      frame = requestAnimationFrame(tick);
    }
    controls();
  });
  reducedMotion.addEventListener('change', () => { if (run) draw(); });
  controls();
  return {
    enter() {
      if (assessment.control() && !controlChoices) {
        for (const picker of [source, target]) {
          picker.add(new Option('Выберите ПК', ''), 0);
          picker.value = '';
        }
        controlChoices = true;
      }
      const previous = signature;
      readNetwork();
      if (previous !== signature) select();
      else endpoints();
    },
    leave() {
      if (run) {
        append('Передача прервана', 'Открыт другой уровень.');
        status.textContent = 'Передача прервана';
      }
      stop();
      onVisual(null);
    },
    chooseSender(id) {
      if (run || !computers.includes(id)) return;
      source.value = id;
      select();
    },
  };
}
