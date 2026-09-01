/**
 * Central catalogue of every enum-like value in the product.
 * SQLite has no native enums, so these constants are the single source of truth
 * for validation, labels and badge colours across the whole application.
 */

/* ------------------------------------------------------------------ */
/* VEHICLE                                                             */
/* ------------------------------------------------------------------ */

export const VEHICLE_STATUSES = [
  "draft",
  "available",
  "reserved",
  "booked",
  "sold",
  "inactive",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_META: Record<
  VehicleStatus,
  { label: string; tone: BadgeTone; publicVisible: boolean; help: string }
> = {
  draft: { label: "Draft", tone: "neutral", publicVisible: false, help: "Not visible on your website yet" },
  available: { label: "Available", tone: "success", publicVisible: true, help: "Live and open for enquiries" },
  reserved: { label: "Reserved", tone: "warning", publicVisible: true, help: "Held for a customer, still listed" },
  booked: { label: "Booked", tone: "info", publicVisible: true, help: "Token received, awaiting delivery" },
  sold: { label: "Sold", tone: "danger", publicVisible: false, help: "Moved to sales history" },
  inactive: { label: "Inactive", tone: "neutral", publicVisible: false, help: "Hidden from the public site" },
};

/** Statuses a customer is allowed to see on the public showroom. */
export const PUBLIC_VEHICLE_STATUSES = VEHICLE_STATUSES.filter(
  (s) => VEHICLE_STATUS_META[s].publicVisible,
);

export const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid", "Petrol + CNG", "LPG"] as const;
export const TRANSMISSIONS = ["Manual", "Automatic", "AMT", "CVT", "DCT", "iMT"] as const;
export const BODY_TYPES = [
  "Hatchback",
  "Sedan",
  "SUV",
  "Compact SUV",
  "MUV",
  "Luxury",
  "Coupe",
  "Convertible",
  "Pickup",
] as const;

export const OWNERSHIP_OPTIONS = [
  { value: 1, label: "1st Owner" },
  { value: 2, label: "2nd Owner" },
  { value: 3, label: "3rd Owner" },
  { value: 4, label: "4th Owner or more" },
];

export const INSURANCE_STATUSES = [
  { value: "comprehensive", label: "Comprehensive" },
  { value: "third_party", label: "Third Party" },
  { value: "zero_dep", label: "Zero Depreciation" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "Not Available" },
];

export const SERVICE_HISTORY_OPTIONS = [
  { value: "full", label: "Full service history" },
  { value: "partial", label: "Partial history" },
  { value: "none", label: "Not available" },
];

export const CONDITION_GRADES = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "average", label: "Average" },
  { value: "needs_work", label: "Needs work" },
];

export const POPULAR_MAKES = [
  "Maruti Suzuki",
  "Hyundai",
  "Tata",
  "Mahindra",
  "Honda",
  "Toyota",
  "Kia",
  "Volkswagen",
  "Skoda",
  "Renault",
  "MG",
  "Nissan",
  "Ford",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Jeep",
  "Volvo",
] as const;

export const INDIAN_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

/** Feature catalogue grouped for the vehicle form and the detail page. */
export const FEATURE_GROUPS: { group: string; features: { key: string; label: string }[] }[] = [
  {
    group: "Comfort & Convenience",
    features: [
      { key: "ac", label: "Air Conditioning" },
      { key: "climate_control", label: "Climate Control" },
      { key: "power_steering", label: "Power Steering" },
      { key: "power_windows", label: "Power Windows" },
      { key: "central_locking", label: "Central Locking" },
      { key: "keyless_entry", label: "Keyless Entry" },
      { key: "push_start", label: "Push Button Start" },
      { key: "cruise_control", label: "Cruise Control" },
      { key: "rear_ac_vents", label: "Rear AC Vents" },
    ],
  },
  {
    group: "Infotainment",
    features: [
      { key: "touchscreen", label: "Touchscreen" },
      { key: "android_auto", label: "Android Auto" },
      { key: "apple_carplay", label: "Apple CarPlay" },
      { key: "navigation", label: "Navigation" },
      { key: "bluetooth", label: "Bluetooth" },
      { key: "premium_audio", label: "Premium Audio" },
    ],
  },
  {
    group: "Safety",
    features: [
      { key: "abs", label: "ABS" },
      { key: "airbags", label: "Airbags" },
      { key: "esp", label: "ESP" },
      { key: "traction_control", label: "Traction Control" },
      { key: "rear_camera", label: "Rear Camera" },
      { key: "camera_360", label: "360 Camera" },
      { key: "parking_sensors", label: "Parking Sensors" },
      { key: "isofix", label: "ISOFIX Child Seat Mounts" },
      { key: "tpms", label: "Tyre Pressure Monitor" },
    ],
  },
  {
    group: "Exterior & Interior",
    features: [
      { key: "sunroof", label: "Sunroof" },
      { key: "panoramic_sunroof", label: "Panoramic Sunroof" },
      { key: "leather_seats", label: "Leather Seats" },
      { key: "ventilated_seats", label: "Ventilated Seats" },
      { key: "electric_seats", label: "Electric Seats" },
      { key: "alloy_wheels", label: "Alloy Wheels" },
      { key: "led_headlights", label: "LED Headlights" },
      { key: "fog_lamps", label: "Fog Lamps" },
      { key: "roof_rails", label: "Roof Rails" },
    ],
  },
];

