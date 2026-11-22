// Pure day-count maths shared by CareTimeline and BookingDetailPageV2, so the
// header stat cards and the timeline can never disagree about which day a
// booking is on once pauses or weekly repeat days are involved.
import { isRepeatDay } from '../../../utils/repeatDays';

export const shiftDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
export const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function buildServiceCalendar({ start, pauses = [], serviceModel, repeatDays = null, shiftSlots = [], reschedules = [] }) {
  const isShiftBased = serviceModel === 'SHIFT_BASED';
  // ── Pause windows ─────────────────────────────────────────────────────────
  // A pause blanks out the calendar days between when it started and when it (or its
  // target resume date) ends — those days look locked/greyed, don't count as service,
  // and don't get their own "Day N" number. Everything from the resume day onward picks
  // the numbering back up right where the pause began, so a week-long pause never makes
  // the client's day count jump by a week for nothing.
  const pauseWindows = (() => {
    if (!start || !pauses.length) return [];
    const dayNumOf = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      d.setHours(0, 0, 0, 0);
      return Math.round((d - start) / 86400000) + 1;
    };
    return pauses
      .map((p) => ({
        pausedDayNum: dayNumOf(p.paused_date),
        // An already-resumed pause is bounded by when it ACTUALLY resumed, not the
        // (possibly missed/changed) target resume_date it was set to.
        endDayNum: p.resumed_date ? dayNumOf(p.resumed_date) : dayNumOf(p.resume_date),
        openEnded: !p.resumed_date && !p.resume_date,
      }))
      .filter((w) => w.pausedDayNum != null)
      .sort((a, b) => a.pausedDayNum - b.pausedDayNum);
  })();

  // Resolves a raw (uncompressed) calendar day-number to whether it falls inside a
  // locked gap, and — if not — its display day-number with prior gaps squeezed out.
  const resolvePauseOnly = (rawDayNum) => {
    let locked = false;
    let compress = 0;
    for (const w of pauseWindows) {
      if (w.openEnded) {
        if (rawDayNum > w.pausedDayNum) locked = true;
        continue;
      }
      const gapStart = w.pausedDayNum + 1;
      const gapEnd = w.endDayNum - 1;
      if (gapEnd < gapStart) continue; // resumed same/next day — no visible gap
      if (rawDayNum >= gapStart && rawDayNum <= gapEnd) locked = true;
      else if (rawDayNum > gapEnd) compress += (gapEnd - gapStart + 1);
    }
    return { locked, displayDayNum: rawDayNum - compress };
  };

  // Inverse of resolvePauseOnly's compression — plannedDays/paidDays are day-COUNTS
  // (effective/compressed scale, e.g. "9 days of paid service"), but the calendar grid
  // needs a RAW calendar day-number to know how many real dates to render. Without
  // this, a paused booking's grid gets cut short by exactly the length of its pause
  // gap(s) — the last few paid days after resuming never appear.
  const pauseCountToRawDay = (target) => {
    let raw = target;
    for (const w of pauseWindows) {
      if (w.openEnded) break; // nothing meaningfully "beyond" an open-ended pause
      const gapStart = w.pausedDayNum + 1;
      const gapEnd = w.endDayNum - 1;
      if (gapEnd < gapStart) continue;
      if (raw >= gapStart) raw += (gapEnd - gapStart + 1);
    }
    return raw;
  };

  // ── Weekly repeat days ────────────────────────────────────────────────────
  // A booking (LIVE_IN, via repeatDays) or individual shifts (SHIFT_BASED, via each
  // slot's repeat_days) can run only on chosen weekdays. A weekday nothing runs on is
  // a "day off": like a pause gap it gets no Day number, isn't counted as served, paid
  // or overdue, and the numbering carries on from the next service day — mirroring the
  // backend, which never bills, pays or seeds anything for those days.
  // With no repeat days set, every helper below falls straight through to the
  // pause-only versions, so ordinary bookings behave exactly as before.
  const hasRepeatDays = (() => {
    const restricts = (days) => Array.isArray(days) && days.length > 0 && days.length < 7;
    if (serviceModel === 'LIVE_IN') return restricts(repeatDays);
    if (isShiftBased) return shiftSlots.some((s) => restricts(s.repeat_days));
    return false;
  })();

  const slotRunsOn = (slot, date) =>
    isRepeatDay(Array.isArray(slot?.repeat_days) ? slot.repeat_days.map(Number) : null, date);

  // Lazily-extended day index: how many off days precede a raw day, and which raw day
  // is the Nth service day. Pause gaps are excluded here (they're already compressed by
  // resolvePauseOnly), and an open-ended pause is treated like pauseCountToRawDay does.
  const serviceCalendar = (() => {
    const liveInDays = Array.isArray(repeatDays) ? repeatDays.map(Number) : null;
    const makeupCount = new Map(); // dateISO -> makeup shifts landing there
    reschedules.forEach((r) => {
      const key = r.new_date?.slice(0, 10);
      if (key) makeupCount.set(key, (makeupCount.get(key) || 0) + 1);
    });
    const dateOf = (raw) => { const d = shiftDays(start, raw - 1); d.setHours(12, 0, 0, 0); return d; };
    const inClosedGap = (raw) => pauseWindows.some((w) =>
      !w.openEnded && raw >= w.pausedDayNum + 1 && raw <= w.endDayNum - 1);
    // Shifts actually running on a raw day: natural slots repeating that weekday, or —
    // on a day none repeat — any makeup shifts moved onto it (which make it a service day).
    const shiftsOn = (raw) => {
      if (!start) return 0;
      const date = dateOf(raw);
      const natural = shiftSlots.filter((s) => slotRunsOn(s, date)).length;
      return natural > 0 ? natural : (makeupCount.get(toLocalISO(date)) || 0);
    };
    const isOff = (raw) => {
      if (!hasRepeatDays || !start) return false;
      if (serviceModel === 'LIVE_IN') return !isRepeatDay(liveInDays, dateOf(raw));
      if (isShiftBased) return shiftSlots.length > 0 && shiftsOn(raw) === 0;
      return false;
    };

    const MAX_RAW = 20000;
    const offPrefix = [0];
    const serviceRaws = [];
    let scanned = 0;
    const extendTo = (raw) => {
      while (scanned < Math.min(raw, MAX_RAW)) {
        scanned++;
        const gap = inClosedGap(scanned);
        const off = !gap && isOff(scanned);
        offPrefix[scanned] = offPrefix[scanned - 1] + (off ? 1 : 0);
        if (!gap && !off) serviceRaws.push(scanned);
      }
    };
    return {
      isOff,
      shiftsOn,
      offCount: (raw) => {
        if (raw <= 0) return 0;
        extendTo(raw);
        return offPrefix[Math.min(raw, scanned)];
      },
      nthRaw: (n) => {
        if (n <= 0) return n;
        while (serviceRaws.length < n && scanned < MAX_RAW) extendTo(scanned + 64);
        return serviceRaws[n - 1] ?? (scanned + (n - serviceRaws.length));
      },
    };
  })();

  // Pause- and day-off-aware versions of the two helpers above — used everywhere below.
  const resolvePauseDay = (rawDayNum) => {
    const base = resolvePauseOnly(rawDayNum);
    if (!hasRepeatDays) return { ...base, off: false };
    return {
      locked: base.locked,
      off: !base.locked && serviceCalendar.isOff(rawDayNum),
      displayDayNum: base.displayDayNum - serviceCalendar.offCount(rawDayNum),
    };
  };
  const effectiveCountToRawDay = (target) =>
    hasRepeatDays ? serviceCalendar.nthRaw(target) : pauseCountToRawDay(target);

  return { pauseWindows, hasRepeatDays, serviceCalendar, slotRunsOn, resolvePauseDay, effectiveCountToRawDay };
}

