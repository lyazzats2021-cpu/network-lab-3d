import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelResult, levels, newAttempt, nextLevel, readAttempt, recordCheck, resultMessage, resultText, totalPoints } from '../src/assessment.js';

const finish = award => {
  let attempt = newAttempt('Ирина Студентова', 'И-26');
  for (const level of levels) {
    for (const task of level.tasks) {
      const points = award(task, level);
      attempt = recordCheck(attempt, level.id, task.id, points, 'Обратная связь', new Date('2026-11-18T08:30:00Z'));
      assert.ok(attempt);
    }
  }
  return attempt;
};

test('control requires name and group; training has no scores', () => {
  assert.equal(newAttempt(' ', 'И-26'), null);
  assert.equal(newAttempt('Студент', ' '), null);
  assert.equal(recordCheck({ mode: 'training' }, 'practice', 'topology', 20, 'Верно'), null);
  assert.deepEqual(readAttempt('{"mode":"training","student":{"name":"X"},"checks":{}}'), { mode: 'training' });
});

test('levels unlock only after all current checks, including a zero result', () => {
  const attempt = newAttempt('Асан Беков', '1');
  assert.equal(nextLevel(attempt), 'practice');
  assert.equal(recordCheck(attempt, 'ip', 'addresses', 20, 'Верно'), null);
  assert.equal(recordCheck(attempt, 'practice', 'topology', 17, 'Не кратно пяти'), null);
  const submitted = recordCheck(attempt, 'practice', 'topology', 0, 'Сеть не подключена');
  assert.deepEqual(levelResult(submitted, levels[0]), { checked: 1, complete: true, points: 0 });
  assert.equal(nextLevel(submitted), 'ip');
  assert.equal(recordCheck(submitted, 'practice', 'topology', 20, 'Верно'), null);
  assert.equal(totalPoints(submitted), 0);
});

test('a repeated task cannot raise or overwrite the recorded score or feedback after reload', () => {
  let attempt = newAttempt('Асан Беков', '1');
  attempt = recordCheck(attempt, 'practice', 'topology', 15, 'Три ПК');
  attempt = recordCheck(attempt, 'ip', 'addresses', 10, 'Два ПК');
  attempt = recordCheck(attempt, 'packet', 'switch', 0, 'Сохранён первый ответ');
  attempt = readAttempt(JSON.stringify(attempt));
  assert.equal(nextLevel(attempt), 'packet');
  assert.equal(totalPoints(attempt), 25);
  assert.equal(recordCheck(attempt, 'packet', 'switch', 5, 'Верно'), null);
  assert.equal(attempt.checks.packet.switch.feedback, 'Сохранён первый ответ');
  assert.equal(recordCheck(attempt, 'packet', 'subnet', 10, 'Сверх шкалы'), null);
  assert.equal(recordCheck(attempt, 'routing', 'subnet', 4, 'Преждевременно'), null);
});

test('each level totals twenty and a complete attempt totals 100', () => {
  assert.equal(levels.length, 5);
  assert.deepEqual(levels.map(level => level.tasks.reduce((sum, item) => sum + item.points, 0)), [20, 20, 20, 20, 20]);
  assert.equal(levels[4].tasks.length, 5);
  assert.ok(levels[4].tasks.every(task => task.points === 4));
  const attempt = finish(task => task.points);
  assert.equal(totalPoints(attempt), 100);
  assert.deepEqual(levels.map(level => levelResult(attempt, level).points), [20, 20, 20, 20, 20]);
  assert.equal(nextLevel(attempt), 'results');
  assert.deepEqual(readAttempt(JSON.stringify(attempt)), attempt);
});

test('the 50 point cutoff is inclusive and TXT includes the stored results', () => {
  assert.equal(resultMessage(49), 'Рекомендуется повторить учебный материал');
  assert.equal(resultMessage(50), 'Тренажёр успешно пройден');
  const report = resultText(finish(task => task.points), '18 ноября 2026 г.');
  for (const line of ['Ирина Студентова', 'И-26', 'Информатика', 'Организация компьютерных сетей', '18 ноября 2026 г.',
    ...levels.map(level => `${level.name}: 20 из 20`), '100 из 100', '100%', 'Порог 50 баллов: достигнут']) assert.ok(report.includes(line));
  assert.match(resultText(finish(() => 0), 'Дата'), /Порог 50 баллов: не достигнут/);
});

test('a new attempt has no old checks and inconsistent persisted scores are rejected', () => {
  const old = finish(task => task.points);
  const fresh = newAttempt(old.student.name, old.student.group);
  assert.equal(nextLevel(fresh), 'practice');
  assert.equal(totalPoints(fresh), 0);
  old.checks.routing.fault.points = 99;
  assert.equal(readAttempt(JSON.stringify(old)), null);
  assert.equal(readAttempt('broken JSON'), null);
});
