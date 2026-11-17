const fs = require('node:fs');
const path = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const {
  initializeTestEnvironment, assertFails, assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');
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

test('verified Primary Admin can update receipt timestamp but not booking status or payment amounts', async () => {
  await seed([['bookings', 'GNH-ABC123', {
    id: 'GNH-ABC123',
    status: 'pending',
    amountPaid: 0,
    totalAmount: 1000
  }]]);
  const db = owner().firestore();
  const booking = doc(db, 'bookings', 'GNH-ABC123');

  await assertSucceeds(getDoc(booking));
  await assertSucceeds(updateDoc(booking, {
    receiptSentAt: Timestamp.now()
  }));
  await assertFails(updateDoc(booking, {
    status: 'approved'
  }));
  await assertFails(updateDoc(booking, {
    amountPaid: 1000
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

test('guest cannot upload protected Storage documents', async () => {
  const storage = guest().storage();
  await assertFails(uploadString(
    ref(storage, 'documents/guest-test.txt'), 'guest test document'
  ));
});

test('unverified Primary Admin cannot upload protected Storage documents', async () => {
  const unverifiedOwner = env.authenticatedContext('owner-unverified-storage', {
    email: primaryEmail,
    email_verified: false
  });
  const storage = unverifiedOwner.storage();
  await assertFails(uploadString(
    ref(storage, 'documents/unverified-owner-test.txt'), 'unverified test document'
  ));
});

// Additional staff-role permission tests
function roleUser(uid, role) {
  return env.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    email_verified: true
  });
}

async function seedStaffRoles() {
  await seed([
    ['staff_accounts', 'manager-1', { active: true, role: 'manager' }],
    ['staff_accounts', 'accountant-1', { active: true, role: 'accountant' }],
    ['staff_accounts', 'receptionist-1', { active: true, role: 'receptionist' }],
    ['staff_accounts', 'staff-admin-1', { active: true, role: 'admin' }]
  ]);
}

test('Manager can manage announcements but Receptionist and Accountant cannot', async () => {
  await seedStaffRoles();

  const managerDb = roleUser('manager-1', 'manager').firestore();
  const receptionistDb = roleUser('receptionist-1', 'receptionist').firestore();
  const accountantDb = roleUser('accountant-1', 'accountant').firestore();

  await assertSucceeds(setDoc(doc(managerDb, 'announcements', 'manager-announcement'), {
    title: 'Service update',
    type: 'general',
    message: 'A test announcement',
    validUntil: null,
    active: true,
    createdAt: Timestamp.now(),
    views: 0,
    clicks: 0
  }));

  await assertSucceeds(updateDoc(
    doc(managerDb, 'announcements', 'manager-announcement'),
    { active: false }
  ));

  await assertSucceeds(
    getDoc(doc(receptionistDb, 'announcements', 'manager-announcement'))
  );

  await assertFails(setDoc(doc(receptionistDb, 'announcements', 'receptionist-announcement'), {
    title: 'Not allowed',
    type: 'general',
    message: 'Should fail',
    validUntil: null,
    active: true,
    createdAt: Timestamp.now(),
    views: 0,
    clicks: 0
  }));

  await assertSucceeds(getDoc(doc(accountantDb, 'announcements', 'manager-announcement')));
});

test('Manager can moderate and reply to reviews but cannot delete them', async () => {
  await seedStaffRoles();
  await seed([['reviews', 'review-1', {
    approved: false,
    message: 'Test review'
  }]]);

  const managerDb = roleUser('manager-1', 'manager').firestore();
  const accountantDb = roleUser('accountant-1', 'accountant').firestore();

  await assertSucceeds(getDoc(doc(managerDb, 'reviews', 'review-1')));

  await assertSucceeds(updateDoc(doc(managerDb, 'reviews', 'review-1'), {
    approved: true,
    updatedAt: Timestamp.now()
  }));

  await assertSucceeds(updateDoc(doc(managerDb, 'reviews', 'review-1'), {
    adminReply: 'Thank you for your feedback.',
    repliedAt: Timestamp.now()
  }));

  await assertFails(updateDoc(doc(managerDb, 'reviews', 'review-1'), {
    message: 'Tampered review'
  }));

  await assertFails((async () => {
    const { deleteDoc } = require('firebase/firestore');
    return deleteDoc(doc(managerDb, 'reviews', 'review-1'));
  })());

  await assertSucceeds(getDoc(doc(accountantDb, 'reviews', 'review-1')));
});

test('Receptionist and Manager can handle operational records; Accountant cannot', async () => {
  await seedStaffRoles();
  await seed([
    ['messages', 'message-1', {
      name: 'Guest',
      email: 'guest@example.com',
      message: 'Please contact me',
      status: 'new'
    }],
    ['service_requests', 'service-1', {
      status: 'pending',
      details: 'Extra towels'
    }]
  ]);

  const receptionistDb = roleUser('receptionist-1', 'receptionist').firestore();
  const managerDb = roleUser('manager-1', 'manager').firestore();
  const accountantDb = roleUser('accountant-1', 'accountant').firestore();
  const adminDb = roleUser('staff-admin-1', 'admin').firestore();

  await assertSucceeds(getDoc(doc(receptionistDb, 'messages', 'message-1')));
  await assertSucceeds(updateDoc(doc(receptionistDb, 'messages', 'message-1'), {
    status: 'read',
    readAt: Timestamp.now()
  }));

  await assertSucceeds(getDoc(doc(receptionistDb, 'service_requests', 'service-1')));
  await assertSucceeds(updateDoc(doc(receptionistDb, 'service_requests', 'service-1'), {
    status: 'completed',
    updatedAt: Timestamp.now()
  }));

  await assertFails(getDoc(doc(accountantDb, 'messages', 'message-1')));
  await assertFails(getDoc(doc(accountantDb, 'service_requests', 'service-1')));

  await assertFails(updateDoc(doc(managerDb, 'messages', 'message-1'), {
    message: 'Tampered message'
  }));

  await assertFails(updateDoc(doc(receptionistDb, 'service_requests', 'service-1'), {
    status: 'forged',
    updatedAt: Timestamp.now()
  }));

  const { deleteDoc } = require('firebase/firestore');
  await assertFails(deleteDoc(doc(receptionistDb, 'service_requests', 'service-1')));
  await assertFails(deleteDoc(doc(managerDb, 'service_requests', 'service-1')));
  await assertSucceeds(deleteDoc(doc(adminDb, 'service_requests', 'service-1')));
});

test('Only operational staff can read guest documents; no staff can write them', async () => {
  await seedStaffRoles();
  await seed([
    ['users/booking_GNH-ABC123/documents', 'id-1', {
      name: 'identity.pdf',
      type: 'application/pdf'
    }]
  ]);

  const managerDb = roleUser('manager-1', 'manager').firestore();
  const receptionistDb = roleUser('receptionist-1', 'receptionist').firestore();
  const accountantDb = roleUser('accountant-1', 'accountant').firestore();
  const documentPath = 'users/booking_GNH-ABC123/documents/id-1';

  await assertSucceeds(getDoc(doc(managerDb, documentPath)));
  await assertSucceeds(getDoc(doc(receptionistDb, documentPath)));
  await assertFails(getDoc(doc(accountantDb, documentPath)));

  await assertFails(setDoc(doc(managerDb, 'users/booking_GNH-ABC123/documents/forged'), {
    name: 'forged.pdf'
  }));

  await assertFails(setDoc(doc(receptionistDb, 'users/booking_GNH-ABC123/documents/forged'), {
    name: 'forged.pdf'
  }));
});

test('Payment ledger is Primary Admin only', async () => {
  await seedStaffRoles();
  await seed([['payments', 'payment-1', { amount: 1000 }]]);

  const primaryDb = owner().firestore();
  const adminDb = roleUser('staff-admin-1', 'admin').firestore();
  const managerDb = roleUser('manager-1', 'manager').firestore();
  const accountantDb = roleUser('accountant-1', 'accountant').firestore();
  const receptionistDb = roleUser('receptionist-1', 'receptionist').firestore();

  await assertSucceeds(getDoc(doc(primaryDb, 'payments', 'payment-1')));
  await assertFails(getDoc(doc(adminDb, 'payments', 'payment-1')));
  await assertFails(getDoc(doc(managerDb, 'payments', 'payment-1')));
  await assertFails(getDoc(doc(accountantDb, 'payments', 'payment-1')));
  await assertFails(getDoc(doc(receptionistDb, 'payments', 'payment-1')));

  await assertFails(setDoc(doc(primaryDb, 'payments', 'forged'), { amount: 999999 }));
});

test('Only Admin and Primary Admin can delete messages and reviews', async () => {
  await seedStaffRoles();
  await seed([
    ['messages', 'message-delete', {
      name: 'Guest',
      email: 'guest@example.com',
      message: 'Test'
    }],
    ['reviews', 'review-delete', {
      approved: true,
      message: 'Test'
    }]
  ]);

  const { deleteDoc } = require('firebase/firestore');
  const adminDb = roleUser('staff-admin-1', 'admin').firestore();
  const managerDb = roleUser('manager-1', 'manager').firestore();
  const receptionistDb = roleUser('receptionist-1', 'receptionist').firestore();

  await assertFails(deleteDoc(doc(managerDb, 'messages', 'message-delete')));
  await assertFails(deleteDoc(doc(receptionistDb, 'messages', 'message-delete')));
  await assertSucceeds(deleteDoc(doc(adminDb, 'messages', 'message-delete')));

  await assertFails(deleteDoc(doc(managerDb, 'reviews', 'review-delete')));
  await assertSucceeds(deleteDoc(doc(adminDb, 'reviews', 'review-delete')));
});
