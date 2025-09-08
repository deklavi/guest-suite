import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function Terms() {
  const [text, setText] = useState("");

  useEffect(() => {
    document.documentElement.dir = "rtl";
    fetch("/terms.md")
      .then(r => (r.ok ? r.text() : Promise.reject()))
      .then(setText)
      .catch(() => setText(defaultText));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50" style={{ padding: 24 }}>
      <div className="mx-auto" style={{ maxWidth: 820 }}>
        <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>תקנון דירת האירוח</div>
            <div style={{ fontSize: 14, color: '#475569' }}>מסמך עקרונות ושימוש עבור החברים והאורחים</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/" style={{ textDecoration: 'underline', fontSize: 14 }}>דף החיפוש</Link>
            <Link to="/admin" style={{ textDecoration: 'underline', fontSize: 14 }}>דף מנהל</Link>
            <button onClick={() => window.print()} style={{ border: '1px solid #e5e7eb', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>הדפס</button>
          </div>
        </header>

        <article className="bg-white border" style={{ borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 16 }}>{text}</div>
        </article>
      </div>
    </div>
  );
}

const defaultText = `
# תקנון דירת האירוח (טיוטה)

מסמך זה נועד לשמש כנוסח התחלתי בהתאם ל"מצע לדיון דירת אירוח". 
ניתן להחליף/לעדכן את התוכן בקובץ /public/terms.md — הדף ייטען אותו אוטומטית.

## מטרות ושימוש
- יצירת מסגרת הוגנת וברורה למימוש זכות אירוח לחברי הקיבוץ.
- שמירה על זמינות, סדר וניקיון לטובת כלל החברים.

## זכאות והגבלות
- הזמנת הדירה מיועדת לחברי הקיבוץ ובני משפחותיהם בהתאם לכללי הבית.
- מגבלת לינות חודשית כפי שמופיעה במערכת עלולה לחול; מנהל רשאי לאשר חריגים.

## הזמנה וביטול
- הזמנה נחשבת מאושרת לאחר הופעתה ביומן ההזמנות.
- ביטול/שינוי — לפי מדיניות שתיקבע (למשל X ימים מראש ללא חיוב).

## כללי התנהגות וניקיון
- יש לשמור על ניקיון, שקט, ושמירה על הרכוש.
- איסור עישון בדירה.

## אכיפה וניהול
- הנהלת הדירה רשאית לעדכן תקנון זה ולפעול לאכיפתו.
`;
