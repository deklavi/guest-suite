import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, createHashRouter, RouterProvider, useNavigate, useLocation } from "react-router-dom";
import PublicBooking from "./pages/PublicBooking.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import Members from "./pages/Members.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import AdminDisabled from "./pages/AdminDisabled.jsx";
// Simple inline password gate; keeps AdminLogin.jsx available but unused now

function AdminRoute({ element }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const ok = typeof window !== "undefined" && localStorage.getItem("simple.admin.ok") === "yes";
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // keep RTL for admin area
    document.documentElement.dir = "rtl";
  }, []);

  if (ok) return element;

  function submit(e) {
    e.preventDefault();
    if (pwd === "1234") {
      localStorage.setItem("simple.admin.ok", "yes");
      const to = location.pathname || "/admin";
      navigate(to, { replace: true });
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
          <input
            type="password"
            value={pwd}
            onChange={(e)=>{ setPwd(e.target.value); setErr(""); }}
            className="w-full border rounded px-3 py-2"
            placeholder="הכנס סיסמה"
          />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="bg-black text-white rounded-2xl px-4 py-2 w-full">כניסה</button>
        <div className="text-center text-sm">
          <Link className="underline" to="/">← חזרה לדף חיפוש</Link>
        </div>
      </form>
    </div>
  );
}

const ENABLE_ADMIN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ENABLE_ADMIN === 'true')
  || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE !== 'production');
const ROUTER_MODE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ROUTER) || (import.meta.env.MODE === 'production' ? 'hash' : 'browser');

const routes = [
  { path: "/", element: <PublicBooking enableAdmin={ENABLE_ADMIN} /> },           // דף משתמש
  { path: "/terms", element: <Terms /> },               // דף תקנון
  { path: "/privacy", element: <Privacy /> },           // מדיניות פרטיות
];

if (ENABLE_ADMIN) {
  routes.push(
    { path: "/admin", element: <AdminRoute element={<AdminDashboard />} /> },
    { path: "/admin/members", element: <AdminRoute element={<Members />} /> },
  );
} else {
  routes.push({ path: "/admin", element: <AdminDisabled /> });
}

const makeRouter = ROUTER_MODE === 'hash' ? createHashRouter : createBrowserRouter;
const router = makeRouter(routes);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
