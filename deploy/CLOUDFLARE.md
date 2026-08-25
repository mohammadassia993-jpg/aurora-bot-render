# نفق Cloudflare الثابت

1. في لوحة Cloudflare Zero Trust أنشئ Tunnel جديد وانسخ التوكن.
2. أضف التوكن إلى `.env` المحلي أو متغيرات Render باسم `CLOUDFLARED_TUNNEL_TOKEN`.
3. ثبّت `cloudflared` ثم شغّل `bash deploy/cloudflare-supervisor.sh`.
4. اربط اسم النفق بالنطاق من لوحة Cloudflare إلى `http://localhost:8787`.

النظام يستخدم النفق المسمّى تلقائيًا عند توفر التوكن؛ بدونه يعود إلى Pinggy كحل مؤقت فقط.
