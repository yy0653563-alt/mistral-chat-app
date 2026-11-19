# تطبيق محادثة Mistral بالعربية

تطبيق ويب بسيط بواجهة عربية من اليمين إلى اليسار، وخادم Node.js وExpress مكتوب بـTypeScript. يستخدم التطبيق SDK الرسمي `@mistralai/mistralai` والنموذج `mistral-small-latest`. يُحفظ مفتاح API على الخادم فقط ولا يُرسل إلى المتصفح.

## المتطلبات

- Node.js 20 أو أحدث
- مفتاح API من [Mistral AI](https://console.mistral.ai/)

## التثبيت والتشغيل محليًا

```bash
npm install
cp .env.example .env
```

ضع مفتاحك في `.env`:

```env
MISTRAL_API_KEY=your_actual_api_key
PORT=3000
```

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

يُقبل من السجل فقط دورا `user` و`assistant`، ويُقصّ إلى آخر 20 رسالة. حد الرسالة الواحدة 8000 حرف. يعيد الخادم `{ "reply": "..." }` عند النجاح.

## النشر مجانًا على Render

1. ادفع المستودع إلى GitHub، ثم من لوحة Render اختر **New → Web Service** واربط `yy0653563-alt/mistral-chat-app`.
2. اختر خطة **Free**، وبيئة **Node**، والفرع `main`.
3. أدخل إعدادات البناء والتشغيل:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. في **Environment Variables** أضف `MISTRAL_API_KEY` واجعل قيمته مفتاحك من Mistral. لا تضع المفتاح في ملفات الواجهة أو GitHub.
5. أنشئ الخدمة وانتظر اكتمال النشر. سيعطيك Render رابطًا عامًا بصيغة `https://��سم-الخدمة.onrender.com`.

يحدد Render المنفذ عبر متغير `PORT` تلقائيًا؛ ويستخدم التطبيق 3000 افتراضيًا للتشغيل المحلي. قد تدخل خدمات Render المجانية في وضع السكون عند عدم الاستخدام، وقد يستغرق أول طلب بعد السكون وقتًا أطول.
