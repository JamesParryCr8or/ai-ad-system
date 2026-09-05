(function () {
  const STORAGE_KEY = 'cr8or40AdsFunnel';
  const UTM_KEY = 'cr8or40AdsUtm';
  const qs = new URLSearchParams(window.location.search);

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function order() {
    return read(STORAGE_KEY, {
      orderNumber: 'CR8-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      customer: {},
      selections: { corePack: true, strategyReport: false, campaignSetup: false, creatorAi: false, optimisation: false },
      brief: {},
      briefComplete: false,
      purchases: [],
      createdAt: new Date().toISOString()
    });
  }

  function saveOrder(patch) {
    const current = order();
    const next = Object.assign({}, current, patch);
    next.customer = Object.assign({}, current.customer, patch.customer || {});
    next.selections = Object.assign({}, current.selections, patch.selections || {});
    next.brief = Object.assign({}, current.brief, patch.brief || {});
    write(STORAGE_KEY, next);
    return next;
  }

  function captureUtm() {
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    const found = read(UTM_KEY, {});
    keys.forEach((key) => { if (qs.get(key)) found[key] = qs.get(key); });
    if (Object.keys(found).length) write(UTM_KEY, found);
    return found;
  }

  function appendUtm(url) {
    const stored = captureUtm();
    const target = new URL(url, window.location.origin);
    Object.keys(stored).forEach((key) => target.searchParams.set(key, stored[key]));
    return target.pathname + target.search + target.hash;
  }

  function track(name, data) {
    const payload = Object.assign({ funnel: '40-product-ads', event: name }, data || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    if (typeof fbq === 'function') {
      const metaMap = {
        ViewContent: 'ViewContent',
        InitiateCheckout: 'InitiateCheckout',
        Purchase: 'Purchase',
        Lead: 'Lead'
      };
      fbq('track', metaMap[name] || 'CustomEvent', payload);
    }
    document.dispatchEvent(new CustomEvent('cr8or:funnel-event', { detail: payload }));
  }

  async function postWebhook(type, payload) {
    try {
      await fetch('/api/40-ads-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, order: order(), utm: read(UTM_KEY, {}), payload: payload || {} })
      });
    } catch (_) {}
  }

  function decorateLinks() {
    document.querySelectorAll('[data-preserve-utm]').forEach((el) => {
      el.setAttribute('href', appendUtm(el.getAttribute('href')));
    });
  }

  function initReveals() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((item) => io.observe(item));
  }

  function bindCheckout() {
    const form = document.querySelector('[data-checkout-form]');
    if (!form) return;
    const bump = document.querySelector('[name="strategyReport"]');
    const errorBox = document.querySelector('[data-checkout-error]');
    const paymentHelp = document.querySelector('[data-payment-help]');
    const paymentTotal = document.querySelector('[data-payment-total]');
    let stripe = null;
    let elements = null;
    let paymentIntentId = '';
    let paymentReady = false;
    let loadedTotal = 0;

    function showError(message) {
      if (!errorBox) {
        alert(message);
        return;
      }
      errorBox.textContent = message;
      errorBox.classList.add('visible');
    }

    function clearError() {
      if (errorBox) errorBox.classList.remove('visible');
    }

    function currentTotal() {
      return bump && bump.checked ? 46 : 27;
    }

    function updateTotalLabel() {
      if (paymentTotal) paymentTotal.textContent = '£' + currentTotal() + ' today';
    }

    function clearCheckoutFields() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name || el.type === 'checkbox') return;
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
    }

    async function loadPaymentElement(data, strategyReport) {
      const total = strategyReport ? 46 : 27;
      const res = await fetch('/api/40-ads-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: data, strategyReport, utm: read(UTM_KEY, {}) })
      });
      const json = await res.json();
      if (!res.ok || !json.client_secret) throw new Error(json.error || 'Unable to start checkout');
      if (!json.publishable_key) throw new Error('Stripe publishable key not configured on server');

      stripe = Stripe(json.publishable_key);
      elements = stripe.elements({
        clientSecret: json.client_secret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#8B5CF6',
            colorBackground: '#13102B',
            colorText: '#F1EEFF',
            colorTextSecondary: '#A5A0C0',
            colorDanger: '#FB7185',
            fontFamily: 'Outfit, Inter, system-ui, sans-serif',
            borderRadius: '8px',
            spacingUnit: '5px'
          }
        }
      });
      const mount = document.getElementById('payment-element');
      mount.innerHTML = '';
      elements.create('payment', { layout: 'tabs' }).mount('#payment-element');
      paymentIntentId = json.payment_intent_id;
      paymentReady = true;
      loadedTotal = total;
      if (paymentHelp) paymentHelp.textContent = 'Enter your card details securely here. Your payment method is saved for optional one-click upsells in the next steps.';
    }

    track('InitiateCheckout', { currency: 'GBP', value: 27 });
    clearCheckoutFields();
    window.setTimeout(clearCheckoutFields, 250);
    updateTotalLabel();
    if (bump) {
      bump.addEventListener('change', () => {
        updateTotalLabel();
        if (paymentReady && loadedTotal !== currentTotal()) {
          paymentReady = false;
          paymentIntentId = '';
          const mount = document.getElementById('payment-element');
          if (mount) mount.innerHTML = '';
          const btn = form.querySelector('button[type="submit"]');
          if (btn) btn.textContent = 'Continue to Payment';
          if (paymentHelp) paymentHelp.textContent = 'Your order total changed. Continue again to reload the secure payment form.';
        }
      });
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();
      const data = Object.fromEntries(new FormData(form).entries());
      const strategyReport = !!(bump && bump.checked);
      const total = strategyReport ? 46 : 27;
      saveOrder({ customer: data, selections: { strategyReport }, totalPaid: total });
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (!paymentReady || loadedTotal !== total) {
          btn.textContent = 'Loading secure payment...';
          if (strategyReport) track('OrderBumpAccepted', { currency: 'GBP', value: 19 });
          await postWebhook('abandoned_or_started_checkout', { customer: data, strategyReport });
          await loadPaymentElement(data, strategyReport);
          btn.disabled = false;
          btn.textContent = 'Pay £' + total + ' Securely';
          return;
        }

        btn.textContent = 'Processing...';
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.origin + appendUtm('/40-ads/campaign-setup/?payment_intent=' + encodeURIComponent(paymentIntentId)) },
          redirect: 'if_required'
        });
        if (error) throw new Error(error.message || 'Payment failed. Please try again.');
        if (!paymentIntent || paymentIntent.status !== 'succeeded') throw new Error('Payment was not completed.');
        saveOrder({ paymentIntentId: paymentIntent.id, totalPaid: total });
        track('Purchase', { currency: 'GBP', value: total, payment_intent: paymentIntent.id });
        await postWebhook('purchase_completed', { customer: data, strategyReport, payment_intent: paymentIntent.id });
        window.location.href = appendUtm('/40-ads/campaign-setup/?payment_intent=' + encodeURIComponent(paymentIntent.id));
      } catch (error) {
        btn.disabled = false;
        btn.textContent = paymentReady ? 'Pay £' + total + ' Securely' : 'Continue to Payment';
        showError(error.message);
      }
    });
  }

  function bindUpsell() {
    const accept = document.querySelector('[data-upsell-accept]');
    const decline = document.querySelector('[data-upsell-decline]');
    const agreement = document.querySelector('[data-renewal-agreement]');
    if (!accept && !decline) return;
    const offer = accept ? accept.dataset.upsellAccept : decline.dataset.upsellDecline;
    const values = { campaignSetup: 199, creatorAi: 197, optimisation: 399 };
    track('UpsellViewed', { offer, value: values[offer], currency: 'GBP' });
    if (agreement) {
      agreement.addEventListener('change', () => { accept.disabled = !agreement.checked; });
      accept.disabled = !agreement.checked;
    }
    if (accept) {
      accept.addEventListener('click', async () => {
        const next = accept.dataset.next || '/40-ads/brief/';
        accept.disabled = true;
        accept.textContent = 'Adding securely...';
        saveOrder({ selections: { [offer]: true } });
        track('UpsellAccepted', { offer, value: values[offer], currency: 'GBP' });
        await postWebhook('upsell_accepted', { offer });
        try {
          const res = await fetch('/api/40-ads-upsell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offer, session_id: qs.get('session_id'), payment_intent_id: qs.get('payment_intent') || order().paymentIntentId, order: order() })
          });
          const json = await res.json();
          if (json.url) window.location.href = json.url;
          else window.location.href = appendUtm(next);
        } catch (_) {
          window.location.href = appendUtm(next);
        }
      });
    }
    if (decline) {
      decline.addEventListener('click', async (event) => {
        event.preventDefault();
        const next = decline.getAttribute('href');
        track('UpsellDeclined', { offer, currency: 'GBP' });
        await postWebhook('upsell_declined', { offer });
        window.location.href = appendUtm(next);
      });
    }
  }

  function bindBrief() {
    const form = document.querySelector('[data-brief-form]');
    if (!form) return;
    let step = Number(localStorage.getItem('cr8orBriefStep') || '1');
    const steps = Array.from(document.querySelectorAll('.brief-step'));
    const progress = document.querySelector('.bar span');
    const stepLabel = document.querySelector('[data-step-label]');
    const summary = document.querySelector('[data-brief-summary]');

    function fill() {
      const saved = order().brief;
      Array.from(form.elements).forEach((el) => {
        if (!el.name || el.type === 'file') return;
        if (saved[el.name]) el.value = saved[el.name];
      });
    }

    function persist() {
      const data = Object.fromEntries(new FormData(form).entries());
      saveOrder({ brief: data });
      postWebhook('brief_saved', data);
    }

    function render() {
      steps.forEach((el, index) => el.classList.toggle('active', index + 1 === step));
      if (progress) progress.style.width = (step / steps.length * 100) + '%';
      if (stepLabel) stepLabel.textContent = 'Step ' + step + ' of ' + steps.length;
      if (summary) {
        const data = Object.fromEntries(new FormData(form).entries());
        summary.innerHTML = ['businessName', 'productName', 'productUrl', 'platform', 'targetCountries']
          .map((key) => '<div><strong>' + key.replace(/[A-Z]/g, ' $&') + ':</strong> ' + (data[key] || 'Not supplied yet') + '</div>')
          .join('');
      }
      localStorage.setItem('cr8orBriefStep', String(step));
    }

    fill();
    render();
    form.addEventListener('input', persist);
    document.querySelectorAll('[data-next-step]').forEach((btn) => btn.addEventListener('click', () => { persist(); step = Math.min(steps.length, step + 1); render(); window.scrollTo(0, 0); }));
    document.querySelectorAll('[data-prev-step]').forEach((btn) => btn.addEventListener('click', () => { step = Math.max(1, step - 1); render(); window.scrollTo(0, 0); }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      persist();
      saveOrder({ briefComplete: true });
      track('BriefCompleted', {});
      await postWebhook('brief_completed', order().brief);
      window.location.href = appendUtm('/40-ads/complete/');
    });
    track('BriefStarted', {});
  }

  function renderComplete() {
    const root = document.querySelector('[data-complete]');
    if (!root) return;
    const current = order();
    const services = [
      ['40 Product Ad Variations', true],
      ['Creative Strategy Report', current.selections.strategyReport],
      ['Meta Campaign Launch', current.selections.campaignSetup],
      ['Creator AI Annual Access', current.selections.creatorAi],
      ['30-Day Optimisation Sprint', current.selections.optimisation]
    ].filter((item) => item[1]).map((item) => item[0]);
    root.querySelector('[data-order-number]').textContent = current.orderNumber;
    root.querySelector('[data-services]').textContent = services.join(', ');
    root.querySelector('[data-total-paid]').textContent = '£' + (current.totalPaid || 27);
    root.querySelector('[data-brief-status]').textContent = current.briefComplete ? 'Complete' : 'Incomplete';
    root.querySelector('[data-next-action]').textContent = current.briefComplete ? 'We will review your submission and contact you if anything essential is missing.' : 'Complete your creative brief so delivery can begin.';
  }

  function bindGrowth() {
    const form = document.querySelector('[data-growth-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      track('GrowthAssessmentApplied', data);
      await postWebhook('growth_assessment_applied', data);
      form.innerHTML = '<div class="formula">Application received. We will review fit before inviting a strategy call.</div>';
    });
  }

  window.CR8OR40 = { order, saveOrder, track, postWebhook, appendUtm };
  captureUtm();
  decorateLinks();
  initReveals();
  bindCheckout();
  bindUpsell();
  bindBrief();
  renderComplete();
  bindGrowth();
  track('ViewContent', { path: window.location.pathname });
})();
