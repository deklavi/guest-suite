 import React, { useEffect, useMemo, useRef, useState } from "react";
  import { Link } from "react-router-dom";
  import { addDays, addMonths, format, isBefore, parseISO, startOfDay,
  differenceInCalendarDays, getDay, startOfMonth, endOfMonth,
  eachDayOfInterval } from "date-fns";
  import { he } from "date-fns/locale";
  import { loadMembersSeeded, normalizeId3 } from "../lib/membersStore.js";

const toISO = (d) => format(d, "yyyy-MM-dd");
const fromISO = (s) => startOfDay(parseISO(s));
const nightsBetween = (s,e) => Math.max(0, differenceInCalendarDays(fromISO(e), fromISO(s)));
const displayDate = (iso) => {
  try { return iso ? format(fromISO(iso), 'dd-MM-yyyy') : ''; } catch { return iso || ''; }
};

export default function PublicBooking({ enableAdmin = true }) {
  useEffect(()=>{ document.documentElement.dir = "rtl"; }, []);

  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [members, setMembers] = useState([]);
  const [activeField, setActiveField] = useState(null); // 'id' | 'name' | null
  const [showSuggest, setShowSuggest] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [startReq, setStartReq] = useState(toISO(new Date()));
  const [endReq, setEndReq] = useState(toISO(addDays(new Date(), 2)));
  const [result, setResult] = useState(null);
  const [reserveStatus, setReserveStatus] = useState("");
  const [bookings, setBookings] = useState([]);
  const endDateRef = useRef(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [endViewMonth, setEndViewMonth] = useState(() => startOfMonth(new Date()));
  const listboxId = 'member-suggest';
  // Inquiry-only mode: public users cannot save bookings; they send an email request.
  const INQUIRY_ONLY = (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_PUBLIC_INQUIRY_ONLY ?? 'true')) === 'true';
  const ADMIN_EMAIL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ADMIN_EMAIL) || '';

  // Invalidate previous availability result if inputs change from what was checked
  useEffect(() => {
    if (!result) return;
    try {
      const mid = normalizeId3(memberId) ?? String(memberId || "");
      const same =
        result.request &&
        String(result.request.memberId) === String(mid) &&
        String(result.request.memberName || "") === String(memberName || "") &&
        result.request.start === startReq &&
        result.request.end === endReq;
      if (!same) { setResult(null); setReserveStatus(""); }
    } catch {}
  }, [memberId, memberName, startReq, endReq]);

  function highlight(text, query) {
    const q = String(query || '').trim();
    if (!q) return text;
    const idx = String(text).toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = String(text).slice(0, idx);
    const match = String(text).slice(idx, idx + q.length);
    const after = String(text).slice(idx + q.length);
    return (<>{before}<mark>{match}</mark>{after}</>);
  }

  const canCheck = useMemo(()=> memberId && memberName && isBefore(fromISO(startReq), fromISO(endReq)), [memberId, memberName, startReq, endReq]);

  useEffect(() => {
    try { setMembers(loadMembersSeeded()); } catch {}
  }, []);

  // Load bookings from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("guest.bookings");
      setBookings(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  // Availability helpers
  function listNights(startISO, endISO) {
    const out = [];
    for (let d = fromISO(startISO); d < fromISO(endISO); d = addDays(d, 1)) out.push(toISO(d));
    return out;
  }
  function occupiedSetAll() {
    const set = new Set();
    for (const b of bookings) {
      for (let d = fromISO(b.start); d < fromISO(b.end); d = addDays(d, 1)) set.add(toISO(d));
    }
    return set;
  }
  function isWeekendRange(nightIsos) {
    return nightIsos.some(iso => { const dow = getDay(fromISO(iso)); return dow === 5 || dow === 6; });
  }
  function isMidweekRange(nightIsos) {
    return nightIsos.every(iso => { const dow = getDay(fromISO(iso)); return dow >= 0 && dow <= 4; });
  }
  function findAlternative(nightsWanted, wantWeekend) {
    const occ = occupiedSetAll();
    for (let offset = 1; offset <= 120; offset++) {
      const start = addDays(fromISO(startReq), offset);
      const nights = Array.from({length: nightsWanted}, (_,i)=> toISO(addDays(start,i)));
      if (nights.some(n => occ.has(n))) continue;
      const isWknd = isWeekendRange(nights);
      const isMid = isMidweekRange(nights);
      if ((wantWeekend && isWknd) || (!wantWeekend && isMid)) {
        return { start: toISO(start), end: toISO(addDays(start, nightsWanted)) };
      }
    }
    return null;
  }
  function handleCheck(){
    // Policy: horizon depends on last vacation in the past 6 months
    // If member had a vacation within last 6 months → up to 6 weeks ahead
    // Else → up to 8 weeks ahead. The restriction applies to the START date only.
    const today = new Date();
    const todayStart = startOfDay(today);
    const mid = normalizeId3(memberId) ?? String(memberId || "");
    // Find member's last-night date across existing bookings
    let lastNightPastById = null;   // last used night in the past (by id)
    let lastNightPastByName = null; // last used night in the past (by name)
    try {
      for (const b of bookings) {
        const ln = addDays(fromISO(b.end), -1);
        // consider only past usage (ignore future bookings)
        if (+ln < +todayStart) {
          if (String(b.memberId) === String(mid)) {
            if (!lastNightPastById || +ln > +lastNightPastById) lastNightPastById = ln;
          }
          if (String(b.memberName || "").trim() === String(memberName || "").trim()) {
            if (!lastNightPastByName || +ln > +lastNightPastByName) lastNightPastByName = ln;
          }
        }
      }
    } catch {}
    const sixMonthsAgo = addMonths(today, -6);
    const usedInLast6M =
      (lastNightPastById && (+lastNightPastById >= +sixMonthsAgo)) ||
      (lastNightPastByName && (+lastNightPastByName >= +sixMonthsAgo));
    const allowedWeeks = usedInLast6M ? 6 : 8;
    const horizon = addDays(startOfDay(today), allowedWeeks * 7);

    if (+fromISO(startReq) > +horizon) {
      setResult({
        status: 'policy',
        message: usedInLast6M
          ? `ניתן להזמין עד שישה שבועות מראש מאחר והשתמשת בחצי שנה האחרונה`
          : `ניתן להזמין עד שמונה שבועות מראש מאחר ולא השתמשת בחצי השנה האחרונה`,
        request:{start:startReq,end:endReq,memberId,memberName}
      });
      setReserveStatus("");
      return;
    }

    const nights = listNights(startReq, endReq);

    // Safety: if horizon was somehow not caught above, enforce again here
    if (+fromISO(startReq) > +horizon) {
      setResult({
        status: 'policy',
        message: usedInLast6M
          ? `ניתן להזמין עד שישה שבועות מראש מאחר והשתמשת בחצי שנה האחרונה`
          : `ניתן להזמין עד שמונה שבועות מראש מאחר ולא השתמשת בחצי השנה האחרונה`,
        request:{start:startReq,end:endReq,memberId,memberName}
      });
      setReserveStatus("");
      return;
    }
    // policy: up to 5 nights per calendar month and up to 5 nights total in a search
    const perMonth = new Map();
    for (const iso of nights) {
      const key = format(fromISO(iso), 'yyyy-MM');
      perMonth.set(key, (perMonth.get(key) || 0) + 1);
    }
    const overTotal = nights.length > 5;
    const overAnyMonth = Array.from(perMonth.values()).some(c => c > 5);
    if (overTotal || overAnyMonth) {
      setResult({ status: 'policy', message: 'עד חמישה לילות בחודש', request:{start:startReq,end:endReq,memberId,memberName} });
      setReserveStatus("");
      return;
    }
    const occ = occupiedSetAll();
    const overlaps = nights.filter(n => occ.has(n));
    const nightsWanted = nights.length;
    const reqWeekend = isWeekendRange(nights);
    const reqMidweek = isMidweekRange(nights);
    // Member monthly limit check (includes existing bookings)
    const perMonthExisting = new Map();
    for (const b of bookings) {
      if (String(b.memberId) !== String(mid)) continue;
      for (let d = fromISO(b.start); d < fromISO(b.end); d = addDays(d, 1)) {
        const key = format(d,'yyyy-MM');
        perMonthExisting.set(key, (perMonthExisting.get(key)||0)+1);
      }
    }
    const perMonthNew = new Map();
    for (const iso of nights) {
      const key = format(fromISO(iso),'yyyy-MM');
      perMonthNew.set(key, (perMonthNew.get(key)||0)+1);
    }
    let violatesMember = false;
    for (const [m,c] of perMonthNew.entries()) {
      const total = (perMonthExisting.get(m)||0) + c;
      if (total > 5) { violatesMember = true; break; }
    }
    if (violatesMember) {
      setResult({ status: 'policy', message: 'עד חמישה לילות בחודש', request:{start:startReq,end:endReq,memberId,memberName} });
      setReserveStatus("");
      return;
    }

    if (overlaps.length === 0) {
      setResult({ status: 'ok', request:{start:startReq,end:endReq,memberId,memberName} });
      setReserveStatus("");
      return;
    }
    if (overlaps.length === nights.length) {
      const alt = findAlternative(nightsWanted, reqWeekend && !reqMidweek);
      setResult({ status: 'full', request:{start:startReq,end:endReq,memberId,memberName}, alt });
      setReserveStatus("");
      return;
    }
    // partial — build contiguous free segments
    const free = nights.filter(n => !occ.has(n));
    const segs = [];
    let i = 0;
    while (i < free.length) {
      const start = free[i];
      let j = i + 1;
      while (j < free.length) {
        const prev = fromISO(free[j-1]);
        const cur = fromISO(free[j]);
        if (differenceInCalendarDays(cur, prev) === 1) j++; else break;
      }
      const end = toISO(addDays(fromISO(free[j-1]), 1));
      segs.push({ start, end });
      i = j;
    }
    setResult({ status: 'partial', request:{start:startReq,end:endReq,memberId,memberName}, segments: segs });
    setReserveStatus("");
  }

  function reserveRange(s, e) {
    try {
      // Enforce member monthly limit again on save
      const nights = listNights(s, e);
      const mid = normalizeId3(memberId) ?? String(memberId || "");
      const perMonthExisting = new Map();
      for (const b of bookings) {
        if (String(b.memberId) !== String(mid)) continue;
        for (let d = fromISO(b.start); d < fromISO(b.end); d = addDays(d,1)) {
          const key = format(d,'yyyy-MM');
          perMonthExisting.set(key, (perMonthExisting.get(key)||0)+1);
        }
      }
      for (const iso of nights) {
        const key = format(fromISO(iso),'yyyy-MM');
        const total = (perMonthExisting.get(key)||0) + 1;
        if (total > 5) { setReserveStatus('policy'); return; }
        perMonthExisting.set(key, total);
      }
      const raw = localStorage.getItem("guest.bookings");
      const existing = raw ? JSON.parse(raw) : [];
      const booking = { id: "b" + Date.now(), memberId: mid, memberName, start: s, end: e };
      const next = [...existing, booking];
      localStorage.setItem("guest.bookings", JSON.stringify(next));
      setBookings(next);
      setReserveStatus("ok");
    } catch (e) { setReserveStatus("err"); }
  }
  function recheckAndMaybeReserve(s, e) {
    // Always re-validate current inputs before reserving
    try {
      const mid = normalizeId3(memberId) ?? String(memberId || "");
      const today = new Date();
      const todayStart = startOfDay(today);

      // last-6-months usage (past reservations only)
      let lastNightPastById = null;
      let lastNightPastByName = null;
      for (const b of bookings) {
        const ln = addDays(fromISO(b.end), -1);
        if (+ln >= +todayStart) continue; // only past
        if (String(b.memberId) === String(mid)) {
          if (!lastNightPastById || +ln > +lastNightPastById) lastNightPastById = ln;
        }
        if (String(b.memberName || "").trim() === String(memberName || "").trim()) {
          if (!lastNightPastByName || +ln > +lastNightPastByName) lastNightPastByName = ln;
        }
      }
      const sixMonthsAgo = addMonths(today, -6);
      const usedInLast6M =
        (lastNightPastById && (+lastNightPastById >= +sixMonthsAgo)) ||
        (lastNightPastByName && (+lastNightPastByName >= +sixMonthsAgo));
      const allowedWeeks = usedInLast6M ? 6 : 8;
      const horizon = addDays(todayStart, allowedWeeks * 7);
      if (+fromISO(s) > +horizon) {
        setResult({
          status: 'policy',
          message: usedInLast6M
            ? `ניתן להזמין עד שישה שבועות מראש מאחר והשתמשת בחצי שנה האחרונה`
            : `ניתן להזמין עד שמונה שבועות מראש מאחר ולא השתמשת בחצי השנה האחרונה`,
          request:{ start: s, end: e, memberId: mid, memberName }
        });
        setReserveStatus("");
        return;
      }

      const nights = listNights(s, e);
      // Basic 5-night policy across month and total
      const perMonth = new Map();
      for (const iso of nights) {
        const key = format(fromISO(iso), 'yyyy-MM');
        perMonth.set(key, (perMonth.get(key) || 0) + 1);
      }
      const overTotal = nights.length > 5;
      const overAnyMonth = Array.from(perMonth.values()).some(c => c > 5);
      if (overTotal || overAnyMonth) {
        setResult({ status: 'policy', message: 'עד חמישה לילות בחודש', request:{ start: s, end: e, memberId: mid, memberName } });
        setReserveStatus("");
        return;
      }

      // Occupancy
      const occ = occupiedSetAll();
      const overlaps = nights.filter(n => occ.has(n));
      if (overlaps.length > 0) {
        // Partially or fully taken — recompute segments for UX
        const free = nights.filter(n => !occ.has(n));
        const segs = [];
        let i = 0;
        while (i < free.length) {
          const start = free[i];
          let j = i + 1;
          while (j < free.length) {
            const prev = fromISO(free[j-1]);
            const cur = fromISO(free[j]);
            if (differenceInCalendarDays(cur, prev) === 1) j++; else break;
          }
          const end = toISO(addDays(fromISO(free[j-1]), 1));
          segs.push({ start, end });
          i = j;
        }
        setResult({ status: overlaps.length === nights.length ? 'full' : 'partial', request:{ start: s, end: e, memberId: mid, memberName }, ...(segs.length? { segments: segs } : {}) });
        setReserveStatus("");
        return;
      }

      // Member monthly limit including existing
      const perMonthExisting = new Map();
      for (const b of bookings) {
        if (String(b.memberId) !== String(mid)) continue;
        for (let d = fromISO(b.start); d < fromISO(b.end); d = addDays(d, 1)) {
          const key = format(d,'yyyy-MM');
          perMonthExisting.set(key, (perMonthExisting.get(key)||0)+1);
        }
      }
      for (const iso of nights) {
        const key = format(fromISO(iso),'yyyy-MM');
        const total = (perMonthExisting.get(key)||0) + 1;
        if (total > 5) {
          setResult({ status: 'policy', message: 'עד חמישה לילות בחודש', request:{ start: s, end: e, memberId: mid, memberName } });
          setReserveStatus("");
          return;
        }
      }

      // All good — reserve
      setResult({ status: 'ok', request:{ start: s, end: e, memberId: mid, memberName } });
      reserveRange(s, e);
    } catch {
      setReserveStatus('err');
    }
  }

  function handleReserve() {
    if (!result || result.status !== 'ok') return;
    recheckAndMaybeReserve(startReq, endReq);
  }

  // Reserve a specific range from the current result (e.g., alternative or segment),
  // but only if the current inputs match the validated request.
  function handleReserveExact(s, e) {
    if (!result) return;
    const mid = normalizeId3(memberId) ?? String(memberId || "");
    const same =
      result.request &&
      String(result.request.memberId) === String(mid) &&
      String(result.request.memberName || "") === String(memberName || "") &&
      result.request.start === startReq &&
      result.request.end === endReq;
    if (!same) {
      setResult({ status: 'policy', message: 'התאריכים השתנו — נא ללחוץ "בדוק זמינות" שוב', request:{ start: startReq, end: endReq, memberId, memberName } });
      setReserveStatus("");
      return;
    }
    recheckAndMaybeReserve(s, e);
  }

  // Suggestions based on currently active field's query
  const query = (activeField === 'id' ? memberId : activeField === 'name' ? memberName : "").trim();
  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const scored = members
      .filter(m => String(m.id).includes(query) || String(m.name || "").toLowerCase().includes(q))
      .map(m => {
        const name = String(m.name || "").toLowerCase();
        const idStr = String(m.id || "");
        let score = 3;
        if (name.startsWith(q)) score = 0;
        else if (idStr.startsWith(query)) score = 1;
        else if (name.includes(q)) score = 2;
        else score = 3;
        return { m, score };
      })
      .sort((a,b) => a.score - b.score || String(a.m.name || "").localeCompare(String(b.m.name || ""), 'he'))
      .slice(0, 4)
      .map(x => x.m);
    return scored;
  }, [members, query]);

  // Reset/highlight handling when suggestion list changes
  useEffect(() => {
    if (!showSuggest) return;
    if (highlightIdx >= suggestions.length) setHighlightIdx(0);
  }, [suggestions.length, showSuggest]);

  function pickSuggestion(m) {
    setMemberId(String(m.id || ""));
    setMemberName(String(m.name || ""));
    setShowSuggest(false);
    setActiveField(null);
  }

  function onBlurWithDelay() {
    // allow click on suggestion before closing
    setTimeout(() => setShowSuggest(false), 120);
  }

  function handleKeyDown(e) {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = suggestions[highlightIdx];
      if (pick) pickSuggestion(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggest(false);
    }
  }

  function prettyRange([s,e]){
    const a = format(fromISO(s), "d LLL yyyy", {locale:he});
    const b = format(addDays(fromISO(e),-1), "d LLL yyyy", {locale:he});
    return `${a} → ${b}`;
  }

  function buildMailto(s, e) {
    try {
      const subj = `בקשת בירור זמינות — דירת האירוח`;
      const nights = nightsBetween(s, e);
      const body = [
        `שם: ${memberName} (מזהה ${memberId})`,
        `טווח מבוקש: ${prettyRange([s,e])}`,
        `סה"כ לילות: ${nights}`,
        '',
        'נא לאשר אם פנוי. תודה!',
      ].join('\n');
      const addr = encodeURIComponent(ADMIN_EMAIL);
      const qs = `subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
      return `mailto:${addr}?${qs}`;
    } catch {
      return `mailto:${ADMIN_EMAIL || ''}`;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ padding: 24 }}>
              <div className="mx-auto" style={{ maxWidth: 720 }}>
                <div className="flex items-end justify-between" style={{ marginBottom: 16 }}>
                  <div className="flex items-center gap-3">
            <img
              src="/kibbutz-logo.png"
              alt="לוגו הקיבוץ"
              onError={(e)=>{ e.currentTarget.style.display='none'; }}
              style={{ width: 56, height: 56, objectFit: 'contain' }}
            />
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>ברוכים הבאים לדירת האירוח</div>
              <div style={{ fontSize: 16, color: '#475569' }}>הזינו פרטי חבר ותאריכים כדי לבדוק זמינות ולהזמין</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <Link to="/terms" style={{ textDecoration: 'underline', fontSize: 14 }}>תקנון</Link>
            <Link to="/privacy" style={{ textDecoration: 'underline', fontSize: 14 }}>מדיניות פרטיות</Link>
            {enableAdmin && (
              <Link to="/admin" style={{ textDecoration: 'underline', fontSize: 14 }}>דף מנהל</Link>
            )}
          </div>
        </div>

              <div className="bg-white border" style={{ borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                    {INQUIRY_ONLY && (
                      <div style={{ fontSize: 14, color: '#0f766e', background:'#ecfeff', border:'1px solid #cffafe', padding:'8px 12px', borderRadius: 10 }}>
                        מצב בירור בלבד — הבקשה תישלח למנהל במייל, ללא שמירה אוטומטית.
                      </div>
                    )}
            {/* Live status for screen readers */}
            <div aria-live="polite" aria-atomic="true" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0 0 0 0)' }}>
              {(() => {
                if (!result) return '';
                if (result.status === 'ok') return `פנוי — ${prettyRange([result.request.start,result.request.end])}`;
                if (result.status === 'full') return `תפוס — ${prettyRange([result.request.start,result.request.end])}`;
                if (result.status === 'partial') return `חלקית — ${prettyRange([result.request.start,result.request.end])}`;
                if (result.status === 'policy') return String(result.message || 'עד חמישה לילות בחודש');
                return '';
              })()}
            </div>
            <div style={{ position: 'relative' }}>
              <label htmlFor="member-id" style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>מזהה חבר (3 ספרות)</label>
              <input
                id="member-id"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 18 }}
                placeholder='למשל 001'
                value={memberId}
                onChange={(e)=>{ setMemberId(e.target.value); setActiveField('id'); setShowSuggest(true); }}
                onFocus={()=>{ setActiveField('id'); if ((memberId||memberName).trim()) setShowSuggest(true); }}
                onBlur={onBlurWithDelay}
                inputMode="numeric"
                onKeyDown={handleKeyDown}
                aria-autocomplete="list" aria-controls={listboxId} aria-expanded={showSuggest && suggestions.length>0}
              />
              {showSuggest && activeField==='id' && suggestions.length>0 && (
                <ul id={listboxId} role="listbox" style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                  {suggestions.map((m, i) => (
                    <li
                      key={m.id}
                      role="option" aria-selected={i===highlightIdx}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: i===highlightIdx ? '#f1f5f9' : 'white' }}
                      onMouseDown={(e)=>e.preventDefault()}
                      onMouseEnter={() => setHighlightIdx(i)}
                      onClick={()=>pickSuggestion(m)}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{highlight(m.name, query)}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{highlight(m.id, query)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <label htmlFor="member-name" style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>שם מלא</label>
              <input
                id="member-name"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 18 }}
                placeholder="התחל להקליד שם (למשל רועי)"
                value={memberName}
                onChange={(e)=>{ setMemberName(e.target.value); setActiveField('name'); setShowSuggest(true); }}
                onFocus={()=>{ setActiveField('name'); if ((memberId||memberName).trim()) setShowSuggest(true); }}
                onBlur={onBlurWithDelay}
                onKeyDown={handleKeyDown}
                aria-autocomplete="list" aria-controls={listboxId} aria-expanded={showSuggest && suggestions.length>0}
              />
              {showSuggest && activeField==='name' && suggestions.length>0 && (
                <ul role="listbox" id={listboxId} style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                  {suggestions.map((m, i) => (
                    <li
                      key={m.id}
                      role="option" aria-selected={i===highlightIdx}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: i===highlightIdx ? '#f1f5f9' : 'white' }}
                      onMouseDown={(e)=>e.preventDefault()}
                      onMouseEnter={() => setHighlightIdx(i)}
                      onClick={()=>pickSuggestion(m)}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{highlight(m.name, query)}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{highlight(m.id, query)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>תאריך הגעה</label>
              <input
                type="date"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 18 }}
                value={startReq}
                onChange={(e)=>{
                  setStartReq(e.target.value);
                  // Immediately focus and open the checkout picker
                  setTimeout(() => {
                    try {
                      endDateRef.current?.focus();
                      setEndViewMonth(startOfMonth(fromISO(e.target.value)));
                      setShowEndPicker(true);
                    } catch {}
                  }, 0);
                }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>תאריך עזיבה</label>
              <input
                ref={endDateRef}
                type="text"
                readOnly
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 18, background: '#fff', cursor: 'pointer' }}
                value={displayDate(endReq)}
                onFocus={()=>{ setEndViewMonth(startOfMonth(fromISO(endReq || startReq))); setShowEndPicker(true); }}
                onClick={()=>{ setEndViewMonth(startOfMonth(fromISO(endReq || startReq))); setShowEndPicker(true); }}
                onBlur={()=>{ setTimeout(() => setShowEndPicker(false), 120); }}
              />
              {showEndPicker && (
                <div
                  role="dialog"
                  aria-label="בחר תאריך עזיבה"
                  style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, marginTop: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  onMouseDown={(e)=> e.preventDefault()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <button aria-label="חודש קודם" onClick={()=> setEndViewMonth(m => startOfMonth(addMonths(m, -1)))} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f8fafc', touchAction:'manipulation' }}>←</button>
                    <div style={{ fontWeight: 700 }}>{format(endViewMonth, 'LLLL yyyy', { locale: he })}</div>
                    <button aria-label="חודש הבא" onClick={()=> setEndViewMonth(m => startOfMonth(addMonths(m, 1)))} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f8fafc', touchAction:'manipulation' }}>→</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
                  </div>
                  {(() => {
                    const start = startOfMonth(endViewMonth);
                    const end = endOfMonth(endViewMonth);
                    const days = eachDayOfInterval({ start, end });
                    const blanks = getDay(start);
                    const minDate = addDays(fromISO(startReq), 1); // earliest checkout is the next day
                    const maxDate = addDays(fromISO(startReq), 5); // limit to 5 nights total (start night + 4 more)
                    const rows = [];
                    const cells = [];
                    for (let i=0;i<blanks;i++) cells.push(<div key={'b'+i} />);
                    for (const d of days) {
                      const iso = toISO(d);
                      const disabled = d < minDate || d > maxDate;
                      const selected = iso === endReq;
                      cells.push(
                        <button
                          key={iso}
                          disabled={disabled}
                          onClick={() => { setEndReq(iso); setShowEndPicker(false); }}
                          style={{
                            width: 44, height: 44,
                            padding: 0,
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                            background: selected ? '#e0f2fe' : disabled ? '#f8fafc' : '#fff',
                            color: disabled ? '#94a3b8' : '#111827',
                            fontWeight: selected ? 700 : 500,
                            touchAction: 'manipulation'
                          }}
                        >{format(d,'d')}</button>
                      );
                    }
                    // chunk to rows of 7
                    for (let i=0;i<cells.length;i+=7) {
                      rows.push(<div key={'r'+i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>{cells.slice(i,i+7)}</div>);
                    }
                    return <div style={{ display: 'grid', gap: 4 }}>{rows}</div>;
                  })()}
                </div>
              )}
            </div>
            <div>
              <button disabled={!canCheck} onClick={handleCheck} style={{ background: '#111827', color: 'white', borderRadius: 999, padding: '12px 18px', fontSize: 18, opacity: canCheck ? 1 : 0.6 }}>
                בדוק זמינות
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className="bg-white p-4 rounded-2xl border" style={{ fontSize: 18 }}>
            {result.status === 'ok' && (() => {
              const mid = normalizeId3(memberId) ?? String(memberId || "");
              const stale = !result.request ||
                String(result.request.memberId) !== String(mid) ||
                String(result.request.memberName || "") !== String(memberName || "") ||
                result.request.start !== startReq ||
                result.request.end !== endReq;
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>✅ פנוי — {prettyRange([result.request.start,result.request.end])}</div>
                  {INQUIRY_ONLY ? (
                    <a
                      href={buildMailto(result.request.start, result.request.end)}
                      onClick={(e)=>{ if (stale) { e.preventDefault(); } }}
                      title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                      style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '10px 14px', fontSize: 16, opacity: stale ? 0.6 : 1, textDecoration: 'none' }}
                    >
                      שליחת בקשה במייל
                    </a>
                  ) : (
                    <button
                      onClick={handleReserve}
                      disabled={stale}
                      title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                      style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '10px 14px', fontSize: 16, opacity: stale ? 0.6 : 1 }}
                    >
                      הזמנת תאריכים אלה
                    </button>
                  )}
                </div>
              );
            })()}
            {result.status === 'policy' && (
              <div style={{ color: '#b91c1c' }}>❗ {String(result.message || 'עד חמישה לילות בחודש')}</div>
            )}
            {result.status === 'full' && (() => {
              const mid = normalizeId3(memberId) ?? String(memberId || "");
              const stale = !result.request ||
                String(result.request.memberId) !== String(mid) ||
                String(result.request.memberName || "") !== String(memberName || "") ||
                result.request.start !== startReq ||
                result.request.end !== endReq;
              return (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>❌ לצערי כבר תפוס — {prettyRange([result.request.start,result.request.end])}</div>
                  {result.alt ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>הצעה חלופית: {prettyRange([result.alt.start, result.alt.end])}</div>
                      {INQUIRY_ONLY ? (
                        <a
                          href={buildMailto(result.alt.start, result.alt.end)}
                          onClick={(e)=>{ if (stale) e.preventDefault(); }}
                          title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                          style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '8px 12px', fontSize: 16, opacity: stale ? 0.6 : 1, textDecoration: 'none' }}
                        >
                          שליחת בקשה להצעה
                        </a>
                      ) : (
                        <button
                          onClick={() => handleReserveExact(result.alt.start, result.alt.end)}
                          disabled={stale}
                          title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                          style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '8px 12px', fontSize: 16, opacity: stale ? 0.6 : 1 }}
                        >
                          הזמנת ההצעה
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: 14 }}>לא נמצאה הצעה חלופית מתאימה.</div>
                  )}
                </div>
              );
            })()}
            {result.status === 'partial' && (() => {
              const mid = normalizeId3(memberId) ?? String(memberId || "");
              const stale = !result.request ||
                String(result.request.memberId) !== String(mid) ||
                String(result.request.memberName || "") !== String(memberName || "") ||
                result.request.start !== startReq ||
                result.request.end !== endReq;
              return (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>⏳ חלק מהימים כבר תפוסים — {prettyRange([result.request.start,result.request.end])}</div>
                  <div style={{ fontSize: 14, color: '#475569' }}>אפשרות להזמין רק את הימים הפנויים:</div>
                  {result.segments && result.segments.length > 0 ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {result.segments.map((seg, i) => (
                        <div key={`${seg.start}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>{prettyRange([seg.start, seg.end])}</div>
                          {INQUIRY_ONLY ? (
                            <a
                              href={buildMailto(seg.start, seg.end)}
                              onClick={(e)=>{ if (stale) e.preventDefault(); }}
                              title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                              style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '8px 12px', fontSize: 16, opacity: stale ? 0.6 : 1, textDecoration: 'none' }}
                            >
                              בקשה לתאריכים אלו
                            </a>
                          ) : (
                            <button
                              onClick={() => handleReserveExact(seg.start, seg.end)}
                              disabled={stale}
                              title={stale ? 'התאריכים השתנו — בדוק זמינות מחדש' : undefined}
                              style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '8px 12px', fontSize: 16, opacity: stale ? 0.6 : 1 }}
                            >
                              הזמנה לתאריכים אלו
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: 14 }}>אין ימים פנויים מתוך הטווח המבוקש.</div>
                  )}
                </div>
              );
            })()}
            {reserveStatus === 'ok' && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#065f46' }}>
                ההזמנה נשמרה בהצלחה.
              </div>
            )}
            {reserveStatus === 'policy' && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#b91c1c' }}>
                עד חמישה לילות בחודש
              </div>
            )}
            {reserveStatus === 'err' && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#b91c1c' }}>
                אירעה שגיאה בשמירת ההזמנה.
              </div>
            )}
          </div>
        )}

       <div className="text-center" style={{ fontSize: 14, marginTop: 16 }}>
    מנהל? עבור ל־ <Link className="underline" to="/admin">דף המנהל</Link>
  </div>
      </div>
    </div>
  );
}
