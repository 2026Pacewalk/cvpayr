import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/faq";
import type { TemplateDefinition } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The showroom's questions and answers.
 *
 * Built on <details> rather than a client component for two reasons: every
 * answer is present in the served HTML whether or not it is expanded, which is
 * what makes it quotable by a crawler or an assistant, and it costs no
 * JavaScript on a connection that may be a phone on mobile data.
 */
export function ShowroomFaq({
  items,
  template,
}: {
  items: FaqItem[];
  template: TemplateDefinition;
}) {
  if (!items.length) return null;
  const centred = template.heading === "centred";

  return (
    <section className="border-y border-ink-200 bg-ink-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className={cn(centred && "text-center")}>
          <h2 className="text-[24px] leading-tight text-ink-950 sm:text-[30px]">
            Questions buyers ask us
          </h2>
          <p className={cn("mt-2 text-[14px] text-ink-500", centred && "mx-auto max-w-xl")}>
            Everything below is about this dealership specifically — not generic advice.
          </p>
        </div>

        <div className="mt-8 border-t border-ink-200">
          {items.map((item) => (
            <details key={item.question} className="group border-b border-ink-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                <h3 className="text-[15px] font-medium">{item.question}</h3>
                <ChevronDown className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-[14px] leading-relaxed text-ink-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
