import React, { useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfDay,
  startOfMonth,
  differenceInCalendarDays,
  isSameMonth,
  max as dateMax,
  min as dateMin,
} from "date-fns";
import { he } from "date-fns/locale";
import { Calendar as CalendarIcon, Info, XCircle, CheckCircle2, Search, Trash2, Plus, ShieldCheck, Mail } from "lucide-react";

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * Kibbutz Guest Suite Booker — MVP (v2)
 *
 * שיפורים עיקריים:
 * 1) לוח שנה חודשי שמציג ימים תפוסים/פנויים + ניווט בין חודשים.
 * 2) מצב מנהל: הוספה/מחיקה של הזמנות (לביטולים/עדכונים) עם שמירה מקומית.
 * 3) דו"ח חודשי: סיכום לילות לפי חבר + חישוב עלות (120 ₪ ללילה).
 * 4) סימון "תאריכים מיוחדים" (חגים) + לוגיקה בסיסית לפתיחה חודשיים מראש ואישור 5 שבועות לפני.
 * 5) בסיס ל"שליחת מייל" (מייצר נוסח מוכן להעתקה/שליחה ע"י המנהל).  ❗שליחה אמיתית תדרוש חיבור שירות חיצוני.
 * 6) שיפור עיצוב כללי (עדיין ללא Tailwind מותקן, אז משתמש במחלקות כ-NOOP; בהמשך נוסיף סטייל גלובלי).
 *
 * הערה: הדגמה ללא שרת — כל הנתונים נשמרים ב-localStorage בדפדפן.
 * ניתן לאפס נתונים ע"י מחיקת localStorage לדומיין.
 *
 * כללי בית מרכזיים (לפי המסמך):
 * - מקסימום 5 לילות בחודש קלנדרי. לא "מדביקים" סוף חודש להתחלת הבא כדי לעבור 5. (נחמיר: לא יותר מ-5 לילות רצופים בהזמנה.)
 * - עלות לילה: 120 ₪. (לדו"ח.)
 * - בחגים: הרשמה נפתחת חודשיים מראש; אישור סופי 5 שבועות לפני. (העדפת צדק היסטורית — שלב הבא.)
 */

// ──────────────────────────────────────────────────────────────────────────────
// כלי עזר בסיסיים
const toISODate = (d) => format(d, "yyyy-MM-dd");
const fromISO = (s) => startOfDay(parseISO(s));
const todayISO = () => toISODate(new Date());

function nightsBetween(start, end) {
  return Math.max(0, differenceInCalendarDays(fromISO(end), fromISO(start)));
}

function intervalNightsISO(startISO, endISO) {
  // מחזיר מערך תאריכים (yyyy-MM-dd) של לילות בטווח [start, end)
  const start = fromISO(startISO);
  const end = fromISO(endISO);
  if (isAfter(start, end)) return [];
  const lastNight = addDays(end, -1);
  return eachDayOfInterval({ start, end: lastNight }).map(toISODate);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  // [aStart, aEnd) חופף ל-[bStart, bEnd) אם aStart < bEnd && bStart < aEnd
  return isBefore(fromISO(aStart), fromISO(bEnd)) && isBefore(fromISO(bStart), fromISO(aEnd));
}

function listConflicts(request, bookings) {
  const { start, end } = request;
  return bookings.filter((b) => overlaps(start, end, b.start, b.end));
}

function contiguousBlocks(datesISO) {
  if (!datesISO.length) return [];
  const sorted = [...datesISO].sort();
  const blocks = [];
  let blockStart = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = fromISO(sorted[i - 1]);
    const cur = fromISO(sorted[i]);
    if (differenceInCalendarDays(cur, prev) !== 1) {
      blocks.push([blockStart, toISODate(addDays(prev, 1))]);
      blockStart = sorted[i];
    }
  }
  blocks.push([blockStart, toISODate(addDays(fromISO(sorted.at(-1)), 1))]);
  return blocks; // מערך של [startISO, endISO)
}

function monthKey(dateOrISO) {
  const d = typeof dateOrISO === "string" ? fromISO(dateOrISO) : dateOrISO;
  return format(d, "yyyy-MM");
}

