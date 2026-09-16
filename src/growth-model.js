export function forecast(input, factor = 1) {
  const positive = n => Math.max(0, Number(n) || 0);
  const rate = n => Math.min(1, positive(n) / 100);
  const budget = positive(input.budget);
  const cpc = positive(input.cpc) / factor;
  const clickCapacity = positive(input.volume) * rate(input.share) * rate(input.ctr);
  const clicks = cpc > 0 ? Math.min(budget / cpc, clickCapacity) : 0;
  const spend = clicks * cpc;
  const conversions = clicks * Math.min(1, rate(input.cvr) * factor);
  const sales = input.mode === 'leads' ? conversions * rate(input.close) : conversions;
  const revenue = sales * positive(input.value);
  return { clicks, spend, conversions, sales, revenue, unused: Math.max(0, budget - spend), cpa: sales > 0 ? spend / sales : null, cpl: conversions > 0 ? spend / conversions : null, roas: spend > 0 ? revenue / spend : null, contribution: revenue * rate(input.margin) - spend, capacity: clickCapacity, breakEvenCpa: positive(input.value) * rate(input.margin) };
}

export function researchMetrics(rows, fx = 1) {
  const known = rows.filter(row => row.volume !== null && Number.isFinite(row.volume));
  const priced = known.filter(row => row.cpc !== null && row.cpc > 0 && row.volume > 0);
  const volume = known.reduce((sum, row) => sum + row.volume, 0);
  const weight = priced.reduce((sum, row) => sum + row.volume, 0);
  return { volume, cpc: weight ? priced.reduce((sum, row) => sum + row.volume * row.cpc, 0) / weight * fx : null, missing: rows.length - priced.length };
}
