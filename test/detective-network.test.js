import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIncidentState, incidents, inspectPorts, networkIssues, probeIncident, setAccessCable } from '../src/detective-network.js';
import { lessonMask } from '../src/ipv4.js';

const repairs = [
  {
    id: 'cable',
    error: /Нет кабеля от ПК 03/,
    inspect(state) {
      assert.equal(inspectPorts(state, 'pc-03')[0].up, false);
      assert.match(inspectPorts(state, 'switch-b')[0].detail, /Кабель отсутствует/);
    },
    repair(state) { setAccessCable(state, 'pc-03', true); },
  },
  {
    id: 'duplicate',
    error: /Конфликт IP-адресов: ПК 01, ПК 02/,
    repair(state) { state.hosts.get('pc-02').address = '192.168.1.25'; },
  },
  {
    id: 'mask',
    error: /255\.255\.255\.240 считает адрес 192\.168\.1\.20 внешним/,
    repair(state) { state.hosts.get('pc-01').mask = lessonMask; },
  },
  {
    id: 'gateway',
    error: /шлюз 192\.168\.1\.254 не совпадает/,
    repair(state) { state.hosts.get('pc-01').gateway = '192.168.1.1'; },
  },
  {
    id: 'interface',
    error: /Интерфейс B выключен/,
    inspect(state) {
      assert.equal(inspectPorts(state, 'router').find(port => port.id === 'if-b').up, false);
      assert.match(inspectPorts(state, 'switch-b').at(-1).detail, /интерфейс маршрутизатора выключен/);
    },
    repair(state) { state.interfaces.get('if-b').up = true; },
  },
];

for (const { id, error, inspect, repair } of repairs) {
  test(`detective case ${id} fails, diagnoses its actual fault and recovers after a repair`, () => {
    const { pair } = incidents.find(item => item.id === id);
    const initial = createIncidentState(id);
    const diagnosis = probeIncident(initial, pair);
    assert.match(diagnosis.errors.join(' '), error);
    assert.deepEqual(diagnosis.steps, []);
    assert.notEqual(networkIssues(initial).length, 0);
    inspect?.(initial);

    repair(initial);
    const retest = probeIncident(initial, pair);
    assert.deepEqual(retest.errors, []);
    assert.deepEqual(networkIssues(initial), []);
    assert.match(retest.steps[0].title, /^Запрос/);
    assert.match(retest.steps.at(-1).title, /^Ответ.*Пакет доставлен/);
    assert.strictEqual(retest.steps.find(step => step.moves.length).moves[0].link,
      initial.access.find(([id]) => id === pair[0]));

    assert.match(probeIncident(createIncidentState(id), pair).errors.join(' '), error,
      'reset recreates the initial fault');
  });
}

test('round-trip diagnosis checks the return gateway as well as the outbound gateway', () => {
  const state = createIncidentState('gateway');
  state.hosts.get('pc-01').gateway = '192.168.1.1';
  state.hosts.get('pc-03').gateway = '192.168.2.254';
  assert.match(probeIncident(state, ['pc-01', 'pc-03']).errors.join(' '), /ПК 03: шлюз 192\.168\.2\.254/);
});

test('final network checks catch new faults away from the tested pair and leave other cases isolated', () => {
  const state = createIncidentState('duplicate');
  const other = createIncidentState('cable');
  state.hosts.get('pc-02').address = '192.168.1.20';
  setAccessCable(state, 'pc-04', false);
  assert.deepEqual(probeIncident(state, ['pc-01', 'pc-02']).errors, []);
  assert.match(networkIssues(state).join(' '), /ПК 04: восстановите кабель/);
  assert.equal(inspectPorts(other, 'pc-04')[0].up, true);
  assert.equal(inspectPorts(other, 'pc-03')[0].up, false);
});
