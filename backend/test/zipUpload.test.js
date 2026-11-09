import assert from 'node:assert/strict';
import test from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import transfers from '../src/routes/transfers.js';
import Transfer from '../src/models/Transfer.js';
import User from '../src/models/User.js';

const handler = path => transfers.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('ZIP upload and replacement enable the normal dispatch and receipt workflow', async t => {
  const env = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  const original = Object.fromEntries(env.map(key => [key, process.env[key]]));
  env.forEach(key => { process.env[key] = key === 'R2_PUBLIC_URL' ? 'https://storage.example.test' : 'test'; });
  t.after(() => env.forEach(key => {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }));
  const commands = [];
  t.mock.method(S3Client.prototype, 'send', async command => { commands.push(command); });
  const notifications = [];
  t.mock.method(User, 'find', query => {
    notifications.push(query);
    return { select: async () => [] };
  });
  let saves = 0;
  const transfer = {
    _id: 'transfer', status: 'awaiting_head_office', sourceLocation: 'Source', destinationLocation: 'Destination',
    async save() { saves++; }
  };
  t.mock.method(Transfer, 'findById', async () => transfer);
  const request = {
    user: { location: 'HO' }, params: { id: 'transfer' },
    file: { originalname: 'TOGs.zip', buffer: Buffer.from('test archive') }
  };
  await handler('/:id/zip')(request, response());
  assert.equal(transfer.status, 'invoice_uploaded');
  assert.ok(transfer.zipFile.startsWith('https://storage.example.test/invoices/transfer/'));
  assert.equal(transfer.zipOriginalName, 'TOGs.zip');
  assert.ok(transfer.zipUploadedAt instanceof Date);
  assert.equal(saves, 1);
  assert.deepEqual(notifications[0].$or, [{ location: 'Source' }]);
  assert.equal(commands[0].input.ContentType, 'application/zip');

  const oldKey = transfer.zipStorageKey;
  await handler('/:id/zip')(request, response());
  assert.equal(transfer.status, 'invoice_uploaded');
  assert.equal(commands.at(-1).input.Key, oldKey);
  assert.equal(commands.at(-1).constructor.name, 'DeleteObjectCommand');

  await handler('/:id/dispatch')({ ...request, user: { location: 'Source' } }, response());
  assert.equal(transfer.status, 'awaiting_destination');
  const rejected = response();
  const commandCount = commands.length;
  await handler('/:id/zip')(request, rejected);
  assert.equal(rejected.statusCode, 409);
  assert.equal(commands.length, commandCount);
  await handler('/:id/receive')({ ...request, user: { location: 'Destination' } }, response());
  assert.equal(transfer.status, 'completed');
});

test('failed ZIP storage leaves the transfer pending', async t => {
  const transfer = { status: 'awaiting_head_office', async save() { assert.fail('Should not save'); } };
  t.mock.method(Transfer, 'findById', async () => transfer);
  t.mock.method(S3Client.prototype, 'send', async () => { throw new Error('Storage unavailable'); });
  const res = response();
  const request = { user: { location: 'HO' }, params: { id: 'transfer' }, file: { originalname: 'TOGs.zip', buffer: Buffer.from('test') } };
  // An unconfigured store must also leave the transfer unchanged.
  try {
    await handler('/:id/zip')(request, res);
    assert.equal(res.statusCode, 503);
  } catch (error) {
    assert.equal(error.message, 'Storage unavailable');
  }
  assert.equal(transfer.status, 'awaiting_head_office');
  assert.equal(transfer.zipFile, undefined);
});
