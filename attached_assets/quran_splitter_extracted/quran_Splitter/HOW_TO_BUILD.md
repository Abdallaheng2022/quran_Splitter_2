# بناء الـ APK على GitHub Actions

## الخطوات
1. ارفع **محتوى** مجلّد `quran_Splitter` إلى مستودعك على GitHub
   (يجب أن يكون `app_src/` و`.github/` في جذر المستودع مباشرةً).
2. افتح تبويب **Actions** → اختر **Android CI** → **Run workflow** → فرع main.
3. انتظر العلامة الخضراء ✅.
4. من صفحة التشغيل → قسم **Artifacts** → نزّل **quran-splitter-apk**.

## ما الذي أُصلح في هذه النسخة
- خطأ paywall.dart (سلسلة cascade على void) → تحويلها إلى إسنادات منفصلة.
- نسخة NDK مضبوطة على 28.2.13676358 (ما تطلبه الإضافات).
- ملف workflow صحيح لمشروع Flutter (flutter create + flutter build apk)
  بدل قالب Gradle القديم.

## ملاحظات
- التطبيق "عميل خفيف": التقطيع الفعلي يتطلّب تشغيل السيرفر وضبط API_BASE.
- الاشتراك لا يكتمل في APK مثبّت يدويًا (يتطلّب رفعه على Play Console).
