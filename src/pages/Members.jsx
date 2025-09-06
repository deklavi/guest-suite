import React, { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { loadMembersSeeded, saveMembers, resetDemoMembers, normalizeId3 } from "../lib/membersStore.js";

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  // Add-form autocomplete state
  const [addActiveField, setAddActiveField] = useState(null); // 'id' | 'name' | null
  const [addShowSuggest, setAddShowSuggest] = useState(false);
  const [addHighlightIdx, setAddHighlightIdx] = useState(0);
  const [bookings, setBookings] = useState([]);
  // no auto-export side effects; export is manual via button
  const [pendingChange, setPendingChange] = useState(null); // { type: 'add'|'delete', member, id }
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    try { setMembers(loadMembersSeeded()); } finally { setLoaded(true); }
  }, []);
  // Load bookings for "last vacation" column
  useEffect(() => {
    try {
      const raw = localStorage.getItem("guest.bookings");
      setBookings(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);
  // Ensure RTL like other admin pages
  useEffect(() => {
    document.documentElement.dir = "rtl";
  }, []);

  // Persist to localStorage whenever members change
  useEffect(() => {
    if (!loaded) return;
    saveMembers(members);
  }, [members, loaded]);

  // Filtered list for the table
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => String(m.id).includes(query) || String(m.name || "").toLowerCase().includes(q));
  }, [members, query]);

  // Suggestions for quick narrowing
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter(m => String(m.id).includes(query) || String(m.name || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, query]);

  function highlight(text, q) {
    const idx = String(text).toLowerCase().indexOf(String(q).toLowerCase());
    if (idx === -1 || !q) return text;
    const before = String(text).slice(0, idx);
    const match = String(text).slice(idx, idx + q.length);
    const after = String(text).slice(idx + q.length);
    return (<>{before}<mark>{match}</mark>{after}</>);
  }

  // Map memberId -> last consecutive vacation range (overall); UI will decide if 6 months passed
  const lastVacationById = useMemo(() => {
    const nightsByMember = new Map(); // id -> Set of time values for nights
    for (const b of bookings) {
      const id = String(b.memberId);
      try {
        const s = parseISO(b.start + "T00:00:00");
        const e = parseISO(b.end + "T00:00:00"); // exclusive
        for (let d = s; d < e; d = addDays(d, 1)) {
          if (!nightsByMember.has(id)) nightsByMember.set(id, new Set());
          nightsByMember.get(id).add(+d);
        }
      } catch {}
    }

    const result = new Map();
    for (const [id, set] of nightsByMember.entries()) {
      if (!set || set.size === 0) continue;
      const arr = Array.from(set).sort((a,b)=>a-b).map(ms => new Date(ms));
      let best = null; // {start:Date, end:Date}
      let curStart = arr[0];
      let prev = arr[0];
      for (let i=1;i<arr.length;i++){
        const d = arr[i];
        if (differenceInCalendarDays(d, prev) === 1) {
          prev = d;
          continue;
        }
        // close streak
        best = !best || +prev > +best.end ? { start: curStart, end: prev } : best;
        curStart = d;
        prev = d;
      }
      // final streak
      best = !best || +prev > +best.end ? { start: curStart, end: prev } : best;
      if (best) result.set(id, best);
    }
    return result;
  }, [bookings]);

  function fmtDate(d) { try { return d ? format(d, 'dd-MM-yyyy') : ''; } catch { return ''; } }
  function fmtRange(r) { return r ? `${fmtDate(r.start)} → ${fmtDate(r.end)}` : ''; }

  function addMember() {
    const trimmedId = normalizeId3(id);
    const trimmedName = name.trim();
    if (trimmedId === null) { alert("המזהה חייב להיות עד שלוש ספרות"); return; }
    if (!trimmedId || !trimmedName) return;
    if (members.some(m => String(m.id) === trimmedId)) { alert("מזהה זה כבר קיים"); return; }
    // Don't apply yet — ask for confirmation
    setPendingChange({ type: 'add', member: { id: trimmedId, name: trimmedName } });
    setConfirmOpen(true);
  }

  function deleteMember(mid) {
    const m = members.find(x => String(x.id) === String(mid));
    setPendingChange({ type: 'delete', id: String(mid), member: m });
    setConfirmOpen(true);
  }

  function exportCSV() {
    try {
      const rows = [['id','name'], ...members.map(m => [String(m.id), String(m.name??'')])];
      const csv = rows.map(r => r.map(v => String(v).replace(/"/g,'""')).map(v => /,|"|\n/.test(v)?`"${v}"`:v).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'members.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  }

  // Confirmation handlers
  function confirmApply() {
    if (!pendingChange) return;
    if (pendingChange.type === 'add') {
      const exists = members.some(m => String(m.id) === String(pendingChange.member.id));
      if (exists) { alert("מזהה זה כבר קיים"); setPendingChange(null); setConfirmOpen(false); return; }
      setMembers([...members, pendingChange.member]);
      setId(""); setName("");
    } else if (pendingChange.type === 'delete') {
      setMembers(members.filter(m => String(m.id) !== String(pendingChange.id)));
    }
    setPendingChange(null);
    setConfirmOpen(false);
  }
  function confirmCancel() {
    setPendingChange(null);
    setConfirmOpen(false);
  }

  // no automatic export on change

  function pickSuggestion(m) {
    setQuery(String(m.name || m.id || ""));
    setShowSuggest(false);
  }

  function handleSearchKeyDown(e) {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchHighlightIdx(i => (i+1)%suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchHighlightIdx(i => (i-1+suggestions.length)%suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = suggestions[searchHighlightIdx]; if (pick) pickSuggestion(pick); }
    else if (e.key === 'Escape') { e.preventDefault(); setShowSuggest(false); }
  }

  // Add-form suggestions
  const addQuery = (addActiveField === 'id' ? id : addActiveField === 'name' ? name : "").trim();
  const addSuggestions = useMemo(() => {
    if (!addQuery) return [];
    const q = addQuery.toLowerCase();
    return members
      .filter(m => String(m.id).includes(addQuery) || String(m.name || "").toLowerCase().includes(q))
      .map(m => {
        const nameL = String(m.name || "").toLowerCase();
        const idStr = String(m.id || "");
        let score = 3;
        if (nameL.startsWith(q)) score = 0;
        else if (idStr.startsWith(addQuery)) score = 1;
        else if (nameL.includes(q)) score = 2;
        return { m, score };
      })
      .sort((a,b) => a.score - b.score || String(a.m.name || "").localeCompare(String(b.m.name || ""), 'he'))
      .slice(0, 4)
      .map(x => x.m);
  }, [members, addQuery]);

  useEffect(() => {
    if (!addShowSuggest) return;
    if (addHighlightIdx >= addSuggestions.length) setAddHighlightIdx(0);
  }, [addSuggestions.length, addShowSuggest]);

  function pickAddSuggestion(m) {
    setId(String(m.id || ""));
    setName(String(m.name || ""));
    setAddShowSuggest(false);
    setAddActiveField(null);
  }

  function onAddBlurWithDelay() {
    setTimeout(() => setAddShowSuggest(false), 120);
  }

  function handleAddKeyDown(e) {
    if (!addShowSuggest || addSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAddHighlightIdx(i => (i + 1) % addSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAddHighlightIdx(i => (i - 1 + addSuggestions.length) % addSuggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = addSuggestions[addHighlightIdx];
      if (pick) pickAddSuggestion(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAddShowSuggest(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-sm">
          <a className="underline" href="/">← חזרה לדף חיפוש</a>
        </div>
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">ניהול חברים</h1>
          <nav style={{ display: 'flex', gap: 8 }}>
            <a
              href="/admin"
              style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}
            >
              ← דף המנהל
            </a>
            <a
              href="/"
              style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}
            >
              דף הבית
            </a>
            <button
              onClick={() => {
                resetDemoMembers();
                window.location.reload();
              }}
              style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}
            >
              איפוס מאגר דמו
            </button>
            <a
              href="/admin"
              onClick={(e)=>{ e.preventDefault(); try{ localStorage.removeItem('simple.admin.ok'); }catch{} window.location.assign('/admin'); }}
              style={{ textDecoration: 'none', border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 12px', borderRadius: 999, fontSize: 14 }}
            >
              התנתק
            </a>
          </nav>
        </header>

        {members.length === 0 && (
          <section className="bg-white border rounded-2xl p-4" aria-live="polite">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <div>
                אין נתונים כרגע. ניתן להוסיף חברים בטופס למטה או לייבא קובץ JSON/CSV שקיים אצלך.
              </div>
              <div>
                <input id="import-file" type="file" accept=".json,.csv,application/json,text/csv" style={{ display:'none' }} onChange={(e)=>{
                  const f = e.target.files?.[0]; if(!f) return; const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      let imported = [];
                      const text = String(reader.result||'');
                      if (f.name.toLowerCase().endsWith('.json') || text.trim().startsWith('[')) {
                        const arr = JSON.parse(text); if (Array.isArray(arr)) imported = arr;
                      } else {
                        const lines = text.split(/\r?\n/).filter(Boolean);
                        const [h, ...rows] = lines; const hasHeader = /id/i.test(h) && /name/i.test(h);
                        const dataRows = hasHeader ? rows : lines;
                        imported = dataRows.map(line => { const parts=[]; let cur=''; let q=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){ if(q && line[i+1]==='"'){cur+='"'; i++;} else q=!q; } else if(ch===',' && !q){ parts.push(cur); cur=''; } else cur+=ch; } parts.push(cur); const [idv,...nameParts]=parts; return { id:idv, name:nameParts.join(',').trim() }; });
                      }
                      const normalized = imported.map(m=>({ id: normalizeId3(m.id), name: String(m.name??'').trim() })).filter(m=>m.id && m.name && m.id!==null);
                      if (normalized.length>0) setMembers(normalized);
                    } catch {}
                  };
                  reader.readAsText(f); e.target.value='';
                }} />
                <label htmlFor="import-file" style={{ border:'1px solid #e5e7eb', background:'#f8fafc', padding:'8px 12px', borderRadius:999, cursor:'pointer' }}>ייבוא JSON/CSV</label>
              </div>
            </div>
          </section>
        )}

        {/* Manual CSV export button */}
        <section className="bg-white border rounded-2xl p-4">
          <button onClick={exportCSV} style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '8px 12px', borderRadius: 999, fontSize: 14 }}>
            ייצוא CSV
          </button>
        </section>

        {/* Confirmation bar for committing changes and updating files */}
        {confirmOpen && (
          <div className="bg-white border rounded-2xl p-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 14 }}>
              האם לעדכן את קובץ הלקוחות?
              {pendingChange?.type === 'add' && (
                <span> — הוספה: {pendingChange.member.name} ({pendingChange.member.id})</span>
              )}
              {pendingChange?.type === 'delete' && (
                <span> — מחיקה: {pendingChange.member?.name || pendingChange.id}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmApply} style={{ background: '#0f766e', color: 'white', borderRadius: 999, padding: '8px 12px', fontSize: 14 }}>כן</button>
              <button onClick={confirmCancel} style={{ background: '#f1f5f9', borderRadius: 999, padding: '8px 12px', fontSize: 14 }}>לא</button>
            </div>
          </div>
        )}

        <section className="bg-white border rounded-2xl p-4">
          <div style={{ position: 'relative' }}>
            <label htmlFor="member-search" className="block text-sm mb-1">חיפוש לפי שם או מזהה</label>
            <input
              id="member-search"
              className="w-full border rounded px-3 py-2"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggest(true); setSearchHighlightIdx(0); }}
              onFocus={() => { if (query.trim()) setShowSuggest(true); }}
              onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
              placeholder="לדוגמה: דנה / 00"
              onKeyDown={handleSearchKeyDown}
              aria-autocomplete="list" aria-controls="member-search-list" aria-expanded={showSuggest && suggestions.length>0}
            />
            {showSuggest && suggestions.length > 0 && (
              <ul id="member-search-list" role="listbox" style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                {suggestions.map((m,i) => (
                  <li key={m.id} role="option" aria-selected={i===searchHighlightIdx} style={{ padding: '10px 14px', cursor: 'pointer', background: i===searchHighlightIdx? '#f1f5f9' : 'white' }} onMouseDown={(e)=>e.preventDefault()} onClick={() => pickSuggestion(m)} onMouseEnter={()=>setSearchHighlightIdx(i)}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{highlight(m.name, query)}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{highlight(m.id, query)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-4">
          <h2 className="font-medium mb-3">הוספת חבר</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div style={{ position: 'relative' }}>
              <label className="block text-sm mb-1">מזהה (3 ספרות)</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={id}
                onChange={e => { setId(e.target.value); setAddActiveField('id'); setAddShowSuggest(true); }}
                onFocus={() => { setAddActiveField('id'); if ((id||name).trim()) setAddShowSuggest(true); }}
                onBlur={onAddBlurWithDelay}
                onKeyDown={handleAddKeyDown}
                placeholder="למשל 001"
                inputMode="numeric"
              />
              {addShowSuggest && addActiveField==='id' && addSuggestions.length>0 && (
                <ul style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                  {addSuggestions.map((m,i) => (
                    <li
                      key={m.id}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: i===addHighlightIdx ? '#f1f5f9' : 'white' }}
                      onMouseDown={(e)=>e.preventDefault()}
                      onMouseEnter={()=>setAddHighlightIdx(i)}
                      onClick={() => pickAddSuggestion(m)}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{m.id}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="sm:col-span-2" style={{ position: 'relative' }}>
              <label className="block text-sm mb-1">שם</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={name}
                onChange={e => { setName(e.target.value); setAddActiveField('name'); setAddShowSuggest(true); }}
                onFocus={() => { setAddActiveField('name'); if ((id||name).trim()) setAddShowSuggest(true); }}
                onBlur={onAddBlurWithDelay}
                onKeyDown={handleAddKeyDown}
                placeholder="למשל יעל כהן"
              />
              {addShowSuggest && addActiveField==='name' && addSuggestions.length>0 && (
                <ul style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'white', border: '1px solid #e5e7eb', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                  {addSuggestions.map((m,i) => (
                    <li
                      key={m.id}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: i===addHighlightIdx ? '#f1f5f9' : 'white' }}
                      onMouseDown={(e)=>e.preventDefault()}
                      onMouseEnter={()=>setAddHighlightIdx(i)}
                      onClick={() => pickAddSuggestion(m)}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{m.id}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={addMember}
              className="bg-black text-white rounded-2xl px-4 py-2 disabled:opacity-50"
              disabled={!id.trim() || !name.trim() || members.some(m => String(m.id) === id.trim())}
            >
              הוסף
            </button>
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-4">
          <h2 className="font-medium mb-3">רשימת חברים</h2>
          {filtered.length === 0 ? (
            <div className="text-sm text-gray-600">אין חברים עדיין.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-gray-600 border-b">
                  <th className="py-2 pr-2">מזהה</th>
                  <th className="py-2">שם</th>
                  <th className="py-2">חופשה אחרונה</th>
                  <th className="py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2 pr-2 align-top">{m.id}</td>
                    <td className="py-2 align-top">{m.name}</td>
                    <td className="py-2 align-top">{
                      (() => {
                        const r = lastVacationById.get(String(m.id));
                        if (!r) return 'כבר חצי שנה לא ';
                        const sixMonthsAgo = addMonths(new Date(), -6);
                        return r.end >= sixMonthsAgo ? fmtRange(r) : 'כבר חצי שנה לא ';
                      })()
                    }</td>
                    <td className="py-2 align-top text-left">
                      <button
                        className="bg-gray-100 rounded-xl px-3 py-1"
                        onClick={() => deleteMember(m.id)}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
