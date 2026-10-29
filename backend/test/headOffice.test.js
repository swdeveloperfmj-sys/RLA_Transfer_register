import assert from 'node:assert/strict';
import test from 'node:test';
import { isHeadOffice } from '../src/config/headOffice.js';
import { isHeadOffice as frontendIsHeadOffice } from '../../frontend/src/headOffice.js';
import { reportsAccess, requirePermission } from '../src/middleware/auth.js';
import transfers from '../src/routes/transfers.js';
import Transfer from '../src/models/Transfer.js';
import User from '../src/models/User.js';
import { notifyLocationUsers } from '../src/services/notifications.js';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('frontend and backend recognize HO and legacy Head Office, excluding HOS and HO Sales', () => {
  for (const check of [isHeadOffice, frontendIsHeadOffice]) {
    for (const location of ['HO', ' ho ', 'Head Office', ' HEAD OFFICE ']) {
      assert.equal(check(location), true, location);
    }
    for (const location of ['HOS', 'hos', 'HO Sales', 'Kandy Location', '', null, undefined]) {
      assert.equal(check(location), false, String(location));
    }
  }
});

test('HO retains legacy report access and explicit permission restrictions', () => {
  const user = { role: 'manager', location: 'HO' };
  let allowed = false;
  reportsAccess('heldReports')({ user }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
  const res = response();
  user.permissions = [];
  reportsAccess('heldReports')({ user }, res, () => assert.fail('Restricted report allowed'));
  assert.equal(res.statusCode, 403);
  requirePermission('invoiceRequests')({ user }, res, () => assert.fail('Restricted upload allowed'));
  assert.equal(res.statusCode, 403);
});

test('TOG upload accepts HO and Head Office but rejects other locations', async t => {
  t.mock.method(Transfer, 'findById', async () => ({ status: 'awaiting_head_office' }));
  const route = transfers.stack.find(layer => layer.route?.path === '/:id/invoice').route;
  const uploadHandler = route.stack.at(-1).handle;
  for (const location of ['HO', 'Head Office', ' ho ']) {
    const res = response();
    await uploadHandler({ user: { location }, params: { id: 'transfer' } }, res);
    assert.equal(res.statusCode, 400, location);
    assert.equal(res.body.message, 'Attach an invoice document.');
  }
  for (const location of ['HOS', 'HO Sales', 'Kandy Location']) {
    const res = response();
    await uploadHandler({ user: { location }, params: { id: 'transfer' } }, res);
    assert.equal(res.statusCode, 403, location);
  }
});

test('Head Office notifications reach both location names and super admins', async t => {
  let query;
  t.mock.method(User, 'find', value => {
    query = value;
    return { select: async () => [] };
  });
  for (const location of ['Head Office', 'HO']) {
    await notifyLocationUsers({ location, message: 'New transfer request' });
    assert.equal(query.isActive, true);
    const matcher = query.$or[0].location;
    assert.equal(matcher.test('HO'), true);
    assert.equal(matcher.test('Head Office'), true);
    assert.equal(matcher.test('HOS'), false);
    assert.equal(matcher.test('HO Sales'), false);
    assert.deepEqual(query.$or[1], { role: 'super_admin' });
  }
  for (const location of ['HOS', 'HO Sales']) {
    await notifyLocationUsers({ location, message: 'Dispatch' });
    assert.deepEqual(query.$or, [{ location }]);
  }
});
