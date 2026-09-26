const form = document.querySelector('#website-form');
const button = form.querySelector('button');
const error = document.querySelector('#form-error');
let requestId = crypto.randomUUID();
if (new URLSearchParams(location.search).get('checkout') === 'cancelled') {
  error.textContent = 'Checkout was cancelled. You can enter your details again whenever you’re ready.';
  error.hidden = false;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = 'Opening secure checkout…';
  error.hidden = true;
  try {
    const details = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/website-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, consent: true, requestId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Checkout could not open. Please try again.');
    if (!data.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Checkout could not open. Please try again.');
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'website_checkout_started', currency: 'GBP', value: 49 });
    location.assign(data.url);
  } catch (e) {
    error.textContent = e.message || 'Please try again shortly.';
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Continue to checkout →';
  }
});
