(() => {
  const form = document.querySelector('#access-form');
  const submitButton = document.querySelector('#claim-button');
  const error = document.querySelector('#form-error');
  const calendarRoot = document.querySelector('#software-calendar');
  const calendarStatus = document.querySelector('#calendar-status');
  const retry = document.querySelector('#calendar-retry');
  const storageKey = 'cr8or-free-software-v1';
  let calendarLoading = false;
  let calendarLoaded = false;

  function loadCalendar() {
    if (calendarLoaded || calendarLoading) return;
    calendarLoading = true;
    retry.hidden = true;
    calendarStatus.hidden = false;
    calendarStatus.textContent = 'Loading available times…';
    const script = document.createElement('script');
    script.src = '/assets/calendar-widget.js';
    script.onload = () => {
      calendarLoading = false;
      calendarLoaded = true;
      calendarStatus.hidden = true;
    };
    script.onerror = () => {
      calendarLoading = false;
      script.remove();
      calendarStatus.textContent = 'Your request is saved. The calendar could not load. Please try again.';
      retry.hidden = false;
    };
    document.body.appendChild(script);
  }

  function showSetup(contact, scroll = true) {
    const [firstName, ...lastName] = contact.name.trim().split(/\s+/);
    calendarRoot.dataset.firstName = firstName;
    calendarRoot.dataset.lastName = lastName.join(' ');
    calendarRoot.dataset.email = contact.email;
    calendarRoot.dataset.phone = contact.phone;
    document.querySelector('#opt-in-panel').hidden = true;
    document.querySelector('#saved-panel').hidden = false;
    document.querySelector('#saved-copy').textContent = `Thanks, ${firstName}. Now let’s put your growth stack to work.`;
    document.querySelector('#setup').hidden = false;
    document.querySelectorAll('[data-claim-link]').forEach(link => {
      link.href = '#setup';
      link.textContent = 'Book my setup session ↗';
    });
    loadCalendar();
    if (scroll) {
      document.querySelector('#setup-title').focus({ preventScroll: true });
      document.querySelector('#setup').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }
  retry.addEventListener('click', loadCalendar);
  document.querySelector('a[href="#privacy"]').addEventListener('click', () => { document.querySelector('#privacy').open = true; });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitButton.disabled || !form.reportValidity()) return;
    const fields = new FormData(form);
    const contact = { name: fields.get('name').trim(), email: fields.get('email').trim(), phone: fields.get('phone').trim() };
    const phoneDigits = contact.phone.replace(/\D/g, '');
    if (!contact.name || !/^\+?[\d\s().-]+$/.test(contact.phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      error.textContent = 'Please enter your name and a valid phone number, including the country code.';
      error.hidden = false;
      return;
    }
    const params = new URLSearchParams(location.search);
    const attribution = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].map(key => [key, (params.get(key) || '').slice(0, 250)]));
    error.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving your request…';
    try {
      const response = await fetch('/api/free-software-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contact, attribution, consent: true, website: fields.get('website') }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success !== true) throw new Error(data?.error || 'We could not save your details. Please try again.');
      try { sessionStorage.setItem(storageKey, JSON.stringify({ contact, savedAt: Date.now() })); } catch { /* Private browsing may disable storage. */ }
      // No contact details are sent to analytics. This hook works with an existing tag manager.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'free_software_lead', offer: 'growth-stack' });
      showSetup(contact);
    } catch (failure) {
      error.textContent = failure.name === 'TimeoutError' || failure.name === 'TypeError'
        ? 'The connection was interrupted. Please try again; your details are still in the form.' : failure.message;
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.innerHTML = 'Unlock my free growth stack <span aria-hidden="true">↗</span>';
    }
  });
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    if (stored?.savedAt > Date.now() - 86400000 && ['name', 'email', 'phone'].every(key => typeof stored.contact?.[key] === 'string' && stored.contact[key].trim())) showSetup(stored.contact, false);
  } catch { /* A fresh form is usable without browser storage. */ }
})();
