import React, { useEffect, useState } from "react";

const ADMIN_PASSWORD = "kibbutz123"; // אפשר לשנות כאן

export default function AdminLogin({ onSuccess }) {
  useEffect(() => { document.documentElement.dir = "rtl"; }, []);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    if (pwd === ADMIN_PASSWORD) {
      localStorage.setItem("guest.admin.ok", "yes");
      onSuccess?.();
    } else {
      setErr("סיסמה שגויה");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <form onSubmit={submit} className="bg-white border rounded-2xl p-6 w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold">כניסה למנהל</h1>
        <div>
          <label className="block text-sm mb-1">סיסמה</label>
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
                 className="w-full border rounded px-3 py-2" placeholder="הכנס סיסמה" />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="bg-black text-white rounded-2xl px-4 py-2 w-full">כניסה</button>
        <div className="text-center text-sm">
          <a className="underline" href="/">← חזרה לדף הראשי</a>
        </div>
      </form>
    </div>
  );
}