// Service days elapsed as of `today` (pause- and day-off-compressed). VISITING is a
// one-time visit, so it is always a single day.
export function computeServedDays({ cal, start, today, serviceModel }) {
  if (serviceModel === 'VISITING') return 1;
  if (!start) return 0;
  const { pauseWindows, resolvePauseDay } = cal;
  const rawDayNum = Math.max(0, Math.floor((today - start) / 86400000) + 1);
  if (rawDayNum === 0) return 0;
  for (const w of pauseWindows) {
    if (w.openEnded) {
      if (rawDayNum > w.pausedDayNum) return resolvePauseDay(w.pausedDayNum).displayDayNum;
      continue;
    }
    const gapStart = w.pausedDayNum + 1;
    const gapEnd = w.endDayNum - 1;
    if (gapEnd >= gapStart && rawDayNum >= gapStart && rawDayNum <= gapEnd) {
      return resolvePauseDay(w.pausedDayNum).displayDayNum;
    }
  }
  return resolvePauseDay(rawDayNum).displayDayNum;
}

// Shifts delivered over the first `servedDays` service days (shifts/day varies once
// shifts repeat on different weekdays).
export function computeServedShifts({ cal, servedDays, shiftsPerDay }) {
  if (!cal.hasRepeatDays) return servedDays * shiftsPerDay;
  let total = 0;
  for (let k = 1; k <= servedDays; k++) total += cal.serviceCalendar.shiftsOn(cal.serviceCalendar.nthRaw(k));
  return total;
}
