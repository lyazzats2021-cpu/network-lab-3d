import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkStar, computers, connect, switchPorts } from '../src/topology.js';

test('a star accepts every computer on a distinct switch port', () => {
  const links = [];
  computers.forEach((id, index) => assert.equal(connect(links, id, switchPorts[3 - index]), undefined));
  assert.deepEqual(checkStar(links), { attached: 4, errors: [] });
});

test('an empty or partial network names the disconnected computers', () => {
  const links = [];
  assert.match(checkStar(links).errors[0], /ПК 01, ПК 02, ПК 03, ПК 04/);
  connect(links, 'pc-02', 'sw-3');
  assert.deepEqual(checkStar(links), {
    attached: 1,
    errors: ['Подключите к свободным портам коммутатора: ПК 01, ПК 03, ПК 04.'],
  });
});

test('a direct connection is diagnosed and both ports can be used after deletion', () => {
  const links = [];
  assert.equal(connect(links, 'pc-03', 'pc-01'), undefined);
  const result = checkStar(links);
  assert.equal(result.attached, 0);
  assert.match(result.errors[0], /ПК 03 и ПК 01 соединены напрямую/);
  links.splice(0, 1);
  assert.equal(connect(links, 'pc-03', 'sw-2'), undefined);
  assert.equal(connect(links, 'pc-01', 'sw-1'), undefined);
  assert.equal(checkStar(links).attached, 2);
});

test('occupied ports and invalid endpoints leave the topology unchanged', () => {
  const links = [['pc-01', 'sw-1']];
  assert.match(connect(links, 'pc-02', 'sw-1'), /занят/);
  assert.match(connect(links, 'pc-01', 'sw-2'), /занят/);
  assert.match(connect(links, 'pc-02', 'pc-02'), /другой порт/);
  assert.match(connect(links, 'sw-2', 'sw-3'), /RJ/);
  assert.deepEqual(links, [['pc-01', 'sw-1']]);
});
