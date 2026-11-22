# تطبيق محادثة OpenRouter بالعربية

تطبيق ويب بسيط بواجهة عربية من اليمين إلى اليسار، وخادم Node.js وExpress مكتوب بـTypeScript. يستخدم التطبيق واجهة OpenRouter المتوافقة مع OpenAI لإرسال الرسائل وعرض الإجابات.

## المتطلبات

- Node.js 20 أو أحدث
- مفتاح API من [OpenRouter](https://openrouter.ai/keys). تتوفر نماذج مجانية عبر OpenRouter دون الحاجة إلى بطاقة ائتمان.

## التثبيت والتشغيل محليًا

```bash
npm install
cp .env.example .env
```

ضع مفتاحك في `.env`:

```env
OPENROUTER_API_KEY=your_actual_api_key
OPENROUTER_MODEL=openrouter/free
OPENROUTER_VISION_MODEL=google/gemma-4-31b-it:free
PORT=3000
```

`OPENROUTER_MODEL` اختياري، والقيمة الافتراضية هي `openrouter/free`. كما أن `OPENROUTER_VISION_MODEL` اختياري، والقيمة الافتراضية هي `google/gemma-4-31b-it:free`.

ثم شغّل وضع التطوير:

```bash
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000).

## فحص الأنواع والبناء

```bash
npm run typecheck
npm run build
npm start
```

## نقطة API

`POST /api/chat` يقبل JSON بالشكل التالي:

```json
{
  "message": "مرحبًا",
  "history": [
    { "role": "user", "content": "ما الذي تستطيع فعله؟" },
    { "role": "assistant", "content": "أستطيع مساعدتك في أسئلة كثيرة." }
  ]
}
```

يُقبل من السجل فقط دورا `user` و`assistant`، ويُقصّ إلى آخر 20 رسالة. حد الرسالة الواحدة 8000 حرف. يدعم التطبيق إرفاق صورة حتى 5 ميغابايت مع الرسالة أو دون نص؛ وتُرسل الصورة إلى نموذج الرؤية المحدد في `OPENROUTER_VISION_MODEL`، بينما تبقى رسائل السجل نصية فقط. يعيد الخادم `{ "reply": "..." }` عند النجاح.

## النشر مجانًا على Render

1. ادفع المستودع إلى GitHub، ثم من لوحة Render اختر **New → Web Service** واربط `yy0653563-alt/mistral-chat-app`.
2. اختر خطة **Free**، وبيئة **Node**، والفرع `main`.
3. أدخل إعدادات البناء والتشغيل:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. في **Environment Variables** أضف `OPENROUTER_API_KEY` واجعل قيمته مفتاحك من OpenRouter. يمكنك أيضًا تعيين `OPENROUTER_MODEL` و`OPENROUTER_VISION_MODEL`؛ لكل منهما قيمة افتراضية موضحة أعلاه.
5. أنشئ الخدمة وانتظر اكتمال النشر. سيعطيك Render رابطًا عامًا بصيغة `https://اسم-الخدمة.onrender.com`.

يحدد Render المنفذ عبر متغير `PORT` تلقائيًا؛ ويستخدم التطبيق 3000 افتراضيًا للتشغيل المحلي. قد تدخل خدمات Render المجانية في وضع السكون عند عدم الاستخدام.
