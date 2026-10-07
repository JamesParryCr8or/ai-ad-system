document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
try {
  const state = JSON.parse(sessionStorage.getItem('cr8or-mortgage-funnel-v1') || '{}');
  if (state?.submitted) {
    document.querySelector('#receipt').hidden = false;
    const root = document.querySelector('#ghl-calendar-root');
    const [firstName, ...rest] = String(state.name || '').trim().split(/\s+/);
    Object.assign(root.dataset, { firstName, lastName:rest.join(' '), email:state.email || '', phone:state.phone || '' });
  }
} catch {}
const script = document.createElement('script'); script.src = '/assets/calendar-widget.js'; document.body.append(script);
