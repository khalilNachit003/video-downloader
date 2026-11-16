/**
 * Bilingual UI strings. Arabic is the default (RTL), English is the
 * secondary language (LTR).
 */
export const STRINGS = {
  ar: {
    dir: 'rtl',
    lang: 'ar',
    tagline: 'نزّل المقاطع من يوتيوب وفيسبوك وإنستغرام بسهولة',
    tabSingle: 'رابط واحد',
    tabMulti: 'روابط متعددة',
    tabPlaylist: 'قائمة تشغيل',
    placeholder: 'الصق رابط الفيديو هنا…',
    placeholderMulti: 'الصق رابطاً في كل سطر (حتى 20 رابطاً)…',
    placeholderPlaylist: 'الصق رابط قائمة التشغيل أو القناة…',
    paste: 'لصق',
    clear: 'مسح',
    analyze: 'تحليل',
    analyzeShort: 'تحليل',
    analyzing: 'جارٍ التحليل…',
    download: 'تنزيل',
    downloadMp3: 'تنزيل MP3',
    quality: 'الجودة',
    best: 'الأفضل',
    preparing: 'جارٍ التحضير…',
    downloading: 'جارٍ التنزيل…',
    started: 'بدأ التنزيل — سيبدأ الملف بالظهور خلال ثوانٍ…',
    results: 'النتيجة',
    supportedSites: 'المواقع المدعومة',
    history: 'سجل التنزيلات',
    historyEmpty: 'لا يوجد تنزيلات سابقة. ابدأ الآن!',
    clearHistory: 'مسح السجل',
    redownload: 'تنزيل مرة أخرى',
    openOriginal: 'فتح الأصل',
    duration: 'المدة',
    views: 'المشاهدات',
    size: 'الحجم',
    quality2: 'الجودة',
    title: 'العنوان',
    noQualities: 'لا توجد جودات متاحة.',
    errorInvalidUrl: 'الرجاء إدخال رابط صحيح.',
    errorUnsupported: 'هذه المنصة غير مدعومة.',
    errorGeneric: 'حدث خطأ. حاول مرة أخرى.',
    errorNoSelection: 'اختر رابطاً واحداً على الأقل.',
    selectAll: 'تحديد الكل',
    deselectAll: 'إلغاء التحديد',
    downloadSelected: 'تنزيل المحدد',
    copyLink: 'نسخ الرابط',
    copied: 'تم النسخ!',
    itemsSelected: 'محدد',
    language: 'English',
    footerRights: 'جميع الحقوق محفوظة',
    disclaimerTitle: 'تنبيه قانوني',
    disclaimerBody:
      'هذه الأداة مخصصة لتحميل محتوى تملكه أو تملك حقوقه أو محتوى يكون متاحاً للتحميل بشكل قانوني. يرجى عدم استخدامه لتنزيل محتوى محمي بحقوق الملكية الفكرية دون إذن. أنت وحدك المسؤول عن كيفية استخدامك للموقع.',
    aboutTitle: 'عن الموقع',
    aboutBody:
      'موقع بسيط وسريع لتحميل مقاطع الفيديو من منصات التواصل الاجتماعي. يعمل على خادم يحلّل الرابط ثم يرسل الملف مباشرة إلى متصفحك، بدون تخزين الملفات على الخادم.',
    howTitle: 'كيف يعمل؟',
    how1: 'الصق رابط الفيديو',
    how2: 'اضغط تحليل',
    how3: 'اختر الجودة واضغط تنزيل',
    terms: 'شروط الاستخدام',
    privacy: 'الخصوصية',
    privacyBody:
      'لا نقوم بتخزين روابطك أو ملفاتك. سجل التنزيلات يُحفظ في متصفحك فقط (localStorage) ولا يُرسل إلى الخادم.',
    files: 'ملفات',
    items: 'مقطع',
    addMore: 'أضف روابط',
    remove: 'حذف',
    working: 'جارٍ المعالجة…',
    done: 'تم',
    failed: 'فشل',
    zoomTitle: 'معاينة',
    close: 'إغلاق',
    pasteFail: 'تعذّر قراءة الحافظة. انسخ الرابط يدوياً.',
    youtube: 'يوتيوب',
    facebook: 'فيسبوك',
    instagram: 'إنستغرام',
    downloading2: 'جارٍ التنزيل…',
    downloaded: 'تم التنزيل',
    cancel: 'إلغاء',
    ffmpegMissing:
      'تنبيه: ffmpeg غير مثبت على الخادم، لذلك قد لا تعمل الجودات المدمجة ولا تحويل MP3.',
  },

  en: {
    dir: 'ltr',
    lang: 'en',
    tagline: 'Download clips from YouTube, Facebook & Instagram in seconds',
    tabSingle: 'Single link',
    tabMulti: 'Multiple links',
    tabPlaylist: 'Playlist',
    placeholder: 'Paste the video link here…',
    placeholderMulti: 'Paste one link per line (up to 20)…',
    placeholderPlaylist: 'Paste a playlist or channel link…',
    paste: 'Paste',
    clear: 'Clear',
    analyze: 'Analyze',
    analyzeShort: 'Analyze',
    analyzing: 'Analyzing…',
    download: 'Download',
    downloadMp3: 'Download MP3',
    quality: 'Quality',
    best: 'Best',
    preparing: 'Preparing…',
    downloading: 'Downloading…',
    started: 'Download started — the file will appear in a few seconds…',
    results: 'Result',
    supportedSites: 'Supported sites',
    history: 'Download history',
    historyEmpty: 'No downloads yet. Start your first one!',
    clearHistory: 'Clear history',
    redownload: 'Download again',
    openOriginal: 'Open original',
    duration: 'Duration',
    views: 'Views',
    size: 'Size',
    quality2: 'Quality',
    title: 'Title',
    noQualities: 'No qualities available.',
    errorInvalidUrl: 'Please enter a valid link.',
    errorUnsupported: 'This platform is not supported.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNoSelection: 'Select at least one link.',
    selectAll: 'Select all',
    deselectAll: 'Deselect',
    downloadSelected: 'Download selected',
    copyLink: 'Copy link',
    copied: 'Copied!',
    itemsSelected: 'selected',
    language: 'العربية',
    footerRights: 'All rights reserved',
    disclaimerTitle: 'Legal notice',
    disclaimerBody:
      'This tool is meant for downloading content you own, that you have rights to, or that is legally available for download. Please do not use it to obtain copyrighted material without permission. You alone are responsible for how you use this site.',
    aboutTitle: 'About',
    aboutBody:
      'A simple and fast website for downloading videos from social platforms. The server resolves the link and streams the file straight to your browser — files are never stored on the server.',
    howTitle: 'How it works',
    how1: 'Paste the video link',
    how2: 'Hit Analyze',
    how3: 'Pick a quality and download',
    terms: 'Terms of use',
    privacy: 'Privacy',
    privacyBody:
      'We never store your links or files. The download history lives in your browser only (localStorage) and is never sent to the server.',
    files: 'files',
    items: 'items',
    addMore: 'Add more links',
    remove: 'Remove',
    working: 'Processing…',
    done: 'Done',
    failed: 'Failed',
    zoomTitle: 'Preview',
    close: 'Close',
    pasteFail: 'Could not read the clipboard. Please copy the link manually.',
    youtube: 'YouTube',
    facebook: 'Facebook',
    instagram: 'Instagram',
    downloading2: 'Downloading…',
    downloaded: 'Download complete',
    cancel: 'Cancel',
    ffmpegMissing:
      'Warning: ffmpeg is not installed on the server, so merged qualities and MP3 conversion may fail.',
  },
};

const STORAGE_KEY = 'vd.lang';

export function getLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ar' || saved === 'en') return saved;
  return navigator.language?.startsWith('ar') ? 'ar' : 'ar'; // Arabic is the default
}

export function setLang(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  applyLang(lang);
}

export function t(key) {
  const lang = getLang();
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
}

export function applyLang(lang = getLang()) {
  const s = STRINGS[lang];
  document.documentElement.lang = s.lang;
  document.documentElement.dir = s.dir;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (s[key] !== undefined) el.textContent = s[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (s[key] !== undefined) el.setAttribute('placeholder', s[key]);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria;
    if (s[key] !== undefined) el.setAttribute('aria-label', s[key]);
  });

  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}
