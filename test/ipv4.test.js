import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAssignment, checkConnection, parseIPv4, parseSubnetMask } from '../src/ipv4.js';

const mask = '255.255.255.0';
const settings = (address, subnet = mask) => ({ address, mask: subnet });
const plan = () => new Map([10, 20, 30, 40].map((host, index) => [`pc-0${index + 1}`, settings(`192.168.1.${host}`)]));
const switched = [['pc-01', 'sw-4'], ['pc-02', 'sw-1']];
const probe = (configs, links = switched) => checkConnection(configs, links, 'pc-01', 'pc-02');

test('IPv4 parser rejects missing, extra, non-decimal, ambiguous or out-of-range octets', () => {
  assert.equal(parseIPv4(' 192.168.1.10 '), 0xc0a8010a);
  assert.equal(parseIPv4('0.0.0.0'), 0);
  for (const input of [null, '', '192.168.1', '192.168.1.1.1', '192.168.1.-1', '192.168.1.256', '192.168.1.010', '192.168.1.1e2', '192. 168.1.1']) {
    assert.equal(parseIPv4(input), null, String(input));
  }
});

test('masks must contain contiguous leading ones', () => {
  assert.equal(parseSubnetMask(mask), 0xffffff00);
  assert.equal(parseSubnetMask('0.0.0.0'), 0);
  assert.equal(parseSubnetMask('255.255.255.255'), 0xffffffff);
  assert.equal(parseSubnetMask('255.255.255.128'), 0xffffff80);
  for (const bad of ['255.0.255.0', '255.255.255.127', '255.255.255.256', '/24']) {
    assert.equal(parseSubnetMask(bad), null, bad);
  }
});

test('assignment requires exactly the plan for every PC, not just unique local addresses', () => {
  const configs = plan();
  assert.equal(checkAssignment(configs).size, 0);
  configs.set('pc-01', settings('192.168.1.11', '255.255.0.0'));
  configs.set('pc-02', settings('192.168.2.20'));
  configs.set('pc-03', settings('192.168.1.0'));
  configs.delete('pc-04');
  const issues = checkAssignment(configs);
  assert.match(issues.get('pc-01').join(' '), /255\.255\.255\.0.*192\.168\.1\.10/);
  assert.match(issues.get('pc-02').join(' '), /маршрутизация/);
  assert.match(issues.get('pc-03').join(' '), /широковещательный/);
  assert.match(issues.get('pc-04').join(' '), /сохраните/);
});

test('assignment reports an address conflict for all computers sharing a valid IP', () => {
  const configs = plan();
  configs.set('pc-03', settings('192.168.1.10'));
  configs.set('pc-04', settings('192.168.1.999', '255.0.255.0'));
  const issues = checkAssignment(configs);
  assert.match(issues.get('pc-01').join(' '), /Конфликт адресов.*ПК 01, ПК 03/);
  assert.match(issues.get('pc-03').join(' '), /Конфликт адресов/);
  assert.match(issues.get('pc-04').join(' '), /неверный формат IPv4.*неверная маска/);
});

test('connectivity requires a cable path even when every IP is configured correctly', () => {
  assert.match(probe(plan(), []).errors.join(' '), /нет физического пути/);
  assert.match(probe(plan(), [switched[0]]).errors.join(' '), /нет физического пути/);
  const result = probe(plan());
  assert.deepEqual(result, {
    errors: [],
    path: [{ link: switched[0], reverse: false }, { link: switched[1], reverse: true }],
  });
  const direct = [['pc-02', 'pc-01']];
  assert.deepEqual(probe(plan(), direct), { errors: [], path: [{ link: direct[0], reverse: true }] });
  assert.match(checkConnection(plan(), switched, 'pc-01', 'pc-01').errors[0], /два разных/);
});

test('a cable path cannot solve inconsistent subnets, reservations or malformed settings', () => {
  const configs = plan();
  configs.set('pc-01', settings('192.168.1.130', '255.255.255.128'));
  assert.match(probe(configs).errors.join(' '), /разных подсетях.*маршрутизатор/);
  configs.set('pc-02', settings('192.168.1.255'));
  assert.match(probe(configs).errors.join(' '), /широковещательный/);
  configs.set('pc-02', settings('192.168.1.20', '255.0.255.0'));
  assert.match(probe(configs).errors.join(' '), /неверная маска/);
});

test('connectivity detects address conflicts only on the connected segment', () => {
  const configs = plan();
  configs.set('pc-03', settings('192.168.1.10'));
  assert.deepEqual(probe(configs).errors, []);
  assert.match(probe(configs, [...switched, ['pc-03', 'sw-2']]).errors.join(' '), /Конфликт адресов/);
  configs.set('pc-02', settings('192.168.1.10'));
  assert.match(probe(configs).errors.join(' '), /Конфликт адресов.*ПК 01, ПК 02/);
});
