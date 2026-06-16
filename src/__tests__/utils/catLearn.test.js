// Unit tests for catLearn.js — localStorage-based merchant→category learning

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Provide an in-memory localStorage before catLearn.js is imported
// vi.hoisted runs above ES module imports so the mock is ready when catLearn loads.
const _lsData = vi.hoisted(() => {
  const data = {};
  globalThis.localStorage = {
    getItem:    k => (k in data ? data[k] : null),
    setItem:    (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    clear:      () => { for (const k in data) delete data[k]; },
  };
  return data;
});

import { learnCategory, getLearnedCategory, clearLearnedCategory } from '../../utils/catLearn.js';

const KEY = 'ch_cat_learn';
const THRESHOLD = 3;

beforeEach(() => {
  // Reset storage between tests by clearing the shared data object
  for (const k in _lsData) delete _lsData[k];
});

// ── learnCategory ─────────────────────────────────────────────────────────────

describe('learnCategory', () => {
  test('writes to localStorage', () => {
    learnCategory('Starbucks', 'Coffee');
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw).toBeTruthy();
    expect(raw['starbucks']['Coffee']).toBe(1);
  });

  test('increments count on repeated calls', () => {
    learnCategory('Starbucks', 'Coffee');
    learnCategory('Starbucks', 'Coffee');
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw['starbucks']['Coffee']).toBe(2);
  });

  test('normalises merchant to lowercase', () => {
    learnCategory('WALMART', 'Groceries');
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw['walmart']).toBeTruthy();
  });

  test('trims whitespace from merchant', () => {
    learnCategory('  Tim Hortons  ', 'Coffee');
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw['tim hortons']).toBeTruthy();
  });

  test('tracks multiple categories for same merchant', () => {
    learnCategory('Amazon', 'Shopping');
    learnCategory('Amazon', 'Subscriptions');
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw['amazon']['Shopping']).toBe(1);
    expect(raw['amazon']['Subscriptions']).toBe(1);
  });

  test('no-ops when merchant is empty', () => {
    learnCategory('', 'Coffee');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('no-ops when category is empty', () => {
    learnCategory('Starbucks', '');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('no-ops when both are null/undefined', () => {
    learnCategory(null, undefined);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

// ── getLearnedCategory ────────────────────────────────────────────────────────

describe('getLearnedCategory', () => {
  test('returns null when nothing learned', () => {
    expect(getLearnedCategory('Starbucks')).toBeNull();
  });

  test(`returns null below threshold (${THRESHOLD})`, () => {
    for (let i = 0; i < THRESHOLD - 1; i++) learnCategory('Starbucks', 'Coffee');
    expect(getLearnedCategory('Starbucks')).toBeNull();
  });

  test(`returns category at threshold (${THRESHOLD})`, () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Starbucks', 'Coffee');
    expect(getLearnedCategory('Starbucks')).toBe('Coffee');
  });

  test('returns category above threshold', () => {
    for (let i = 0; i < THRESHOLD + 5; i++) learnCategory('McDonald\'s', 'Dining');
    expect(getLearnedCategory('McDonald\'s')).toBe('Dining');
  });

  test('returns the most frequent category when multiple exist', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Amazon', 'Shopping');
    learnCategory('Amazon', 'Subscriptions');
    learnCategory('Amazon', 'Subscriptions');
    expect(getLearnedCategory('Amazon')).toBe('Shopping');
  });

  test('is case-insensitive for merchant lookup', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('walmart', 'Groceries');
    expect(getLearnedCategory('WALMART')).toBe('Groceries');
  });

  test('returns null for unknown merchant even when others are learned', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Starbucks', 'Coffee');
    expect(getLearnedCategory('Tim Hortons')).toBeNull();
  });
});

// ── clearLearnedCategory ──────────────────────────────────────────────────────

describe('clearLearnedCategory', () => {
  test('removes the merchant entry', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Starbucks', 'Coffee');
    clearLearnedCategory('Starbucks');
    expect(getLearnedCategory('Starbucks')).toBeNull();
  });

  test('does not affect other merchants', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Starbucks', 'Coffee');
    for (let i = 0; i < THRESHOLD; i++) learnCategory('Walmart', 'Groceries');
    clearLearnedCategory('Starbucks');
    expect(getLearnedCategory('Walmart')).toBe('Groceries');
  });

  test('no-ops gracefully for unknown merchant', () => {
    expect(() => clearLearnedCategory('UnknownMerchant')).not.toThrow();
  });

  test('is case-insensitive for removal', () => {
    for (let i = 0; i < THRESHOLD; i++) learnCategory('starbucks', 'Coffee');
    clearLearnedCategory('STARBUCKS');
    expect(getLearnedCategory('starbucks')).toBeNull();
  });
});
