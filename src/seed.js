// Realistic sample data so the site looks complete on first run.
// PLACEHOLDER people — replace via the admin Guests page (or edit + re-seed).

import config from '../config/wedding.js';
import { emptyData, newId, newToken } from './store.js';

const ALL = config.events.map((e) => e.id);
const iso = (s) => new Date(s).toISOString();

const DAY1 = ['haldi', 'sagai', 'chaak', 'bhaat', 'sangeet'];
const DAY2 = ['baraat', 'reception'];
const HOTEL = 'Sample hotel'; // demo data only

const GUESTS = [
  { name: 'Mehta family', phone: '+919000000001', side: 'bride', groups: ['family', 'outstation'], events: ALL, maxGuests: 4, stay: { hotel: HOTEL, room: '214', checkIn: '1 Dec, 12 noon', checkOut: '4 Dec, 12 noon' }, transportNote: 'Sample note: your airport pickup is confirmed.' },
  { name: 'Kamla Devi ji', phone: '+919000000002', side: 'groom', groups: ['family', 'elders'], events: ALL, maxGuests: 1, stay: { hotel: HOTEL, room: '101 (ground floor)', checkIn: '1 Dec', checkOut: '4 Dec' }, lang: 'hi' },
  { name: 'Rohit & Ananya Sharma', phone: '+919000000003', side: 'groom', groups: ['friends', 'outstation'], events: ['sangeet', ...DAY2], maxGuests: 2, stay: { hotel: HOTEL, room: '305', checkIn: '2 Dec', checkOut: '4 Dec' } },
  { name: 'Dr. Verma & family', phone: '+919000000004', side: 'bride', groups: ['family'], events: ['haldi', 'sagai', ...DAY2], maxGuests: 3 },
  { name: 'Priya Nair', phone: '+919000000005', side: 'bride', groups: ['friends', 'colleagues', 'outstation'], events: ['sangeet', 'reception'], maxGuests: 1, stay: { hotel: HOTEL, room: '', checkIn: '2 Dec', checkOut: '4 Dec' } },
  { name: 'Agarwal family', phone: '+919000000006', side: 'groom', groups: ['friends'], events: ['reception'], maxGuests: 4 },
  { name: 'Vikram Singh', phone: '+919000000007', side: 'groom', groups: ['colleagues'], events: ['reception'], maxGuests: 2 },
  { name: 'Fatima & Imran Khan', phone: '+919000000008', side: 'bride', groups: ['friends'], events: ['sangeet', 'reception'], maxGuests: 2 },
  { name: 'Joshi family', phone: '+919000000009', side: 'both', groups: ['family', 'outstation', 'vip'], events: ALL, maxGuests: 5, stay: { hotel: HOTEL, room: '220 & 221', checkIn: '1 Dec', checkOut: '4 Dec' } },
  { name: 'Neha', phone: '+919000000010', side: 'bride', groups: ['family'], events: ALL, maxGuests: 1, stay: { hotel: HOTEL, room: '218', checkIn: '1 Dec', checkOut: '4 Dec' } },
  { name: 'Arjun', phone: '+919000000011', side: 'groom', groups: ['friends', 'outstation'], events: [...DAY1, ...DAY2], maxGuests: 1, stay: { hotel: HOTEL, room: '301', checkIn: '1 Dec', checkOut: '4 Dec' } },
  { name: 'Gupta uncle & aunty', phone: '+919000000012', side: 'groom', groups: ['elders'], events: DAY2, maxGuests: 2, lang: 'hi' },
];

export async function seed(store) {
  const d = emptyData();
  const created = iso('2026-10-20T10:00:00+05:30');
  d.guests = GUESTS.map((g) => ({ id: newId('g'), token: newToken(10), checkinCode: newToken(8), stay: null, transportNote: '', notes: '', lang: '', createdAt: created, ...g }));
  d.announcements = [
    { id: newId('a'), title: { en: 'Welcome to our wedding website!', hi: 'हमारी शादी की वेबसाइट पर स्वागत है!' }, body: { en: 'Everything you need, from timings and the venue to the dress code, is here. See you in Indore!', hi: 'समय, स्थल और परिधान — सब कुछ यहाँ है। इंदौर में मिलते हैं!' }, audience: { type: 'public', values: [] }, startsAt: null, endsAt: '2026-12-04T00:00:00.000Z', pinned: false, createdAt: iso('2026-11-01T09:00:00+05:30') },
    { id: newId('a'), title: { en: 'Travelling in?', hi: 'बाहर से आ रहे हैं?' }, body: { en: 'Sample announcement for out-of-town guests: please WhatsApp your arrival details to the family.', hi: 'बाहर से आने वाले मेहमानों के लिए नमूना सूचना: कृपया अपने आगमन की जानकारी परिवार को WhatsApp करें।' }, audience: { type: 'groups', values: ['outstation'] }, startsAt: null, endsAt: null, pinned: true, createdAt: iso('2026-11-08T10:00:00+05:30') },
  ];

  await store.replace(d);
  store.flush();
  return d;
}
