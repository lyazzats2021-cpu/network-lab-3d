import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPacketMemory, macAddress, networkKey, planTransmission } from '../src/packet-network.js';

const settings = () => new Map([10, 20, 30, 40].map((host, i) => [
  `pc-0${i + 1}`, { address: `192.168.1.${host}`, mask: '255.255.255.0' },
]));
const links = [['pc-01', 'sw-4'], ['pc-03', 'sw-1'], ['pc-02', 'sw-3']];
const send = (ips = settings(), network = links, memory) => planTransmission(ips, network, 'pc-01', 'pc-03', memory);
const movements = (plan, kind) => plan.steps.filter(step => step.kind === kind && step.moves.length).map(step => step.moves);
const up = link => ({ link, reverse: false });
const down = link => ({ link, reverse: true });

test('cold transmission broadcasts ARP excluding ingress and learns from the reply', () => {
  const memory = createPacketMemory();
  const plan = send(undefined, undefined, memory);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(movements(plan, 'arp'), [
    [up(links[0])],
    [down(links[1]), down(links[2])],
    [up(links[1])],
    [down(links[0])],
  ]);
  assert.strictEqual(movements(plan, 'arp')[0][0].link, links[0]);
  assert.deepEqual(movements(plan, 'frame'), [[up(links[0])], [down(links[1])]]);
  assert.equal(plan.steps.at(-1).role, 'delivered');
  assert.equal(plan.nextMemory.arp.get('pc-01/192.168.1.30'), macAddress('pc-03'));
  assert.equal(plan.nextMemory.ports.get(macAddress('pc-03')), 'sw-1');
  assert.equal(memory.arp.size, 0, 'uncompleted attempts do not update live memory');
});

test('warm transmission skips ARP movement and sends the frame only to the learned port', () => {
  const plan = send(undefined, undefined, send().nextMemory);
  assert.deepEqual(movements(plan, 'arp'), []);
  assert.match(plan.steps[1].title, /ARP-кэше/);
  assert.deepEqual(movements(plan, 'frame'), [[up(links[0])], [down(links[1])]]);
});

test('a known ARP entry does not imply a known port on the switch', () => {
  const warm = send().nextMemory;
  warm.ports.clear();
  const plan = send(undefined, undefined, warm);
  assert.match(plan.steps.map(step => step.title).join(' '), /отсутствует в таблице/);
  assert.deepEqual(movements(plan, 'frame'), [[up(links[0])], [down(links[1]), down(links[2])]]);
  assert.equal(plan.nextMemory.ports.has(macAddress('pc-03')), false, 'a switch learns source addresses');
});

test('invalid endpoints, missing cables and direct PC links never plan a delivery', () => {
  const samePc = planTransmission(settings(), links, 'pc-01', 'pc-01');
  assert.match(samePc.errors.join(' '), /два разных/);
  for (const topology of [[], [links[0]], [['pc-01', 'pc-03']]]) {
    const plan = send(undefined, topology);
    assert.match(plan.errors.join(' '), /ПК 03 не подключён к коммутатору/);
    assert.deepEqual(plan.steps, []);
  }
  assert.match(send(undefined, [...links, ['pc-04', 'sw-1']]).errors.join(' '), /портов занят/);
});

test('subnet mismatch, incorrect IPv4, mask and IP conflict block a wired pair', () => {
  const config = settings();
  config.set('pc-03', { address: '192.168.2.30', mask: '255.255.255.0' });
  assert.match(send(config).errors.join(' '), /разных подсетях/);
  config.set('pc-03', { address: '192.168.1.300', mask: '255.0.255.0' });
  assert.match(send(config).errors.join(' '), /неверный формат IPv4.*неверная маска/);
  config.set('pc-03', config.get('pc-01'));
  assert.match(send(config).errors.join(' '), /Конфликт адресов/);
  assert.deepEqual(send(config).steps, []);
});

test('network identity changes when a cable or saved address changes', () => {
  const config = settings();
  const key = networkKey(config, links);
  assert.equal(networkKey(config, links.slice().reverse()), key);
  assert.notEqual(networkKey(config, links.slice(1)), key);
  config.set('pc-03', { ...config.get('pc-03'), address: '192.168.2.30' });
  assert.notEqual(networkKey(config, links), key);
});
