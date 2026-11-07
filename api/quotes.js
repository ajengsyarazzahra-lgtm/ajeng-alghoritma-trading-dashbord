const TICKERS = [
  'SRIL', 'BBCA', 'BBRI', 'BMRI', 'BBNI', 'BBTN', 'BTPS',
  'TLKM', 'EXCL', 'TOWR', 'TBIG', 'JSMR',
  'ADRO', 'PTBA', 'ITMG', 'PGAS', 'AKRA',
  'ANTM', 'INCO',
  'ASII', 'UNTR', 'SMGR', 'INKP', 'TKIM', 'BRPT', 'INTP',
  'UNVR', 'ICBP', 'INDF', 'CPIN', 'JPFA', 'GGRM', 'HMSP', 'KLBF',
  'ACES', 'LPPF', 'ERAA',
  'CTRA', 'PWON', 'BSDE', 'WIKA', 'PTPP', 'WSKT',
  'MNCN', 'SCMA'
];

async function fetchQuote(ticker) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.JK`);
  url.searchParams.set('range', '1d');
  url.searchParams.set('interval', '1m');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);

    const payload = await response.json();
    const chart = payload.chart;
    if (chart.error) throw new Error(chart.error.description || 'Yahoo Finance returned an error');
    const result = chart.result && chart.result[0];
    if (!result) throw new Error('No market data available');

    const meta = result.meta || {};
    const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
    if (!quote) throw new Error('No quote data available');
    const firstValue = values => (values || []).find(Number.isFinite);
    const maxValue = values => Math.max(...(values || []).filter(Number.isFinite));
    const minValue = values => Math.min(...(values || []).filter(Number.isFinite));
    const last = Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : (quote.close || []).filter(Number.isFinite).slice(-1)[0];
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const open = Number.isFinite(meta.regularMarketOpen) ? meta.regularMarketOpen : firstValue(quote.open);
    const high = Number.isFinite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : maxValue(quote.high);
    const low = Number.isFinite(meta.regularMarketDayLow) ? meta.regularMarketDayLow : minValue(quote.low);
    const volume = Number.isFinite(meta.regularMarketVolume)
      ? meta.regularMarketVolume
      : (quote.volume || []).filter(Number.isFinite).slice(-1)[0];

    if (![open, high, low, last, previousClose, volume].every(Number.isFinite) || previousClose === 0) {
      throw new Error('Incomplete market data');
    }

    return {
      ticker,
      quote: {
        open,
        high,
        low,
        last,
        previousClose,
        changePercent: (last / previousClose - 1) * 100,
        volumeLot: volume / 100
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const quotes = {};
  const errors = [];
  let next = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (next < TICKERS.length) {
      const ticker = TICKERS[next++];
      try {
        const result = await fetchQuote(ticker);
        quotes[result.ticker] = result.quote;
      } catch (error) {
        errors.push({ ticker, message: error.message || 'Quote request failed' });
      }
    }
  });
  await Promise.all(workers);

  if (Object.keys(quotes).length === 0) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Yahoo Finance did not return valid LQ45 quotes', errors });
  }

  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
  return res.status(200).json({
    provider: 'Yahoo Finance',
    updatedAt: new Date().toISOString(),
    quotes,
    errors
  });
};
