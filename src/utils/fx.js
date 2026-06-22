import { today } from "./formatters.js";

const fetchUsdCad = (dateStr) => {
  const endpoint = dateStr >= today()
    ? "https://api.frankfurter.dev/v1/latest?from=USD&to=CAD"
    : `https://api.frankfurter.dev/v1/${dateStr}?from=USD&to=CAD`;
  return fetch(endpoint).then(r => r.json()).then(d => {
    const rate = d?.rates?.CAD;
    if (!rate) throw new Error("Rate unavailable");
    return rate;
  });
};

export { fetchUsdCad };
