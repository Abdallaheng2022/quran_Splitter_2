# دليل تطبيق أندرويد — مُقسّم التلاوة (Flutter)

تطبيق أندرويد خفيف يتّصل بالـ API على سيرفرك (`scripts/api.py`)، يعمل تسجيل/دخول،
رفع صوت وتقسيم وتحميل، ويدمج اشتراك **Google Play Billing** مع تحقّق على السيرفر.

> **مهمّ جدًا:** الفوترة (الاشتراك) **لا تعمل في APK مثبّت يدويًا**. جوجل تفعّلها فقط
> بعد رفع التطبيق على **Play Console** (ولو على مسار الاختبار الداخلي) موقّعًا، ومُعرّفًا
> فيه منتج اشتراك. لذلك التثبيت المباشر مفيد لتجربة التقسيم فقط، أمّا الاشتراك فيُختبر
> بعد الرفع. باقي الميزات (الدخول، التقسيم) تشتغل في التثبيت المباشر عاديًا.

---

## 1) أين تضع الملفات

ضع داخل مستودع GitHub لمشروعك:
```
app_src/                         ← مجلد المصدر (lib + pubspec + AndroidManifest)
.github/workflows/build-android.yml   ← بناء الـ APK سحابيًا
```
(لو عندك بالفعل `.github/workflows/` لا تستبدله، فقط أضف `build-android.yml` بجانبه.)

---

## 2) الطريقة المُوصى بها: بناء APK في السحابة (بلا أي برامج على جهازك)

1. ادخل GitHub → **Settings → Secrets and variables → Actions → Variables**، وأضف:
   - `API_BASE` = عنوان سيرفرك، مثل `https://your-server.com`
   - `APP_ORG`  = نطاق حزمتك، مثل `com.yourcompany` (يصبح applicationId = `com.yourcompany.quran_splitter`)
2. روح تبويب **Actions** → اختر **build-android** → **Run workflow**.
3. بعد ما يخلص (دقائق)، افتح التشغيل ونزّل من قسم **Artifacts**:
   - `quran-splitter-apk` → `app-release.apk` (ثبّته على هاتفك للتجربة)
   - `quran-splitter-aab` → `app-release.aab` (ارفعه على Google Play)

### تثبيت الـ APK على الهاتف للتجربة
انقل `app-release.apk` للهاتف، افتحه، واسمح بـ «تثبيت من مصدر غير معروف». سجّل دخولك
وجرّب التقسيم بطريقة السكتات (المستوى المجاني). الاشتراك يظهر لكنه يكتمل فقط بعد خطوة 4.

---

## 3) الطريقة البديلة: بناء محلي (لو عندك Flutter)

```bash
flutter create --org com.yourcompany --project-name quran_splitter --platforms android app
rm -rf app/lib && cp -rf app_src/lib app/lib
cp -f app_src/pubspec.yaml app/pubspec.yaml
cp -f app_src/AndroidManifest.xml app/android/app/src/main/AndroidManifest.xml
cd app && flutter pub get
flutter build apk --release --dart-define=API_BASE=https://your-server.com
# الناتج: app/build/app/outputs/flutter-apk/app-release.apk
```

---

## 4) تفعيل الاشتراك على Google Play (مرّة واحدة)

بدون هذه الخطوة، زر «اشترك» لن يكمل الشراء.

1. **سجّل كمطوّر**: حساب Google Play Console (رسوم 25$ لمرّة واحدة).
2. **أنشئ التطبيق** وارفع الـ `.aab` على مسار **Internal testing** أولًا. فعّل **Play App
   Signing** (جوجل تدير مفتاح التوقيع؛ أنت ترفع بمفتاح الرفع).
3. **أنشئ منتج اشتراك**: Monetize → Subscriptions → معرّف المنتج لازم يطابق:
   - في التطبيق: `kSubscriptionId` داخل `app_src/lib/billing.dart` (افتراضي `quran_pro_yearly`)
   - في السيرفر: متغيّر البيئة `PLAY_SUBSCRIPTION_IDS`
   اضبط السعر السنوي (مثلًا 3–5 دولار) والدورة سنوية.
4. **حساب خدمة للتحقّق على السيرفر** (المستخدم بالفعل في `scripts/play_billing.py`):
   - في Google Cloud: فعّل **Google Play Android Developer API**، وأنشئ Service Account ونزّل مفتاح JSON.
   - في Play Console: Users and permissions → ادعُ حساب الخدمة وامنحه صلاحية إدارة الطلبات والاشتراكات.
   - على السيرفر اضبط متغيّرات البيئة:
     ```
     GOOGLE_PLAY_PACKAGE=com.yourcompany.quran_splitter
     GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
     PLAY_SUBSCRIPTION_IDS=quran_pro_yearly
     ```
5. **التجديد التلقائي (اختياري لكن موصى به):** فعّل **Real-time Developer Notifications**
   في Play Console ووجّهها (عبر Pub/Sub push) إلى نقطة `/api/play/rtdn` على سيرفرك.
6. **حسابات اختبار:** أضف بريدك في License testers لتجربة الشراء بلا خصم فعلي.

---

## 5) أماكن التعديل السريعة

| ماذا | أين |
|------|-----|
| عنوان السيرفر الافتراضي | `app_src/lib/api.dart` → `kDefaultBaseUrl` (أو `--dart-define=API_BASE=`) |
| معرّف منتج الاشتراك | `app_src/lib/billing.dart` → `kSubscriptionId` |
| حدود المستوى المجاني/المدفوع | على السيرفر: `scripts/accounts.py` → `FREE_LIMITS` / `PAID_LIMITS` |
| اسم التطبيق الظاهر | `app_src/AndroidManifest.xml` → `android:label` |

---

## 6) تسلسل العمل الكامل

رفع صوت في التطبيق → `POST /api/analyze` (يتحقّق السيرفر من المستوى والحصة) →
`POST /api/save` (يرجّع zip) → يُحفظ على الجهاز. وعند الاشتراك: شراء عبر Play →
`POST /api/play/verify` → السيرفر يتحقّق من جوجل ويفتح المستوى المدفوع.

> ملاحظة: التطبيق عميل خفيف فقط؛ كل المعالجة الثقيلة على السيرفر، فحجم الـ APK صغير
> وسريع على الهاتف.
