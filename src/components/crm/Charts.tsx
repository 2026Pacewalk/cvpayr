"use client";

import * as React from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatPrice } from "@/lib/utils";

/**
 * Shared chart language:
 * - one accent for the primary series, muted neutrals for structure
 * - no gridlines on the value axis beyond faint horizontals
 * - tooltips are cards, not the default browser-grey boxes
 */
const COLORS = {
  brand: "#2f4bdd",
  brandSoft: "#94b4ff",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  purple: "#7c3aed",
  info: "#0284c7",
  grid: "#eceff4",
  axis: "#94a1b4",
};

const CATEGORICAL = [
  COLORS.brand, COLORS.purple, COLORS.success, COLORS.warning,
  COLORS.info, COLORS.danger, "#688cfb", "#6b788c",
];

const axisProps = {
  tick: { fontSize: 11, fill: COLORS.axis },
  tickLine: false,
  axisLine: false,
};

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string;
  formatter?: (value: number, key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-ink-200 bg-white px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-[11.5px] font-medium text-ink-500">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-[12.5px]">
          <span className="size-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-ink-500">{entry.name}</span>
          <span className="ml-auto font-semibold text-ink-900 tabular-nums">
            {formatter && typeof entry.value === "number"
              ? formatter(entry.value, String(entry.dataKey))
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------ TRENDS ------------------------------- */

export function TrendAreaChart({
  data,
  height = 220,
}: {
  data: { label: string; leads: number; sales: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.brand} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLORS.brand} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} allowDecimals={false} width={36} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLORS.grid }} />
        <Area
          type="monotone" dataKey="leads" name="Leads" stroke={COLORS.brand}
          strokeWidth={2} fill="url(#leadsFill)"
        />
        <Area
          type="monotone" dataKey="sales" name="Sales" stroke={COLORS.success}
          strokeWidth={2} fill="url(#salesFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueLineChart({
  data,
  height = 200,
}: {
  data: { label: string; revenue: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} width={52} tickFormatter={(v) => formatPrice(Number(v))} />
        <Tooltip content={<ChartTooltip formatter={(v) => formatPrice(v)} />} />
        <Line
          type="monotone" dataKey="revenue" name="Revenue"
          stroke={COLORS.brand} strokeWidth={2.2} dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------------------------- DISTRIBUTION --------------------------- */

export function HorizontalBarChart({
  data,
  height = 220,
  color = COLORS.brand,
  valueFormatter,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis
          type="category" dataKey="label" {...axisProps} width={96}
          tick={{ fontSize: 11.5, fill: "#4d5a6d" }}
        />
        <Tooltip
          content={<ChartTooltip formatter={(v) => (valueFormatter ? valueFormatter(v) : String(v))} />}
          cursor={{ fill: "rgba(47,75,221,0.05)" }}
        />
        <Bar dataKey="value" name="Count" fill={color} radius={[0, 5, 5, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedBarChart({
  data,
  keys,
  height = 240,
}: {
  data: Record<string, string | number>[];
  keys: { key: string; label: string; color?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} width={36} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(47,75,221,0.05)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        {keys.map((k, i) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            name={k.label}
            stackId="a"
            fill={k.color ?? CATEGORICAL[i % CATEGORICAL.length]}
            radius={i === keys.length - 1 ? [5, 5, 0, 0] : undefined}
            barSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                formatter={(v) => `${v} (${total ? Math.round((v / total) * 100) : 0}%)`}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerValue !== undefined || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-[22px] leading-none font-semibold text-ink-950 tabular-nums">
            {centerValue ?? total}
          </p>
          {centerLabel && <p className="mt-1 text-[11.5px] text-ink-400">{centerLabel}</p>}
        </div>
      )}
    </div>
  );
}

/** Colour swatch legend for the donut, rendered outside the chart for readability. */
export function ChartLegend({
  data,
  formatter,
}: {
  data: { label: string; value: number }[];
  formatter?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={d.label} className="flex items-center gap-2.5 text-[12.5px]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: CATEGORICAL[i % CATEGORICAL.length] }}
          />
          <span className="min-w-0 flex-1 truncate text-ink-600">{d.label}</span>
          <span className="font-semibold text-ink-900 tabular-nums">
            {formatter ? formatter(d.value) : d.value}
          </span>
          <span className="w-9 text-right text-ink-400 tabular-nums">
            {total ? Math.round((d.value / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export { COLORS as CHART_COLORS, CATEGORICAL as CHART_CATEGORICAL };
