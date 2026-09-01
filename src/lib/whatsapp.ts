/**
 * WhatsApp message templates.
 *
 * Pure functions — imported by client components and server code alike, so no
 * `server-only` and no Prisma in here. The dealer edits the body once in
 * Settings and every screen that sends that kind of message picks up the change.
 */

/** Every placeholder a template body may contain. */
export const TEMPLATE_VARIABLES = [
  { key: "customer", label: "Customer full name", example: "Rahul Sharma" },
  { key: "customer_first", label: "Customer first name", example: "Rahul" },
  { key: "dealer", label: "Dealership name", example: "Sharma Auto Wheels" },
  { key: "salesperson", label: "Your name", example: "Priya Malhotra" },
  { key: "vehicle", label: "Vehicle name", example: "2022 Hyundai Creta SX (O)" },
  { key: "stock_id", label: "Stock ID", example: "STK-0001" },
  { key: "price", label: "Asking price", example: "₹15.45 L" },
  { key: "link", label: "Link to the page", example: "https://…/cars/…" },
  { key: "branch", label: "Branch name", example: "Ludhiana Showroom" },
  { key: "branch_address", label: "Branch address", example: "Plot 44, GT Road, Ludhiana" },
  { key: "date", label: "Date", example: "12 Sep 2026" },
  { key: "time", label: "Time", example: "11:00 am" },
  { key: "amount", label: "Amount", example: "₹25,000" },
] as const;

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>>;

/**
 * Fills placeholders. Unknown or unsupplied placeholders are stripped rather
 * than left as raw `{{…}}` — a half-rendered template must never reach a customer.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key as keyof TemplateVars] ?? "")
    // Collapse the gaps a stripped variable leaves behind.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Which variables a body actually uses — drives the "missing data" hint in the UI. */
export function usedVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}

export type TemplateCategory = "lead" | "vehicle" | "booking" | "general";

export type SeedTemplate = {
  key: string;
  name: string;
  category: TemplateCategory;
  body: string;
  sortOrder: number;
};

/**
 * The templates every dealership starts with. Seeded per dealer on first use so
 * they can be edited freely without affecting anyone else.
 */
export const DEFAULT_TEMPLATES: SeedTemplate[] = [
  {
    key: "vehicle_details",
    name: "Send vehicle details",
    category: "vehicle",
    sortOrder: 1,
    body:
      "Hi {{customer_first}}, thank you for your interest in our {{vehicle}}.\n\n" +
      "Asking price: {{price}}\nStock ID: {{stock_id}}\nAvailable at: {{branch}}\n\n" +
      "You can view complete details, photos and the condition report here:\n{{link}}\n\n" +
      "Please let me know if you would like to schedule a test drive.\n\n— {{salesperson}}, {{dealer}}",
  },
  {
    key: "vehicle_link",
    name: "Send vehicle link only",
    category: "vehicle",
    sortOrder: 2,
    body: "Hi {{customer_first}}, here is the {{vehicle}} we discussed:\n{{link}}\n\n— {{salesperson}}, {{dealer}}",
  },
  {
    key: "shortlist",
    name: "Send shortlist",
    category: "lead",
    sortOrder: 3,
    body:
      "Hi {{customer_first}}, based on what you told me I have shortlisted a few cars for you.\n\n" +
      "You can see all of them here:\n{{link}}\n\n" +
      "Tell me which ones you like and I will keep them ready for a test drive.\n\n— {{salesperson}}, {{dealer}}",
  },
  {
    key: "follow_up",
    name: "Follow up",
    category: "lead",
    sortOrder: 4,
    body:
      "Hi {{customer_first}}, following up on your enquiry for the {{vehicle}}.\n\n" +
      "Is it still something you are considering? Happy to arrange a test drive at a time that suits you.\n\n" +
      "— {{salesperson}}, {{dealer}}",
  },
  {
    key: "test_drive",
    name: "Confirm test drive",
    category: "lead",
    sortOrder: 5,
    body:
      "Hi {{customer_first}}, your test drive is confirmed.\n\n" +
      "Car: {{vehicle}}\nDate: {{date}}\nTime: {{time}}\nShowroom: {{branch}}\n{{branch_address}}\n\n" +
      "Please carry your driving licence. Call me if anything changes.\n\n— {{salesperson}}, {{dealer}}",
  },
  {
    key: "booking",
    name: "Confirm booking",
    category: "booking",
    sortOrder: 6,
    body:
      "Hi {{customer_first}}, thank you for booking the {{vehicle}}.\n\n" +
      "Token received: {{amount}}\nBooking date: {{date}}\n\n" +
      "We have marked the car as reserved for you. I will keep you updated on the paperwork and delivery.\n\n" +
      "— {{salesperson}}, {{dealer}}",
  },
  {
    key: "location",
    name: "Send showroom location",
    category: "general",
    sortOrder: 7,
    body:
      "Hi {{customer_first}}, here is our showroom address:\n\n{{branch}}\n{{branch_address}}\n\n" +
      "Location on map: {{link}}\n\nLooking forward to seeing you.\n\n— {{salesperson}}, {{dealer}}",
  },
  {
    key: "price_offer",
    name: "Share best price",
    category: "lead",
    sortOrder: 8,
    body:
      "Hi {{customer_first}}, I spoke to my manager about the {{vehicle}}.\n\n" +
      "The best we can do is {{amount}}. This includes a full inspection and complete paperwork support.\n\n" +
      "Shall I hold the car for you?\n\n— {{salesperson}}, {{dealer}}",
  },
];

/** Number of characters WhatsApp comfortably shows before truncating a preview. */
export const TEMPLATE_SOFT_LIMIT = 900;
