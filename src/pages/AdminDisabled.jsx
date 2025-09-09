import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function AdminDisabled() {
  useEffect(() => { document.documentElement.dir = 'rtl'; }, []);
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">אזור המנהל כבוי בפרודקשן</h1>
        <p className="text-gray-700">
          מסכי הניהול לא נכללים בגרסה הציבורית. לפריסה מאובטחת של הניהול, בנו אתר
          נפרד או הפעלו משתנה סביבה <code>VITE_ENABLE_ADMIN=true</code> בעת הבנייה
          (לא מומלץ לפרסום ציבורי ללא הגנה).
        </p>
        <div>
          <Link className="underline" to="/">← חזרה לדף החיפוש</Link>
        </div>
      </div>
    </div>
  );
}
