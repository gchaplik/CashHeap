# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

CashHeap is a local-first personal finance desktop app for macOS/Windows/Linux built on Electron. All data lives in a local SQLite database (`spend.db`). No cloud backend, no accounts, no subscription. The Next.js server runs inside Electron on port 3000.

The React UI is split across `src/SpendTracker.jsx` (root app shell + all global state) plus view files in `src/views/`. Heavy views are lazy-loaded with `React.lazy`.

Part of the **HeapSuite** brand — a family of local-first Electron desktop apps.

---

## Architecture

| Layer | Details |
|---|---|
| UI | React 19, Recharts, all inline styles using design tokens (`T` from `src/theme/tokens.jsx`) |
| Desktop shell | Electron 32 — `electron/main.mjs` |
| Web framework | Next.js 16 (App Router) on port 3000 |
| API routes | `app/api/` — Next.js route handlers |
| Database | SQLite via better-sqlite3 — `server/db/index.js` |
| DB init | `instrumentation.js` — runs `migrate()` + seed once on server start |
| DAL | `server/dal/` — one file per entity |
| AI | OpenRouter (default) · Gemini · DeepSeek · Ollama |

---

## Key Files

| File | Purpose |
|---|---|
| `src/SpendTracker.jsx` | Root shell — all global state, nav, keyboard shortcuts, toast, alerts, bill auto-matching |
| `src/constants/index.js` | NAV_ITEMS, DEFAULT_CATS, DEFAULT_SETTINGS, COLORS, CADENCES |
| `src/theme/tokens.jsx` | Design tokens `T`, shared helpers `CA`, `IS`, `Btn`, `Fld` |
| `src/utils/formatters.js` | `fmt`, `fmtUSD`, `nfmt`, `today()`, `uid()`, `encodeFileBase64`, `fingerprint` |
| `src/utils/dateUtils.js` | `buildDates`, `_df`, `_label`, `_sqlDf` — date ranges and SQL WHERE fragments |
| `src/utils/catLearn.js` | localStorage merchant→category learning (threshold 3 matches to auto-assign) |
| `src/utils/crypto.js` | Base64, PBKDF2 PIN hashing, TOTP generation/secret — used for optional PIN lock |
| `src/utils/fx.js` | USD→CAD exchange rate fetch from frankfurter.app (live + historical) |
| `src/utils/idb.js` | IndexedDB helpers for persisting FileSystemDirectoryHandle (Folder Sync feature) |
| `src/utils/receiptOCR.js` | Receipt image/PDF → Gemini API → transaction object |
| `src/utils/shortcuts.js` | Keyboard combo parsing (`eventToCombo`, `matchesCombo`, `displayCombo`) |
| `src/api/client.js` | `fetchData()`, `patchData()` — all client-side API calls |
| `server/db/index.js` | `migrate()`, `seedFromJson()`, migration array |
| `server/dal/transactions.js` | Transaction CRUD + `getByMonth` + `insertMany` + `replaceAll` |
| `server/dal/bills.js` | Bill CRUD + payment tracking + `replaceAll` |
| `server/dal/holdings.js` | Holdings + accounts + account_history CRUD |
| `server/dal/settings.js` | Key-value settings + cat_budgets + goals |
| `server/dal/expected.js` | Expected income entries + confirm/link to transaction |
| `server/dal/vacations.js` | Vacation trips + vacation_txns with cascading delete |
| `server/services/dataService.js` | `getFullData()` (all-entity query) + `mergeData(patch)` (differential bulk update) |
| `app/api/pdf-parse/route.js` | PDF bank statement parser (`PDFParse` class via pdf-parse) |

---

## Feature Map

### Built Views (`src/views/`)

