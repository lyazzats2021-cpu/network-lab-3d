import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkAddressing, connectUplink, createRoutingState, gatewayFor, planRoute, subnetOf, wiringErrors,
} from '../src/routing-network.js';

function configured() {
  const state = createRoutingState();
  for (const [id, config] of state.hosts) config.gateway = gatewayFor(subnetOf(id));
  connectUplink(state.uplinks, 'switch-a', 'if-a');
  connectUplink(state.uplinks, 'switch-b', 'if-b');
  return state;
}

const send = state => planRoute(state, 'pc-01', 'pc-03');

test('built-in plan uses two /24s, distinct hosts and separate state', () => {
  const state = createRoutingState();
  assert.equal(state.hosts.get('pc-03').address, '192.168.2.10');
  assert.equal(state.hosts.get('pc-04').address, '192.168.2.20');
  assert.equal(state.interfaces.get('if-b').address, '192.168.2.1');
  assert.match(checkAddressing(state).join(' '), /ПК 01.*шлюза/);
  state.hosts.get('pc-01').address = '192.168.1.99';
  assert.equal(createRoutingState().hosts.get('pc-01').address, '192.168.1.10');
  assert.deepEqual(checkAddressing(configured()), []);
});

test('each uplink port can be used once and crossed connections are diagnosed', () => {
  const state = createRoutingState();
  assert.equal(connectUplink(state.uplinks, 'switch-a', 'if-b'), undefined);
  assert.match(connectUplink(state.uplinks, 'switch-b', 'if-b'), /занят/);
  assert.match(connectUplink(state.uplinks, 'switch-a', 'if-a'), /занят/);
  assert.match(wiringErrors(state).join(' '), /неверному интерфейсу.*не подключён/);
  state.uplinks.pop();
  assert.equal(connectUplink(state.uplinks, 'switch-a', 'if-a'), undefined);
});

test('an intra-subnet delivery follows only the switch without gateways or uplinks', () => {
  const state = createRoutingState();
  state.forwarding = false;
  const route = planRoute(state, 'pc-01', 'pc-02');
  assert.deepEqual(route.errors, []);
  assert.deepEqual(route.path, ['pc-01', 'switch-a', 'pc-02']);
  assert.deepEqual(route.steps.flatMap(step => step.moves).map(move => move.link), state.access.slice(0, 2));
});

test('inter-subnet path uses both connected routes and actual cables in both directions', () => {
  const state = configured();
  const route = send(state);
  assert.deepEqual(route.errors, []);
  assert.deepEqual(route.path, ['pc-01', 'switch-a', 'router', 'switch-b', 'pc-03']);
  const moves = route.steps.flatMap(step => step.moves);
  assert.strictEqual(moves[0].link, state.access[0]);
  assert.strictEqual(moves[1].link, state.uplinks[0]);
  assert.strictEqual(moves[2].link, state.uplinks[1]);
  assert.strictEqual(moves[3].link, state.access[2]);
  assert.deepEqual(moves.map(move => move.reverse), [false, false, true, true]);
  assert.match(route.steps.map(step => step.detail).join(' '), /Вход — интерфейс A, выход — интерфейс B/);
  assert.deepEqual(planRoute(state, 'pc-03', 'pc-01').path, route.path.slice().reverse());
});

test('wrong gateway, disabled interfaces and forwarding block delivery', () => {
  const state = configured();
  state.hosts.get('pc-01').gateway = '192.168.1.254';
  state.interfaces.get('if-b').up = false;
  state.forwarding = false;
  const plan = send(state);
  assert.match(plan.errors.join(' '), /Интерфейс B выключен.*шлюз 192\.168\.1\.254.*Маршрутизация выключена/);
  assert.deepEqual(plan.steps, []);
});

test('missing physical links and invalid endpoint selections are rejected', () => {
  const state = configured();
  state.uplinks.pop();
  state.access.shift();
  const route = send(state);
  assert.match(route.errors.join(' '), /Нет кабеля.*Коммутатор B не подключён/);
  assert.deepEqual(route.steps, []);
  assert.match(planRoute(state, 'pc-01', 'pc-01').errors[0], /два разных/);
});

test('malformed IPs, masks, wrong subnet and duplicate hosts are diagnosed', () => {
  const state = configured();
  state.hosts.get('pc-01').address = '192.168.1.999';
  state.hosts.get('pc-01').mask = '255.0.255.0';
  state.hosts.get('pc-03').address = '192.168.1.20';
  const errors = send(state).errors.join(' ');
  assert.match(errors, /неверный формат IPv4.*маску.*вне подсети.*Конфликт IP-адресов/);
  state.hosts.get('pc-01').address = '192.168.1.1';
  assert.match(checkAddressing(state).join(' '), /ПК 01, Интерфейс A используют один адрес/);
});
