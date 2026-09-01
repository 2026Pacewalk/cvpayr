"use client";

import * as React from "react";
import { Check, ExternalLink } from "lucide-react";
import { TEMPLATE_LIST, TEMPLATES, type TemplateKey } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * Choosing a showroom template.
 *
 * Every card is a miniature of the real layout — the actual hero composition,
 * type pairing and corner radius that template uses — rather than a name and a
 * paragraph. A dealer should be able to tell Metro from Velocity without
 * previewing either.
 */
export function TemplatePicker({
  value,
  accent,
  previewBase,
}: {
  value: string;
  accent: string | null;
  /** The live showroom URL, so a dealer can open the real thing. */
  previewBase: string;
}) {
  const [selected, setSelected] = React.useState<TemplateKey>(
    (TEMPLATES[value as TemplateKey] ? value : "momentum") as TemplateKey,
  );
  const [colour, setColour] = React.useState(accent ?? TEMPLATES[selected].defaultAccent);

  // Picking a template moves the accent to that template's own colour, unless
  // the dealer has deliberately chosen one already.
  const choose = (key: TemplateKey) => {
    if (colour === TEMPLATES[selected].defaultAccent) setColour(TEMPLATES[key].defaultAccent);
    setSelected(key);
  };

  return (
    <div>
      <input type="hidden" name="template" value={selected} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATE_LIST.map((t) => {
          const active = t.key === selected;
          const swatchAccent = active ? colour : t.defaultAccent;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => choose(t.key)}
              aria-pressed={active}
              className={cn(
                "group relative overflow-hidden rounded-[14px] border-2 text-left transition-all",
                active
                  ? "border-brand-600 shadow-[0_0_0_4px_rgba(47,75,221,0.12)]"
                  : "border-ink-200 hover:border-ink-300",
              )}
            >
              {active && (
                <span className="absolute top-3 right-3 z-10 flex size-6 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}

              <Thumbnail templateKey={t.key} accent={swatchAccent} />

              <div className="border-t border-ink-100 bg-white p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[14.5px] font-semibold text-ink-950">{t.name}</p>
                  <p className="shrink-0 text-[11px] text-ink-400">
                    {t.fonts.display} · {t.fonts.body}
                  </p>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{t.tagline}</p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">{t.bestFor}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Accent colour, shown here because it changes what the thumbnails do. */}
      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-[12px] border border-ink-200 bg-ink-50/60 p-4">
        <label htmlFor="themeAccent" className="text-[13.5px] font-medium text-ink-800">
          Accent colour
        </label>
        <div className="flex items-center gap-2.5">
          <input
            id="themeAccent"
            name="themeAccent"
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className="size-9 cursor-pointer rounded-[8px] border border-ink-200 bg-white p-1"
          />
          <code className="font-mono text-[12.5px] text-ink-500">{colour.toUpperCase()}</code>
          {colour.toLowerCase() !== TEMPLATES[selected].defaultAccent.toLowerCase() && (
            <button
              type="button"
              onClick={() => setColour(TEMPLATES[selected].defaultAccent)}
              className="text-[12px] font-medium text-brand-700 hover:text-brand-800"
            >
              Reset to {TEMPLATES[selected].name}&rsquo;s colour
            </button>
          )}
        </div>

        <a
          href={previewBase}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900"
        >
          Open your live showroom
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <p className="mt-3 text-[12.5px] text-ink-400">
        Save to apply. Your cars, branches and copy stay exactly as they are — only the layout,
        typefaces and shapes change.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* THUMBNAILS                                                          */
/* ------------------------------------------------------------------ */

/**
 * A miniature of each template's actual hero. Drawn with divs rather than
 * screenshots so it can never fall out of date with the real thing, and so the
 * dealer's own accent shows through.
 */
function Thumbnail({ templateKey, accent }: { templateKey: TemplateKey; accent: string }) {
  const t = TEMPLATES[templateKey];
  const r = (px: number) => ({ borderRadius: `${Math.min(px, 10)}px` });

  if (templateKey === "metro") {
    return (
      <div className="flex h-[132px] gap-3 bg-[#faf9f7] p-4">
        <div className="flex flex-1 flex-col justify-center">
          <div className="h-0.5 w-5" style={{ background: accent }} />
          <div className="mt-2 h-2.5 w-full bg-ink-800" style={r(2)} />
          <div className="mt-1 h-2.5 w-4/5 bg-ink-800" style={r(2)} />
          <div className="mt-2 h-1 w-3/5 bg-ink-300" style={r(2)} />
          <div className="mt-3 h-0.5 w-12" style={{ background: accent }} />
        </div>
        <div className="w-[42%] bg-ink-200" style={r(2)} />
      </div>
    );
  }

  if (templateKey === "velocity") {
    return (
      <div className="relative h-[132px] overflow-hidden bg-[#08090c] p-4">
        <div
          className="absolute -top-8 -right-6 size-24 rounded-full opacity-40 blur-2xl"
          style={{ background: accent }}
        />
        <div className="relative flex h-full flex-col justify-center">
          <div className="h-0.5 w-6" style={{ background: accent }} />
          <div className="mt-2.5 h-3.5 w-11/12 bg-white/90" style={r(2)} />
          <div className="mt-1.5 h-3.5 w-2/3 bg-white/90" style={r(2)} />
          <div className="mt-3 h-4 w-full bg-white/10" style={r(6)} />
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-1.5 w-5 bg-white/70" style={r(2)} />
                <div className="mt-1 h-0.5 w-3" style={{ background: accent }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (templateKey === "atelier") {
    return (
      <div className="flex h-[132px] flex-col items-center justify-center bg-[#f7f4ef] px-6">
        <div className="h-1 w-10 bg-ink-300" style={r(1)} />
        <div className="mt-3 h-2.5 w-full bg-ink-700" style={r(1)} />
        <div className="mt-1.5 h-2.5 w-3/4 bg-ink-700" style={r(1)} />
        <div className="mt-3 h-1 w-1/2 bg-ink-300" style={r(1)} />
        <div className="mt-4 h-7 w-full bg-ink-200" style={r(1)} />
        <div className="mt-3 h-px w-16" style={{ background: accent }} />
      </div>
    );
  }

  if (templateKey === "kinetic") {
    return (
      <div className="h-[132px] bg-[#fff8f1] p-4">
        <div
          className="relative overflow-hidden px-3 pt-4 pb-8"
          style={{ background: accent, borderRadius: "10px" }}
        >
          <div className="h-1.5 w-10 bg-white/40" style={r(999)} />
          <div className="mt-2 h-2.5 w-4/5 bg-white/90" style={r(3)} />
          <div className="mt-1 h-2.5 w-1/2 bg-white/90" style={r(3)} />
        </div>
        <div
          className="-mt-5 border border-ink-200 bg-white p-2.5 shadow-sm"
          style={{ borderRadius: "10px" }}
        >
          <div className="h-3 w-full bg-ink-100" style={r(6)} />
        </div>
      </div>
    );
  }

  // momentum
  return (
    <div className="relative h-[132px] overflow-hidden bg-ink-950 p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-ink-800 to-ink-950" />
      <div className="relative flex h-full flex-col justify-center">
        <div
          className="h-1.5 w-14 rounded-full"
          style={{ background: accent, opacity: 0.9 }}
        />
        <div className="mt-2.5 h-3 w-10/12 bg-white/90" style={r(3)} />
        <div className="mt-1.5 h-3 w-1/2 bg-white/90" style={r(3)} />
        <div className="mt-3 h-6 w-full border border-white/15 bg-white/10" style={r(8)} />
      </div>
      <span className="sr-only">{t.name}</span>
    </div>
  );
}
