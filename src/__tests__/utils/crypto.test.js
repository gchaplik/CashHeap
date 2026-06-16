// Unit tests for crypto.js — Base64 codecs, PIN hashing, TOTP

import { describe, test, expect } from 'vitest';
import {
  _b64e, _b64d,
  _b64ue, _b64ud,
  _b32d,
  hashPin, genSalt,
  calcTOTP, genTOTPSecret,
} from '../../utils/crypto.js';

// ── Base64 standard ───────────────────────────────────────────────────────────

describe('_b64e / _b64d — standard Base64 round-trip', () => {
  test('encodes a known buffer', () => {
    const buf = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(_b64e(buf)).toBe('SGVsbG8=');
  });

  test('decodes back to original bytes', () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const encoded = _b64e(original);
    const decoded = _b64d(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  test('round-trips arbitrary 32-byte buffer', () => {
    const buf = crypto.getRandomValues(new Uint8Array(32));
    expect(Array.from(_b64d(_b64e(buf)))).toEqual(Array.from(buf));
  });

  test('empty buffer encodes to empty string', () => {
    expect(_b64e(new Uint8Array([]))).toBe('');
  });
});

// ── Base64 URL-safe ───────────────────────────────────────────────────────────

describe('_b64ue / _b64ud — URL-safe Base64 round-trip', () => {
  test('does not contain +, /, or = characters', () => {
    const buf = crypto.getRandomValues(new Uint8Array(64));
    const encoded = _b64ue(buf);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  test('round-trips correctly', () => {
    const buf = crypto.getRandomValues(new Uint8Array(20));
    expect(Array.from(_b64ud(_b64ue(buf)))).toEqual(Array.from(buf));
  });

  test('+ replaced with -, / replaced with _', () => {
    // Force bytes that produce + or / in standard base64:
    // 0xFB = 251 → encodes with +; 0xFF encodes with /
    const buf = new Uint8Array([0xFB, 0xEF, 0xBE]);
    const standard = _b64e(buf);
    const urlSafe  = _b64ue(buf);
    expect(urlSafe).toBe(standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  });
});

// ── Base32 decode ─────────────────────────────────────────────────────────────

describe('_b32d — Base32 decode', () => {
  test('decodes a known RFC 4648 Base32 string', () => {
    // RFC 4648 §10 test vector: Base32("foobar") = "MZXW6YTBOI======"
    const result = _b32d('MZXW6YTBOI======');
    const text = String.fromCharCode(...result);
    expect(text).toBe('foobar');
  });

  test('is case-insensitive', () => {
    const upper = _b32d('JBSWY3DPEH3K3NA=');
    const lower = _b32d('jbswy3dpeh3k3na=');
    expect(Array.from(upper)).toEqual(Array.from(lower));
  });

  test('ignores padding characters', () => {
    const withPad    = _b32d('JBSWY3DPEH3K3NA=');
    const withoutPad = _b32d('JBSWY3DPEH3K3NA');
    expect(Array.from(withPad)).toEqual(Array.from(withoutPad));
  });

  test('returns a Uint8Array', () => {
    expect(_b32d('JBSWY3DP') instanceof Uint8Array).toBe(true);
  });
});

// ── hashPin ───────────────────────────────────────────────────────────────────

describe('hashPin', () => {
  test('returns a non-empty string', async () => {
    const hash = await hashPin('1234', 'salt123');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  test('is deterministic for same pin + salt', async () => {
    const h1 = await hashPin('1234', 'my-salt');
    const h2 = await hashPin('1234', 'my-salt');
    expect(h1).toBe(h2);
  });

  test('differs for different PINs', async () => {
    const h1 = await hashPin('1234', 'my-salt');
    const h2 = await hashPin('5678', 'my-salt');
    expect(h1).not.toBe(h2);
  });

  test('differs for different salts', async () => {
    const h1 = await hashPin('1234', 'salt-a');
    const h2 = await hashPin('1234', 'salt-b');
    expect(h1).not.toBe(h2);
  });

  test('produces a valid Base64 string', async () => {
    const hash = await hashPin('0000', 'test-salt');
    expect(() => atob(hash)).not.toThrow();
  });
});

// ── genSalt ───────────────────────────────────────────────────────────────────

describe('genSalt', () => {
  test('returns a string', () => {
    expect(typeof genSalt()).toBe('string');
  });

  test('returns unique values each call', () => {
    const salts = new Set(Array.from({ length: 20 }, genSalt));
    expect(salts.size).toBe(20);
  });

  test('produces valid Base64', () => {
    expect(() => atob(genSalt())).not.toThrow();
  });
});

// ── calcTOTP ──────────────────────────────────────────────────────────────────

describe('calcTOTP', () => {
  // RFC 6238 test vector (secret = "12345678901234567890" in Base32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
  const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  test('returns a 6-digit zero-padded string', async () => {
    const code = await calcTOTP(SECRET, Date.now());
    expect(code).toMatch(/^\d{6}$/);
  });

  test('is deterministic for same time window', async () => {
    const t = 59000; // epoch ms inside the same 30s window
    const c1 = await calcTOTP(SECRET, t);
    const c2 = await calcTOTP(SECRET, t);
    expect(c1).toBe(c2);
  });

  test('changes between different time windows', async () => {
    const c1 = await calcTOTP(SECRET, 0);      // window 0
    const c2 = await calcTOTP(SECRET, 30000);  // window 1
    // Different windows should (almost certainly) produce different codes
    // Test is probabilistic but the chance of collision is 1/1000000
    expect(c1).not.toBe(c2);
  });

  test('matches RFC 6238 test vector at t=59s', async () => {
    // At time=59s, TOTP(GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ) should be "287082"
    const code = await calcTOTP(SECRET, 59000);
    expect(code).toBe('287082');
  });

  test('defaults to current time when called without time arg', async () => {
    const code = await calcTOTP(SECRET);
    expect(code).toMatch(/^\d{6}$/);
  });
});

// ── genTOTPSecret ─────────────────────────────────────────────────────────────

describe('genTOTPSecret', () => {
  test('returns a 20-character string', () => {
    expect(genTOTPSecret()).toHaveLength(20);
  });

  test('contains only Base32 alphabet characters', () => {
    const secret = genTOTPSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  test('returns unique values each call', () => {
    const secrets = new Set(Array.from({ length: 20 }, genTOTPSecret));
    expect(secrets.size).toBe(20);
  });

  test('generated secret works with calcTOTP', async () => {
    const secret = genTOTPSecret();
    const code = await calcTOTP(secret, Date.now());
    expect(code).toMatch(/^\d{6}$/);
  });
});