| View | What it does |
|---|---|
| `Dashboard.jsx` | Monthly spend/income summary, budget rings, velocity indicator, MoM delta cards, trend chart |
| `History.jsx` | Transaction list with search/filter, bulk category reassign, tag search, split modal, duplicate manager, merchant norm display, subscription badges |
| `Bills.jsx` | Recurring bills, due-date tracking, mark paid, outstanding list |
| `Categories.jsx` | Custom categories with budgets, merchant normalizer rules, overspend breakdown, budget suggestions, zero-based mode |
| `Goals.jsx` | Savings goals with target amount + date + progress |
| `NetWorth.jsx` | Accounts, assets, liabilities; net worth over time |
| `Stocks.jsx` | Portfolio holdings with live CAD/USD prices |
| `ExpectedIncome.jsx` | Scheduled future income, cadence-based, mark received, auto-generate next |
| `CashFlow.jsx` | 90-day forward projection from bills + income + spending rate |
| `DebtTracker.jsx` | Loans/credit cards/mortgage with Avalanche vs Snowball payoff strategies |
| `Vacations.jsx` | Separate trip budgets rolled into spending totals |
| `Reports.jsx` | Year-over-year chart, savings rate, RRSP/TFSA tracker, PDF export |
| `RetirementPlanner.jsx` | RRSP/TFSA compound growth projections |
| `TaxTracker.jsx` | Tag deductible transactions, annual summary |
| `MortgageCalculator.jsx` | Amortization table with extra payment simulator |
| `HealthScore.jsx` | Composite financial health score from multiple signals |
| `Household.jsx` | Split expenses across household members, IOUs |
| `FinancialCalendar.jsx` | Monthly calendar view of bills, income, and vacations |
| `Wishlist.jsx` | Planned purchases with affordability projections |
| `SubscriptionManager.jsx` | Detect and manage recurring charges |
| `CSVImport.jsx` | CSV importer with column mapping, bank format presets, auto-categorise, review screen, duplicate detection |
| `Receipts.jsx` | Receipt photo/PDF OCR → transaction via Gemini |
| `Settings.jsx` | All app settings, PIN lock, notifications, display |

### Jarvis AI (`src/views/jarvis/`)

| Component | Purpose |
|---|---|
| `GlobalChat.jsx` | Floating chat panel, streaming responses, tool call rendering, voice mode |
| `Insights.jsx` | Proactive AI-generated analysis cards over transaction history |
| `DataModel.jsx` | Schema explorer for advanced users |
| `ToolCoverage.jsx` | Jarvis tool library health check |

**Jarvis internals:**
- `TOOL_LIBRARY` — named SQL-returning functions with `__SQL__:` markers
- `callLLM(msgs, sys, onChunk)` — routes to OpenRouter/Gemini/DeepSeek/Ollama; streams when `onChunk` provided
- `callSynthesis(question, toolResults, onChunk, history)` — synthesis with last-10-turn context
- `autoWidget` — renders results as metric / bar / pie / table widgets automatically
- Persistent chat: `localStorage["ch_jarvis_msgs"]` (last 50 messages)
- Pinned queries: `settings.pinnedQueries` — auto-run on first open per session

---

## Design Tokens

```js
// src/theme/tokens.jsx
const T = {
  bg, surface, overlay, border,
  tx1, tx2, tx3,           // stone-900 / 600 / 400
  accent, accentBg, accentMid,
  green, greenBg, red, redBg, amber, amberBg,
  shadow, shadowMd,
  r: 8, rCard: 12,
};
```

Shared helpers (call with `T`):
- `CA` — card style (background, border, borderRadius, shadow, padding)
- `IS` — input style (border, radius, padding, fontSize, background, color)
- `Btn.primary` / `Btn.ghost` / `Btn.danger` — button variants
- `Fld` — field label style

Dark mode and 5 colorblind filter modes are supported. Always use `nfmt(v)` (not `fmt()`) in views — it respects `settings.discreteMode`.

---

## Database

SQLite: `spend.db`

**Tables:** `transactions`, `bills`, `bill_payments`, `vacations`, `vacation_txns`, `holdings`, `account_history`, `expected_income`, `cat_budgets`, `goals`, `settings`, `accounts`, `schema_migrations`

**Migrations:** Append-only `MIGRATIONS` array in `server/db/index.js`, tracked in `schema_migrations`. Use `PRAGMA table_info` checks — SQLite does not support `ADD COLUMN IF NOT EXISTS`.

**DAL pattern:** Each `server/dal/*.js` file exports individual CRUD functions + a `replaceAll()` for bulk sync. `dataService.getFullData()` aggregates everything into one flat object; `dataService.mergeData(patch)` dispatches to the correct `replaceAll()` based on which keys are present in the patch.

---

