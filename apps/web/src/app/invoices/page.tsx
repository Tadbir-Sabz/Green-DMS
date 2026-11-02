export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">فاکتورها</h1>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr><th className="text-right p-3">شماره فاکتور</th><th className="text-right p-3">مشتری</th><th className="text-right p-3">تاریخ</th><th className="text-right p-3">جمع کل</th><th className="text-right p-3">وضعیت</th></tr>
          </thead>
          <tbody><tr><td colSpan={5} className="text-center p-6 text-gray-500">داده‌ای موجود نیست</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}
