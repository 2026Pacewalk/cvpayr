/**
 * The home page FAQ copy.
 *
 * It lives here rather than inside the client component that renders it because
 * a server component importing a constant from a "use client" module receives a
 * client reference, not the value. Keeping one array means the visible answers
 * and the FAQPage markup generated from them cannot drift apart, which matters:
 * FAQ structured data with no matching on-page content is a guideline breach,
 * not a cosmetic bug.
 */
export const FAQS = [
  {
    q: "Do I need a website already?",
    a: "No. Your showroom is created with your account — a full public site at /d/your-name with every car you add, your branding, your branches and your contact details. Point a domain at it whenever you are ready.",
  },
  {
    q: "Can my salespeople see what a car cost me?",
    a: "Only if you let them. Purchase cost, refurbishment spend, minimum acceptable price and profit are behind two separate permissions. Sales executives see the asking price; the cost fields are stripped on the server, so they are not in the page, an export, or a network response.",
  },
  {
    q: "How do enquiries reach my team?",
    a: "Every website form, WhatsApp tap and manually-added walk-in becomes a lead with the vehicle, branch, source and campaign attached. It appears in the pipeline immediately and can be auto-assigned round-robin to the least loaded executive at that branch.",
  },
  {
    q: "What happens when a car is sold?",
    a: "The vehicle moves to Sold, disappears from your public site, and is kept permanently in sales history with a snapshot of cost and margin. Every other open enquiry on that car is closed automatically with the reason 'Vehicle sold'.",
  },
  {
    q: "Can I run more than one showroom?",
    a: "Yes — that is the point. Stock, leads, staff, sales and reports are all tracked per branch, you can transfer a vehicle between branches, and staff can be scoped so a branch manager only sees their own location.",
  },
  {
    q: "What does yearly billing save me?",
    a: "A flat 10% off every plan, applied automatically when you choose yearly. You can switch between monthly and yearly at any time and the price updates on your next cycle.",
  },
];
