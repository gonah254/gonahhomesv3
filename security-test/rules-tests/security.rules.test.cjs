const fs = require('node:fs');
const path = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const {
  initializeTestEnvironment, assertFails, assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { ref, uploadString } = require('firebase/storage');

let env;
const projectId = 'demo-gonah-security-test';
const primaryEmail = 'gonahhomes0@gmail.com';

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8180
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9299
    }
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

async function seed(records) {
  await env.withSecurityRulesDisabled(async ctx => {
    for (const [collection, id, data] of records) {
      await setDoc(doc(ctx.firestore(), collection, id), data);
    }
  });
}

const guest = () => env.authenticatedContext('guest-1', {
  email: 'guest@example.com', email_verified: true
});

const owner = () => env.authenticatedContext('primary-admin-1', {
  email: primaryEmail, email_verified: true
});

const staff = () => env.authenticatedContext('staff-admin-1', {
  email: 'staff@example.com', email_verified: true
});

test('public property reads allowed; guest writes denied', async () => {
  await seed([['properties', 'home-1', { name: 'Test property' }]]);
  const db = guest().firestore();
  await assertSucceeds(getDoc(doc(db, 'properties', 'home-1')));
  await assertFails(setDoc(doc(db, 'properties', 'home-1'), { name: 'Changed' }));
});

test('guests cannot read, create or alter bookings directly', async () => {
  await seed([['bookings', 'GNH-ABC123', { id: 'GNH-ABC123', status: 'pending' }]]);
  const db = guest().firestore();
  await assertFails(getDoc(doc(db, 'bookings', 'GNH-ABC123')));
  await assertFails(setDoc(doc(db, 'bookings', 'GNH-NEW123'), { status: 'pending' }));
  await assertFails(setDoc(doc(db, 'bookings', 'GNH-ABC123'), { status: 'cancelled' }));
});

test('verified Primary Admin has Firestore admin access', async () => {
  await seed([['bookings', 'GNH-ABC123', { id: 'GNH-ABC123', status: 'pending' }]]);
  const db = owner().firestore();
  await assertSucceeds(getDoc(doc(db, 'bookings', 'GNH-ABC123')));
  await assertSucceeds(setDoc(doc(db, 'bookings', 'GNH-ABC123'), {
    id: 'GNH-ABC123', status: 'approved'
  }));
});

test('unverified Primary Admin email is denied', async () => {
  const ctx = env.authenticatedContext('owner-unverified', {
    email: primaryEmail, email_verified: false
  });
  await assertFails(setDoc(doc(ctx.firestore(), 'properties', 'new'), { name: 'Denied' }));
});

test('active admin staff allowed; inactive staff denied', async () => {
  await seed([
    ['staff_accounts', 'staff-admin-1', { active: true, role: 'admin' }],
    ['staff_accounts', 'inactive-1', { active: false, role: 'admin' }],
    ['bookings', 'GNH-ABC123', { id: 'GNH-ABC123' }]
  ]);
  await assertSucceeds(getDoc(doc(staff().firestore(), 'bookings', 'GNH-ABC123')));
  const inactive = env.authenticatedContext('inactive-1', {
    email: 'inactive@example.com', email_verified: true
  });
  await assertFails(getDoc(doc(inactive.firestore(), 'bookings', 'GNH-ABC123')));
});

test('staff can read their own staff record, not another staff record', async () => {
  await seed([
    ['staff_accounts', 'staff-admin-1', { active: true, role: 'admin' }],
    ['staff_accounts', 'other-staff', { active: true, role: 'receptionist' }]
  ]);
  const db = staff().firestore();
  await assertSucceeds(getDoc(doc(db, 'staff_accounts', 'staff-admin-1')));
  await assertFails(getDoc(doc(db, 'staff_accounts', 'other-staff')));
});

test('only approved reviews are public', async () => {
  await seed([
    ['reviews', 'approved-1', { approved: true }],
    ['reviews', 'pending-1', { approved: false }]
  ]);
  const db = guest().firestore();
  await assertSucceeds(getDoc(doc(db, 'reviews', 'approved-1')));
  await assertFails(getDoc(doc(db, 'reviews', 'pending-1')));
});

test('guest messages can be submitted but inbox cannot be read by guests', async () => {
  const db = guest().firestore();
  await assertSucceeds(setDoc(doc(db, 'messages', 'guest-message'), {
    name: 'Guest', email: 'guest@example.com', message: 'Please contact me'
  }));
  await assertFails(getDoc(doc(db, 'messages', 'guest-message')));
  await assertFails(setDoc(doc(db, 'messages', 'bad-message'), {
    name: 123, email: 'guest@example.com', message: 'Invalid name'
  }));
});

test('dashboard activity is admin-readable but client writes are denied', async () => {
  await seed([['dashboard_activity', 'event-1', { action: 'test' }]]);
  const db = owner().firestore();
  await assertSucceeds(getDoc(doc(db, 'dashboard_activity', 'event-1')));
  await assertFails(setDoc(doc(db, 'dashboard_activity', 'forged'), { action: 'forged' }));
  await assertFails(getDoc(doc(guest().firestore(), 'dashboard_activity', 'event-1')));
});

test('active staff admin can upload protected Storage documents', async () => {
  await seed([['staff_accounts', 'staff-admin-1', { active: true, role: 'admin' }]]);
  const storage = staff().storage();
  await assertSucceeds(uploadString(
    ref(storage, 'documents/security-test.txt'), 'private test document'
  ));
});

test('verified Primary Admin can upload protected Storage documents', async () => {
  const storage = owner().storage();
  await assertSucceeds(uploadString(
    ref(storage, 'documents/primary-admin-test.txt'), 'owner test document'
  ));
});
