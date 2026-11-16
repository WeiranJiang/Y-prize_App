import assert from 'node:assert/strict';
import test from 'node:test';
import { careDemoReply, CARE_DEMO_NOTICE } from '../src/domain/careMessaging';

test('care preview discloses automated replies and no clinician delivery', () => {
  assert.match(CARE_DEMO_NOTICE, /not sent to a clinician/);
  assert.match(careDemoReply('Are you my dentist?')!.text, /no real dentist or clinic is connected/);
});
test('administrative requests cannot appear to reach a practice', () => {
  for (const message of ['Book an appointment', 'Refill my prescription', 'Call me']) {
    assert.match(careDemoReply(message)!.text, /nothing has been sent or booked/);
  }
});
test('symptoms continue through the existing safety guidance', () => {
  assert.equal(careDemoReply('Book a visit: swelling and trouble breathing'), undefined);
  assert.equal(careDemoReply('My gums are bleeding'), undefined);
  assert.equal(careDemoReply('Explain my pH reading'), undefined);
});
