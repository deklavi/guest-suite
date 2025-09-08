import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function Privacy() {
  const [text, setText] = useState("");
  useEffect(() => {
    document.documentElement.dir = "rtl";
    fetch("/privacy.md").then(r => (r.ok ? r.text() : Promise.reject())).then(setText).catch(() => setText(defaultText));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50" style={{ padding: 24 }}>
      <div className="mx-auto" style={{ maxWidth: 820 }}>
        <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>מדיניות פרטיות</div>
            <div style={{ fontSize: 14, color: '#475569' }}>מידע על נתונים, שימוש ושקיפות</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/" style={{ textDecoration: 'underline', fontSize: 14 }}>דף החיפוש</Link>
            <Link to="/terms" style={{ textDecoration: 'underline', fontSize: 14 }}>תקנון</Link>
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
# מדיניות פרטיות (טיוטה)

האפליקציה פועלת בצד הלקוח בלבד (Front‑End), ללא שרת מאחורי הקלעים. המשמעות:

## מה נשמר ובאיזה מקום
- הנתונים נשמרים בדפדפן המקומי (localStorage) של המשתמש:
  - guest.members — רשימת חברים
  - guest.members.seedVersion — גרסת זריעה (בסביבת פיתוח בלבד)
  - guest.bookings — הזמנות
  - simple.admin.ok — סימון כניסה של מנהל בדפדפן זה בלבד
- ייצוא/גיבוי: בעת ייצוא, קבצי JSON/CSV נשמרים אצלכם במחשב בלבד.

## מה לא נשמר
- אין בסיס נתונים שרתי, ואין שליחת מידע החוצה כברירת מחדל.
- אין קובצי cookies פרט לכלי הדפדפן הסטנדרטיים.

## גישה ותפקידי מנהל
- מסכי הניהול זמינים רק בסביבה מוגנת. בפרסום ציבורי ניתן לכבותם או להגן בסיסמה/שכבת גישה.
- מנהל יכול לנהל הזמנות ולשחרר תאריכים. מומלץ להשתמש בדפדפן מאובטח.

## שקיפות ושינויים
- ייתכנו עדכונים למדיניות. תאריך העדכון יוצג ברשומה זו.

## יצירת קשר
- בכל שאלה על פרטיות ושימוש בנתונים, פנו לצוות הדירה/הנהלת הקיבוץ.
`;