## API Routes (`app/api/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/data` | GET / POST | Full data fetch + full differential sync via `dataService` |
| `/api/db/sql` | POST | Raw SQL execution (Jarvis tool calls) |
| `/api/llm/chat` | POST | Streaming LLM chat |
| `/api/llm/query` | POST | LLM query with tool library execution |
| `/api/llm/models` | GET | Available LLM models list |
| `/api/pdf-parse` | POST | PDF bank statement text extraction |
| `/api/stocks` | GET | Live stock price fetch |
| `/api/stocks/history` | GET | Historical stock prices |
| `/api/holdings/prices` | GET | Current holdings prices |
| `/api/messages` | POST | Gemini API proxy (receipt OCR) |
| `/api/config/gemini-key` | GET / POST | Gemini API key management |

---

## Testing

**Framework:** Vitest (jsdom environment)  
**Run:** `npm test`  
**Location:** `src/__tests__/`  
**Current coverage:** 21 test files, 431 tests, all passing.

### Test Infrastructure

- Setup: `src/__tests__/setup.js` — stubs `window.speechSynthesis`, `ResizeObserver`, React act env
- No centralised DB fixture — tests use inline fixture arrays of plain objects
- Pattern: pure functions extracted and tested directly; no component rendering in most tests

### What is Tested

| Area | Files |
|---|---|
| Cash flow projection | `cashFlow.test.js` |
| Dashboard calculations | `dashboardCalc.test.js` |
| Date range filtering | `dateFilter.test.js` |
| CSV import parsing | `csvImport.test.js` |
| Budget alerts | `alerts.test.js` |
| Debt payoff strategies | `debtTracker.test.js` |
| Financial health score | `healthScore.test.js` |
| Mortgage amortization | `mortgage.test.js` |
| Retirement projections | `retirement.test.js` |
| Spending anomalies | `spendingAnomalies.test.js` |
| Subscription detection | `subscriptions.test.js` |
| Tax deduction tagging | `taxTracker.test.js` |
| Wishlist affordability | `wishlist.test.js` |
| Jarvis tool library | `toolLibrary.test.js`, `buildToolSummary.test.js`, `parseToolCall.test.js` |
| Quick-nav fast path | `quickNavFastPath.test.js` |
| Integration (vacation, favourites, chat) | `src/__tests__/integration/` |
| Server mock API | `src/__tests__/server/api.test.js` |

### Untested Areas (prioritised)

| Priority | Area | Why it matters |
|---|---|---|
| High | `src/utils/dateUtils.js` | Date range filtering drives every historical query |
| High | `src/utils/crypto.js` | PIN hashing + TOTP — security-critical, silent failures |
| High | DAL layer (`server/dal/*.js`) | CRUD, `INSERT OR REPLACE`, transaction rollback never verified |
| High | `app/api/` route handlers | No validation of real request/response shapes |
| Medium | `src/utils/catLearn.js` | Auto-categorisation affects every CSV import |
| Medium | `src/utils/receiptOCR.js` | JSON parse can fail silently on malformed Gemini response |
| Low | View components | Complex state in Bills, History, CSVImport |
| Low | `src/utils/shortcuts.js` | Keyboard combos — failures are immediately visible |

---

## Known Decisions

- **No double-counting bills:** Bill payments are captured as expense transactions — don't add them again in spending totals.
- **`_expUnion`** unions `transactions` and `vacation_txns` — only reference columns present in both tables.
- **`nfmt(v)` over `fmt()`:** `nfmt` is the discrete-mode-aware formatter. In `useAlerts`, read `settings.discreteMode` synchronously (not `window.__discreteMode`) since `useMemo` runs before effects.
- **Category learning:** Both `settings.catRules` and `ch_cat_learn` localStorage are applied in `applyAutoCategory()` in CSVImport during preview. Threshold is 3 matches.
- **Bill auto-matching** runs after CSV import via `autoMatchBills()` in SpendTracker.
- **Expected income cadence:** Confirming an expected income entry with a cadence auto-generates the next instance via `confirmPayment()`.
- **Budget rollover:** `settings.catRollover` (`{cat: bool}`) — per-category flags; Dashboard computes effective budgets with carryover logic.
- **Merchant normalization:** `settings.merchantNorms` (`[{id, pattern, replacement}]`) — display-layer only, applied in History rows.
- **Zero-based budget:** `settings.zeroBudget` (bool) — shown in Categories with unallocated remainder.
- **History props:** `History` requires `subscriptions` (for ↻ badge) and `merchantNorms` (for display normalization) as props.
- **Split transaction:** `SplitModal` in History removes the original and inserts multiple replacement transactions.
- **Duplicate manager:** O(n²) scan over last 600 singles; dismissed dupes stored in component state only.
- **RRSP/TFSA tracker:** `RrspTfsaTracker` in Reports backed by `ch_rrsp_tfsa` localStorage.
- **Net worth milestones:** `prevNetWorthRef` in SpendTracker fires toast + OS Notification when crossing $10k/$25k/$50k thresholds.
- **Web Notifications** fire on app launch (bills ≤3 days, budget ≥80%/100%, weekly digest on Sundays) and on `saveTxns` for large amounts.
- **Vacation transactions** (`vacation_txns`) are a parallel table — they roll into spending totals via `_expUnion` but are managed separately.
- **`dataService.mergeData`** inspects which keys are defined in a patch and calls the correct DAL `replaceAll()` — only keys present in the patch are updated.

