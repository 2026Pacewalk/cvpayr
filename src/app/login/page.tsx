import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Gauge } from "lucide-react";

export const metadata: Metadata = { title: "Sign in", robots: NOINDEX };

const DEMO_ACCOUNTS = [
  { role: "Dealer Owner", email: "owner@sharmaautowheels.in", note: "Full access including cost & margin" },
  { role: "Branch Manager", email: "vikram@sharmaautowheels.in", note: "Ludhiana branch only" },
  { role: "Sales Executive", email: "priya@sharmaautowheels.in", note: "Only leads assigned to them" },
  { role: "Inventory Manager", email: "harpreet@sharmaautowheels.in", note: "Stock and pricing, no CRM" },
  { role: "Lead Manager", email: "neha@sharmaautowheels.in", note: "Full pipeline, can assign leads" },
  { role: "View Only", email: "ravi@sharmaautowheels.in", note: "Read-only, no cost visibility" },
  { role: "Super Admin", email: "admin@carvyapar.in", note: "Platform console" },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.isSuperAdmin ? "/admin" : "/dashboard");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-ink-900 text-white">
              <Gauge className="size-5" />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight text-ink-950">
              CarVyapar
            </span>
          </Link>

          <h1 className="font-display text-[26px] leading-tight font-semibold text-ink-950">
            Sign in to your dealership
          </h1>
          <p className="mt-2 text-[14px] text-ink-500">
            Manage inventory, branches, staff and every lead from one place.
          </p>

          <div className="mt-7">
            <LoginForm />
          </div>

          <div className="mt-8 rounded-[12px] border border-ink-200 bg-ink-50 p-4">
            <p className="text-[12px] font-semibold tracking-[0.06em] text-ink-500 uppercase">
              Demo accounts
            </p>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Password for every account is{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px] text-ink-800">
                password123
              </code>
              . Sign in as different roles to see permissions change.
            </p>
            <ul className="mt-3 space-y-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                  <span className="font-medium text-ink-800">{a.role}</span>
                  <code className="font-mono text-[11.5px] text-brand-700">{a.email}</code>
                  <span className="text-ink-400">— {a.note}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 text-center text-[13px] text-ink-500">
            Want to see the customer side?{" "}
            <Link href="/d/sharma-auto" className="font-medium text-brand-700 hover:underline">
              Visit the public showroom
            </Link>
          </p>
        </div>
      </div>

      {/* Brand side */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-35"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=1600&q=80)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-950/85 to-brand-900/60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div />
          <div className="max-w-md">
            <p className="font-display text-[30px] leading-[1.25] font-semibold text-white">
              Your showroom, your stock, your customers — in one system.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-white/60">
              Add a car once. It appears on your website, in your branch inventory, in your
              salesperson&apos;s pocket, and in every report you run at month end.
            </p>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
              {[
                { k: "Branches", v: "Unlimited" },
                { k: "Lead capture", v: "Automatic" },
                { k: "Setup time", v: "Same day" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[11px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                    {s.k}
                  </dt>
                  <dd className="mt-1 font-display text-[15px] font-semibold text-white">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
