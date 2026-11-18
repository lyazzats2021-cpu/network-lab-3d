import { checkAssignment, checkConnection } from './ipv4.js';
import { computers, portLabel } from './topology.js';

const blank = { address: '', mask: '' };
const labels = {
  empty: 'Без настроек',
  draft: 'Не сохранено',
  saved: 'Сохранено',
  correct: 'IP настроен',
  error: 'Есть ошибки',
};

export function createIpPractice(panel, getLinks, onUpdate, onProbe, submit) {
  const saved = new Map();
  const drafts = new Map();
  let selected = null;
  let marked = null;
  const devices = panel.querySelector('#ip-devices');
  const form = panel.querySelector('#ip-form');
  const address = panel.querySelector('#ip-address');
  const mask = panel.querySelector('#ip-mask');
  const source = panel.querySelector('#ip-source');
  const target = panel.querySelector('#ip-target');
  const selection = panel.querySelector('#ip-selection');
  const feedback = panel.querySelector('#ip-feedback');
  const settingsNote = panel.querySelector('#ip-settings-note');

  const buttons = new Map();
  for (const id of computers) {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('strong');
    name.textContent = portLabel(id);
    const status = document.createElement('small');
    button.append(name, status);
    button.addEventListener('click', () => selectDevice(id));
    buttons.set(id, { button, status });
    devices.append(button);
    source.add(new Option(portLabel(id), id));
    target.add(new Option(portLabel(id), id));
  }
  source.value = computers[0];
  target.value = computers[1];

  function dirty(id) {
    const draft = drafts.get(id);
    const config = saved.get(id) ?? blank;
    return Boolean(draft && (draft.address !== config.address || draft.mask !== config.mask));
  }

  function refresh() {
    const statuses = new Map();
    for (const [id, { button, status }] of buttons) {
      const state = dirty(id) ? 'draft'
        : marked?.has(id) ? 'error'
        : marked ? 'correct'
        : saved.has(id) ? 'saved'
        : 'empty';
      button.dataset.ipStatus = state;
      status.textContent = labels[state];
      button.setAttribute('aria-pressed', String(selected === id));
      statuses.set(id, { state, label: labels[state] });
    }
    onUpdate({ selected, statuses });
  }

  function selectDevice(id) {
    if (!computers.includes(id)) return;
    selected = id;
    const config = drafts.get(id) ?? saved.get(id) ?? blank;
    address.value = config.address;
    mask.value = config.mask;
    selection.textContent = `Сетевые настройки · ${portLabel(id)}`;
    settingsNote.textContent = dirty(id) ? 'Сохраните изменения перед проверкой.' : '';
    form.hidden = false;
    refresh();
  }

  function report(title, errors = []) {
    feedback.hidden = !title;
    feedback.replaceChildren();
    if (!title) return;
    feedback.dataset.error = String(Boolean(errors.length));
    const heading = document.createElement('strong');
    heading.textContent = title;
    feedback.append(heading);
    if (errors.length) {
      const list = document.createElement('ul');
      for (const error of new Set(errors)) {
        const item = document.createElement('li');
        item.textContent = error;
        list.append(item);
      }
      feedback.append(list);
    }
  }

  function warnUnsaved(ids) {
    const unsaved = ids.filter(dirty);
    if (!unsaved.length) return false;
    report('Есть несохранённые настройки', [`Сохраните изменения: ${unsaved.map(portLabel).join(', ')}.`]);
    return true;
  }

  function clearProbe() {
    report('');
    onProbe([]);
  }

  form.addEventListener('input', () => {
    drafts.set(selected, { address: address.value.trim(), mask: mask.value.trim() });
    settingsNote.textContent = dirty(selected) ? 'Сохраните изменения перед проверкой.' : '';
    clearProbe();
    refresh();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const config = { address: address.value.trim(), mask: mask.value.trim() };
    saved.set(selected, config);
    drafts.delete(selected);
    marked = null;
    settingsNote.textContent = `Настройки ${portLabel(selected)} сохранены.`;
    clearProbe();
    refresh();
  });
  panel.querySelector('#ip-check').addEventListener('click', () => {
    onProbe([]);
    if (warnUnsaved(computers)) return;
    const checked = checkAssignment(saved);
    const errors = [...new Set([...checked.values()].flat())];
    const title = errors.length ? 'Исправьте IP-адресацию' : 'IP-адресация соответствует плану';
    if (!submit('ip', 'addresses', (computers.length - checked.size) * 5, [title, ...errors].join(' '))) return;
    marked = checked;
    report(title, errors);
    refresh();
  });
  source.addEventListener('change', clearProbe);
  target.addEventListener('change', clearProbe);
  panel.querySelector('#ip-test-link').addEventListener('click', () => {
    onProbe([]);
    const from = source.value;
    const to = target.value;
    if (warnUnsaved([from, to])) return;
    const { errors, path } = checkConnection(saved, getLinks(), from, to);
    report(errors.length ? 'Связь не установлена' : `Есть связь: ${portLabel(from)} ↔ ${portLabel(to)}`, errors);
    if (!errors.length) onProbe(path);
  });

  refresh();
  return { selectDevice, clearProbe, getSaved: () => new Map(saved) };
}
