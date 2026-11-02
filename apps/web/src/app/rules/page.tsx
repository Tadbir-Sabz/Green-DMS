export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">موتور قوانین</h1>
        <button className="px-3 py-1.5 bg-green-600 text-white rounded">افزودن قانون</button>
      </div>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr><th className="text-right p-3">کد</th><th className="text-right p-3">عنوان</th><th className="text-right p-3">موجودیت</th><th className="text-right p-3">اثر</th><th className="text-right p-3">وضعیت</th></tr>
          </thead>
          <tbody><tr><td colSpan={5} className="text-center p-6 text-gray-500">داده‌ای موجود نیست</td></tr></tbody>
        </table>
      </div>
    </div>
  );
}
