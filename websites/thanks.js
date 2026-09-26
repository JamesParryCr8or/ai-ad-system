const title = document.querySelector('#order-title');
const message = document.querySelector('#order-message');
const id = new URLSearchParams(location.search).get('session_id');
async function verify() {
  if (!id) { title.textContent = 'No order reference found.'; message.textContent = 'Please return using the confirmation link from checkout, or contact us for help.'; return; }
  try {
    const response = await fetch('/api/website-checkout?session_id=' + encodeURIComponent(id));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (!result.paid) { title.textContent = 'Your payment isn’t confirmed yet.'; message.textContent = 'If you just paid, please refresh in a moment. Contact us before attempting a second payment.'; return; }
    title.textContent = 'You’re in. Let’s build your website.';
    message.textContent = 'Payment confirmed. Your £49/month website subscription has started.';
    document.querySelector('#next-steps').hidden = false;
    document.querySelector('#reference').textContent = 'Order reference: ' + result.reference;
  } catch (e) { title.textContent = 'We’re still checking your order.'; message.textContent = e.message || 'Please refresh shortly or contact us before paying again.'; }
}
verify();
