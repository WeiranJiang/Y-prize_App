import type { Reply } from './assistant';

export const CARE_DEMO_NOTICE = 'Demo only · automated replies. Messages are not sent to a clinician.';
export const CARE_STARTERS = [
  { label: 'Discuss a reading', text: 'Could you help me understand the readings from my latest scan?' },
  { label: 'Retainer care', text: 'How should I clean and care for my retainer?' },
  { label: 'Before a visit', text: 'What should I bring up at my next dental appointment?' },
];

/** Administrative actions must never masquerade as real bookings, prescriptions or clinic contact. */
export function careDemoReply(message: string): Reply | undefined {
  const text = message.toLowerCase();
  // Preserve urgent/symptom guidance from the existing clinical-safety rules.
  if (/pain|toothache|bleed|swoll|swelling|fever|breathing|swallowing|broken|chipped/.test(text)) return undefined;
  if (/who are you|are you (a |my |the )?(doctor|dentist)|real (doctor|dentist)|is (this|anyone) (a |my )?(real|live)|are.*replies.*automated/.test(text)) {
    return { text: 'This is a demo of messaging your dental care team. Replies are automated; no real dentist or clinic is connected.' };
  }
  if (/\b(book|schedule|reschedule|cancel)\b.*\b(appointment|visit)|\b(prescription|prescribe|refill|insurance|billing)\b|\b(call|phone) me\b/.test(text)) {
    return { text: 'This preview can’t book visits, request prescriptions or contact a practice. Please contact your actual dental practice for that request; nothing has been sent or booked here.' };
  }
  return undefined;
}
