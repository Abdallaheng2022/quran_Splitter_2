# تحويل التطبيق إلى أندرويد + تشغيل الدفع (RevenueCat)

هذا الملف يشرح ما تم تعديله في الكود، والخطوات المتبقّية التي **يجب تشغيلها من جهازك / Replit shell** (لا يمكن تنفيذها تلقائيًا لأنها تحتاج تسجيل دخول EAS وحساب Google Play).

---

## ليه التطبيق ما كانش "أندرويد حقيقي" قبل كده

النشر الحالي يبني التطبيق كـ **Expo Go static bundle** ويقدّمه عبر سيرفر Node — يعني المستخدم بيفتحه **جوّه تطبيق Expo Go**، مش كتطبيق مستقل. ومكتبة الدفع `react-native-purchases` (RevenueCat) **لا تعمل داخل Expo Go ولا على الويب**؛ علشان كده الكود فيه `isRevenueCatTestMode` اللي بيحوّل الشراء لوضع تجريبي وهمي.

الخلاصة: لازم **بناء أصلي (native build) عبر EAS** علشان الدفع يشتغل فعليًا. وده اللي تم تجهيزه.

---

## ١) اللي اتعدّل في الكود (جاهز)

| الملف | التعديل |
|------|---------|
| `eas.json` *(جديد)* | إعداد EAS لبناء أندرويد: `development` (dev client) و`preview` (APK للتجربة) و`production` (AAB للنشر) + إعداد `submit`. المفاتيح العامة لـ RevenueCat مضمَّنة جاهزة. |
| `app.json` | إضافة `android.versionCode` و`android.adaptiveIcon` (مطلوبة لمتجر Play) + حجب أذونات الكاميرا/الموقع/الميكروفون غير المستخدمة (`blockedPermissions`). |
| `package.json` | سكربتات جديدة: `android`, `prebuild:android`, `build:android:dev/preview/production`, `submit:android`. |
| `lib/revenuecat.tsx` | (إصلاح) اختيار المفتاح المطلوب للمنصة الحالية فقط بدل اشتراط المفاتيح الثلاثة معًا، + علامة `isRevenueCatConfigured()`، + إيقاف استعلامات RevenueCat لما الموديول مش متاح (ويب/Expo Go) لتفادي الأخطاء. |
| `app/_layout.tsx` | `Purchases.logIn` ما يتنفّذش غير لما RevenueCat يكون متظبّط + تحذير واضح لو دومين الـ API ناقص في بناء مستقل. |
| `api-server/src/lib/revenuecat.ts` *(جديد)* + `routes/analyze.ts` | **تأمين الدفع من السيرفر**: تحقق فعلي من اشتراك `pro` عبر RevenueCat REST API لما `REVENUECAT_SECRET_API_KEY` متظبّط (هو الحاكم)، مع رجوع آمن للهيدر لو مش متظبّط/مش واصل. |

> **ملاحظة:** الدفع نفسه (entitlement `pro`، عرض `default`، باقة `$rc_monthly`، المنتج `pro_monthly`، ومفتاح Android العام `goog_…`) **متظبّط بالفعل** في لوحة RevenueCat — سكربت `seedRevenueCat.ts` اتنفّذ. المتبقّي هو ربط Google Play وبناء التطبيق.

---

## ٢) تجهيز EAS (مرة واحدة)

من جذر المشروع داخل Replit shell:

```bash
# 1) ثبّت EAS CLI (لو مش مثبّت)
npm install -g eas-cli

# 2) سجّل دخول بحساب Expo
eas login

# 3) من داخل مجلد التطبيق فقط
cd artifacts/quran-splitter

# 4) اربط المشروع بـ EAS — ده بيكتب extra.eas.projectId داخل app.json تلقائيًا
eas init
```

---

## ٣) املأ القيم الناقصة في `eas.json`

افتح `artifacts/quran-splitter/eas.json` وغيّر القيمتين دول داخل `build.base.env`:

- **`EXPO_PUBLIC_DOMAIN`** → دومين **سيرفر الـ API المنشور** (بدون `https://`).
  التطبيق المستقل مفيهوش بروكسي Replit، فلو القيمة دي غلط/فاضية، **كل طلبات الـ API هتفشل**. لازم يكون artifact الـ `api-server` منشور وشغّال.
- **`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`** → مفتاح Clerk العام (يبدأ بـ `pk_live_…` أو `pk_test_…`). آمن إنه يكون داخل الملف.
- (اختياري) **`EXPO_PUBLIC_CLERK_PROXY_URL`** → سيبه فاضي إلا لو بتستخدم Clerk proxy.

مفاتيح RevenueCat الثلاثة موجودة جاهزة (لأنها `EXPO_PUBLIC_` = عامة ومضمّنة في الحزمة على أي حال).

---

## ٤) أوامر البناء

كل الأوامر من داخل `artifacts/quran-splitter`:

```bash
# (اختياري) بناء تطوير بـ dev client — أفضل أثناء التطوير، فيه hot reload + الموديولات الأصلية
npx expo install expo-dev-client      # لازم قبل أول development build
pnpm run build:android:dev

# بناء APK للتجربة (شراء حقيقي عبر Google Play sandbox) — الأسهل للاختبار
pnpm run build:android:preview

# بناء AAB للنشر على المتجر
pnpm run build:android:production
```