// חישוב שימוש חודשי מכל ההזמנות הקיימות
function usageMapFromBookings(bookings) {
  const usage = new Map(); // key = `${memberId}:${yyyy-MM}` → nights
  bookings.forEach((b) => {
    intervalNightsISO(b.start, b.end).forEach((iso) => {
      const key = `${b.memberId}:${monthKey(iso)}`;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
  });
  return usage;
}

// כללי חגים בסיסיים
function calcHolidayWindowMeta(special) {
  // special: {start, end, label, type:'holiday'}
  const start = fromISO(special.start);
  const openDate = addDays(start, -60); // חודשיים ≈ 60 יום
  const decisionDate = addDays(start, -35); // ~5 שבועות
  return { openDate, decisionDate };
}

function intersectsSpecial(request, specials, type = "holiday") {
  return specials.filter((s) => s.type === type && overlaps(request.start, request.end, s.start, s.end));
}

// מגבלת 5 לילות רצופים (בנוסף למגבלת 5 בחודש)
function exceedsConsecutiveLimit(startISO, endISO, maxNights = 5) {
  return nightsBetween(startISO, endISO) > maxNights;
}

// ──────────────────────────────────────────────────────────────────────────────
// שמירה ב-localStorage
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

// ──────────────────────────────────────────────────────────────────────────────
// נתוני דוגמה התחלתיים
const INITIAL_BOOKINGS = [
  { id: 1, memberId: "123", memberName: "רות כהן", start: "2025-09-10", end: "2025-09-13" },
  { id: 2, memberId: "234", memberName: "דקל לוי", start: "2025-09-18", end: "2025-09-20" },
];

const INITIAL_SPECIALS = [
  // דוגמה: חג סוכות 2025 (נניח תאריכים מקורבים)
  { id: "h1", type: "holiday", label: "סוכות", start: "2025-10-13", end: "2025-10-20" },
];

const NIGHT_PRICE = 120; // ₪ ללילה
const MONTHLY_LIMIT = 5; // לילות לחודש

// ──────────────────────────────────────────────────────────────────────────────
// קומפוננטים בסיסיים ("shadcn-lite")
const Card = ({ children, className = "" }) => (
  <div className={`bg-white shadow-sm rounded-2xl p-5 border border-gray-100 ${className}`}>{children}</div>
);
const Label = ({ children }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{children}</label>
);
const Input = (props) => (
  <input
    {...props}
    className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 ${props.className || ""}`}
  />
);
const Button = ({ children, onClick, variant = "default", disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition
      ${variant === "default" ? "bg-black text-white hover:bg-gray-900" : "bg-gray-100 text-gray-900 hover:bg-gray-200"}
      disabled:opacity-50`}
  >
    {children}
  </button>
);

// ──────────────────────────────────────────────────────────────────────────────
// לוח שנה חודשי (תצוגה בלבד + לחיצה ליום לפרטים)
function MonthCalendar({ monthDate, bookings, specials, onPrev, onNext, onSelectDay }) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const days = eachDayOfInterval({ start, end });

  // סטטוס לכל יום: "free" | "booked" | "holiday"
  const nightStatus = (iso) => {
    // אם לילה כלול בחג → holiday; אם יש הזמנה → booked; אחרת free
    const inHoliday = specials.some((s) => s.type === "holiday" && intervalNightsISO(s.start, s.end).includes(iso));
    if (inHoliday) return "holiday";
    const inBooking = bookings.some((b) => intervalNightsISO(b.start, b.end).includes(iso));
    return inBooking ? "booked" : "free";
  };

  const weekNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]; // כותרות עמודות

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">לוח שנה — {format(monthDate, "LLLL yyyy", { locale: he })}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onPrev}>‹ חודש קודם</Button>
          <Button variant="ghost" onClick={onNext}>חודש הבא ›</Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
        {weekNames.map((w) => (
          <div key={w} className="py-1 font-medium">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISODate(d);
          const status = nightStatus(iso);
          const isToday = iso === todayISO();
          return (
            <button
              key={iso}
              onClick={() => onSelectDay?.(iso)}
              className={`aspect-square rounded-lg border text-sm flex items-center justify-center select-none
                ${status === "booked" ? "bg-red-100 border-red-200 text-red-800" :
                  status === "holiday" ? "bg-amber-100 border-amber-200 text-amber-800" :
                  "bg-gray-50 border-gray-200 text-gray-800"}
                ${isToday ? "ring-2 ring-black" : ""}
              `}
              title={status === "booked" ? "תפוס" : status === "holiday" ? "חג/תאריך מיוחד" : "פנוי"}
            >
              {format(d, "d", { locale: he })}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-600 mt-3">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"/> תפוס</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block"/> חג</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block"/> פנוי</span>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// דו"ח חודשי (לילות ועלות)
function MonthlyReport({ monthDate, bookings }) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const nightsInMonth = new Map(); // memberId → {name, nights}

  bookings.forEach((b) => {
    intervalNightsISO(b.start, b.end).forEach((iso) => {
      const d = fromISO(iso);
      if (isAfter(d, end) || isBefore(d, start)) return;
      const rec = nightsInMonth.get(b.memberId) || { name: b.memberName, nights: 0 };
      rec.nights += 1;
      nightsInMonth.set(b.memberId, rec);
    });
  });

  const rows = Array.from(nightsInMonth.entries()).map(([memberId, rec]) => ({
    memberId,
    memberName: rec.name,
    nights: rec.nights,
    cost: rec.nights * NIGHT_PRICE,
  }));

  const total = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">דו"ח חודשי — {format(monthDate, "LLLL yyyy", { locale: he })}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">אין לילות רשומים החודש.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-600 border-b">
                <th className="py-2">חבר</th>
                <th className="py-2">מזהה</th>
                <th className="py-2">סה"כ לילות</th>
                <th className="py-2">עלות (₪{NIGHT_PRICE}/לילה)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId} className="border-b">
                  <td className="py-2">{r.memberName}</td>
                  <td className="py-2">{r.memberId}</td>
                  <td className="py-2">{r.nights}</td>
                  <td className="py-2">₪{r.cost.toLocaleString()}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold" colSpan={3}>סה"כ לחודש</td>
                <td className="py-2 font-semibold">₪{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// טופס מנהל: הוספה/מחיקה של הזמנות + תאריכים מיוחדים
function AdminPanel({ bookings, setBookings, specials, setSpecials }) {
  const [mId, setMId] = useState("");
  const [mName, setMName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [msg, setMsg] = useState("");

  const [label, setLabel] = useState("");
  const [spStart, setSpStart] = useState("");
  const [spEnd, setSpEnd] = useState("");

  function addBooking() {
    setMsg("");
    if (!mId || !mName || !start || !end) { setMsg("יש להשלים את כל השדות"); return; }
    if (!isBefore(fromISO(start), fromISO(end))) { setMsg("טווח תאריכים לא תקין"); return; }

    const req = { memberId: mId, memberName: mName, start, end };

    // בדיקת התנגשות
    const conflicts = listConflicts(req, bookings);
    if (conflicts.length) {
      setMsg("התנגשות עם הזמנות קיימות — לא ניתן להוסיף.");
      return;
    }

    // כלל 5 לילות רצופים
    if (exceedsConsecutiveLimit(start, end, MONTHLY_LIMIT)) {
      setMsg(`לא ניתן להזמין יותר מ-${MONTHLY_LIMIT} לילות רצופים (כולל מעבר בין חודשים).`);
      return;
    }

    // כלל 5 לילות בחודש (נגזר מכל ההזמנות + הבקשה)
    const usage = usageMapFromBookings(bookings);
    const nights = intervalNightsISO(start, end);
    const overflows = new Set();
    nights.forEach((iso) => {
      const ym = monthKey(iso);
      const key = `${mId}:${ym}`;
      const cur = usage.get(key) || 0;
      const newVal = cur + 1;
      if (newVal > MONTHLY_LIMIT) overflows.add(ym);
      usage.set(key, newVal);
    });
    if (overflows.size) {
      setMsg(`חריגה ממכסת לילות חודשית (${MONTHLY_LIMIT}) בחודשים: ${Array.from(overflows).join(", ")}`);
      return;
    }

    // חגים: אם הטווח כולל חג — מציג הודעת "ממתין לאישור"
    const hits = intersectsSpecial(req, specials, "holiday");
    let note = "";
    if (hits.length) {
      const meta = calcHolidayWindowMeta(hits[0]);
      const now = new Date();
      if (isBefore(now, meta.openDate)) {
        note = `לא ניתן להזמין עדיין: ההרשמה נפתחת ב-${format(meta.openDate, "d.LL.yyyy")}`;
      } else if (isBefore(now, meta.decisionDate)) {
        note = `הבקשה נרשמה — תשובה סופית תינתן עד ${format(meta.decisionDate, "d.LL.yyyy")}`;
      }
    }

    const id = Math.random().toString(36).slice(2);
    setBookings([...bookings, { id, ...req, note }]);
    setMsg(note || "נוספה הזמנה");
  }

  function removeBooking(id) {
    setBookings(bookings.filter((b) => b.id !== id));
  }

  function addSpecial() {
    if (!label || !spStart || !spEnd) return;
    const id = Math.random().toString(36).slice(2);
    setSpecials([...specials, { id, type: "holiday", label, start: spStart, end: spEnd }]);
    setLabel(""); setSpStart(""); setSpEnd("");
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4"><ShieldCheck size={18}/> <div className="font-semibold">אזור מנהל</div></div>

      <div className="grid md:grid-cols-5 gap-3 items-end">
        <div>
          <Label>ת"ז/מזהה</Label>
          <Input value={mId} onChange={(e) => setMId(e.target.value)} placeholder="123456789" />
        </div>
        <div>
          <Label>שם</Label>
          <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="שם מלא" />
        </div>
        <div>
          <Label>צ׳ק-אין</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <Label>צ׳ק-אאוט</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <Button onClick={addBooking}><Plus size={16}/> הוסף הזמנה</Button>
        </div>
      </div>
      {msg && <div className="text-sm text-gray-700 mt-2">{msg}</div>}

      <div className="mt-6">
        <div className="font-medium mb-2">הזמנות קיימות</div>
        {bookings.length === 0 ? (
          <div className="text-sm text-gray-500">אין הזמנות</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-gray-600 border-b">
                  <th className="py-2">שם</th>
                  <th className="py-2">מזהה</th>
                  <th className="py-2">טווח</th>
                  <th className="py-2">הערה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="py-2">{b.memberName}</td>
                    <td className="py-2">{b.memberId}</td>
                    <td className="py-2">{format(fromISO(b.start), "d LLL yyyy", { locale: he })} → {format(addDays(fromISO(b.end), -1), "d LLL yyyy", { locale: he })}</td>
                    <td className="py-2">{b.note || ""}</td>
                    <td className="py-2 text-left">
                      <Button variant="ghost" onClick={() => removeBooking(b.id)} title="מחק"><Trash2 size={16}/></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="font-medium mb-2">תאריכים מיוחדים (חגים)</div>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <Label>שם חג/אירוע</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="למשל פסח" />
          </div>
          <div>
            <Label>מתאריך</Label>
            <Input type="date" value={spStart} onChange={(e) => setSpStart(e.target.value)} />
          </div>
          <div>
            <Label>עד תאריך (צ׳ק-אאוט)</Label>
            <Input type="date" value={spEnd} onChange={(e) => setSpEnd(e.target.value)} />
          </div>
          <div>
            <Button onClick={addSpecial}><Plus size={16}/> הוסף חג</Button>
          </div>
        </div>
        {specials.length > 0 && (
          <ul className="list-disc pr-5 mt-2 text-sm text-gray-700">
            {specials.map((s) => (
              <li key={s.id}>{s.label}: {format(fromISO(s.start), "d LLL yyyy", { locale: he })} → {format(addDays(fromISO(s.end), -1), "d LLL yyyy", { locale: he })}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// מסך ראשי
export default function App() {
  useEffect(() => { document.documentElement.dir = "rtl"; }, []);

  const [bookings, setBookings] = useLocalStorage("guest.bookings", INITIAL_BOOKINGS);
  const [specials, setSpecials] = useLocalStorage("guest.specials", INITIAL_SPECIALS);

  const [memberId, setMemberId] = useState("234");
  const [memberName, setMemberName] = useState("דקל לוי");
  const [startReq, setStartReq] = useState(toISODate(new Date()));
  const [endReq, setEndReq] = useState(toISODate(addDays(new Date(), 2)));

  const [result, setResult] = useState(null);

  const [monthView, setMonthView] = useState(startOfMonth(new Date()));

  const canCheck = useMemo(
    () => !!startReq && !!endReq && !!memberId && isBefore(fromISO(startReq), fromISO(endReq)),
    [startReq, endReq, memberId]
  );

  function prettyRange([s, e]) {
    const fmt = (x) => format(fromISO(x), "d LLL yyyy", { locale: he });
    const endInclusive = format(addDays(fromISO(e), -1), "d LLL yyyy", { locale: he });
    return `${fmt(s)} → ${endInclusive}`;
  }

  function handleCheck() {
    const req = { start: startReq, end: endReq, memberId, memberName };

    // חוקים
    const conflicts = listConflicts(req, bookings);
    const nights = intervalNightsISO(startReq, endReq);

    // כלל 5 רצופים
    if (exceedsConsecutiveLimit(startReq, endReq, MONTHLY_LIMIT)) {
      setResult({ ok: false, reason: `לא ניתן להזמין יותר מ-${MONTHLY_LIMIT} לילות רצופים (כולל מעבר בין חודשים).`, conflicts, freeBlocks: [], usageWarn: [] });
      return;
    }

    // כלל 5 בחודש
    const usage = usageMapFromBookings(bookings);
    const overflows = new Set();
    nights.forEach((iso) => {
      const key = `${memberId}:${monthKey(iso)}`;
      const cur = usage.get(key) || 0;
      const newVal = cur + 1;
      if (newVal > MONTHLY_LIMIT) overflows.add(monthKey(iso));
      usage.set(key, newVal);
    });

    const hits = intersectsSpecial(req, specials, "holiday");
    let holidayNote = "";
    if (hits.length) {
      const meta = calcHolidayWindowMeta(hits[0]);
      const now = new Date();
      if (isBefore(now, meta.openDate)) {
        holidayNote = `לא ניתן להזמין עדיין: ההרשמה נפתחת ב-${format(meta.openDate, "d.LL.yyyy")}`;
      } else if (isBefore(now, meta.decisionDate)) {
        holidayNote = `הבקשה נרשמה — תשובה סופית תינתן עד ${format(meta.decisionDate, "d.LL.yyyy")}`;
      }
    }

    const freeBlocks = contiguousBlocks(nights.filter((iso) => {
      // ימים פנויים מתוך הבקשה
      const blocked = bookings.some((b) => intervalNightsISO(b.start, b.end).includes(iso));
      return !blocked;
    }));

    const ok = conflicts.length === 0 && overflows.size === 0 && !holidayNote.startsWith("לא ניתן להזמין");

    setResult({ ok, conflicts, freeBlocks, request: req, overflows: Array.from(overflows), holidayNote });
  }

  // "שלח מייל" — מייצר נוסח טקסט להעתקה (חיבור SMTP אמיתי בשלב הבא)
  function buildEmailText(result) {
    if (!result) return "";
    const title = result.ok ? "אישור הזמנה" : "סטטוס בקשה";
    const range = prettyRange([result.request.start, result.request.end]);
    let body = `${title}\n\n`;
    body += `שם: ${result.request.memberName} (מזהה ${result.request.memberId})\n`;
    body += `טווח מבוקש: ${range}\n`;
    if (result.ok) {
      const nights = nightsBetween(result.request.start, result.request.end);
      const cost = nights * NIGHT_PRICE;
      body += `\nהבקשה אושרה. סה"כ לילות: ${nights}. עלות משוערת: ₪${cost}.`;
    } else {
      if (result.overflows?.length) body += `\nחריגה ממכסת לילות בחודשים: ${result.overflows.join(", ")}.`;
      if (result.conflicts?.length) body += `\nהתנגשות עם הזמנות קיימות.`;
      if (result.holidayNote) body += `\n${result.holidayNote}`;
      if (result.freeBlocks?.length) {
        body += "\nחלופות מתוך הטווח:\n" + result.freeBlocks.map((b) => `- ${prettyRange(b)}`).join("\n");
      }
    }
    body += "\n\nנהלי הדירה: החזרת מפתח, ניקיון, ועלות 120 ₪ ללילה.";
    return body;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">מערכת בדיקת זמינות — דירת האירוח (גרסת הדגמה v2)</h1>
        </header>

        {/* טופס בדיקת זמינות */}
        <Card>
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>ת"ז / מזהה חבר</Label>
              <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="למשל 012345678" />
            </div>
            <div>
              <Label>שם מלא</Label>
              <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="שם החבר" />
            </div>
            <div>
              <Label>תאריך הגעה (צ׳ק-אין)</Label>
              <Input type="date" value={startReq} onChange={(e) => setStartReq(e.target.value)} />
            </div>
            <div>
              <Label>תאריך עזיבה (צ׳ק-אאוט)</Label>
              <Input type="date" value={endReq} onChange={(e) => setEndReq(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleCheck} disabled={!canCheck}><Search size={16} />בדוק זמינות</Button>
            <div className="text-xs text-gray-500">הערה: הספירה היא לפי לילות (העזיבה בבוקר היום האחרון).</div>
          </div>
        </Card>

        {/* תוצאה */}
        {result && (
          <Card className="space-y-3">
            {result.ok ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="text-green-600" />
                <div>
                  <div className="font-semibold">המועדים פנויים!</div>
                  <div className="text-sm text-gray-600">טווח מבוקש: {prettyRange([result.request.start, result.request.end])}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <XCircle className="text-red-600" />
                  <div>
                    <div className="font-semibold">לא פנוי לכל הטווח/נוגד כללים.</div>
                    <div className="text-sm text-gray-600">טווח מבוקש: {prettyRange([result.request.start, result.request.end])}</div>
                    {result.overflows?.length > 0 && (
                      <div className="text-sm text-gray-700 mt-1">חריגה ממכסה חודשית ({MONTHLY_LIMIT}) בחודשים: {result.overflows.join(", ")}</div>
                    )}
                    {result.holidayNote && (
                      <div className="text-sm text-amber-700 mt-1">{result.holidayNote}</div>
                    )}
                  </div>
                </div>

                {result.conflicts?.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">התנגשות עם הזמנות קיימות:</div>
                    <ul className="list-disc pr-5 text-sm text-gray-700 space-y-1">
                      {result.conflicts.map((b) => (
                        <li key={b.id}>
                          {b.memberName} — {format(fromISO(b.start), "d LLL yyyy", { locale: he })} → {format(addDays(fromISO(b.end), -1), "d LLL yyyy", { locale: he })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.freeBlocks?.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">אפשר להציע חלופה קצרה יותר מתוך הטווח שביקשת:</div>
                    <ul className="list-disc pr-5 text-sm text-gray-700 space-y-1">
                      {result.freeBlocks.map((blk, idx) => (
                        <li key={idx}>{prettyRange(blk)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t">
              <details>
                <summary className="text-sm text-gray-600 inline-flex items-center gap-2 cursor-pointer"><Mail size={14}/> יצירת נוסח מייל (להעתקה)</summary>
                <textarea readOnly className="mt-2 w-full h-40 text-sm border rounded p-2" value={buildEmailText(result)} />
              </details>
            </div>
          </Card>
        )}

        {/* לוח שנה + דו"ח חודשי */}
        <div className="grid md:grid-cols-2 gap-6">
          <MonthCalendar
            monthDate={monthView}
            bookings={bookings}
            specials={specials}
            onPrev={() => setMonthView(addDays(monthView, -1 * differenceInCalendarDays(endOfMonth(monthView), startOfMonth(monthView)) - 1))}
            onNext={() => setMonthView(addDays(endOfMonth(monthView), 1))}
            onSelectDay={(iso) => {
              // בקליק נציג הזמנות שכוללות את הלילה הזה
              const related = bookings.filter((b) => intervalNightsISO(b.start, b.end).includes(iso));
              const msg = related.length
                ? `בלילה של ${format(fromISO(iso), "d LLL yyyy", { locale: he })} יש ${related.length} הזמנות.`
                : `הַלַּיְלָה של ${format(fromISO(iso), "d LLL yyyy", { locale: he })} פנוי.`;
              alert(msg);
            }}
          />

          <MonthlyReport monthDate={monthView} bookings={bookings} />
        </div>

        {/* מנהל */}
        <AdminPanel bookings={bookings} setBookings={setBookings} specials={specials} setSpecials={setSpecials} />

        <footer className="text-center text-xs text-gray-500 py-6">© {new Date().getFullYear()} Kibbutz Guest Suite — Demo v2</footer>
      </div>
    </div>
  );
}