---

## Running the App

```bash
npm run dev            # Next.js at localhost:3000
npm run electron:dev   # Native Electron window (waits for port 3000)
npm test               # Vitest — 21 files, 431 tests
npm run electron:build # Production DMG
```

---

## Roadmap

Status: `[ ]` not started · `[~]` in progress · `[x]` done

### ~~Phase A — Cleanup & Quick Wins~~

- ~~[x] Delete stale `src/views/* 2.jsx` backup files~~
- ~~[x] Dashboard: month-over-month spending delta cards~~
- ~~[x] Dashboard: spending velocity indicator~~
- ~~[x] Quick-add transaction (Cmd+N)~~
- ~~[x] History: bulk category reassign~~
- ~~[x] History: inline transaction tags (#tag syntax in note field)~~

### ~~Phase B — Smart Budgets~~

- ~~[x] Budget rollover — `settings.catRollover`~~
- ~~[x] Budget suggestions — 3-month average analysis, one-click apply~~
- ~~[x] Overspend breakdown — top transactions per over-budget category~~
- ~~[x] Zero-based budget mode — `settings.zeroBudget`~~

### ~~Phase C — Analytics & Reporting~~

- ~~[x] Year-over-year chart~~
- ~~[x] PDF monthly report — `window.print()`~~
- ~~[x] RRSP / TFSA room tracker~~
- ~~[x] Savings rate tracker — rolling 12-month chart~~
- ~~[x] Net worth milestones — toast + OS notification~~

### ~~Phase D — Transaction Intelligence~~

- ~~[x] Split transaction — `SplitModal`~~
- ~~[x] Merchant name normalizer — `settings.merchantNorms`~~
- ~~[x] Duplicate manager — ±3-day same-merchant/amount scan~~
- ~~[x] Subscription badge — ↻ icon in History~~

### ~~Phase E — Notifications~~

- ~~[x] Bill due ≤3 days — native OS toast on launch~~
- ~~[x] Budget overage — 80% and 100% thresholds~~
- ~~[x] Large transaction toast — `settings.largeTransactionAlert`~~
- ~~[x] Weekly digest — Sunday summary notification~~

### Phase F — Next Up

- [ ] Recurring transaction auto-detection — scan last 90 days for same-merchant/amount patterns; suggest adding to Bills
- [ ] Income forecasting — project next 3 months of net income/expense from confirmed cadences + budgets
- [ ] Multi-account net worth chart — stacked area chart of each account balance over time (`account_history`)
- [ ] Jarvis: natural-language budget edit — "increase groceries to $600" parses and applies directly
- [ ] CSV export — export filtered transactions from History with active filters applied
- [ ] Compact mode — denser transaction rows toggle (`settings.compactMode`)
- [ ] Category emoji picker — display emoji per category (`settings.catEmoji`)
- [ ] Bill schedule calendar view — upcoming bills on mini calendar in Bills tab

### Phase G — Test Coverage

- [ ] Unit tests for `dateUtils.js` — `buildDates`, `_sqlDf`, `_df`, `_label`
- [ ] Unit tests for `crypto.js` — PIN hashing, TOTP generation
- [ ] Unit tests for `catLearn.js` — threshold learning, localStorage round-trip
- [ ] DAL unit tests — CRUD, `replaceAll`, `INSERT OR REPLACE`, coercion
- [ ] API route integration tests — real request/response shapes for `/api/data`, `/api/db/sql`, `/api/pdf-parse`