- نوع `preview` و`development` بيطلّعوا **APK** بتنزّله وتثبّته على الموبايل مباشرة (رابط من EAS).
- نوع `production` بيطلّع **AAB** ترفعه على Google Play.
- مع `appVersionSource: "local"`، لازم **تزوّد `android.versionCode`** في `app.json` يدويًا قبل كل رفعة جديدة على Play.

---

## ٥) تشغيل الدفع فعليًا (Google Play + RevenueCat)

> هذه الخطوة هي السبب الوحيد اللي بيخلّي الشراء "حقيقي". RevenueCat جاهز، بس الشراء الفعلي بيمرّ عبر فوترة Google Play، فلازم تربطهم.

1. **Google Play Console** (يحتاج حساب مطوّر مدفوع لمرة واحدة):
   - أنشئ تطبيقًا باسم الحزمة **`com.quransplitter.app`** (نفس `android.package`).
   - ارفع أول AAB على مسار **Internal testing** (الفوترة ما بتشتغلش قبل رفع أول build).
   - من **Monetize → Products → Subscriptions** أنشئ اشتراكًا:
     - **Product ID:** `pro_monthly`
     - **Base plan ID:** `monthly` (يطابق `pro_monthly:monthly` في سكربت الـ seed)
     - السعر: 1.00 دولار/شهر.
   - فعّل المنتج (Activate).

2. **اربط Google Play بـ RevenueCat:**
   - في Google Play Console أنشئ **Service Account** وامنحه صلاحيات الفوترة (Financial / View financial data + Manage orders).
   - نزّل ملف الـ JSON بتاع الـ service account، وارفعه في لوحة RevenueCat (تطبيق Play Store)، أو حطّه باسم `play-service-account.json` جنب `eas.json` لو هتستخدم `pnpm run submit:android`.

3. **اختبر الشراء:**
   - في Play Console → **License testing** أضف إيميل الـ Gmail بتاعك كـ tester.
   - ثبّت الـ APK (نوع `preview`) بنفس الحساب، افتح الـ Paywall، واشترِ — هيكون شراء تجريبي بدون خصم فعلي.
   - بعد الشراء، `useSubscription().isSubscribed` المفروض يرجع `true` وطريقة "المحاذاة بالمرجع" تتفتح.

> أثناء بناء `development` (وضع `__DEV__`) التطبيق بيستخدم **متجر RevenueCat التجريبي** ومودال تأكيد وهمي — مفيد للتجربة السريعة من غير Google Play. الشراء الحقيقي بيشتغل في بناء `preview`/`production` فقط.

### تأمين الدفع من جهة السيرفر (مهم للإنتاج)

تم تجهيز السيرفر بحيث **يتحقق من اشتراك `pro` مباشرة من RevenueCat** بدل الثقة العمياء في هيدر `x-subscribed` (اللي عميل متلاعَب فيه يقدر يزوّره). علشان تفعّلها:

1. من لوحة RevenueCat → **API keys** انسخ **مفتاح سرّي (Secret key v1)** — مش مفتاح `goog_`/`appl_` العام.
2. ضيفه كـ secret في بيئة سيرفر الـ API باسم:
   ```
   REVENUECAT_SECRET_API_KEY = sk_xxx...
   ```
3. أعِد نشر artifact الـ `api-server`.

بعد كده: لو المفتاح متظبّط، **رأي السيرفر هو الحاكم** (تحقّق حقيقي لكل تحليل، مع كاش ٦٠ ثانية لكل مستخدم). ولو المفتاح ناقص أو RevenueCat مش واصل، بيرجع تلقائيًا لسلوك الهيدر القديم — يعني **مفيش كسر** للتطوير أو لأي نشر قديم.

---

## ٦) ملاحظات ومخاطر

- **ثقة الاشتراك على العميل:** السيرفر بقى **يتحقق من جهته** من اشتراك `pro` عبر RevenueCat لما تضبط `REVENUECAT_SECRET_API_KEY` (شوف القسم اللي فوق). بدون المفتاح ده، بيرجع للاعتماد على هيدر `x-subscribed` (المخاطرة القديمة الموثّقة في `replit.md`). يعني: للإنتاج، ظبّط المفتاح وخلاص.
- **الأذونات:** تم بالفعل حجب أذونات الكاميرا/الموقع/الميكروفون (`blockedPermissions` في `app.json`) لأنها مش مستخدمة، علشان تتفادى أسئلة مراجعة Play. لو حابب تنضّف أكتر، تقدر تشيل الحزم غير المستخدمة `expo-location` و`expo-image-picker` من `package.json`.
- **سيرفر الـ API لازم يكون منشور:** التطبيق المستقل بيكلّم `EXPO_PUBLIC_DOMAIN`؛ تأكّد إن artifact `api-server` منشور وإن `ffmpeg` معرّف في `replit.nix` (مذكور في `replit.md` تحت Gotchas).
- **iOS:** نفس الإعداد جاهز لـ iOS (مفتاح `appl_…` و bundle id موجودين)؛ بس يحتاج حساب Apple Developer و`eas build -p ios`.