export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.features.map((f) => [f.key, f.label])),
);

export function featureLabel(key: string) {
  return FEATURE_LABELS[key] ?? key;
}

/* ------------------------------------------------------------------ */
/* LEADS                                                               */
/* ------------------------------------------------------------------ */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "interested",
  "follow_up",
  "test_drive_scheduled",
  "test_drive_completed",
  "negotiation",
  "booking_pending",
  "booked",
  "won",
  "lost",
  "not_interested",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_META: Record<
  LeadStage,
  { label: string; short: string; tone: BadgeTone; group: "open" | "won" | "lost" }
> = {
  new: { label: "New Lead", short: "New", tone: "info", group: "open" },
  contacted: { label: "Contacted", short: "Contacted", tone: "info", group: "open" },
  interested: { label: "Interested", short: "Interested", tone: "brand", group: "open" },
  follow_up: { label: "Follow-up", short: "Follow-up", tone: "brand", group: "open" },
  test_drive_scheduled: { label: "Test Drive Scheduled", short: "TD Scheduled", tone: "purple", group: "open" },
  test_drive_completed: { label: "Test Drive Completed", short: "TD Done", tone: "purple", group: "open" },
  negotiation: { label: "Negotiation", short: "Negotiation", tone: "warning", group: "open" },
  booking_pending: { label: "Booking Pending", short: "Booking", tone: "warning", group: "open" },
  booked: { label: "Booked", short: "Booked", tone: "success", group: "open" },
  won: { label: "Sold / Won", short: "Won", tone: "success", group: "won" },
  lost: { label: "Lost", short: "Lost", tone: "danger", group: "lost" },
  not_interested: { label: "Not Interested", short: "Dropped", tone: "neutral", group: "lost" },
};

/** Ordered columns for the kanban pipeline (closed stages live in a collapsed tail). */
export const PIPELINE_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "follow_up",
  "test_drive_scheduled",
  "test_drive_completed",
  "negotiation",
  "booking_pending",
  "booked",
  "won",
  "lost",
];

export const LEAD_SOURCES = [
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone Call" },
  { value: "walk_in", label: "Walk-In" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google_ads", label: "Google Ads" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "referral", label: "Referral" },
  { value: "marketplace", label: "Marketplace" },
  { value: "other", label: "Other" },
];

export const LEAD_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_SOURCES.map((s) => [s.value, s.label]),
);

export const LEAD_PRIORITIES = [
  { value: "high", label: "High", tone: "danger" as BadgeTone },
  { value: "medium", label: "Medium", tone: "warning" as BadgeTone },
  { value: "low", label: "Low", tone: "neutral" as BadgeTone },
];

export const LOST_REASONS = [
  "Price too high",
  "Bought elsewhere",
  "Vehicle sold",
  "Finance not approved",
  "Only enquiring",
  "Wrong number / unreachable",
  "Wanted a different variant",
  "Other",
];

export const ACTIVITY_TYPES = [
  "note", "call", "whatsapp", "email", "stage_change", "assignment",
  "test_drive", "booking", "sale", "system", "follow_up",
] as const;

export const FOLLOW_UP_TYPES = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visit", label: "Showroom Visit" },
  { value: "test_drive", label: "Test Drive" },
  { value: "email", label: "Email" },
];

