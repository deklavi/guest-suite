// Simple i18n helper — can be extended to other languages.
export const lang = 'he';

export const strings = {
  he: {
    welcome: 'ברוכים הבאים לדירת האירוח',
    subtitle: 'הזינו פרטי חבר ותאריכים כדי לבדוק זמינות ולהזמין',
    adminPage: 'דף מנהל',
    memberIdLabel: 'מזהה חבר (3 ספרות)',
    memberNameLabel: 'שם מלא',
    arrivalDate: 'תאריך הגעה',
    departureDate: 'תאריך עזיבה',
    checkAvailability: 'בדוק זמינות',
    reserveTheseDates: 'הזמנת תאריכים אלה',
    lastVacation: 'חופשה אחרונה',
  },
};

export function t(key) {
  return strings[lang]?.[key] ?? key;
}

export function applyDir() {
  // Auto set document dir by language
  if (typeof document !== 'undefined') {
    document.documentElement.dir = lang === 'he' || lang === 'ar' ? 'rtl' : 'ltr';
  }
}

