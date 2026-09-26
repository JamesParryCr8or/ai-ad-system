import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

const browser=await chromium.launch({headless:true});
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Europe/London'});
  const page=await context.newPage();
  let failCapture=true, leadRequests=0, availabilityRequests=0, bookingBody;
  const slotDate=new Date(Date.now()+86400000);slotDate.setUTCHours(12,0,0,0);const slot=slotDate.toISOString();
  await page.route('**/api/free-software-lead',async route=>{
    leadRequests++;
    const body=route.request().postDataJSON();
    expect(body.attribution.utm_source).toBe('meta');expect(body.consent).toBe(true);
    await route.fulfill({status:failCapture?503:200,contentType:'application/json',body:JSON.stringify(failCapture?{error:'Please retry your request.'}:{success:true})});
  });
  await page.route('**/api/ghl-availability?**',async route=>{
    availabilityRequests++;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({slots:{[slot.slice(0,10)]:[slot]}})});
  });
  await page.route('**/api/ghl-book',async route=>{
    bookingBody=route.request().postDataJSON();
    await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,appointmentId:'mock-only',startTime:slot})});
  });
  await page.goto(`${base}/free-software/?utm_source=meta&utm_campaign=preview`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('#setup')).toBeHidden();expect(availabilityRequests).toBe(0);
  await expect(page.locator('#access-form input:not([name="website"])')).toHaveCount(3);
  await expect(page.locator('video')).toHaveAttribute('src',/1787055241021_Marketing_Fiverr_1\.mp4/);
  await page.screenshot({path:path.join(os.tmpdir(),'free-software-desktop.png')});
  await page.locator('.stack-section').scrollIntoViewIfNeeded();
  await page.locator('.tool-card:last-child').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.tools-grid img').evaluateAll(imgs=>imgs.every(img=>img.complete && img.naturalWidth>0))).toBe(true);
  await page.locator('.stack-section').screenshot({path:path.join(os.tmpdir(),'free-software-stack.png')});
  await page.locator('#lead-name').fill('Taylor Example');await page.locator('#lead-email').fill('taylor@example.test');await page.locator('#lead-phone').fill('+44 7700 900123');
  await page.locator('#claim-button').click();await expect(page.locator('#form-error')).toContainText('Please retry');
  await expect(page.locator('#setup')).toBeHidden();expect(availabilityRequests).toBe(0);
  failCapture=false;await page.locator('#claim-button').click();
  await expect(page.locator('#setup')).toBeVisible();await expect(page.locator('.cr8-calendar')).toBeVisible();
  if(slotDate.getMonth() !== new Date().getMonth()) await page.getByRole('button',{name:'Next month'}).click();
  await page.locator('.cr8-calendar__days .is-available').first().click();
  await page.locator('.cr8-calendar__time-list button').first().click();await page.locator('.cr8-calendar__continue').click();
  await expect(page.getByLabel('First name',{exact:true})).toHaveValue('Taylor');
  await expect(page.getByLabel('Last name',{exact:true})).toHaveValue('Example');
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue('taylor@example.test');
  await expect(page.getByLabel('Phone',{exact:true})).toHaveValue('+44 7700 900123');
  await page.getByRole('button',{name:'Book my setup session'}).click();await expect(page.locator('.cr8-calendar__success')).toBeVisible();
  expect(bookingBody.bookingPurpose).toBe('free-software');expect(leadRequests).toBe(2);
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#setup')).toBeVisible();expect(leadRequests).toBe(2);
  // A fresh visitor still sees only the opt-in on mobile.
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  await mobile.goto(`${base}/free-software/`,{waitUntil:'domcontentloaded'});await mobile.evaluate(()=>document.fonts.ready);
  await expect(mobile.locator('#setup')).toBeHidden();
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mobile.screenshot({path:path.join(os.tmpdir(),'free-software-mobile.png')});
  await mobile.locator('#access').screenshot({path:path.join(os.tmpdir(),'free-software-mobile-form.png')});
  await mobile.route('**/api/free-software-lead',route=>route.fulfill({contentType:'application/json',body:'{"success":true}'}));
  await mobile.route('**/api/ghl-availability?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({slots:{[slot.slice(0,10)]:[slot]}})}));
  await mobile.locator('#lead-name').fill('Taylor Example');await mobile.locator('#lead-email').fill('taylor@example.test');await mobile.locator('#lead-phone').fill('+44 7700 900123');
  await mobile.locator('#claim-button').click();await expect(mobile.locator('.cr8-calendar')).toBeVisible();
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Existing homepage calendars keep their original copy and do not inherit opt-in details.
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const originalCalendar=page.locator('.cr8-calendar').first();
  if(slotDate.getMonth() !== new Date().getMonth()) await originalCalendar.getByRole('button',{name:'Next month'}).click();
  await originalCalendar.locator('.cr8-calendar__days .is-available').first().click();
  await originalCalendar.locator('.cr8-calendar__time-list button').first().click();await originalCalendar.locator('.cr8-calendar__continue').click();
  await expect(originalCalendar.getByLabel('First name',{exact:true})).toHaveValue('');
  await expect(originalCalendar.getByRole('button',{name:'Schedule exploration call'})).toBeVisible();
  console.log('PASS: form failure and retry, saved lead gate, campaign attribution, calendar prefill, simulated booking, reload and mobile layout. No live leads or appointments created.');
  console.log('Screenshots saved in '+os.tmpdir());
} finally { await browser.close(); }
