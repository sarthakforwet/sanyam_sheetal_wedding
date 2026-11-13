// Events & programme, dress code / outfit planner, travel & stay.

import { html } from '../../lib/html.js';
import { layout } from '../layout.js';
import { icon } from '../motifs.js';
import { pageHead, eventCard, eventStyle, moodBoard, contactsCard } from '../components.js';
import { fmtDate, fmtShortDate, fmtTime } from '../../lib/time.js';
import { programme, dressFor } from '../../lib/visibility.js';

// Cream "programme card" with lace edges: time | function, day by day
export function programmeCard(c, events, { link = false } = {}) {
  const { t, tr, lang, config } = c;
  const days = programme(config, events);
  if (!days.length) return '';
  return html`
<section class="paper" aria-labelledby="prog-h">
  <div class="lace top" aria-hidden="true"></div>
  <div class="paper-inner">
    <h2 class="sec-title" id="prog-h">${t('programme_title')}</h2>
    ${days.map((d) => html`
    <div class="day">
      <p class="day-h">${fmtDate(`${d.date}T12:00:00+05:30`, lang)}</p>
      <ol class="tl">
        ${d.items.map((it) => {
          const [time, ampm] = fmtTime(it.time, 'en').split(' ');
          return html`<li ${it.event ? eventStyle(it.event) : ''}>
            <div class="t">${lang === 'hi' ? fmtTime(it.time, 'hi') : time}${lang === 'hi' ? '' : html`<small>${ampm.toUpperCase()}</small>`}</div>
            <div class="ev">${it.event ? html`<a href="${link ? '/events' : ''}#ev-${it.event.id}"><b>${tr(it.name)}</b></a>` : html`<b>${tr(it.name)}</b>`}${it.tagline ? html`<span>${tr(it.tagline)}</span>` : ''}</div>
          </li>`;
        })}
      </ol>
    </div>`)}
    ${link ? html`<p class="center prog-more"><a class="btn btn-line" href="/events">${t('all_events')} →</a></p>` : ''}
  </div>
  <div class="lace bot" aria-hidden="true"></div>
</section>`;
}

export function eventsPage(c, { events }) {
  const { t } = c;
  const body = html`
<div class="container">
  ${pageHead(t('all_events'))}
</div>
${programmeCard(c, events)}
<div class="container">
  <div class="event-list">${events.map((ev) => eventCard(c, ev))}</div>
  ${events.length > 1 ? html`<p class="center"><a class="btn btn-ghost" href="/cal/all.ics" download>${icon('calendar')}<span>${t('add_all_calendar')}</span></a></p>` : ''}
</div>`;
  return layout(c, { body, page: 'events', title: t('nav_events') });
}

function packingItems(c, ev) {
  const { t, tr, config } = c;
  const dress = dressFor(config, ev);
  return [
    { id: 'outfit-her', who: 'her', text: t('pack_outfit', { item: tr(dress.women) }) },
    { id: 'outfit-him', who: 'him', text: t('pack_outfit', { item: tr(dress.men) }) },
  ];
}

export function stylePage(c, { events }) {
  const { t, tr, lang, config } = c;
  const general = ['pack_shoes_flat', 'pack_shoes_dance', 'pack_accessories', 'pack_shawl', 'pack_id', 'pack_charger', 'pack_meds', 'pack_sunscreen'];
  const own = events.filter((e) => e.dress);
  const body = html`
<div class="container">
  ${pageHead(t('nav_style'), t('style_intro'))}
</div>
<section class="satin" aria-labelledby="dress-h">
  <div class="satin-inner">
    <h2 class="sec-title" id="dress-h">${tr(config.dressCode.title)}</h2>
    <p class="sec-sub">${tr(config.dressCode.note)}</p>
    ${moodBoard(c, config.dressCode)}
  </div>
</section>
<div class="container">
  ${own.map((ev) => html`
  <section class="style-block" ${eventStyle(ev)} aria-labelledby="st-${ev.id}">
    <h2 id="st-${ev.id}" class="style-title">${icon(ev.icon)} ${tr(ev.name)} <small>${fmtDate(ev.start, lang)}</small></h2>
    <p class="style-sub">${tr(ev.dress.title)}</p>
    <p>${tr(ev.dress.note)}</p>
    ${moodBoard(c, ev.dress)}
  </section>`)}

  <section class="card weather" aria-labelledby="wx-title" data-weather>
    <h2 id="wx-title">${t('weather_title', { city: tr(config.city) })}</h2>
    <p class="wx-source muted" data-wx-source>${t('weather_typical')}</p>
    <ul class="wx-days" data-wx-days>
      ${[...new Set(config.events.map((e) => e.start.slice(0, 10)))].map((d) => html`<li><strong>${fmtShortDate(`${d}T12:00:00+05:30`, lang)}</strong><span class="wx-temp">${config.weather.typical.highC}° / ${config.weather.typical.lowC}°C</span><span class="muted">${t('wx_clear')}</span></li>`)}
    </ul>
    <p>${tr(config.weather.typical.note)}</p>
  </section>

  <section class="card packing" aria-labelledby="pack-title" data-packing="v1">
    <h2 id="pack-title">${t('packing_title')}</h2>
    <p class="muted">${t('packing_intro')}</p>
    <fieldset class="seg">
      <legend>${t('packing_for')}</legend>
      ${[['both', 'packing_both'], ['her', 'packing_her'], ['him', 'packing_him']].map(([v, k], i) => html`<label><input type="radio" name="pack-who" value="${v}" ${i === 0 ? 'checked' : ''}><span>${t(k)}</span></label>`)}
    </fieldset>
    ${events.map((ev) => html`
    <fieldset class="checklist" ${eventStyle(ev)}>
      <legend>${tr(ev.name)} · ${fmtShortDate(ev.start, lang)}</legend>
      ${packingItems(c, ev).map((it) => html`<label class="check" ${it.who ? html`data-who="${it.who}"` : ''}><input type="checkbox" data-key="${ev.id}:${it.id}"><span>${it.text}</span></label>`)}
    </fieldset>`)}
    <fieldset class="checklist">
      <legend>${t('pack_general')}</legend>
      ${general.map((k) => html`<label class="check"><input type="checkbox" data-key="general:${k}"><span>${t(k)}</span></label>`)}
    </fieldset>
    <p><button type="button" class="btn btn-ghost" data-print>${t('print_list')}</button></p>
  </section>
</div>`;
  return layout(c, { body, page: 'style', title: t('nav_style') });
}

export function travelPage(c) {
  const { t, tr, config } = c;
  const body = html`
<div class="container">
  ${pageHead(t('travel_title'))}
  ${config.travel.sections.map((s) => html`<section class="card" aria-labelledby="tr-${s.id}"><h2 id="tr-${s.id}">${tr(s.title)}</h2><p>${tr(s.body)}</p></section>`)}
  <section aria-labelledby="faq-title">
    <h2 id="faq-title" class="sec-title">${t('faq')}</h2>
    ${config.travel.faq.map((f) => html`<details class="faq"><summary>${tr(f.q)}</summary><p>${tr(f.a)}</p></details>`)}
  </section>
  <section aria-labelledby="help">
    <h2 id="help" class="sec-title">${t('need_help')}</h2>
    ${contactsCard(c)}
  </section>
</div>`;
  return layout(c, { body, page: 'travel', title: t('nav_travel') });
}
