"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function DashboardCharts() {
  const data = [
    { month: "فروردین", فروش: 45 },
    { month: "اردیبهشت", فروش: 52 },
    { month: "خرداد", فروش: 48 },
    { month: "تیر", فروش: 61 },
    { month: "مرداد", فروش: 58 },
    { month: "شهریور", فروش: 65 },
  ];
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="font-semibold mb-4">روند فروش (میلیون ریال)</div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="فروش" fill="#22c55e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
