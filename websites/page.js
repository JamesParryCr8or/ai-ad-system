const form = document.querySelector('#website-form');
const button = form.querySelector('button');
const error = document.querySelector('#form-error');
const stickyOrder = document.createElement('div');
stickyOrder.className = 'sticky-order';
stickyOrder.hidden = true;
stickyOrder.innerHTML = '<div class="sticky-order-inner wrap"><p><strong>Your bespoke website</strong><span>£49/month · Hosting included</span></p><a class="button primary" href="#access">Order your website now <span aria-hidden="true">→</span></a></div>';
document.body.append(stickyOrder);
document.body.classList.add('has-sticky-order');
const accessCard = document.querySelector('#access');
const updateStickyOrder = () => { stickyOrder.hidden = accessCard.getBoundingClientRect().bottom > 0; };
window.addEventListener('scroll', updateStickyOrder, { passive: true });
window.addEventListener('resize', updateStickyOrder);
updateStickyOrder();
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
