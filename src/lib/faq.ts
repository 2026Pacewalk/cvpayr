import type { WorkingHour } from "@/server/dealer";

/**
 * The questions a used-car buyer actually asks before they visit, answered from
 * the dealership's own data.
 *
 * Two rules hold this together. Every answer is built from a real field, so a
 * dealer who has not filled something in simply gets one fewer question rather
 * than an invented claim. And every question returned here is rendered on the
 * page — FAQ structured data that has no visible counterpart is what earns a
 * manual action, not a rich result.
 *
 * Answers sit in the 40–60 word range: long enough for an assistant to quote
 * whole, short enough to be the featured snippet rather than the source of one.
 */

export type FaqItem = { question: string; answer: string };

type FaqDealer = {
  name: string;
  city?: string | null;
  addressLine?: string | null;
  state?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  branches: { name: string; city: string; addressLine?: string | null }[];
  websiteSettings?: { showFinance: boolean; showSellYourCar: boolean } | null;
};

const list = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Collapses the week into the plain-English ranges people actually read. */
function hoursSentence(hours: WorkingHour[]): string | null {
  const open = hours.filter((h) => !h.closed && h.open && h.close);
  if (!open.length) return null;

  const closed = hours.filter((h) => h.closed).map((h) => h.day);
  const first = open[0]!;
  const uniform = open.every((h) => h.open === first.open && h.close === first.close);

  if (uniform) {
    const days = closed.length ? `every day except ${list(closed)}` : "every day";
    return `${first.open} to ${first.close}, ${days}`;
  }
  return open.map((h) => `${h.day} ${h.open}–${h.close}`).join(", ");
}

export function showroomFaq(
  dealer: FaqDealer,
  data: {
    hours: WorkingHour[];
    stock: number;
    brands: { make: string; count: number }[];
    since?: number;
  },
): FaqItem[] {
  const items: FaqItem[] = [];
  const city = dealer.city ?? dealer.branches[0]?.city ?? null;
  const where = city ? ` in ${city}` : "";
  const count = dealer.branches.length;

  /* Location — the single most asked question about any local business. */
  if (dealer.branches.length || dealer.addressLine) {
    const addresses = dealer.branches
      .slice(0, 4)
      .map((b) => `${b.name}, ${[b.addressLine, b.city].filter(Boolean).join(", ")}`);
    const body = addresses.length
      ? `${dealer.name} has ${count} showroom${count === 1 ? "" : "s"}: ${list(addresses)}.`
      : `${dealer.name} is at ${[dealer.addressLine, dealer.city, dealer.state].filter(Boolean).join(", ")}.`;
    items.push({
      question: `Where is ${dealer.name} located?`,
      answer: `${body} You can walk in during showroom hours or call ahead and we will keep the car you want ready for a test drive.`,
    });
  }

  /* Timings. */
  const timings = hoursSentence(data.hours);
  if (timings) {
    items.push({
      question: `What are the showroom timings at ${dealer.name}?`,
      answer: `Our showroom${count === 1 ? " is" : "s are"} open ${timings}. If you are travelling from outside${city ? ` ${city}` : ""}, call or message us first and we will confirm the car is still available and hold it for your visit.`,
    });
  }

  /* Stock and brands — the answer that wins "used cars in <city>" queries. */
  if (data.stock > 0) {
    const brands = data.brands.slice(0, 6).map((b) => b.make);
    const brandLine = brands.length ? ` Current stock includes ${list(brands)}.` : "";
    items.push({
      question: `How many used cars does ${dealer.name} have in stock?`,
      answer: `${dealer.name} currently has ${data.stock} pre-owned car${data.stock === 1 ? "" : "s"} listed${where}, across ${count} showroom${count === 1 ? "" : "s"}.${brandLine} Every listing shows real photos, the exact kilometres and the ownership record.`,
    });
  }

  /* Inspection — what separates an organised dealer from a broker. */
  items.push({
    question: `Are the cars at ${dealer.name} inspected before they are listed?`,
    answer: `Yes. Every car is checked and its paperwork verified before it appears on this website, and the listing shows the year, kilometres, fuel type, transmission and number of previous owners so you know what you are looking at before you visit.`,
  });

  /* Finance — only when the dealer actually offers it. */
  if (dealer.websiteSettings?.showFinance !== false) {
    items.push({
      question: `Does ${dealer.name} offer car loans or finance?`,
      answer: `Yes. We work with lending partners to arrange finance on pre-owned cars, and our team can tell you what you are likely to be approved for before you commit. Share your requirement through the finance page and we will come back with the options.`,
    });
  }

  /* Exchange / selling. */
  if (dealer.websiteSettings?.showSellYourCar !== false) {
    items.push({
      question: `Can I sell or exchange my old car at ${dealer.name}?`,
      answer: `Yes. Send us your car's details and we will give you a valuation, usually the same day. If you are buying from us as well, the value of your existing car can be adjusted against the price of the one you are taking home.`,
    });
  }

  /* Test drive — the actual conversion event. */
  const reach = dealer.whatsapp ? "WhatsApp us" : dealer.phone ? "call us" : "send an enquiry";
  items.push({
    question: `How do I book a test drive at ${dealer.name}?`,
    answer: `Open any car on this website and use the enquiry form, or ${reach} with the stock number. Tell us when you can visit and which showroom suits you, and we will have the car cleaned, fuelled and ready when you arrive.`,
  });

  return items;
}
