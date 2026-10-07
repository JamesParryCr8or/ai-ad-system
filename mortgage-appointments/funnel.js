const key = 'cr8or-mortgage-funnel-v1';
let state = {};
try { state = JSON.parse(sessionStorage.getItem(key) || '{}'); if (!state || typeof state !== 'object') state = {}; } catch { state = {}; }
const save = () => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} };
const params = new URLSearchParams(location.search);
state.attribution ||= {};
for (const name of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid']) if (params.has(name)) state.attribution[name] = params.get(name).slice(0,250);
save();
document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
const privacy = document.querySelector('#privacy');
document.querySelectorAll('[data-privacy]').forEach(el => el.addEventListener('click', event => { event.preventDefault(); privacy.showModal(); }));
privacy?.querySelector('.close').addEventListener('click', () => privacy.close());
function render() {
  let step = location.hash.slice(1) || 'intro';
  if (!['intro','capacity','case-type','contact'].includes(step)) step = 'intro';
  if ((step === 'case-type' || step === 'contact') && !state.capacity) step = 'capacity';
  if (step === 'contact' && !state.caseType) step = 'case-type';
  document.querySelectorAll('.screen').forEach(el => el.hidden = el.id !== step);
  document.querySelectorAll('[data-answer]').forEach(el => el.setAttribute('aria-pressed', String(state[el.dataset.answer] === el.dataset.value)));
  window.scrollTo(0,0);
  document.querySelector(`#${step} h1`)?.focus({ preventScroll: true });
}
document.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.back; }));
document.querySelectorAll('[data-answer]').forEach(el => el.addEventListener('click', () => {
  state[el.dataset.answer] = el.dataset.value; save(); location.hash = el.dataset.answer === 'capacity' ? 'case-type' : 'contact';
}));
window.addEventListener('hashchange', render); render();
const form = document.querySelector('#lead-form');
for (const field of ['name','business','email','phone','area']) if (typeof state[field] === 'string') form.elements[field].value = state[field];
form.addEventListener('input', () => { for (const field of ['name','business','email','phone','area']) state[field] = form.elements[field].value; save(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.querySelector('#submit-button'); if (button.disabled) return;
  const error = document.querySelector('#form-error'); error.hidden = true;
  const phone = form.elements.phone.value.trim();
  if (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g,'').length < 7 || phone.replace(/\D/g,'').length > 15) { error.textContent = 'Please enter a valid phone number.'; error.hidden = false; form.elements.phone.focus(); return; }
  button.disabled = true; button.textContent = 'Saving your details…';
  try {
    const response = await fetch('/api/mortgage-lead', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...Object.fromEntries(new FormData(form)), capacity:state.capacity, caseType:state.caseType, attribution:state.attribution, consent:form.elements.consent.checked }), signal:AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) throw new Error(data?.error || 'We couldn’t save your details. Please try again.');
    state.submitted = true; save(); location.assign('/mortgage-appointments/how-it-works/');
  } catch (err) { error.textContent = err.name === 'TimeoutError' ? 'The request timed out. Please try again.' : err.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Show me the full breakdown ↗'; }
});
