import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth, startOfMonth, parseISO, differenceInCalendarDays } from "date-fns";
import { loadMembersSeeded } from "../lib/membersStore.js";
import { he } from "date-fns/locale";

export default function AdminDashboard() {
  useEffect(() => {
    document.documentElement.dir = "rtl"; // מוודא שהתצוגה בעברית
  }, []);

  const [bookings, setBookings] = useState([]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState({ open: false, iso: null });
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedDays, setSelectedDays] = useState(new Set()); // set of ISO nights (can include free days)
  const [anchorDay, setAnchorDay] = useState(null); // for range selection
  const [assignIdx, setAssignIdx] = useState(0);
  const [reassignIdx, setReassignIdx] = useState(0);
  const [flash, setFlash] = useState("");

  function highlight(text, q){
    if(!q) return text; const s=String(text); const i=s.toLowerCase().indexOf(q.toLowerCase()); if(i===-1) return text; return (<>{s.slice(0,i)}<mark>{s.slice(i,i+q.length)}</mark>{s.slice(i+q.length)}</>);
  }

  // Load bookings and seed simple demo if empty
  useEffect(() => {
    try {
      const raw = localStorage.getItem("guest.bookings");
      const existing = raw ? JSON.parse(raw) : [];

      const today = new Date();
      const mStart = startOfMonth(today);
      const sample = [
        { id: "b1", memberId: "700006", memberName: "דקל לוי", start: format(addDays(mStart, 4), "yyyy-MM-dd"), end: format(addDays(mStart, 7), "yyyy-MM-dd") },
        { id: "b2", memberId: "700001", memberName: "רועי כהן", start: format(addDays(mStart, 11), "yyyy-MM-dd"), end: format(addDays(mStart, 14), "yyyy-MM-dd") },
        { id: "b3", memberId: "700015", memberName: "מאיה שלו", start: format(addDays(mStart, 19), "yyyy-MM-dd"), end: format(addDays(mStart, 22), "yyyy-MM-dd") },
      ];

      if (!raw || existing.length === 0) {
        localStorage.setItem("guest.bookings", JSON.stringify(sample));
        setBookings(sample);
      } else {
        setBookings(existing);
      }
    } catch {}
  }, []);

  // Handle approve/reject links coming from email (hash query params)
  useEffect(() => {
    try {
      const hash = typeof location !== 'undefined' ? location.hash || '' : '';
      const qIndex = hash.indexOf('?');
      if (qIndex === -1) return;
      const qs = hash.slice(qIndex + 1);
      const params = new URLSearchParams(qs);
      const approve = params.get('approve');
      const reject = params.get('reject');
      const payloadB64 = approve || reject;
      if (!payloadB64) return;
      const json = decodeURIComponent(payloadB64);
      let data = null;
      try {
        const raw = atob(json.replace(/-/g,'+').replace(/_/g,'/'));
        data = JSON.parse(raw);
      } catch {}
      if (!data || !data.memberId || !data.start || !data.end) return;

      if (approve) {
        // Avoid duplicate add if same booking exists
        const exists = (bookings || []).some(b => String(b.memberId) === String(data.memberId) && b.start === data.start && b.end === data.end);
        if (exists) { setFlash('הבקשה כבר אושרה בעבר (כפילות זוהתה)'); return; }
        const id = 'b' + Date.now();
        const next = [...(bookings || []), { id, memberId: String(data.memberId), memberName: String(data.memberName || data.memberId), start: data.start, end: data.end, note: 'אושר מקישור במייל' }];
        try { localStorage.setItem('guest.bookings', JSON.stringify(next)); } catch {}
        setBookings(next);
        setFlash('הבקשה אושרה ונשמרה ביומן');
      } else if (reject) {
        setFlash('הבקשה סומנה כנדחתה (ללא שינוי ביומן)');
      }

      // Clean the query so reloading won't repeat the action
      const base = hash.slice(0, qIndex);
      setTimeout(() => { try { location.hash = base || '#/admin'; } catch {} }, 200);
    } catch {}
  }, [bookings]);

  // Load members for reassignment autocomplete
  useEffect(() => {
    try { setMembers(loadMembersSeeded()); } catch {}
  }, []);

  function saveBookings(next) {
    try { localStorage.setItem("guest.bookings", JSON.stringify(next)); } catch {}
    setBookings(next);
  }

  function handleDayClick(e, iso /* string yyyy-MM-dd */) {
    const isShift = e.shiftKey && anchorDay;
    setSelectedDays(prev => {
      const n = new Set(prev);
      if (isShift) {
        const a = new Date(anchorDay + 'T00:00:00');
        const b = new Date(iso + 'T00:00:00');
        const start = a <= b ? a : b;
        const end = a <= b ? b : a;
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
          n.add(format(d,'yyyy-MM-dd'));
        }
      } else {
        if (n.has(iso)) n.delete(iso); else n.add(iso);
        setAnchorDay(iso);
      }
      return n;
    });
  }

  function clearSelection() { setSelectedDays(new Set()); }

  // Convert a booking to kept segments after removing selected nights
  function keepSegments(startISO, endISO, isRemoved) {
    const segments = [];
    const oneDay = 24*3600*1000;
    let curStart = null; // Date
    for (let d = new Date(startISO+"T00:00:00"); d < new Date(endISO+"T00:00:00"); d = new Date(+d + oneDay)) {
      const iso = format(d, 'yyyy-MM-dd');
      const removed = isRemoved(iso);
      if (removed) {
        if (curStart) { // close segment
          segments.push({ start: format(curStart,'yyyy-MM-dd'), end: format(d,'yyyy-MM-dd') });
          curStart = null;
        }
      } else {
        if (!curStart) curStart = new Date(d);
      }
    }
    if (curStart) {
      const endD = new Date(endISO+"T00:00:00");
      segments.push({ start: format(curStart,'yyyy-MM-dd'), end: format(endD,'yyyy-MM-dd') });
    }
    return segments;
  }

  function releaseSelected() {
    if (selectedDays.size === 0) return;
    const isRemoved = (iso) => selectedDays.has(iso);
    const next = [];
    for (const b of bookings) {
      const segs = keepSegments(b.start, b.end, isRemoved);
      if (segs.length === 0) continue; // all nights removed
      if (segs.length === 1) {
        next.push({ ...b, start: segs[0].start, end: segs[0].end });
      } else {
        segs.forEach((s, i) => next.push({ ...b, id: b.id + '-' + (i+1), start: s.start, end: s.end }));
      }
    }
    saveBookings(next);
    try { const live = document.getElementById('admin-live'); if (live) live.textContent = `שוחררו ${selectedDays.size} לילות נבחרים`; } catch {}
    clearSelection();
  }

  function assignSelected(toMember) {
    if (!toMember) return;
    if (selectedDays.size === 0) return;
    // validate all selected nights are free
    for (const iso of selectedDays) {
      if (iso.startsWith(format(viewMonth,'yyyy-MM')) && occupiedSet.has(iso)) {
        alert('חלק מהתאריכים שנבחרו תפוסים');
        return;
      }
    }
    // build consecutive segments from selected days (sorted)
    const arr = Array.from(selectedDays).map(s => new Date(s+'T00:00:00')).sort((a,b)=>a-b);
    const segments = [];
    let curStart = arr[0];
    let prev = arr[0];
    for (let i=1;i<arr.length;i++){
      const d = arr[i];
      if (differenceInCalendarDays(d, prev) === 1) { prev = d; continue; }
      segments.push({ start: format(curStart,'yyyy-MM-dd'), end: format(addDays(prev,1),'yyyy-MM-dd') });
      curStart = d; prev = d;
    }
    segments.push({ start: format(curStart,'yyyy-MM-dd'), end: format(addDays(prev,1),'yyyy-MM-dd') });
    // Manager override: allow booking beyond system limits but warn if any segment exceeds 5 nights
    const overFive = segments.some(seg => differenceInCalendarDays(parseISO(seg.end), parseISO(seg.start)) > 5);
    if (overFive) {
      const ok = window.confirm('שים לב: מעל חמישה ימים ברצף. לאשר?');
      if (!ok) return;
    }

    const next = [...bookings];
    for (const seg of segments) {
      next.push({ id: 'b'+Date.now()+Math.random().toString(16).slice(2), memberId: String(toMember.id), memberName: String(toMember.name), start: seg.start, end: seg.end });
    }
    saveBookings(next);
    clearSelection();
    setMemberQuery('');
  }

  // Build current month calendar grid
  const monthStart = viewMonth;
  const monthEnd = endOfMonth(viewMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart); // 0=Sunday

  // Compute occupied days and the last-name(s) of the member(s) per day
  const { occupiedSet, occupiedNames, occupiedFullNames } = useMemo(() => {
    const set = new Set();
    const namesMap = new Map(); // iso -> [lastNames]
    const fullMap = new Map(); // iso -> [fullNames]
    const lastNameOf = (full) => {
      const parts = String(full || "").trim().split(/\s+/);
      return parts.length ? parts[parts.length - 1] : "";
    };
    for (const b of bookings) {
      const s = new Date(b.start + "T00:00:00");
      const e = new Date(b.end + "T00:00:00"); // checkout (exclusive)
      const ln = lastNameOf(b.memberName) || String(b.memberId || "");
      const fn = String(b.memberName || b.memberId || "");
      for (let d = s; d < e; d = addDays(d, 1)) {
        if (!isSameMonth(d, monthStart)) continue;
        const iso = format(d, "yyyy-MM-dd");
        set.add(iso);
        if (!namesMap.has(iso)) namesMap.set(iso, [ln]);
        else namesMap.get(iso).push(ln);
        if (!fullMap.has(iso)) fullMap.set(iso, [fn]);
        else fullMap.get(iso).push(fn);
      }
    }
    return { occupiedSet: set, occupiedNames: namesMap, occupiedFullNames: fullMap };
  }, [bookings, monthStart]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-sm">
          <Link className="underline" to="/">← חזרה לדף חיפוש</Link>
        </div>
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">אזור מנהל</h1>
          <nav style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/members" style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}>
              ניהול חברים
            </Link>
            <Link to="/" style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}>
              דף חיפוש
            </Link>
            <button
              onClick={()=>{ try{ localStorage.removeItem('simple.admin.ok'); }catch{} window.location.hash = '#/admin'; }}
              style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}
            >התנתק</button>
          </nav>
        </header>

        {flash && (
          <div id="admin-live" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3">
            {flash}
          </div>
        )}


        <div className="bg-white rounded-2xl border p-4">
          <p className="text-gray-700">
            ברוך הבא למסך המנהל. מכאן תוכל לצפות בדו"חות, לנהל הזמנות ולהיכנס
            לניהול חברים.
          </p>
        </div>

        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setViewMonth(m => addMonths(m, -1))}
                style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}
              >
                ← חודש קודם
              </button>
              <button
                onClick={() => setViewMonth(m => addMonths(m, 1))}
                style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}
              >
                חודש הבא →
              </button>
              <button
                onClick={() => {
                  try {
                    const raw = localStorage.getItem('guest.bookings');
                    const blob = new Blob([raw || '[]'], { type: 'application/json;charset=utf-8' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'bookings.json';
                    a.click();
                    URL.revokeObjectURL(a.href);
                  } catch {}
                }}
                style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}
              >
                ייצוא הזמנות (JSON)
              </button>
              <label style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, fontSize: 14, cursor:'pointer' }}>
                ייבוא הזמנות (JSON)
                <input type="file" accept="application/json,.json" style={{ display:'none' }} onChange={(e)=>{
                  const f=e.target.files?.[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ try{ const imported=JSON.parse(String(reader.result||'[]')); if(Array.isArray(imported)){ const existing=bookings||[]; const map=new Map(existing.map(b=>[b.id,b])); for(const b of imported){ if(b && b.id) map.set(b.id,b); } const next=Array.from(map.values()); saveBookings(next); } }catch{} }; reader.readAsText(f); e.target.value='';
                }} />
              </label>
            </div>
            <div className="text-lg font-bold">
              {format(monthStart, 'LLLL yyyy', { locale: he })}
            </div>
            <div className="text-sm text-gray-600">ימים מסומנים = תפוס</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', fontSize: 12, color: '#475569', marginBottom: 8 }}>
            <div>א'</div>
            <div>ב'</div>
            <div>ג'</div>
            <div>ד'</div>
            <div>ה'</div>
            <div>ו'</div>
            <div>ש'</div>
          </div>
          {selectedDays.size > 0 && (
            <div className="mb-2" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div className="text-sm">נבחרו {selectedDays.size} לילות</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <button onClick={releaseSelected} style={{ background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:999, padding:'6px 12px' }}>שחרר תאריכים נבחרים</button>
                <button onClick={clearSelection} style={{ border:'1px solid #e5e7eb', borderRadius:999, padding:'6px 12px' }}>נקה בחירה</button>
                <div style={{ position:'relative' }}>
                  <input
                    placeholder="הקצה לחבר — מזהה/שם"
                    value={memberQuery}
                    onChange={e=>{ setMemberQuery(e.target.value); setAssignIdx(0); }}
                    className="border rounded px-3 py-1.5"
                    style={{ minWidth:260 }}
                    onKeyDown={(e)=>{
                      const q = memberQuery.trim().toLowerCase();
                      const suggestions = members.filter(m => String(m.id).includes(q) || String(m.name||'').toLowerCase().includes(q)).slice(0,8);
                      if(!suggestions.length) return;
                      if(e.key==='ArrowDown'){e.preventDefault(); setAssignIdx(i=>(i+1)%suggestions.length);} else if(e.key==='ArrowUp'){e.preventDefault(); setAssignIdx(i=>(i-1+suggestions.length)%suggestions.length);} else if(e.key==='Enter'){e.preventDefault(); assignSelected(suggestions[assignIdx]);}
                    }}
                  />
                  {memberQuery.trim() && (
                    (()=>{
                      const q = memberQuery.trim().toLowerCase();
                      const suggestions = members.filter(m => String(m.id).includes(q) || String(m.name||'').toLowerCase().includes(q)).slice(0,8);
                      return suggestions.length>0 ? (
                        <ul role="listbox" style={{ position:'absolute', top:'100%', right:0, left:0, zIndex:10, background:'white', border:'1px solid #e5e7eb', borderTop:'none', borderBottomLeftRadius:10, borderBottomRightRadius:10, maxHeight:240, overflowY:'auto' }}>
                          {suggestions.map((s,i) => (
                            <li key={s.id} role="option" aria-selected={i===assignIdx} onMouseDown={e=>e.preventDefault()} onClick={()=>assignSelected(s)} onMouseEnter={()=>setAssignIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', background: i===assignIdx? '#f1f5f9' : 'white' }}>
                              <div style={{ fontWeight:600 }}>{highlight(s.name, q)}</div>
                              <div style={{ fontSize:12, color:'#64748b' }}>{highlight(s.id, q)}</div>
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} style={{ padding: '12px 0' }} />
            ))}
            {monthDays.map(d => {
              const iso = format(d, 'yyyy-MM-dd');
              const occupied = occupiedSet.has(iso);
              const lnList = occupied ? (occupiedNames.get(iso) || []) : [];
              const fullList = occupied ? (occupiedFullNames.get(iso) || []) : [];
              const label = lnList.length > 1 ? `${lnList[0]} +${lnList.length - 1}` : (lnList[0] || "");
              const tooltip = fullList.length ? fullList.join(", ") : undefined;
              return (
                <div
                  key={iso}
                  title={tooltip}
                  onClick={(e) => handleDayClick(e, iso)}
                  onDoubleClick={() => { if (occupied) setModal({ open:true, iso }); }}
                  style={{
                  padding: '8px 6px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: occupied ? (selectedDays.has(iso) ? '#fde68a' : '#fee2e2') : (selectedDays.has(iso) ? '#e0f2fe' : '#ffffff'),
                  color: occupied ? '#991b1b' : '#111827',
                  fontWeight: occupied ? 700 : 500,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  minHeight: 56,
                  justifyContent: 'center',
                  cursor: occupied ? 'pointer' : 'default',
                  boxShadow: selectedDays.has(iso) ? 'inset 0 0 0 2px #0ea5e9' : 'none'
                }}>
                  <div>{format(d, 'd')}</div>
                  {occupied && label && (
                    <div style={{ fontSize: 12, color: '#991b1b' }}>{label}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {modal.open && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={()=>setModal({open:false, iso:null})}>
            <div
              className="bg-white"
              role="dialog"
              aria-modal="true"
              aria-labelledby="night-modal-title"
              style={{ width:'min(96vw, 700px)', borderRadius:16, padding:16 }}
              onClick={(e)=>e.stopPropagation()}
              onKeyDown={(e)=>{
                if(e.key==='Escape'){ e.preventDefault(); setModal({open:false, iso:null}); }
                if(e.key==='Tab'){
                  const root = e.currentTarget;
                  const focusables = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                  if(!focusables.length) return;
                  const first = focusables[0];
                  const last = focusables[focusables.length-1];
                  if(e.shiftKey){
                    if(document.activeElement === first){ e.preventDefault(); last.focus(); }
                  }else{
                    if(document.activeElement === last){ e.preventDefault(); first.focus(); }
                  }
                }
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div id="night-modal-title" className="text-lg font-bold">ניהול לילה — {format(parseISO(modal.iso), 'd LLL yyyy')}</div>
                <button autoFocus onClick={()=>setModal({open:false, iso:null})} style={{ border:'1px solid #e5e7eb', padding:'4px 10px', borderRadius:8 }}>סגור</button>
              </div>

              {(() => {
                const day = modal.iso;
                const overlaps = bookings.filter(b => day >= b.start && day < b.end);
                if (overlaps.length === 0) return <div className="text-sm text-gray-600">אין הזמנות ליום זה.</div>;

                function releaseNight() {
                  const next = [];
                  for (const b of bookings) {
                    if (!(day >= b.start && day < b.end)) { next.push(b); continue; }
                    const s = parseISO(b.start); const e = parseISO(b.end);
                    const d1 = parseISO(day); const d2 = addDays(d1,1);
                    if (+e - +s === 24*3600*1000) {
                      // remove entire single-night booking
                      continue;
                    } else if (day === b.start) {
                      next.push({ ...b, start: format(d2,'yyyy-MM-dd') });
                    } else if (format(addDays(e,-1),'yyyy-MM-dd') === day) {
                      next.push({ ...b, end: format(d1,'yyyy-MM-dd') });
                    } else {
                      next.push({ ...b, end: format(d1,'yyyy-MM-dd'), id: b.id+'-a' });
                      next.push({ ...b, start: format(d2,'yyyy-MM-dd'), id: b.id+'-b' });
                    }
                  }
                  saveBookings(next);
                  try { const live = document.getElementById('admin-live'); if (live) live.textContent = 'לילה שוחרר'; } catch {}
                  setModal({open:false, iso:null});
                }

                function reassignNight(toMember) {
                  // enforce monthly per-member limit (max 5 nights per calendar month)
                  const next = [];
                  const d1 = parseISO(day); const d2 = addDays(d1,1);
                  // count existing nights for target member in the month of d1
                  const monthKey = format(d1,'yyyy-MM');
                  let count = 0;
                  for (const b of bookings) {
                    if (String(b.memberId) !== String(toMember.id)) continue;
                    for (let dd = parseISO(b.start); dd < parseISO(b.end); dd = addDays(dd,1)) {
                      if (format(dd,'yyyy-MM') === monthKey) count++;
                    }
                  }
                  if (count >= 5) { alert('עד חמישה לילות בחודש'); return; }
                  for (const b of bookings) {
                    if (!(day >= b.start && day < b.end)) { next.push(b); continue; }
                    const s = parseISO(b.start); const e = parseISO(b.end);
                    if (+e - +s === 24*3600*1000) {
                      // drop original; will add new below
                    } else if (day === b.start) {
                      next.push({ ...b, start: format(d2,'yyyy-MM-dd') });
                    } else if (format(addDays(e,-1),'yyyy-MM-dd') === day) {
                      next.push({ ...b, end: format(d1,'yyyy-MM-dd') });
                    } else {
                      next.push({ ...b, end: format(d1,'yyyy-MM-dd'), id: b.id+'-a' });
                      next.push({ ...b, start: format(d2,'yyyy-MM-dd'), id: b.id+'-b' });
                    }
                  }
                  next.push({ id: 'b'+Date.now(), memberId: String(toMember.id), memberName: String(toMember.name), start: format(d1,'yyyy-MM-dd'), end: format(d2,'yyyy-MM-dd') });
                  saveBookings(next);
                  try { const live = document.getElementById('admin-live'); if (live) live.textContent = `הלילה הוקצה ל־${toMember.name}`; } catch {}
                  setModal({open:false, iso:null});
                }

                const q = memberQuery.trim().toLowerCase();
                const suggestions = !q ? [] : members.filter(m => String(m.id).includes(q) || String(m.name||'').toLowerCase().includes(q)).slice(0,8);

                return (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">הזמנות ליום זה:</div>
                    <ul className="text-sm" style={{ display:'grid', gap:6 }}>
                      {overlaps.map(b => (
                        <li key={b.id} style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px' }}>
                          <div>
                            {b.memberName} — {format(parseISO(b.start),'d LLL')} → {format(addDays(parseISO(b.end),-1),'d LLL')}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button onClick={releaseNight} style={{ background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:999, padding:'8px 12px' }}>שחרר לילה זה</button>
                      <div style={{ position:'relative' }}>
                        <input
                          placeholder="חיפוש חבר — מזהה/שם"
                          value={memberQuery}
                          onChange={e=>{ setMemberQuery(e.target.value); setReassignIdx(0); }}
                          className="border rounded px-3 py-2"
                          style={{ minWidth:280 }}
                          onKeyDown={(e)=>{
                            if(!suggestions.length) return; if(e.key==='ArrowDown'){e.preventDefault(); setReassignIdx(i=>(i+1)%suggestions.length);} else if(e.key==='ArrowUp'){e.preventDefault(); setReassignIdx(i=>(i-1+suggestions.length)%suggestions.length);} else if(e.key==='Enter'){e.preventDefault(); reassignNight(suggestions[reassignIdx]);} else if(e.key==='Escape'){setMemberQuery('');}
                          }}
                        />
                        {suggestions.length>0 && (
                          <ul role="listbox" style={{ position:'absolute', top:'100%', right:0, left:0, zIndex:10, background:'white', border:'1px solid #e5e7eb', borderTop:'none', borderBottomLeftRadius:10, borderBottomRightRadius:10, maxHeight:240, overflowY:'auto' }}>
                            {suggestions.map((s,i) => (
                              <li key={s.id} role="option" aria-selected={i===reassignIdx} onMouseDown={e=>e.preventDefault()} onClick={()=>reassignNight(s)} onMouseEnter={()=>setReassignIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', background: i===reassignIdx? '#f1f5f9' : 'white' }}>
                                <div style={{ fontWeight:600 }}>{highlight(s.name, q)}</div>
                                <div style={{ fontSize:12, color:'#64748b' }}>{highlight(s.id, q)}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="text-sm text-gray-500" style={{ alignSelf:'center' }}>בחר חבר כדי לשנות מחזיק ללילה זה</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        <div id="admin-live" aria-live="polite" aria-atomic="true" className="sr-only"></div>
        <div id="admin-live" aria-live="polite" aria-atomic="true" className="sr-only"></div>
      </div>
    </div>
  );
}