export const TEST_DRIVE_STATUSES = [
  { value: "requested", label: "Requested", tone: "info" as BadgeTone },
  { value: "confirmed", label: "Confirmed", tone: "brand" as BadgeTone },
  { value: "completed", label: "Completed", tone: "success" as BadgeTone },
  { value: "cancelled", label: "Cancelled", tone: "neutral" as BadgeTone },
  { value: "no_show", label: "No Show", tone: "danger" as BadgeTone },
];

/* ------------------------------------------------------------------ */
/* AGEING                                                              */
/* ------------------------------------------------------------------ */

export const AGEING_BUCKETS = [
  { key: "0-15", label: "0-15 days", min: 0, max: 15, tone: "success" as BadgeTone },
  { key: "16-30", label: "16-30 days", min: 16, max: 30, tone: "info" as BadgeTone },
  { key: "31-60", label: "31-60 days", min: 31, max: 60, tone: "brand" as BadgeTone },
  { key: "61-90", label: "61-90 days", min: 61, max: 90, tone: "warning" as BadgeTone },
  { key: "90+", label: "90+ days", min: 91, max: Number.MAX_SAFE_INTEGER, tone: "danger" as BadgeTone },
];

export function ageingBucket(days: number) {
  return AGEING_BUCKETS.find((b) => days >= b.min && days <= b.max) ?? AGEING_BUCKETS[0];
}

/* ------------------------------------------------------------------ */
/* SHARED                                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

export const DEALER_STATUSES = [
  { value: "trial", label: "Trial", tone: "info" as BadgeTone },
  { value: "active", label: "Active", tone: "success" as BadgeTone },
  { value: "suspended", label: "Suspended", tone: "warning" as BadgeTone },
  { value: "expired", label: "Expired", tone: "danger" as BadgeTone },
];

export const PRICE_BUCKETS = [
  { label: "Under 3 Lakh", min: 0, max: 300000 },
  { label: "3 - 5 Lakh", min: 300000, max: 500000 },
  { label: "5 - 8 Lakh", min: 500000, max: 800000 },
  { label: "8 - 12 Lakh", min: 800000, max: 1200000 },
  { label: "12 - 20 Lakh", min: 1200000, max: 2000000 },
  { label: "Above 20 Lakh", min: 2000000, max: 100000000 },
];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "km_asc", label: "Kilometres: Low to High" },
  { value: "year_desc", label: "Year: Newest First" },
];

/** Default EMI assumptions used by the on-page calculator. */
export const EMI_DEFAULTS = { downPaymentPct: 20, interestRate: 9.5, tenureMonths: 60 };

/* ------------------------------------------------------------------ */
/* CUSTOMER REQUIREMENTS                                               */
/* ------------------------------------------------------------------ */

export const REQUIREMENT_STATUSES = [
  { value: "open", label: "Open", tone: "brand" as BadgeTone, help: "Actively looking" },
  { value: "matched", label: "Matched", tone: "success" as BadgeTone, help: "Stock found, customer contacted" },
  { value: "fulfilled", label: "Fulfilled", tone: "success" as BadgeTone, help: "Customer bought" },
  { value: "expired", label: "Expired", tone: "neutral" as BadgeTone, help: "Past its date" },
  { value: "cancelled", label: "Cancelled", tone: "neutral" as BadgeTone, help: "No longer looking" },
];

export const REQUIREMENT_STATUS_META: Record<
  string,
  { label: string; tone: BadgeTone; help: string }
> = Object.fromEntries(
  REQUIREMENT_STATUSES.map((s) => [s.value, { label: s.label, tone: s.tone, help: s.help }]),
);

/** Coded lost reasons — the free-text label stays for display, the code drives analytics. */
export const LOST_REASON_OPTIONS = [
  { code: "budget", label: "Budget issue" },
  { code: "vehicle_sold", label: "Vehicle sold" },
  { code: "not_available", label: "Vehicle not available" },
  { code: "bought_elsewhere", label: "Purchased elsewhere" },
  { code: "finance_rejected", label: "Finance rejected" },
  { code: "price_high", label: "Price too high" },
  { code: "not_responding", label: "Not responding" },
  { code: "requirement_changed", label: "Requirement changed" },
  { code: "location", label: "Location issue" },
  { code: "test_drive_failed", label: "Test drive not satisfactory" },
  { code: "other", label: "Other" },
];

export const LOST_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LOST_REASON_OPTIONS.map((r) => [r.code, r.label]),
);
