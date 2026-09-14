const handlers = {
  backtest: require('../handlers/backtest'),
  'calibration-health': require('../handlers/calibration-health'),
  detail: require('../handlers/detail'),
  'historical-structure-study': require('../handlers/historical-structure-study'),
  htf: require('../handlers/htf'),
  'independent-temporal': require('../handlers/independent-temporal'),
  market: require('../handlers/market'),
  'micro-features': require('../handlers/micro-features'),
  pattern: require('../handlers/pattern'),
  'pattern-validation': require('../handlers/pattern-validation'),
  'structure-study': require('../handlers/structure-study'),
  structure: require('../handlers/structure'),
  'temporal-features': require('../handlers/temporal-features'),
  'trendline-study': require('../handlers/trendline-study')
};

module.exports = async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  const fn = handlers[route];
  if (!fn) {
    return res.status(404).json({ ok: false, error: 'Unknown API route', route });
  }
  try {
    return await fn(req, res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: error?.message || 'API handler failed', route });
    }
    throw error;
  }
};
