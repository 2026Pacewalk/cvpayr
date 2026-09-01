"use client";

import * as React from "react";
import { MessageCircle, Phone, Share2, Printer, Check, Link2, Facebook, Calculator } from "lucide-react";
import { Sheet, Popover, MenuItem } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EnquiryForm, type EnquiryFormProps } from "./EnquiryForm";
import { trackWhatsAppClick } from "@/app/actions/enquiry";
import { calculateEMI, formatINR, formatPrice, whatsappHref, telHref, cn } from "@/lib/utils";
import { EMI_DEFAULTS } from "@/lib/constants";

/* ------------------------------ WHATSAPP ------------------------------ */

export function WhatsAppCTA({
  phone,
  message,
  dealerSlug,
  vehicleId,
  className,
  children,
}: {
  phone: string;
  message: string;
  dealerSlug: string;
  vehicleId?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={whatsappHref(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Fire-and-forget: the click is logged as enquiry activity in the CRM.
        void trackWhatsAppClick(dealerSlug, vehicleId);
      }}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-success-600 px-4 text-[14px] font-medium text-white transition-colors hover:bg-success-700",
        className,
      )}
    >
      <MessageCircle className="size-4" />
      {children ?? "WhatsApp"}
    </a>
  );
}

/* -------------------------------- SHARE ------------------------------- */

export function ShareMenu({ title, className }: { title: string; className?: string }) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);

  const url = typeof window !== "undefined" ? window.location.href : "";

  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <Popover
      className={className}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={async () => {
            const shared = await nativeShare();
            if (!shared) toggle();
          }}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
        >
          <Share2 className="size-4" />
          Share
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={copied ? <Check className="size-4 text-success-600" /> : <Link2 className="size-4" />}
            onClick={() => {
              void copy();
              close();
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </MenuItem>
          <MenuItem
            icon={<MessageCircle className="size-4" />}
            onClick={() => {
              window.open(
                `https://wa.me/?text=${encodeURIComponent(`${title}\n${window.location.href}`)}`,
                "_blank",
                "noopener",
              );
              close();
            }}
          >
            Share on WhatsApp
          </MenuItem>
          <MenuItem
            icon={<Facebook className="size-4" />}
            onClick={() => {
              window.open(
                `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`,
                "_blank",
                "noopener",
              );
              close();
            }}
          >
            Share on Facebook
          </MenuItem>
          <MenuItem
            icon={<Printer className="size-4" />}
            onClick={() => {
              close();
              setTimeout(() => window.print(), 100);
            }}
          >
            Print details
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

/* ------------------------------ ENQUIRE ------------------------------- */

export function EnquireButton({
  label = "Enquire now",
  variant = "primary",
  size = "lg",
  fullWidth,
  className,
  sheetTitle,
  ...formProps
}: EnquiryFormProps & {
  label?: string;
  variant?: "primary" | "outline" | "dark" | "secondary";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  sheetTitle?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label}
        description="Our team replies within business hours, usually much sooner."
        size="md"
      >
        <EnquiryForm {...formProps} />
      </Sheet>
    </>
  );
}

/* ---------------------------- STICKY MOBILE --------------------------- */

export function StickyVehicleBar({
  price,
  phone,
  whatsapp,
  message,
  dealerSlug,
  vehicleId,
  enquiryProps,
}: {
  price: number;
  phone: string | null;
  whatsapp: string | null;
  message: string;
  dealerSlug: string;
  vehicleId: string;
  enquiryProps: EnquiryFormProps;
}) {
  return (
    <div className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_20px_rgba(16,24,40,0.08)] backdrop-blur lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 shrink-0">
          <p className="text-[10.5px] font-medium tracking-wide text-ink-400 uppercase">Price</p>
          <p className="font-display text-[16px] leading-none font-semibold text-ink-950">
            {formatPrice(price)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {phone && (
            <a
              href={telHref(phone)}
              aria-label="Call dealer"
              className="flex size-11 items-center justify-center rounded-[10px] border border-ink-200 text-ink-700"
            >
              <Phone className="size-[18px]" />
            </a>
          )}
          {whatsapp && (
            <WhatsAppCTA
              phone={whatsapp}
              message={message}
              dealerSlug={dealerSlug}
              vehicleId={vehicleId}
              className="size-11 px-0"
            >
              <span className="sr-only">WhatsApp</span>
            </WhatsAppCTA>
          )}
          <EnquireButton {...enquiryProps} label="Enquire" size="lg" className="px-5" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- EMI ---------------------------------- */

export function EMICalculator({ price }: { price: number }) {
  const [downPct, setDownPct] = React.useState(EMI_DEFAULTS.downPaymentPct);
  const [rate, setRate] = React.useState(EMI_DEFAULTS.interestRate);
  const [months, setMonths] = React.useState(EMI_DEFAULTS.tenureMonths);

  const downPayment = Math.round((price * downPct) / 100);
  const principal = price - downPayment;
  const emi = calculateEMI(principal, rate, months);
  const totalInterest = emi * months - principal;

  return (
    <div className="rounded-[14px] border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
          <Calculator className="size-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">EMI calculator</h3>
          <p className="text-[12.5px] text-ink-500">Indicative only — final terms come from the lender.</p>
        </div>
      </div>

      <div className="mt-5 rounded-[12px] bg-ink-50 p-4 text-center">
        <p className="field-label">Estimated monthly EMI</p>
        <p className="mt-1 font-display text-[28px] leading-none font-semibold text-ink-950 tabular-nums">
          {formatINR(emi)}
        </p>
        <p className="mt-1.5 text-[12px] text-ink-500">
          for {months / 12} years at {rate}% p.a.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <Slider
          label="Down payment"
          value={`${downPct}% · ${formatPrice(downPayment)}`}
          min={0}
          max={80}
          step={5}
          current={downPct}
          onChange={setDownPct}
        />
        <Slider
          label="Interest rate"
          value={`${rate}% p.a.`}
          min={7}
          max={18}
          step={0.25}
          current={rate}
          onChange={setRate}
        />
        <Slider
          label="Tenure"
          value={`${months} months`}
          min={12}
          max={84}
          step={12}
          current={months}
          onChange={setMonths}
        />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-[12.5px]">
        <div>
          <dt className="text-ink-500">Loan amount</dt>
          <dd className="mt-0.5 font-semibold text-ink-900 tabular-nums">{formatINR(principal)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Total interest</dt>
          <dd className="mt-0.5 font-semibold text-ink-900 tabular-nums">{formatINR(totalInterest)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[13px] font-medium text-ink-700">{label}</label>
        <span className="text-[12.5px] font-semibold text-ink-900 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full"
      />
    </div>
  );
}
