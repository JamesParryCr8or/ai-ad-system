import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
fs.mkdirSync('.tmp',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto('http://127.0.0.1:4173/websites/');
 assert.equal(await page.locator('.website-tile').count(),9);
 await page.screenshot({path:'.tmp/websites-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'.tmp/websites-mobile.png',fullPage:true});
 await page.route('**/api/website-checkout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Your details are saved, but checkout could not open. Please try again.'})}));
 await page.locator('#name').fill('Test Person');await page.locator('#email').fill('person@example.test');await page.locator('#phone').fill('+44 7700 900123');
 await page.locator('button[type=submit]').click();await page.locator('#form-error').waitFor({state:'visible'});assert.equal(await page.locator('button[type=submit]').isEnabled(),true);
 await page.unroute('**/api/website-checkout');
 let captured;await page.route('**/api/website-checkout',async route=>{captured=route.request().postDataJSON();await route.fulfill({contentType:'application/json',body:JSON.stringify({url:'https://checkout.stripe.com/c/pay/test'})})});
 await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Mock Stripe checkout</h1>'}));
 await page.locator('button[type=submit]').click();await page.waitForURL('https://checkout.stripe.com/**');assert.equal(captured.email,'person@example.test');assert.equal(captured.consent,true);
 await page.route('**/api/website-checkout?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({paid:false})}));
 await page.goto('http://127.0.0.1:4173/websites/thanks.html?session_id=cs_test_abcdefghijklmnopqrstuvwxyz');await page.getByText('Your payment isn’t confirmed yet.').waitFor();assert.equal(await page.locator('#next-steps').isVisible(),false);
 await page.unroute('**/api/website-checkout?*');await page.route('**/api/website-checkout?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({paid:true,reference:'cs_test_verified'})}));await page.reload();await page.getByText('You’re in. Let’s build your website.').waitFor();assert.equal(await page.locator('#next-steps').isVisible(),true);
 console.log('Passed: desktop/mobile layout, nine case studies, error/retry, Stripe redirect, paid/unpaid confirmation. No real leads or payments created.');
}finally{await browser.close()}
