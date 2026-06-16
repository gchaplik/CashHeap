// Unit tests for dateUtils.js — _sqlDf, _df, _label, buildDates

import { describe, test, expect } from 'vitest';
import { _sqlDf, _df, _label, buildDates } from '../../utils/dateUtils.js';

// ── _sqlDf ────────────────────────────────────────────────────────────────────

describe('_sqlDf — SQL WHERE fragment', () => {
  test('no args returns 1=1', () => {
    expect(_sqlDf()).toBe('1=1');
    expect(_sqlDf({})).toBe('1=1');
  });

  test('month filter uses strftime equality on default col', () => {
    expect(_sqlDf({ month: '2026-06' })).toBe("strftime('%Y-%m',date)='2026-06'");
  });

  test('month filter uses custom column', () => {
    expect(_sqlDf({ month: '2026-01' }, 't.created_at')).toBe("strftime('%Y-%m',t.created_at)='2026-01'");
  });

  test('from+to produces compound AND fragment', () => {
    const result = _sqlDf({ from: '2026-01', to: '2026-03' });
    expect(result).toContain("strftime('%Y-%m',date)>='2026-01'");
    expect(result).toContain("strftime('%Y-%m',date)<='2026-03'");
    expect(result).toContain(' AND ');
  });

  test('from only — produces single >= clause', () => {
    const result = _sqlDf({ from: '2026-01' });
    expect(result).toContain(">='2026-01'");
    expect(result).not.toContain('<=');
    expect(result).not.toContain(' AND ');
  });

  test('to only — produces single <= clause', () => {
    const result = _sqlDf({ to: '2026-06' });
    expect(result).toContain("<='2026-06'");
    expect(result).not.toContain('>=');
    expect(result).not.toContain(' AND ');
  });

  test('month takes priority over from/to when both provided', () => {
    const result = _sqlDf({ month: '2026-06', from: '2026-01', to: '2026-12' });
    expect(result).toBe("strftime('%Y-%m',date)='2026-06'");
  });
});

// ── _df ───────────────────────────────────────────────────────────────────────

describe('_df — JS filter string', () => {
  test('no args returns "true"', () => {
    expect(_df()).toBe('true');
    expect(_df({})).toBe('true');
  });

  test('month filter on default field', () => {
    const result = _df({ month: '2026-06' });
    expect(result).toContain("t.date");
    expect(result).toContain("==='2026-06'");
  });

  test('month filter on custom field', () => {
    const result = _df({ month: '2026-01' }, 'e.expectedDate');
    expect(result).toContain("e.expectedDate");
    expect(result).toContain("==='2026-01'");
  });

  test('range filter with from and to', () => {
    const result = _df({ from: '2026-01', to: '2026-03' });
    expect(result).toContain(">='2026-01'");
    expect(result).toContain("<='2026-03'");
  });

  test('from only — to defaults to 9999-99', () => {
    const result = _df({ from: '2026-01' });
    expect(result).toContain("'9999-99'");
    expect(result).toContain(">='2026-01'");
  });

  test('to only — from defaults to 0000-00', () => {
    const result = _df({ to: '2026-06' });
    expect(result).toContain("'0000-00'");
    expect(result).toContain("<='2026-06'");
  });

  test('generated string evaluates correctly for matching date', () => {
    const fn = new Function('t', `return ${_df({ month: '2026-06' })}`);
    expect(fn({ date: '2026-06-15' })).toBe(true);
    expect(fn({ date: '2026-05-31' })).toBe(false);
    expect(fn({ date: null })).toBeFalsy();
  });

  test('range filter evaluates correctly', () => {
    const fn = new Function('t', `return ${_df({ from: '2026-01', to: '2026-03' })}`);
    expect(fn({ date: '2026-01-01' })).toBe(true);
    expect(fn({ date: '2026-03-31' })).toBe(true);
    expect(fn({ date: '2026-04-01' })).toBe(false);
    expect(fn({ date: '2025-12-31' })).toBe(false);
  });
});

// ── _label ────────────────────────────────────────────────────────────────────

describe('_label — human-readable range label', () => {
  test('no args returns All Time', () => {
    expect(_label()).toBe('All Time');
    expect(_label({})).toBe('All Time');
  });

  test('month returns the month string', () => {
    expect(_label({ month: '2026-06' })).toBe('2026-06');
  });

  test('from+to returns dash-separated range', () => {
    expect(_label({ from: '2026-01', to: '2026-06' })).toBe('2026-01 – 2026-06');
  });

  test('from only returns "from …"', () => {
    expect(_label({ from: '2026-01' })).toBe('from 2026-01');
  });

  test('to only returns "up to …"', () => {
    expect(_label({ to: '2026-06' })).toBe('up to 2026-06');
  });

  test('month takes priority over from/to', () => {
    expect(_label({ month: '2026-06', from: '2026-01' })).toBe('2026-06');
  });
});

// ── buildDates ────────────────────────────────────────────────────────────────

describe('buildDates — cadence date sequence', () => {
  test('returns array starting with start date', () => {
    const result = buildDates('2026-01-01', 'monthly', 3);
    expect(result[0]).toBe('2026-01-01');
    expect(result).toHaveLength(3);
  });

  test('weekly: adds 7 days each step', () => {
    const result = buildDates('2026-01-01', 'weekly', 3);
    expect(result).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });

  test('biweekly: adds 14 days each step', () => {
    const result = buildDates('2026-01-01', 'biweekly', 3);
    expect(result).toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
  });

  test('every15: adds 15 days each step', () => {
    const result = buildDates('2026-01-01', 'every15', 3);
    expect(result).toEqual(['2026-01-01', '2026-01-16', '2026-01-31']);
  });

  test('monthly: advances month, preserves day', () => {
    const result = buildDates('2026-01-15', 'monthly', 4);
    expect(result).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });

  test('bimonthly: advances 2 months each step', () => {
    const result = buildDates('2026-01-01', 'bimonthly', 3);
    expect(result).toEqual(['2026-01-01', '2026-03-01', '2026-05-01']);
  });

  test('quarterly: advances 3 months each step', () => {
    const result = buildDates('2026-01-01', 'quarterly', 3);
    expect(result).toEqual(['2026-01-01', '2026-04-01', '2026-07-01']);
  });

  test('annually: advances 1 year each step', () => {
    const result = buildDates('2026-01-01', 'annually', 3);
    expect(result).toEqual(['2026-01-01', '2027-01-01', '2028-01-01']);
  });

  test('count=1 returns only start date', () => {
    expect(buildDates('2026-06-01', 'monthly', 1)).toEqual(['2026-06-01']);
  });

  test('all dates are valid YYYY-MM-DD strings', () => {
    const result = buildDates('2026-01-01', 'monthly', 12);
    for (const d of result) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(d).toString()).not.toBe('Invalid Date');
    }
  });
});
