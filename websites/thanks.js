const title = document.querySelector('#order-title');
const message = document.querySelector('#order-message');
const id = new URLSearchParams(location.search).get('session_id');
const calendarRoot = document.querySelector('#website-calendar');
const calendarStatus = document.querySelector('#calendar-status');
const calendarRetry = document.querySelector('#calendar-retry');

function loadCalendar() {
  calendarRetry.hidden = true;
  calendarStatus.hidden = false;
  calendarStatus.textContent = 'Loading available times…';
  const script = document.createElement('script');
  script.src = '/assets/calendar-widget.js';
  script.onload = () => { calendarStatus.hidden = true; };
  script.onerror = () => {
    script.remove();
    calendarStatus.textContent = 'The calendar could not load. Please try again or email James to arrange your call.';
    calendarRetry.hidden = false;
  };
  document.body.appendChild(script);
}

async function verify() {
  if (!id) { title.textContent = 'No order reference found.'; message.textContent = 'Please return using the confirmation link from checkout, or contact us for help.'; return; }
  try {
    const response = await fetch('/api/website-checkout?session_id=' + encodeURIComponent(id), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (!result.paid) { title.textContent = 'Your payment isn’t confirmed yet.'; message.textContent = 'If you just paid, please refresh in a moment. Contact us before attempting a second payment.'; return; }
    title.textContent = 'Thanks for your purchase.';
    message.textContent = 'Your £49/month website subscription is confirmed. Book your one-hour exploration call with James to plan exactly what your new site needs.';
    const name = String(result.contact?.name || '').trim().split(/\s+/);
    calendarRoot.dataset.firstName = name.shift() || '';
    calendarRoot.dataset.lastName = name.join(' ');
    calendarRoot.dataset.email = result.contact?.email || '';
    calendarRoot.dataset.phone = result.contact?.phone || '';
    document.querySelector('.order').classList.add('is-confirmed');
    document.querySelector('#next-steps').hidden = false;
    document.querySelector('#reference').textContent = 'Order reference: ' + result.reference;
    loadCalendar();
  } catch (error) {
    title.textContent = 'We’re still checking your order.';
    message.textContent = error.message || 'Please refresh shortly or contact us before paying again.';
  }
}

calendarRetry.addEventListener('click', loadCalendar);
verify();
