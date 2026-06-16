// Canonical spending calculations. Spending = expense transactions + vacation transactions.
// All functions that summarise money flow should import from here.

/**
 * Sum all expenses for a period.
 * @param {Array} txns - regular transactions
 * @param {Array} vacationTxns - vacation transactions (always treated as expenses)
 * @param {string|null} month - optional YYYY-MM prefix to filter by month
 */
export function sumExpenses(txns, vacationTxns = [], month = null) {
  const inMonth = t => !month || (t.date && t.date.startsWith(month));
  const e = txns.filter(t => t.type === "expense" && inMonth(t)).reduce((s, t) => s + t.amount, 0);
  const v = vacationTxns.filter(inMonth).reduce((s, t) => s + t.amount, 0);
  return e + v;
}

/**
 * Sum all income for a period.
 * @param {Array} txns - regular transactions
 * @param {string|null} month - optional YYYY-MM prefix to filter by month
 */
export function sumIncome(txns, month = null) {
  const inMonth = t => !month || (t.date && t.date.startsWith(month));
  return txns.filter(t => t.type === "income" && inMonth(t)).reduce((s, t) => s + t.amount, 0);
}

/**
 * Return a { category: amount } map for expenses in a period.
 * Vacation transactions without a category default to "Vacation".
 * Regular transactions without a category default to "Other".
 * @param {Array} txns - regular transactions
 * @param {Array} vacationTxns - vacation transactions
 * @param {string|null} month - optional YYYY-MM prefix to filter by month
 */
export function expensesByCategory(txns, vacationTxns = [], month = null) {
  const inMonth = t => !month || (t.date && t.date.startsWith(month));
  const result = {};
  txns.filter(t => t.type === "expense" && inMonth(t)).forEach(t => {
    const c = t.category || "Other";
    result[c] = (result[c] || 0) + t.amount;
  });
  vacationTxns.filter(inMonth).forEach(t => {
    const c = t.category || "Vacation";
    result[c] = (result[c] || 0) + t.amount;
  });
  return result;
}
