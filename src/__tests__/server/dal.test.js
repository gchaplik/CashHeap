// @vitest-environment node
// DAL layer tests — transactions, bills, settings, expected_income
// Uses an in-memory SQLite database so no file I/O or migration state leaks.

import { vi, describe, test, expect, beforeEach } from 'vitest';

// Must be declared before vi.mock so the factory can reference and assign it.
// vi.mock is hoisted but the factory runs lazily, after this let is initialized.
let _db;

vi.mock('../../../server/db/index.js', async () => {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT,
      amount REAL,
      date TEXT,
      category TEXT,
      merchant TEXT,
      note TEXT,
      source TEXT,
      hasReceipt INTEGER DEFAULT 0,
      groupId TEXT,
      cadence TEXT
    );
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      name TEXT,
      amount REAL,
      dueDay INTEGER,
      category TEXT,
      cadence TEXT,
      active INTEGER DEFAULT 1,
      notes TEXT,
      lastPaid TEXT
    );
    CREATE TABLE IF NOT EXISTS bill_payments (
      id TEXT PRIMARY KEY,
      billId TEXT,
      month TEXT,
      amount REAL,
      paidDate TEXT,
      txnId TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS expected_income (
      id TEXT PRIMARY KEY,
      source TEXT,
      amount REAL,
      expectedDate TEXT,
      cadence TEXT,
      confirmed INTEGER DEFAULT 0,
      note TEXT,
      groupId TEXT,
      confirmedDate TEXT,
      confirmedTxnId TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS cat_budgets (
      category TEXT PRIMARY KEY,
      budget REAL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT,
      emoji TEXT,
      targetAmount REAL,
      currentAmount REAL,
      monthlyTarget REAL,
      deadline TEXT,
      color TEXT,
      createdAt TEXT
    );
  `);

  _db = db;
  return { db };
});

// Imports must come after vi.mock declaration (Vitest hoists mocks above imports)
const txnMod      = await import('../../../server/dal/transactions.js');
const billMod     = await import('../../../server/dal/bills.js');
const settingsMod = await import('../../../server/dal/settings.js');
const expectedMod = await import('../../../server/dal/expected.js');

// ── helpers ───────────────────────────────────────────────────────────────────

const T = (overrides = {}) => ({
  id: 't1', type: 'expense', amount: 50, date: '2026-06-01',
  category: 'Food', merchant: 'Cafe', note: null, source: null,
  hasReceipt: false, groupId: null, cadence: null,
  ...overrides,
});

const B = (overrides = {}) => ({
  id: 'b1', name: 'Netflix', amount: 17.99, dueDay: 15,
  category: 'Subscriptions', active: true, notes: null, cadence: 'monthly',
  ...overrides,
});

const E = (overrides = {}) => ({
  id: 'e1', source: 'Employer', amount: 3000, expectedDate: '2026-06-15',
  cadence: 'monthly', confirmed: false, note: null, groupId: null,
  confirmedDate: null, confirmedTxnId: null,
  ...overrides,
});

// ── Transactions DAL ──────────────────────────────────────────────────────────

describe('transactions DAL', () => {
  beforeEach(() => { _db.prepare('DELETE FROM transactions').run(); });

  test('insert + getAll round-trips basic fields', () => {
    txnMod.insert(T());
    const rows = txnMod.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('t1');
    expect(rows[0].amount).toBe(50);
    expect(rows[0].category).toBe('Food');
  });

  test('getAll returns rows newest-first', () => {
    txnMod.insert(T({ id: 'a', date: '2026-01-01' }));
    txnMod.insert(T({ id: 'b', date: '2026-06-01' }));
    const rows = txnMod.getAll();
    expect(rows[0].id).toBe('b');
    expect(rows[1].id).toBe('a');
  });

  test('getByMonth filters correctly', () => {
    txnMod.insert(T({ id: 'jan', date: '2026-01-15' }));
    txnMod.insert(T({ id: 'jun', date: '2026-06-15' }));
    const rows = txnMod.getByMonth('2026-06');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('jun');
  });

  test('insert OR REPLACE updates existing row', () => {
    txnMod.insert(T({ amount: 50 }));
    txnMod.insert(T({ amount: 99 })); // same id = upsert
    const rows = txnMod.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(99);
  });

  test('update patches specific fields', () => {
    txnMod.insert(T());
    txnMod.update('t1', { category: 'Dining', amount: 75 });
    const rows = txnMod.getAll();
    expect(rows[0].category).toBe('Dining');
    expect(rows[0].amount).toBe(75);
    expect(rows[0].merchant).toBe('Cafe'); // untouched
  });

  test('update is a no-op for unknown id', () => {
    txnMod.insert(T());
    expect(() => txnMod.update('no-such-id', { category: 'X' })).not.toThrow();
    expect(txnMod.getAll()).toHaveLength(1);
  });

  test('remove deletes the row', () => {
    txnMod.insert(T());
    txnMod.remove('t1');
    expect(txnMod.getAll()).toHaveLength(0);
  });

  test('insertMany inserts all rows in a single transaction', () => {
    const batch = [T({ id: 'a' }), T({ id: 'b' }), T({ id: 'c' })];
    txnMod.insertMany(batch);
    expect(txnMod.getAll()).toHaveLength(3);
  });

  test('replaceAll wipes existing rows and inserts fresh set', () => {
    txnMod.insert(T({ id: 'old' }));
    txnMod.replaceAll([T({ id: 'new1' }), T({ id: 'new2' })]);
    const rows = txnMod.getAll();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).not.toContain('old');
  });

  test('hasReceipt boolean is coerced correctly', () => {
    txnMod.insert(T({ hasReceipt: true }));
    const row = txnMod.getAll()[0];
    expect(row.hasReceipt).toBe(true);
  });
});

// ── Bills DAL ─────────────────────────────────────────────────────────────────

describe('bills DAL', () => {
  beforeEach(() => {
    _db.prepare('DELETE FROM bills').run();
    _db.prepare('DELETE FROM bill_payments').run();
  });

  test('upsertBill + getAllBills round-trip', () => {
    billMod.upsertBill(B());
    const rows = billMod.getAllBills();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Netflix');
    expect(rows[0].amount).toBe(17.99);
  });

  test('getAllBills orders by dueDay ASC', () => {
    billMod.upsertBill(B({ id: 'b1', dueDay: 25 }));
    billMod.upsertBill(B({ id: 'b2', dueDay: 5 }));
    const rows = billMod.getAllBills();
    expect(rows[0].id).toBe('b2');
  });

  test('active field is coerced to boolean', () => {
    billMod.upsertBill(B({ active: true }));
    expect(billMod.getAllBills()[0].active).toBe(true);
  });

  test('inactive bills are marked false', () => {
    billMod.upsertBill(B({ active: false }));
    expect(billMod.getAllBills()[0].active).toBe(false);
  });

  test('upsertBill updates existing bill', () => {
    billMod.upsertBill(B({ amount: 17.99 }));
    billMod.upsertBill(B({ amount: 19.99 }));
    expect(billMod.getAllBills()).toHaveLength(1);
    expect(billMod.getAllBills()[0].amount).toBe(19.99);
  });

  test('removeBill deletes the row', () => {
    billMod.upsertBill(B());
    billMod.removeBill('b1');
    expect(billMod.getAllBills()).toHaveLength(0);
  });

  test('addPayment + getPayments(month) round-trip', () => {
    billMod.addPayment({ id: 'p1', billId: 'b1', month: '2026-06', amount: 17.99, paidDate: '2026-06-15', txnId: null });
    const payments = billMod.getPayments('2026-06');
    expect(payments).toHaveLength(1);
    expect(payments[0].billId).toBe('b1');
  });

  test('getPayments() without month returns all payments', () => {
    billMod.addPayment({ id: 'p1', billId: 'b1', month: '2026-05', amount: 17.99, paidDate: null, txnId: null });
    billMod.addPayment({ id: 'p2', billId: 'b1', month: '2026-06', amount: 17.99, paidDate: null, txnId: null });
    expect(billMod.getPayments()).toHaveLength(2);
  });

  test('removePayment deletes the payment', () => {
    billMod.addPayment({ id: 'p1', billId: 'b1', month: '2026-06', amount: 17.99, paidDate: null, txnId: null });
    billMod.removePayment('p1');
    expect(billMod.getPayments()).toHaveLength(0);
  });

  test('replaceAllBills replaces entire table', () => {
    billMod.upsertBill(B({ id: 'old' }));
    billMod.replaceAllBills([B({ id: 'new1' }), B({ id: 'new2' })]);
    const rows = billMod.getAllBills();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).not.toContain('old');
  });
});

// ── Settings DAL ──────────────────────────────────────────────────────────────

describe('settings DAL', () => {
  beforeEach(() => {
    _db.prepare('DELETE FROM settings').run();
    _db.prepare('DELETE FROM cat_budgets').run();
    _db.prepare('DELETE FROM goals').run();
  });

  test('setSetting + getSetting round-trips a string', () => {
    settingsMod.setSetting('theme', 'dark');
    expect(settingsMod.getSetting('theme')).toBe('dark');
  });

  test('setSetting + getSetting round-trips an object', () => {
    settingsMod.setSetting('prefs', { fontSize: 14 });
    expect(settingsMod.getSetting('prefs')).toEqual({ fontSize: 14 });
  });

  test('getSetting returns null for unknown key', () => {
    expect(settingsMod.getSetting('unknown')).toBeNull();
  });

  test('setSetting is idempotent (INSERT OR REPLACE)', () => {
    settingsMod.setSetting('theme', 'light');
    settingsMod.setSetting('theme', 'dark');
    expect(settingsMod.getSetting('theme')).toBe('dark');
  });

  test('getAllSettings returns all key-value pairs', () => {
    settingsMod.setSetting('a', 1);
    settingsMod.setSetting('b', 'hello');
    const all = settingsMod.getAllSettings();
    expect(all.a).toBe(1);
    expect(all.b).toBe('hello');
  });

  test('getCatBudgets returns empty object when no budgets', () => {
    expect(settingsMod.getCatBudgets()).toEqual({});
  });

  test('setCatBudget + getCatBudgets round-trip', () => {
    settingsMod.setCatBudget('Food', 500);
    settingsMod.setCatBudget('Transport', 200);
    const budgets = settingsMod.getCatBudgets();
    expect(budgets.Food).toBe(500);
    expect(budgets.Transport).toBe(200);
  });

  test('replaceCatBudgets replaces all budgets atomically', () => {
    settingsMod.setCatBudget('OldCat', 100);
    settingsMod.replaceCatBudgets({ Food: 600, Dining: 300 });
    const budgets = settingsMod.getCatBudgets();
    expect(Object.keys(budgets)).not.toContain('OldCat');
    expect(budgets.Food).toBe(600);
  });

  test('upsertGoal + getGoals round-trip', () => {
    settingsMod.upsertGoal({ id: 'g1', name: 'Emergency Fund', emoji: '💰', targetAmount: 10000, currentAmount: 2000, monthlyTarget: 500, deadline: null, color: '#0284C7', createdAt: '2026-01-01' });
    const goals = settingsMod.getGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0].name).toBe('Emergency Fund');
    expect(goals[0].targetAmount).toBe(10000);
  });

  test('removeGoal deletes the goal', () => {
    settingsMod.upsertGoal({ id: 'g1', name: 'Car', emoji: '🚗', targetAmount: 5000, currentAmount: 0, monthlyTarget: 0, deadline: null, color: '#0284C7', createdAt: null });
    settingsMod.removeGoal('g1');
    expect(settingsMod.getGoals()).toHaveLength(0);
  });
});

// ── Expected Income DAL ───────────────────────────────────────────────────────

describe('expected income DAL', () => {
  beforeEach(() => { _db.prepare('DELETE FROM expected_income').run(); });

  test('insert + getAll round-trips basic fields', () => {
    expectedMod.insert(E());
    const rows = expectedMod.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('Employer');
    expect(rows[0].amount).toBe(3000);
  });

  test('confirmed boolean is coerced correctly', () => {
    expectedMod.insert(E({ confirmed: true }));
    expect(expectedMod.getAll()[0].confirmed).toBe(true);
  });

  test('unconfirmed entry has confirmed=false', () => {
    expectedMod.insert(E({ confirmed: false }));
    expect(expectedMod.getAll()[0].confirmed).toBe(false);
  });

  test('getAll orders by expectedDate ASC', () => {
    expectedMod.insert(E({ id: 'e2', expectedDate: '2026-07-15' }));
    expectedMod.insert(E({ id: 'e1', expectedDate: '2026-06-01' }));
    const rows = expectedMod.getAll();
    expect(rows[0].id).toBe('e1');
  });

  test('update patches specific fields', () => {
    expectedMod.insert(E());
    expectedMod.update('e1', { confirmed: true, confirmedDate: '2026-06-15', amount: 3200 });
    const row = expectedMod.getAll()[0];
    expect(row.confirmed).toBe(true);
    expect(row.confirmedDate).toBe('2026-06-15');
    expect(row.amount).toBe(3200);
    expect(row.source).toBe('Employer'); // untouched
  });

  test('remove deletes the entry', () => {
    expectedMod.insert(E());
    expectedMod.remove('e1');
    expect(expectedMod.getAll()).toHaveLength(0);
  });

  test('replaceAll wipes and inserts new set', () => {
    expectedMod.insert(E({ id: 'old' }));
    expectedMod.replaceAll([E({ id: 'new1' }), E({ id: 'new2' })]);
    const rows = expectedMod.getAll();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).not.toContain('old');
  });

  test('insert OR REPLACE updates existing entry', () => {
    expectedMod.insert(E({ amount: 3000 }));
    expectedMod.insert(E({ amount: 3500 })); // same id
    expect(expectedMod.getAll()).toHaveLength(1);
    expect(expectedMod.getAll()[0].amount).toBe(3500);
  });
});
