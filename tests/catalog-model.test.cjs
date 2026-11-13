const assert = require('node:assert/strict');
const fs = require('node:fs');
const swc = require('next/dist/build/swc');
require.extensions['.ts'] = (module, filename) => {
  module._compile(swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' },
  }).code, filename);
};
const { blankClient } = require('../lib/clients.ts');
const { emptyBusinessDetails } = require('../lib/businesses.ts');
const { toDatabase, clientFromDatabase, businessFromDatabase, validateClient, validateBusiness, businessId, unwrap } = require('../lib/catalog-model.ts');
const { snapshotFromBackup } = require('../lib/local-backup.ts');

const client = { ...blankClient(), id: 'catalog:Bachoco', name: 'Bachoco', legacyName: 'Bachoco', orderTemplate: 'Bachoco', active: false };
const db = toDatabase(client);
assert.equal(db.order_template, 'Bachoco');
assert.equal(db.active, false);
assert.deepEqual(clientFromDatabase({ ...db, updated_at: '2026-10-07T10:00:00Z' }), { ...client, updatedAt: '2026-10-07T10:00:00Z' });
assert.equal(toDatabase({ ...client, updatedAt: 'test' }).updatedAt, undefined);
assert.equal(toDatabase(emptyBusinessDetails()).clients, undefined);
assert.throws(() => validateClient({ ...client, active: 'true' }));
assert.throws(() => validateClient({ ...client, name: ' ' }));
assert.throws(() => validateClient({ ...client, contacts: undefined, email: 'invalid' }));
assert.throws(() => validateClient({ ...client, rfc: 'invalid' }));
assert.throws(() => validateBusiness({ ...emptyBusinessDetails(), personType: 'unknown' }));
assert.throws(() => businessId('another-company'));
assert.throws(() => unwrap({ ok: false, error: 'Conflict' }), /Conflict/);
assert.deepEqual(businessFromDatabase({ id: 'pcp', ...toDatabase(emptyBusinessDetails()), updated_at: 'now' }, [client.id]).details.clients, [client.id]);

const backup = { format: 'warehouse-local-backup', version: 1, exportedAt: '2026-10-07', rawStorage: {
  'warehouse.clients.v1': JSON.stringify([client]),
  'warehouse.business.pcp.v1': JSON.stringify({ ...emptyBusinessDetails(), clients: ['Bachoco'] }),
  'warehouse.business.taasa.v1': null,
  'warehouse.business.jose.v1': null,
} };
const source = JSON.stringify(backup);
const snapshot = snapshotFromBackup(backup);
assert.equal(snapshot.clients[0].id, client.id);
assert.equal(snapshot.clients[0].active, false);
assert.deepEqual(snapshot.businesses[0].details.clients, ['Bachoco']);
assert.equal(JSON.stringify(backup), source, 'backup must remain unchanged');
assert.throws(() => snapshotFromBackup({ ...backup, version: 2 }));
assert.throws(() => snapshotFromBackup({ ...backup, rawStorage: { ...backup.rawStorage, 'warehouse.clients.v1': '{bad' } }));
assert.throws(() => snapshotFromBackup({ ...backup, rawStorage: { ...backup.rawStorage, 'warehouse.business.pcp.v1': '{"clients":[7]}' } }));
assert.equal(snapshotFromBackup({ ...backup, rawStorage: { ...backup.rawStorage, 'warehouse.clients.v1': '[]', 'warehouse.business.pcp.v1': null } }).clients.length, 0, 'explicit empty catalog is not reseeded');
assert.equal(snapshotFromBackup({ ...backup, rawStorage: { ...backup.rawStorage, 'warehouse.clients.v1': null } }).clients.filter(c => c.name.startsWith('Pilgrims -')).length, 7);
console.log('PASS: catalog mapping, validation, versions, inactive state, legacy IDs, backup preservation, corrupted backups, explicit empty catalog and 7 Pilgrims plants.');
