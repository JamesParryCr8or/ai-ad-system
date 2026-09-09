import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './calendar-widget.css';

const DAY_MS = 86400000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const sameMonth = (a, b) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
const formatTime = (iso, timezone) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
const formatLongDate = (iso, timezone) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date(iso));

function Icon({ name }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function CalendarWidget({ calendarId = 'vgGPyGGNGNmBGXwGNDHM', variant = 'ads' }) {
  const isAppCalendar = variant === 'app';
  const calendarTitle = isAppCalendar ? 'CR8OR AI — App Exploration Call' : 'CR8OR AI — Exploration Call';
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [step, setStep] = useState('calendar');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [booking, setBooking] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', notes: '', consent: false });
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London', []);

  useEffect(() => {
    const controller = new AbortController();
    const rangeStart = new Date(Math.max(today.getTime(), month.getTime()));
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const rangeEnd = new Date(Math.min(monthEnd.getTime(), rangeStart.getTime() + 31 * DAY_MS));
    setLoading(true);
    setLoadError('');
    fetch(`/api/ghl-availability?startDate=${rangeStart.getTime()}&endDate=${rangeEnd.getTime()}&timezone=${encodeURIComponent(timezone)}&calendarId=${encodeURIComponent(calendarId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load availability.');
        setSlots(data.slots || {});
      })
      .catch((error) => { if (error.name !== 'AbortError') setLoadError(error.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [month, timezone, today, calendarId]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(index - offset + 1);
      return date;
    });
  }, [month]);

  const chooseDate = (date) => {
    const key = dateKey(date);
    if (!slots[key]?.length) return;
    setSelectedDate(key);
    setSelectedSlot('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/ghl-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, startTime: selectedSlot, timezone, calendarId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not complete the booking.');
      setBooking(data);
      setStep('success');
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadCalendarInvite = () => {
    const start = booking?.startTime || selectedSlot;
    const end = booking?.endTime || new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
    const toIcsDate = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const escapeIcs = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
    const uid = `${booking?.appointmentId || Date.now()}@scale.cr8or.ai`;
    const meetingLocation = booking?.meetingUrl || 'Google Meet — link sent by email';
    const description = booking?.meetingUrl
      ? `Your ${calendarTitle}. Join Google Meet: ${booking.meetingUrl}`
      : `Your ${calendarTitle}. Your Google Meet link has been sent by email.`;
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CR8OR AI//Exploration Call//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${escapeIcs(uid)}`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      'STATUS:CONFIRMED',
      `SUMMARY:${escapeIcs(calendarTitle)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `LOCATION:${escapeIcs(meetingLocation)}`,
      'ORGANIZER;CN=James Parry:mailto:james@cr8or.co.uk',
      `ATTENDEE;CN=${escapeIcs(`${form.firstName} ${form.lastName}`)};RSVP=TRUE:mailto:${escapeIcs(form.email)}`,
      'URL:https://scale.cr8or.ai/',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = isAppCalendar
      ? 'cr8or-ai-app-exploration-call.ics'
      : 'cr8or-ai-exploration-call.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const availableDates = Object.keys(slots).length;
  const canGoBack = month > new Date(today.getFullYear(), today.getMonth(), 1);

  return <section className="cr8-calendar" aria-label="Book an exploration call">
    <div className="cr8-calendar__glow" />
    <aside className="cr8-calendar__intro">
      <div className="cr8-calendar__eyebrow"><span /> {isAppCalendar ? 'App strategy session' : 'Strategy session'}</div>
      <h3>{isAppCalendar ? <>Let’s map your<br/><em>app system.</em></> : <>Let’s map your<br/><em>growth system.</em></>}</h3>
      <p>{isAppCalendar ? 'A focused exploration call to shape your app, prioritise the right features and map the clearest route from idea to launch.' : 'A focused exploration call to find the gaps in your ads, creative and CRM—and show you the clearest route forward.'}</p>
      <div className="cr8-calendar__facts">
        <div><Icon name="clock"/><span><strong>30 minutes</strong>No drawn-out sales pitch</span></div>
        <div><Icon name="video"/><span><strong>Google Meet</strong>Link sent after booking</span></div>
        <div><Icon name="globe"/><span><strong>Your timezone</strong>{timezone.replaceAll('_', ' ')}</span></div>
      </div>
      <div className="cr8-calendar__host">
        <img src="/Landing%20Page/Headhot%20James%20Parry.png" alt="James Parry" />
        <span><strong>James Parry</strong>Founder, CR8OR AI</span>
      </div>
    </aside>

    <div className="cr8-calendar__panel">
      {step === 'calendar' && <>
        <div className="cr8-calendar__panel-head"><div><span>01</span><h4>Choose a time</h4></div><div className="cr8-calendar__live"><i /> Live availability</div></div>
        <div className="cr8-calendar__picker">
          <div className="cr8-calendar__month">
            <div className="cr8-calendar__month-nav">
              <button type="button" disabled={!canGoBack} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <strong>{MONTHS[month.getMonth()]} <span>{month.getFullYear()}</span></strong>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
            </div>
            <div className="cr8-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className={`cr8-calendar__days ${loading ? 'is-loading' : ''}`}>
              {days.map((date) => {
                const key = dateKey(date);
                const available = Boolean(slots[key]?.length);
                const disabled = date < today || !sameMonth(date, month) || !available;
                return <button type="button" key={key} disabled={disabled} className={`${selectedDate === key ? 'is-selected' : ''} ${available ? 'is-available' : ''}`} onClick={() => chooseDate(date)}><span>{date.getDate()}</span>{available && <i />}</button>;
              })}
            </div>
            {loadError && <div className="cr8-calendar__notice is-error">{loadError}<button type="button" onClick={() => setMonth(new Date(month))}>Try again</button></div>}
            {!loading && !loadError && !availableDates && <div className="cr8-calendar__notice">No remaining times this month. Try the next one.</div>}
          </div>
          <div className="cr8-calendar__times">
            <div className="cr8-calendar__times-title">{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Select a date'}<span>{selectedDate ? `${slots[selectedDate]?.length || 0} times available` : 'Available days are highlighted'}</span></div>
            <div className="cr8-calendar__time-list">
              {selectedDate ? slots[selectedDate].map((slot) => <button type="button" key={slot} className={selectedSlot === slot ? 'is-selected' : ''} onClick={() => setSelectedSlot(slot)}><span>{formatTime(slot, timezone)}</span><Icon name="arrow"/></button>) : <div className="cr8-calendar__empty"><Icon name="clock"/><span>Choose a highlighted date to see available times.</span></div>}
            </div>
            <button type="button" className="cr8-calendar__continue" disabled={!selectedSlot} onClick={() => setStep('details')}>Continue <Icon name="arrow"/></button>
          </div>
        </div>
      </>}

      {step === 'details' && <form className="cr8-calendar__details" onSubmit={submit}>
        <button type="button" className="cr8-calendar__back" onClick={() => setStep('calendar')}>‹ Back to times</button>
        <div className="cr8-calendar__panel-head"><div><span>02</span><h4>Your details</h4></div></div>
        <div className="cr8-calendar__selection"><Icon name="check"/><span><strong>{formatLongDate(selectedSlot, timezone)} at {formatTime(selectedSlot, timezone)}</strong>30 minutes · Google Meet</span></div>
        <div className="cr8-calendar__fields">
          <label><span>First name</span><input required autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}/></label>
          <label><span>Last name</span><input required autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}/></label>
          <label><span>Phone</span><input required type="tel" autoComplete="tel" placeholder="+44 7400 123456" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></label>
          <label><span>Email</span><input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label>
          <label className="is-wide"><span>Anything we should know? <small>Optional</small></span><textarea rows="3" placeholder="Tell us a little about your current setup…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
        </div>
        <label className="cr8-calendar__consent"><input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })}/><i><Icon name="check"/></i><span>I confirm that I want to receive content from CR8OR AI using the contact information I provide.</span></label>
        {submitError && <div className="cr8-calendar__form-error">{submitError}</div>}
        <button className="cr8-calendar__book" disabled={submitting}>{submitting ? <><i/> Securing your time…</> : <>Schedule exploration call <Icon name="arrow"/></>}</button>
        <p className="cr8-calendar__privacy">Your information is kept private and never sold.</p>
      </form>}

      {step === 'success' && <div className="cr8-calendar__success">
        <div className="cr8-calendar__success-mark"><Icon name="check"/></div><span>Booking confirmed</span>
        <h4>You’re in. Let’s build<br/>something remarkable.</h4>
        <p>Your invite and Google Meet link are on their way to <strong>{form.email}</strong>.</p>
        <div className="cr8-calendar__selection"><Icon name="check"/><span><strong>{formatLongDate(booking?.startTime || selectedSlot, timezone)} at {formatTime(booking?.startTime || selectedSlot, timezone)}</strong>30 minutes · Google Meet</span></div>
        <button type="button" className="cr8-calendar__ical" onClick={downloadCalendarInvite}><Icon name="calendar"/><span><strong>Add to calendar</strong>Download .ics file</span><Icon name="arrow"/></button>
      </div>}
    </div>
  </section>;
}

const root = document.getElementById('ghl-calendar-root');
if (root) createRoot(root).render(<CalendarWidget calendarId={root.dataset.calendarId} variant={root.dataset.variant} />);
