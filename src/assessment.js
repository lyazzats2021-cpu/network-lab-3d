export const assessmentKey = 'network-lab-3d.assessment.v1';
const task = (id, points, label) => ({ id, points, label });
export const levels = [
  { id: 'practice', name: 'Собери локальную сеть', tasks: [task('topology', 20, 'Соедините четыре ПК с коммутатором · 5 баллов за каждый ПК')] },
  { id: 'ip', name: 'IP-МАСТЕР 3D', tasks: [task('addresses', 20, 'Настройте адреса и маски по плану без конфликтов · 5 баллов за каждый ПК')] },
  { id: 'packet', name: 'Путешествие пакета', tasks: [
    task('delivery', 5, 'Доставьте кадр от ПК 01 к ПК 03'),
    task('switch', 5, 'Объясните роль коммутатора'),
    task('cable', 5, 'Объясните сбой при отключении кабеля'),
    task('subnet', 5, 'Найдите неверную IPv4-настройку'),
  ] },
  { id: 'routing', name: 'Маршрутизатор 3D', tasks: [
    task('subnet', 4, 'Определите соседний ПК в подсети'),
    task('wires', 4, 'Соедините коммутаторы с нужными интерфейсами'),
    task('gateways', 4, 'Настройте адреса и шлюзы'),
    task('path', 4, 'Выберите путь через маршрутизатор'),
    task('fault', 4, 'Обнаружьте учебный сбой и восстановите доставку'),
  ] },
  { id: 'detective', name: 'Сетевой детектив 3D', tasks: ['cable', 'duplicate', 'mask', 'gateway', 'interface'].map(
    (id, index) => task(id, 4, `Ситуация ${index + 1} · устраните неисправность и подтвердите связь`),
  ) },
];

export function newAttempt(name, group) {
  name = name.trim();
  group = group.trim();
  if (!name || !group) return null;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return { mode: 'control', id, student: { name, group }, checks: {}, completedAt: null };
}

export function levelResult(attempt, level) {
  const results = Object.values(attempt?.checks?.[level.id] ?? {});
  return {
    checked: results.length,
    complete: results.length === level.tasks.length,
    points: results.reduce((sum, result) => sum + result.points, 0),
  };
}

export function nextLevel(attempt) {
  return levels.find(level => !levelResult(attempt, level).complete)?.id ?? 'results';
}

export function totalPoints(attempt) {
  return levels.reduce((sum, level) => sum + levelResult(attempt, level).points, 0);
}

function validPoints(points, definition) {
  return Number.isInteger(points) && points >= 0 && points <= definition.points &&
    (definition.points === 20 ? points % 5 === 0 : points === 0 || points === definition.points);
}

export function recordCheck(attempt, levelId, taskId, points, feedback, now = new Date()) {
  if (attempt?.mode !== 'control' || nextLevel(attempt) !== levelId || attempt.checks[levelId]?.[taskId]) return null;
  const level = levels.find(item => item.id === levelId);
  const definition = level?.tasks.find(item => item.id === taskId);
  if (!definition || !validPoints(points, definition) || typeof feedback !== 'string') return null;
  const next = {
    ...attempt,
    checks: { ...attempt.checks, [levelId]: { ...attempt.checks[levelId], [taskId]: { points, feedback } } },
  };
  if (nextLevel(next) === 'results') next.completedAt = now.toISOString();
  return next;
}

export function readAttempt(raw) {
  let value;
  try { value = JSON.parse(raw); }
  catch { return null; }
  if (value?.mode === 'training') return { mode: 'training' };
  if (value?.mode !== 'control' || typeof value.id !== 'string' || !value.id ||
      typeof value.student?.name !== 'string' || typeof value.student?.group !== 'string') return null;
  let attempt = newAttempt(value.student.name, value.student.group);
  if (!attempt || !value.checks || typeof value.checks !== 'object') return null;
  attempt.id = value.id;
  const date = new Date(value.completedAt);
  for (const level of levels) {
    for (const { id } of level.tasks) {
      const result = value.checks[level.id]?.[id];
      if (result === undefined) continue;
      const next = result && recordCheck(attempt, level.id, id, result.points, result.feedback,
        Number.isNaN(date.valueOf()) ? new Date(0) : date);
      if (!next) return null;
      attempt = next;
    }
  }
  if (nextLevel(attempt) === 'results' && (!value.completedAt || Number.isNaN(date.valueOf()))) return null;
  return attempt;
}

export const resultMessage = points => points >= 50
  ? 'Тренажёр успешно пройден'
  : 'Рекомендуется повторить учебный материал';

export function resultText(attempt, dateLabel) {
  const total = totalPoints(attempt);
  return [
    'NETWORK LAB 3D — Путешествие пакета данных',
    `Фамилия и имя: ${attempt.student.name}`,
    `Учебная группа: ${attempt.student.group}`,
    'Дисциплина: Информатика',
    'Тема: Организация компьютерных сетей',
    `Дата прохождения: ${dateLabel}`,
    '',
    ...levels.map(level => `${level.name}: ${levelResult(attempt, level).points} из 20`),
    '',
    `Итоговый балл: ${total} из 100`,
    `Процент выполнения: ${total}%`,
    `Порог 50 баллов: ${total >= 50 ? 'достигнут' : 'не достигнут'}`,
    resultMessage(total),
  ].join('\r\n') + '\r\n';
}
