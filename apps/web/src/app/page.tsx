export default function Page() {
  const kpis = [
    { label: "سفارشات امروز", value: "۰", delta: "+۰%" },
    { label: "فاکتورهای صادر شده", value: "۰", delta: "+۰%" },
    { label: "مبلغ فروش امروز", value: "۰ ریال", delta: "+۰%" },
    { label: "بدهکاری معوق", value: "۰ ریال", delta: "۰" },
  ];
  const modules = [
    { title: "سفارشات فروش", desc: "مدیریت چرخه سفارش تا فاکتور", href: "/orders" },
    { title: "مشتریان", desc: "پروفایل، اعتبار، مسیر و تاریخچه", href: "/customers" },
    { title: "تورهای فروش", desc: "برنامه‌ریزی، اجرا و تسویه تور", href: "/tours" },
    { title: "رهگیری زنده", desc: "نقشه زنده نیروهای میدانی", href: "/tracking" },
    { title: "انبار و موجودی", desc: "رسید، حواله، انتقال و انبارگردانی", href: "/warehouses" },
    { title: "موتور قوانین", desc: "سقف اعتبار، تخفیف و تأیید خودکار", href: "/rules" },
    { title: "حساب‌های دریافتنی", desc: "بدهکاری، سررسید، وصول", href: "/ar" },
    { title: "خزانه‌داری", desc: "صندوق، بانک، چک‌ها", href: "/treasury" },
  ];
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">داشبورد اجرایی</h1>
          <p className="text-slate-500 mt-1">نمای کلی عملکرد فروش و پخش مویرگی</p>
        </div>
        <div className="text-sm text-slate-500">امروز</div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="text-sm text-slate-500">{k.label}</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{k.value}</div>
            <div className="text-xs text-slate-400 mt-2">{k.delta}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">دسترسی سریع</h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <a key={m.title} href={m.href} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="font-semibold text-slate-900">{m.title}</div>
              <div className="text-sm text-slate-500 mt-1">{m.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
