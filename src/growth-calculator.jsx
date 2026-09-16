import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowUpRight, Search, Globe, Download, RotateCcw, TrendingUp, Check, LoaderCircle, ChevronDown, ExternalLink } from 'lucide-react';
import { forecast, researchMetrics } from './growth-model.js';
import './growth-calculator.css';

const INITIAL = { mode: 'ecommerce', budget: 3000, volume: 20000, cpc: 2, share: 40, ctr: 6, cvr: 3, close: 20, value: 150, margin: 60 };
const COUNTRIES = { gb: 'United Kingdom', us: 'United States', au: 'Australia', ca: 'Canada', ie: 'Ireland', nz: 'New Zealand' };
const number = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n);
const decimal = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);
const SCENARIOS = [['Cautious', 0.8], ['Expected', 1], ['Ambitious', 1.2]];
const initialSource = 'Illustrative inputs';

async function api(body, job) {
  const response = await fetch(`/api/growth-research${job ? `?job=${encodeURIComponent(job)}` : ''}`, job ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Research is unavailable. Please try again.');
  return data;
}

function Field({ label, name, value, set, suffix, min = 0, max = 100000000, step = 1 }) {
  return <label className="field"><span>{label}</span><div className="input-unit"><input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={e => set(name, Math.min(max, Math.max(min, Number(e.target.value))))}/>{suffix && <span>{suffix}</span>}</div></label>;
}

function App() {
  const [input, setInput] = useState(INITIAL);
  const [currency, setCurrency] = useState('GBP');
  const [fx, setFx] = useState(0.75);
  const [source, setSource] = useState(initialSource);
  const [tab, setTab] = useState('keywords');
  const [keywords, setKeywords] = useState('');
  const [website, setWebsite] = useState('');
  const [geo, setGeo] = useState('gb');
  const [ideas, setIdeas] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [research, setResearch] = useState(null);
  const [selected, setSelected] = useState([]);
  const [scenario, setScenario] = useState(1);
  const [pendingJob, setPendingJob] = useState('');
  const requestId = useRef(0);
  const leadMode = input.mode === 'leads';
  const money = (n, digits = 0) => n === null ? 'N/A' : new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: digits }).format(n);
  const set = (name, value) => { setInput(old => ({ ...old, [name]: value })); if (name === 'volume' || name === 'cpc') setSource('Custom demand & CPC'); };
  const result = forecast(input, scenario);
  const chosenRows = useMemo(() => research?.rows.filter((_, i) => selected.includes(i)) || [], [research, selected]);
  const metrics = researchMetrics(chosenRows, currency === 'USD' ? 1 : fx);
  const scenarios = SCENARIOS.map(([name, factor]) => ({ name, factor, ...forecast(input, factor) }));
  const maxRevenue = Math.max(1, ...scenarios.map(s => s.revenue));

  function applyRows(rows, nextSelected, rate = currency === 'USD' ? 1 : fx) {
    const next = researchMetrics(rows.filter((_, i) => nextSelected.includes(i)), rate);
    setSelected(nextSelected);
    setInput(old => ({ ...old, volume: next.volume, cpc: next.cpc === null ? old.cpc : Math.round(next.cpc * 100) / 100 }));
    setSource(next.cpc === null ? 'Research demand / manual CPC' : 'Research-based inputs');
  }
  function changeCurrency(next) {
    const ratio = next === 'USD' ? 1 / fx : fx;
    setCurrency(next);
    setInput(old => ({ ...old, budget: Math.round(old.budget * ratio), cpc: Math.round(old.cpc * ratio * 100) / 100, value: Math.round(old.value * ratio * 100) / 100 }));
  }
  async function poll(job, id) {
    for (let count = 0; count < 42; count++) {
      const data = await api(null, job);
      if (id !== requestId.current) return;
      if (data.status === 'complete') {
        setResearch(data); applyRows(data.rows, data.rows.map((_, i) => i));
        setPendingJob(''); setStatus(data.rows.length ? `${data.rows.length} keyword results ready.` : 'No keyword data returned. Try broader terms.'); return;
      }
      setStatus('Researching demand and click costs...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('Research is taking longer than usual. Check the same search again below.');
  }
  async function runResearch(event) {
    event.preventDefault(); setError(''); setStatus('');
    const seeds = [...new Set(keywords.split(/[\n,]+/).map(s => s.trim()).filter(Boolean))];
    if (seeds.length < 1 || seeds.length > 10 || seeds.some(s => s.length > 80)) { setError('Enter 1 to 10 keywords, up to 80 characters each.'); return; }
    const id = ++requestId.current;
    setBusy(true);
    try { const data = await api({ keywords: seeds, geo, ideas }); setPendingJob(data.job); await poll(data.job, id); }
    catch (e) { setError(e.message); setStatus(''); }
    finally { if (id === requestId.current) setBusy(false); }
  }
  async function suggest(event) {
    event.preventDefault(); setBusy(true); setError(''); setStatus('Reading website headings...');
    try { const data = await api({ action: 'website', website }); setKeywords(data.keywords.join('\n')); setTab('keywords'); setStatus(data.keywords.length ? 'Suggested keywords are ready to review before researching.' : 'No suitable headings found. Enter your keywords below.'); }
    catch (e) { setError(e.message); setStatus(''); } finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true); setError('');
    try { await poll(pendingJob, ++requestId.current); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  useEffect(() => () => { requestId.current++; }, []);

  function download() {
    const rows = [['CR8OR Google Ads forecast', new Date().toISOString()], ['Source', source], ['Research country', research ? COUNTRIES[research.geo] : 'Manual'], ['Currency', currency], ['GBP per USD (planning assumption)', fx], ['Monthly search volume (may overlap)', input.volume], ['CPC', input.cpc], ['Monthly budget', input.budget], ['Impression share %', input.share], ['CTR %', input.ctr], ['Conversion rate %', input.cvr], ['Lead close rate %', leadMode ? input.close : 'N/A'], ['Revenue per sale', input.value], ['Gross margin %', input.margin], [], ['Scenario', 'Spend', 'Clicks', leadMode ? 'Leads' : 'Orders', 'Sales', 'Revenue', 'Customer CPA', 'Contribution after ads'], ...scenarios.map(s => [s.name, s.spend.toFixed(2), s.clicks.toFixed(1), s.conversions.toFixed(1), s.sales.toFixed(1), s.revenue.toFixed(2), s.cpa?.toFixed(2) ?? 'N/A', s.contribution.toFixed(2)]), [], ['Forecasts are estimates, not guarantees. Excludes fees, VAT and fixed costs.'], [], ['Keyword', 'Monthly searches', 'CPC USD', 'Competition'], ...chosenRows.map(r => [r.keyword, r.volume ?? 'Unknown', r.cpc ?? 'Unknown', r.competition])];
    const csv = rows.map(row => row.map(value => { let s = String(value); if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'cr8or-google-ads-forecast.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return <>
    <nav className="topbar"><a className="brand" href="/google-ads/">CR8OR<span> / GROWTH TOOLS</span></a><a className="back-link" href="/google-ads/"><ArrowLeft size={15}/> Google Ads expertise</a><a className="audit-link" href="/google-ads/#book-discovery-call">Book a scale audit <ArrowUpRight size={16}/></a></nav>
    <main>
      <header className="page-heading"><div><span className="eyebrow"><TrendingUp size={14}/> SEARCH DEMAND. COMMERCIAL CLARITY.</span><h1>Google Ads growth calculator</h1><p>Find your demand. Model the economics. See what profitable scale could look like.</p></div><div className="header-actions"><select aria-label="Forecast currency" value={currency} onChange={e => changeCurrency(e.target.value)}><option value="GBP">GBP &#163;</option><option value="USD">USD $</option></select><button className="icon-button" title="Download forecast CSV" aria-label="Download forecast CSV" onClick={download}><Download size={18}/></button><button className="icon-button" title="Reset forecast" aria-label="Reset forecast" onClick={() => { setInput(INITIAL); setCurrency('GBP'); setFx(0.75); setSource(initialSource); setResearch(null); setSelected([]); setScenario(1); }}><RotateCcw size={17}/></button></div></header>
      <div className="workspace">
        <aside className="controls">
          <section className="research-panel"><div className="section-heading"><span className="step">01</span><h2>Find your market</h2></div><div className="segmented"><button type="button" disabled={busy} aria-pressed={tab === 'keywords'} onClick={() => setTab('keywords')}><Search size={14}/> Keywords</button><button type="button" disabled={busy} aria-pressed={tab === 'website'} onClick={() => setTab('website')}><Globe size={14}/> Website</button></div>
            {tab === 'website' ? <form onSubmit={suggest}><label className="field"><span>Website address</span><input required value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourwebsite.com" maxLength={500}/></label><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} Find keyword suggestions</button></form> : <form onSubmit={runResearch}><label className="field"><span>Keywords <small>Up to 10, separated by commas</small></span><textarea required rows={3} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="laser hair growth, hair growth device" maxLength={810}/></label><label className="field"><span>Target market <small>English-language searches</small></span><select value={geo} onChange={e => setGeo(e.target.value)}>{Object.entries(COUNTRIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={ideas} onChange={e => setIdeas(e.target.checked)}/> Include related keyword ideas <small>Max 20</small></label><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {busy ? 'Researching...' : 'Research keywords'}</button></form>}
            <div aria-live="polite">{status && <p className="notice">{status}</p>}{error && <p role="alert" className="error">{error}</p>}{pendingJob && !busy && error && <button className="text-button" onClick={resume}>Check existing research</button>}</div>
          </section>
          <section className="assumptions"><div className="section-heading"><span className="step">02</span><h2>Your business economics</h2></div><div className="segmented"><button aria-pressed={!leadMode} onClick={() => set('mode', 'ecommerce')}>Ecommerce</button><button aria-pressed={leadMode} onClick={() => set('mode', 'leads')}>Lead generation</button></div><Field label="Monthly ad budget" name="budget" value={input.budget} set={set} suffix={currency} step={100}/><div className="field-pair"><Field label="Monthly searches" name="volume" value={input.volume} set={set}/><Field label="Average CPC" name="cpc" value={input.cpc} set={set} suffix={currency} step={0.01}/></div><div className="field-pair"><Field label={leadMode ? 'Click-to-lead rate' : 'Purchase rate'} name="cvr" value={input.cvr} set={set} suffix="%" max={100} step={0.1}/><Field label={leadMode ? 'Revenue per sale' : 'Average order value'} name="value" value={input.value} set={set} suffix={currency} step={10}/></div>{leadMode && <Field label="Lead-to-sale close rate" name="close" value={input.close} set={set} suffix="%" max={100}/>}<label className="slider-field"><span>Gross margin <strong>{input.margin}%</strong></span><input aria-label="Gross margin" type="range" min="0" max="100" value={input.margin} onChange={e => set('margin', Number(e.target.value))}/></label><details open><summary>Demand assumptions <ChevronDown size={14}/></summary><div className="field-pair"><Field label="Impression share" name="share" value={input.share} set={set} suffix="%" max={100}/><Field label="Click-through rate" name="ctr" value={input.ctr} set={set} suffix="%" max={100} step={0.1}/></div>{currency === 'GBP' && <Field label="GBP per USD (planning rate)" name="fx" value={fx} min={0.01} max={10} step={0.01} set={(_name, value) => { setFx(value); if (research && source.startsWith('Research')) applyRows(research.rows, selected, value); }}/>}</details></section>
        </aside>
        <div className="results">
          <section className="forecast-section"><div className="forecast-heading"><div><span className="eyebrow">MONTHLY FORECAST</span><h2>Your growth outlook</h2></div><span className={`source-badge ${source.startsWith('Research') ? 'researched' : ''}`}><span/>{source}</span></div><div className="scenario-tabs" aria-label="Forecast scenario">{SCENARIOS.map(([name, factor]) => <button key={name} aria-pressed={scenario === factor} onClick={() => setScenario(factor)}>{name}</button>)}</div>
            <div className="metrics"><div className="metric revenue"><span>Potential revenue</span><strong>{money(result.revenue)}</strong><small>{decimal(result.roas ?? 0)}x revenue / ad spend</small></div><div className="metric"><span>{leadMode ? 'Qualified leads*' : 'Orders'}</span><strong>{number(result.conversions)}</strong><small>{leadMode ? `${decimal(result.sales)} estimated sales` : `${number(result.clicks)} estimated clicks`}</small></div><div className="metric"><span>{leadMode ? 'Cost per lead' : 'Cost per acquisition'}</span><strong>{money(leadMode ? result.cpl : result.cpa, 2)}</strong><small>{leadMode ? `${money(result.cpa, 2)} per acquired customer` : `${money(result.breakEvenCpa, 2)} break-even CPA`}</small></div></div>
            <div className="chart-section"><div className="chart-heading"><h3>Revenue by scenario</h3><span>{currency} / month</span></div><div className="revenue-chart">{scenarios.map(s => <button aria-label={`${s.name} forecast: ${money(s.revenue)}`} key={s.name} className={`chart-row ${scenario === s.factor ? 'active' : ''}`} onClick={() => setScenario(s.factor)}><span>{s.name}</span><div className="bar-track"><div style={{ width: `${s.revenue / maxRevenue * 100}%` }}/></div><strong>{money(s.revenue)}</strong></button>)}</div><div className="chart-axis"><span>0</span><span>{money(maxRevenue)}</span></div></div>
            <div className="economics"><div><span>Estimated ad spend</span><strong>{money(result.spend)}</strong></div><div><span>Contribution after ads</span><strong className={result.contribution < 0 ? 'negative' : 'positive'}>{money(result.contribution)}</strong></div><div><span>Unused budget</span><strong>{money(result.unused)}</strong></div></div>
            <p className="forecast-note">{result.unused > 1 ? `Demand caps this scenario at ${number(result.capacity)} clicks. ${money(result.unused)} of the budget stays unspent.` : 'This scenario can use the full budget within the modelled search demand.'} Contribution excludes agency fees, VAT and fixed costs.</p>{leadMode && <p className="forecast-note">*Lead quality is an assumption in your click-to-lead rate; keyword data cannot verify qualification.</p>}
          </section>
          <section className="keywords-section"><div className="section-heading"><span className="step">03</span><h2>Demand behind the numbers</h2>{research && <span className="count">{selected.length} / {research.rows.length} selected</span>}</div>{research?.rows.length ? <><div className="table-scroll"><table><thead><tr><th><input aria-label="Select all keywords" type="checkbox" checked={selected.length === research.rows.length} onChange={e => applyRows(research.rows, e.target.checked ? research.rows.map((_, i) => i) : [])}/></th><th>Keyword</th><th>Searches / mo</th><th>CPC {currency}</th><th>Competition</th><th>12-month demand</th></tr></thead><tbody>{research.rows.map((row, i) => <tr key={`${row.keyword}-${i}`}><td><input aria-label={`Include ${row.keyword}`} type="checkbox" checked={selected.includes(i)} onChange={e => applyRows(research.rows, e.target.checked ? [...selected, i] : selected.filter(n => n !== i))}/></td><td>{row.keyword}</td><td>{row.volume === null ? 'Unknown' : number(row.volume)}</td><td>{row.cpc === null ? 'Unknown' : money(row.cpc * (currency === 'GBP' ? fx : 1), 2)}</td><td><span className="competition">{row.competition}</span></td><td><div className="spark">{row.monthly.length ? row.monthly.map((m, j) => <i key={j} title={`${m.month} ${m.year}: ${m.volume === null ? 'Unknown' : number(m.volume)}`} style={{ height: `${m.volume === null ? 0 : Math.max(3, m.volume / Math.max(1, ...row.monthly.map(p => p.volume || 0)) * 28)}px` }}/>) : 'Unavailable'}</div></td></tr>)}</tbody></table></div><p className="table-note">{COUNTRIES[research.geo]} · English · Retrieved {new Date(research.fetchedAt).toLocaleDateString('en-GB')} · CPC supplied in USD{currency === 'GBP' ? `, converted at your planning rate of ${fx} GBP/USD` : ''}. {metrics.missing > 0 && `${metrics.missing} selected keywords have incomplete or zero metrics; missing CPCs are excluded from the weighted average.`} Close variants can overlap; search totals are not unique people.{research.rows.some(r => r.source === 'Provider fallback') && ' Some results use the provider fallback source.'}</p></> : <div className="research-empty"><Search size={25}/><div><h3>{research ? 'No keyword metrics returned' : 'Your market, measured'}</h3><p>{research ? 'Try broader product or service terms.' : 'No research loaded. The forecast currently uses editable illustrative figures.'}</p></div></div>}</section>
          <section className="audit-strip"><img src="/Landing%20Page/Headhot%20James%20Parry.png" alt="James Parry"/><div><h3>Turn the forecast into a scale plan.</h3><p>Review your Google Ads, Shopping and Merchant Centre with James.</p></div><a href="/google-ads/#book-discovery-call">Book your audit <ArrowUpRight size={18}/></a></section>
          <details className="methodology"><summary>Forecast methodology & data sources <ChevronDown size={15}/></summary><p>Clicks = the smaller of budget / CPC and searches x impression share x click-through rate. Orders or leads = clicks x conversion rate. Lead sales also apply your close rate. Revenue = sales x value; contribution = revenue x gross margin minus ad spend.</p><p>Cautious uses 25% higher CPC and 20% lower conversion rate. Ambitious uses 16.7% lower CPC and 20% higher conversion rate. These are sensitivity scenarios, not statistical confidence intervals or guaranteed outcomes. CPC changes in the scenario are independent of budget. This is a Search planning model, not a Shopping or Performance Max forecast.</p><p>Keyword metrics are supplied by the <a href="https://apify.com/aitorsm/keyword-volume" target="_blank" rel="noreferrer">Apify keyword actor <ExternalLink size={12}/></a>, which reports Google Keyword Planner data. It is not a direct Google Ads account forecast. Keyword totals may overlap. Unknown metrics remain unknown. GBP uses your editable planning exchange rate, not a live FX quote.</p></details>
        </div>
      </div>
    </main><footer><a className="brand" href="/google-ads/">CR8OR</a><span>Built around intent. Measured in profit.</span><a href="/google-ads/">Google Ads Scale System <ArrowUpRight size={13}/></a></footer>
  </>;
}
createRoot(document.getElementById('growth-calculator')).render(<App/>);
