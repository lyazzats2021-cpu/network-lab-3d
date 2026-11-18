import {
  assessmentKey, levelResult, levels, newAttempt, nextLevel, readAttempt, recordCheck, resultMessage, resultText, totalPoints,
} from './assessment.js';

export function createAssessment() {
  const $ = id => document.getElementById(id);
  const start = $('start-form');
  const startError = $('start-error');
  const progressError = $('assessment-error');
  const next = $('assessment-next');
  const control = () => attempt?.mode === 'control';
  let attempt = null;
  let current;
  let routeTo;
  let storageAvailable = true;
  try { attempt = readAttempt(localStorage.getItem(assessmentKey)); }
  catch { storageAvailable = false; }
  let savedAttempt = Boolean(attempt);

  function persist() {
    try {
      localStorage.setItem(assessmentKey, JSON.stringify(attempt));
      savedAttempt = storageAvailable = true;
    }
    catch { storageAvailable = false; }
  }

  function error(message) {
    progressError.textContent = message;
    progressError.hidden = !message;
  }

  function resolve(hash) {
    if (control()) {
      // A completed level stays on-screen until the student chooses to advance.
      const allowed = nextLevel(attempt);
      if (hash === allowed || (hash !== 'start' && hash === current && levels.some(level => level.id === hash))) return hash;
      return allowed;
    }
    if (hash && (hash === 'overview' || levels.some(level => level.id === hash))) {
      attempt ??= { mode: 'training' };
      return hash;
    }
    return attempt ? 'overview' : 'start';
  }

  function item(text) {
    const row = document.createElement('li');
    row.textContent = text;
    return row;
  }

  function results() {
    const score = totalPoints(attempt);
    $('results-student').textContent = `${attempt.student.name} · ${attempt.student.group}`;
    $('results-total').textContent = `${score} из 100 · ${score}%`;
    $('results-message').textContent = resultMessage(score);
    $('results-levels').replaceChildren(...levels.map(level => item(`${level.name} — ${levelResult(attempt, level).points} из 20`)));
  }

  function render(route = current) {
    current = route;
    const inControl = control();
    const started = route !== 'start';
    document.querySelector('.lab-nav').hidden = !started;
    $('start-screen').hidden = started;
    $('assessment-bar').hidden = !started;
    $('results-screen').hidden = route !== 'results';
    document.body.dataset.assessment = inControl ? 'control' : 'training';
    $('assessment-mode').textContent = inControl ? 'Контроль знаний' : 'Тренировка';
    $('assessment-score').hidden = !inControl;
    $('assessment-levels').hidden = !inControl;
    $('assessment-rules').hidden = !inControl || route === 'results';
    $('overview-link').href = '#overview';
    $('overview-link').hidden = inControl;
    $('results-link').hidden = route !== 'results';
    $('routing-grade-fault').hidden = !inControl;
    $('packet-send').textContent = inControl ? 'Отправить пакет и зачесть' : 'Отправить пакет';
    next.hidden = true;
    error(inControl && !storageAvailable ? 'Хранилище браузера недоступно. При обновлении страницы баллы могут потеряться.' : '');
    const allowed = inControl ? nextLevel(attempt) : null;
    for (const level of levels) {
      const link = $(`${level.id}-link`);
      if (inControl && level.id !== route && level.id !== allowed) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    }
    if (!inControl) return;

    const complete = levels.filter(level => levelResult(attempt, level).complete).length;
    $('assessment-score').textContent = `${totalPoints(attempt)} из 100 баллов · уровней завершено: ${complete} из 5`;
    const progress = levels.map(level => {
      const result = levelResult(attempt, level);
      const element = item(`${level.name} · ${result.complete ? `${result.points}/20` : level.id === route ? `${result.checked}/${level.tasks.length} сдано` : 'ожидает'}`);
      element.dataset.state = result.complete ? 'done' : level.id === route ? 'active' : 'locked';
      if (level.id === route) element.setAttribute('aria-current', 'step');
      return element;
    });
    $('assessment-levels').replaceChildren(...progress);
    const level = levels.find(item => item.id === route);
    $('assessment-tasks').replaceChildren(...(level?.tasks ?? []).map(task => {
      const scored = attempt.checks[route]?.[task.id];
      const row = item(`${task.label} · ${scored ? `${scored.points}/${task.points} зафиксировано` : `до ${task.points} баллов`}`);
      if (scored?.feedback) {
        const note = document.createElement('small');
        note.textContent = scored.feedback;
        row.append(note);
      }
      return row;
    }));
    for (const button of document.querySelectorAll('[data-grade]')) {
      const [levelId, taskId] = button.dataset.grade.split('/');
      if (attempt.checks[levelId]?.[taskId]) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
    if (level && levelResult(attempt, level).complete) {
      next.hidden = false;
      next.textContent = allowed === 'results' ? 'Показать итог' : 'Следующий уровень';
    }
    if (route === 'results') results();
  }

  function submit(level, task, points, feedback) {
    if (!control()) return true;
    if (savedAttempt && storageAvailable) {
      try {
        const stored = readAttempt(localStorage.getItem(assessmentKey));
        if (stored?.id !== attempt.id) {
          error('Попытка сброшена в другой вкладке. Обновите страницу перед продолжением.');
          return false;
        }
        attempt = stored;
      } catch { storageAvailable = false; }
    }
    const updated = recordCheck(attempt, level, task, points, feedback);
    if (!updated) {
      render();
      error('Этот результат уже зафиксирован или уровень сейчас закрыт. Баллы не изменены.');
      return false;
    }
    attempt = updated;
    persist();
    render();
    return true;
  }

  function requiredInputs() {
    const selected = new FormData(start).get('mode') === 'control';
    $('student-name').required = $('student-group').required = selected;
  }
  start.addEventListener('change', requiredInputs);
  start.addEventListener('submit', event => {
    event.preventDefault();
    if (attempt) return;
    const selected = new FormData(start).get('mode');
    attempt = selected === 'control' ? newAttempt($('student-name').value, $('student-group').value) : { mode: 'training' };
    if (!attempt) {
      startError.textContent = 'Укажите фамилию, имя и учебную группу.';
      startError.hidden = false;
      return;
    }
    persist();
    routeTo(control() ? 'practice' : 'overview');
  });

  $('assessment-reset').addEventListener('click', () => {
    if (!confirm(control()
      ? 'Начать новую попытку? Все баллы и настройки текущей попытки будут удалены.'
      : 'Начать заново? Текущие настройки тренировки будут сброшены.')) return;
    try { localStorage.removeItem(assessmentKey); }
    catch {
      if (control() && savedAttempt) {
        error('Хранилище браузера недоступно. Очистить сохранённую попытку сейчас не удалось.');
        return;
      }
    }
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  });

  next.addEventListener('click', () => routeTo(nextLevel(attempt)));
  $('results-download').addEventListener('click', () => {
    if (!control() || nextLevel(attempt) !== 'results') return;
    const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(attempt.completedAt));
    const blob = new Blob(['\uFEFF', resultText(attempt, date)], { type: 'text/plain;charset=utf-8' });
    const address = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = address;
    link.download = 'network-lab-3d-result.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(address), 1000);
  });

  return {
    control, resolve, render, submit,
    attach(navigate) { routeTo = navigate; },
  };
}
