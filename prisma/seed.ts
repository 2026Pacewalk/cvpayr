/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_TEMPLATES, ALL_PERMISSIONS } from "../src/lib/permissions";
import { yearlyPrice } from "../src/lib/billing";

const db = new PrismaClient();

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const daysAhead = (n: number) => new Date(now.getTime() + n * 86400000);
const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

/** Curated automotive photography pool. Cycled per vehicle with an offset. */
const PHOTOS = [
  "photo-1552519507-da3b142c6e3d",
  "photo-1503376780353-7e6692767b70",
  "photo-1494976388531-d1058494cdd8",
  "photo-1568605117036-5fe5e7bab0b7",
  "photo-1580273916550-e323be2ae537",
  "photo-1541899481282-d53bffe3c35d",
  "photo-1533473359331-0135ef1b58bf",
  "photo-1511919884226-fd3cad34687c",
  "photo-1549317661-bd32c8ce0db2",
  "photo-1503736334956-4c8f8e92946d",
  "photo-1492144534655-ae79c964c9d7",
  "photo-1544636331-e26879cd4d9b",
  "photo-1550355291-bbee04a92027",
  "photo-1485291571150-772bcfc10da5",
  "photo-1519641471654-76ce0107ad1b",
  "photo-1553440569-bcc63803a83d",
  "photo-1502161254066-6c74afbf07aa",
  "photo-1493238792000-8113da705763",
  "photo-1583121274602-3e2820c69888",
  "photo-1606664515524-ed2f786a0bd6",
];

const img = (id: string, w = 1400) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

async function reset() {
  // Order matters: children before parents.
  await db.couponRedemption.deleteMany();
  await db.coupon.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.customerRequirement.deleteMany();
  await db.reminderRun.deleteMany();
  await db.notificationPreference.deleteMany();
  await db.sharedCatalogItem.deleteMany();
  await db.sharedCatalog.deleteMany();
  await db.sale.deleteMany();
  await db.booking.deleteMany();
  await db.testDrive.deleteMany();
  await db.followUp.deleteMany();
  await db.leadActivity.deleteMany();
  await db.lead.deleteMany();
  await db.customer.deleteMany();
  await db.branchTransfer.deleteMany();
  await db.vehicleImage.deleteMany();
  await db.vehicle.deleteMany();
  await db.testimonial.deleteMany();
  await db.userBranch.deleteMany();
  await db.branch.deleteMany();
  await db.websiteSettings.deleteMany();
  await db.subscription.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany();
  await db.dealer.deleteMany();
  await db.plan.deleteMany();
}

async function main() {
  console.log("Resetting database…");
  await reset();

  const password = await bcrypt.hash("password123", 10);

  /* ---------------------------- PLANS ---------------------------- */
  console.log("Seeding plans…");
  const starter = await db.plan.create({
    data: {
      code: "starter",
      name: "Starter",
      description: "For single-showroom dealers getting online.",
      priceMonthly: 1499,
      priceYearly: yearlyPrice(1499),
      sortOrder: 1,
      maxBranches: 1,
      maxUsers: 3,
      maxVehicles: 50,
      maxImagesPerVehicle: 15,
      storageMb: 2048,
      features: JSON.stringify({
        crm: true, customDomain: false, advancedReports: false,
        customBranding: false, apiAccess: false, prioritySupport: false, bulkImport: false,
      }),
    },
  });

  const professional = await db.plan.create({
    data: {
      code: "professional",
      name: "Professional",
      description: "Multi-branch dealerships running a real sales team.",
      priceMonthly: 3999,
      priceYearly: yearlyPrice(3999),
      sortOrder: 2,
      maxBranches: 5,
      maxUsers: 15,
      maxVehicles: 300,
      maxImagesPerVehicle: 30,
      storageMb: 10240,
      features: JSON.stringify({
        crm: true, customDomain: false, advancedReports: true,
        customBranding: true, apiAccess: false, prioritySupport: false, bulkImport: true,
      }),
    },
  });

  const enterprise = await db.plan.create({
    data: {
      code: "enterprise",
      name: "Enterprise",
      description: "Large groups with custom domains and integrations.",
      priceMonthly: 9999,
      priceYearly: yearlyPrice(9999),
      sortOrder: 3,
      maxBranches: -1,
      maxUsers: -1,
      maxVehicles: -1,
      maxImagesPerVehicle: 60,
      storageMb: 102400,
      features: JSON.stringify({
        crm: true, customDomain: true, advancedReports: true,
        customBranding: true, apiAccess: true, prioritySupport: true, bulkImport: true,
      }),
    },
  });

  /* --------------------------- COUPONS --------------------------- */
  console.log("Seeding coupons…");
  const launchCoupon = await db.coupon.create({
    data: {
      code: "LAUNCH50",
      description: "Launch offer — half price for the first 3 months",
      discountType: "percent",
      discountValue: 50,
      durationMonths: 3,
      maxRedemptions: 100,
      validUntil: daysAhead(90),
      notes: "Approved for the first 100 dealerships onboarded.",
    },
  });

  await db.coupon.create({
    data: {
      code: "DIWALI25",
      description: "Diwali seasonal offer — 25% off for a year",
      discountType: "percent",
      discountValue: 25,
      durationMonths: 12,
      maxRedemptions: 50,
      validUntil: daysAhead(45),
    },
  });

  await db.coupon.create({
    data: {
      code: "REFER1000",
      description: "Referral credit — flat ₹1,000 off every month",
      discountType: "flat",
      discountValue: 1000,
      planId: professional.id,
      notes: "Given to dealers who refer another dealership that converts.",
    },
  });

  await db.coupon.create({
    data: {
      code: "WINBACK40",
      description: "Win-back offer for expired accounts",
      discountType: "percent",
      discountValue: 40,
      durationMonths: 6,
      isActive: false,
      notes: "Paused pending finance sign-off.",
    },
  });

  /* ------------------------- SUPER ADMIN ------------------------- */
  await db.user.create({
    data: {
      name: "Platform Admin",
      email: "admin@carvyapar.in",
      passwordHash: password,
      isSuperAdmin: true,
      designation: "Platform Operations",
      phone: "9800000000",
    },
  });

  /* ---------------------------- DEALER --------------------------- */
  console.log("Seeding dealership…");
  const dealer = await db.dealer.create({
    data: {
      slug: "sharma-auto",
      name: "Sharma Auto Wheels",
      legalName: "Sharma Auto Wheels Pvt. Ltd.",
      tagline: "North India's trusted pre-owned car destination",
      about:
        "Sharma Auto Wheels has been helping families across Punjab, Chandigarh and Delhi find honest, well-inspected pre-owned cars since 2009. Every vehicle on our floor passes a 140-point inspection, comes with verified service records and a clear ownership history. No hidden charges, no odometer surprises — just a fair price and a car you can trust.",
      logoUrl: null,
      coverUrl: img("photo-1567818735868-e71b99932e29", 1920),
      contactPerson: "Rajesh Sharma",
      phone: "9815012345",
      whatsapp: "9815012345",
      email: "sales@sharmaautowheels.in",
      website: "https://sharmaautowheels.in",
      addressLine: "Plot 44, GT Road, Near Bus Stand",
      city: "Ludhiana",
      state: "Punjab",
      pincode: "141003",
      mapsUrl: "https://maps.google.com/?q=Ludhiana+GT+Road",
      gstin: "03AABCS1429B1ZP",
      facebookUrl: "https://facebook.com/sharmaautowheels",
      instagramUrl: "https://instagram.com/sharmaautowheels",
      youtubeUrl: "https://youtube.com/@sharmaautowheels",
      status: "active",
      createdAt: new Date("2009-04-12"),
      workingHours: JSON.stringify([
        { day: "Monday", open: "09:30", close: "19:30" },
        { day: "Tuesday", open: "09:30", close: "19:30" },
        { day: "Wednesday", open: "09:30", close: "19:30" },
        { day: "Thursday", open: "09:30", close: "19:30" },
        { day: "Friday", open: "09:30", close: "19:30" },
        { day: "Saturday", open: "09:30", close: "20:00" },
        { day: "Sunday", open: "11:00", close: "17:00" },
      ]),
    },
  });

  await db.subscription.create({
    data: {
      dealerId: dealer.id,
      planId: professional.id,
      status: "active",
      startedAt: daysAgo(210),
      currentPeriodEnd: daysAhead(155),
    },
  });

  await db.websiteSettings.create({
    data: {
      dealerId: dealer.id,
      heroHeadline: "Find your next car, without the guesswork",
      heroSubheadline:
        "Every car inspected on 140 points, priced fairly, and backed by paperwork you can verify.",
      heroImageUrl: img("photo-1493238792000-8113da705763", 1920),
      metaTitle: "Sharma Auto Wheels — Certified Pre-Owned Cars in Ludhiana, Chandigarh & Delhi",
      metaDescription:
        "Browse 18+ inspected pre-owned cars across three showrooms. Transparent pricing, verified service history and easy finance.",
      whyChooseUs: JSON.stringify([
        { icon: "shield", title: "140-point inspection", body: "Engine, suspension, electricals and paint checked before a car reaches our floor." },
        { icon: "file", title: "Verified paperwork", body: "RC, insurance and service records validated. Ownership history disclosed upfront." },
        { icon: "wallet", title: "Finance in 48 hours", body: "Tie-ups with 9 lenders. Get approved without leaving the showroom." },
        { icon: "repeat", title: "5-day exchange", body: "Not the right fit? Swap it for another car within 5 days, no questions." },
      ]),
    },
  });

  /* ----------------------------- ROLES --------------------------- */
  const roles: Record<string, string> = {};
  for (const template of ROLE_TEMPLATES) {
    const role = await db.role.create({
      data: {
        dealerId: dealer.id,
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
        permissions: JSON.stringify(
          template.key === "dealer_owner" ? ALL_PERMISSIONS : template.permissions,
        ),
      },
    });
    roles[template.key] = role.id;
  }

  /* --------------------------- BRANCHES -------------------------- */
  console.log("Seeding branches…");
  const branchSeed = [
    {
      code: "LDH",
      name: "Ludhiana Showroom",
      addressLine: "Plot 44, GT Road, Near Bus Stand",
      city: "Ludhiana",
      state: "Punjab",
      pincode: "141003",
      phone: "9815012345",
      whatsapp: "9815012345",
      email: "ludhiana@sharmaautowheels.in",
      openingHours: "Mon-Sat 9:30 AM - 7:30 PM, Sun 11 AM - 5 PM",
      sortOrder: 1,
      images: JSON.stringify([img("photo-1567818735868-e71b99932e29"), img("photo-1562141961-b5d1cf2fdb5f")]),
    },
    {
      code: "CHD",
      name: "Chandigarh Showroom",
      addressLine: "SCO 118, Industrial Area Phase 1",
      city: "Chandigarh",
      state: "Chandigarh",
      pincode: "160002",
      phone: "9815067890",
      whatsapp: "9815067890",
      email: "chandigarh@sharmaautowheels.in",
      openingHours: "Mon-Sat 10 AM - 8 PM, Sun 11 AM - 6 PM",
      sortOrder: 2,
      images: JSON.stringify([img("photo-1562141961-b5d1cf2fdb5f")]),
    },
    {
      code: "DEL",
      name: "Delhi Showroom",
      addressLine: "A-22, Moti Nagar, Najafgarh Road",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110015",
      phone: "9810045678",
      whatsapp: "9810045678",
      email: "delhi@sharmaautowheels.in",
      openingHours: "Mon-Sun 10 AM - 8 PM",
      sortOrder: 3,
      images: JSON.stringify([img("photo-1493238792000-8113da705763")]),
    },
  ];

  const branches = [];
  for (const b of branchSeed) {
    branches.push(await db.branch.create({ data: { ...b, dealerId: dealer.id } }));
  }
  const [ludhiana, chandigarh, delhi] = branches;

  /* ----------------------------- STAFF --------------------------- */
  console.log("Seeding staff…");
  const owner = await db.user.create({
    data: {
      dealerId: dealer.id,
      roleId: roles.dealer_owner,
      name: "Rajesh Sharma",
      email: "owner@sharmaautowheels.in",
      phone: "9815012345",
      whatsapp: "9815012345",
      designation: "Managing Director",
      passwordHash: password,
      createdAt: daysAgo(400),
    },
  });

  const makeStaff = async (
    name: string,
    email: string,
    phone: string,
    roleKey: string,
    designation: string,
    branchIds: string[],
  ) => {
    const user = await db.user.create({
      data: {
        dealerId: dealer.id,
        roleId: roles[roleKey],
        name,
        email,
        phone,
        whatsapp: phone,
        designation,
        passwordHash: password,
        createdAt: daysAgo(300),
      },
    });
    for (const branchId of branchIds) {
      await db.userBranch.create({ data: { userId: user.id, branchId } });
    }
    return user;
  };

  const vikram = await makeStaff("Vikram Singh", "vikram@sharmaautowheels.in", "9815022222", "branch_manager", "Branch Manager — Ludhiana", [ludhiana.id]);
  const anita = await makeStaff("Anita Kaur", "anita@sharmaautowheels.in", "9815033333", "branch_manager", "Branch Manager — Chandigarh", [chandigarh.id]);
  const mohit = await makeStaff("Mohit Verma", "mohit@sharmaautowheels.in", "9810044444", "branch_manager", "Branch Manager — Delhi", [delhi.id]);
  const priya = await makeStaff("Priya Malhotra", "priya@sharmaautowheels.in", "9815055555", "sales_executive", "Senior Sales Executive", [ludhiana.id]);
  const arjun = await makeStaff("Arjun Mehta", "arjun@sharmaautowheels.in", "9815066666", "sales_executive", "Sales Executive", [chandigarh.id]);
  const sneha = await makeStaff("Sneha Gupta", "sneha@sharmaautowheels.in", "9810077777", "sales_executive", "Sales Executive", [delhi.id]);
  const inventoryMgr = await makeStaff("Harpreet Sandhu", "harpreet@sharmaautowheels.in", "9815088888", "inventory_manager", "Inventory Head", []);
  const leadMgr = await makeStaff("Neha Bansal", "neha@sharmaautowheels.in", "9815099999", "lead_manager", "CRM & Lead Manager", []);
  await makeStaff("Ravi Kumar", "ravi@sharmaautowheels.in", "9815010101", "viewer", "Accounts (View Only)", []);

  await db.branch.update({ where: { id: ludhiana.id }, data: { managerId: vikram.id } });
  await db.branch.update({ where: { id: chandigarh.id }, data: { managerId: anita.id } });
  await db.branch.update({ where: { id: delhi.id }, data: { managerId: mohit.id } });

  /* ---------------------------- VEHICLES ------------------------- */
  console.log("Seeding inventory…");

  type VehicleSeed = {
    make: string; model: string; variant: string; year: number; regYear?: number;
    fuel: string; transmission: string; body: string; colour: string; km: number;
    owners: number; price: number; original: number; purchase: number; refurb: number;
    branch: string; status: string; ageDays: number; featured?: boolean;
    reg: string; rto: string; state: string; rating: number;
    features: string[]; description: string; photoOffset: number;
  };

  const F_BASE = ["ac", "power_steering", "power_windows", "central_locking", "abs", "airbags", "bluetooth"];
  const F_MID = [...F_BASE, "touchscreen", "android_auto", "apple_carplay", "rear_camera", "parking_sensors", "alloy_wheels", "keyless_entry"];
  const F_TOP = [...F_MID, "sunroof", "push_start", "climate_control", "cruise_control", "led_headlights", "esp", "traction_control", "camera_360", "ventilated_seats", "leather_seats"];

  const vehicleSeeds: VehicleSeed[] = [
    {
      make: "Hyundai", model: "Creta", variant: "SX (O) 1.5 Petrol", year: 2022, regYear: 2022,
      fuel: "Petrol", transmission: "Automatic", body: "SUV", colour: "Titan Grey", km: 28400,
      owners: 1, price: 1545000, original: 1820000, purchase: 1360000, refurb: 32000,
      branch: ludhiana.id, status: "available", ageDays: 12, featured: true,
      reg: "PB10ER4521", rto: "Ludhiana West", state: "Punjab", rating: 4.6,
      features: [...F_TOP, "panoramic_sunroof", "navigation", "ventilated_seats"],
      description:
        "Single-owner SX(O) with the full panoramic sunroof and ventilated seats. Complete Hyundai service history, last serviced at 27,000 km. Original paint on all panels, tyres at roughly 70%.",
      photoOffset: 0,
    },
    {
      make: "Maruti Suzuki", model: "Baleno", variant: "Zeta 1.2", year: 2021,
      fuel: "Petrol", transmission: "Manual", body: "Hatchback", colour: "Nexa Blue", km: 34200,
      owners: 1, price: 685000, original: 810000, purchase: 592000, refurb: 18000,
      branch: ludhiana.id, status: "available", ageDays: 22,
      reg: "PB10FA9087", rto: "Ludhiana Central", state: "Punjab", rating: 4.3,
      features: [...F_MID],
      description:
        "Well-kept Zeta variant with SmartPlay infotainment. City-driven, no accident history, all four tyres replaced at 30,000 km.",
      photoOffset: 3,
    },
    {
      make: "Tata", model: "Nexon", variant: "XZ+ Dark Edition", year: 2022,
      fuel: "Diesel", transmission: "Manual", body: "Compact SUV", colour: "Atlas Black", km: 41800,
      owners: 1, price: 1125000, original: 1340000, purchase: 985000, refurb: 24000,
      branch: chandigarh.id, status: "available", ageDays: 8, featured: true,
      reg: "CH01BM3344", rto: "Chandigarh", state: "Chandigarh", rating: 4.5,
      features: [...F_MID, "sunroof", "climate_control", "esp", "led_headlights"],
      description:
        "5-star GNCAP rated Nexon in the Dark Edition trim. Sunroof, JBL audio and full LED lighting. Genuine kilometres with digital service records.",
      photoOffset: 6,
    },
    {
      make: "Kia", model: "Seltos", variant: "GTX+ 1.4 Turbo DCT", year: 2023,
      fuel: "Petrol", transmission: "DCT", body: "SUV", colour: "Intense Red", km: 19600,
      owners: 1, price: 1795000, original: 2010000, purchase: 1590000, refurb: 28000,
      branch: chandigarh.id, status: "reserved", ageDays: 18, featured: true,
      reg: "CH01BR7788", rto: "Chandigarh", state: "Chandigarh", rating: 4.8,
      features: [...F_TOP, "navigation", "panoramic_sunroof", "premium_audio", "electric_seats"],
      description:
        "Top-of-the-line GTX+ with the 1.4 turbo and 7-speed DCT. Bose audio, ventilated seats, 360 camera. Under manufacturer warranty until 2026.",
      photoOffset: 9,
    },
    {
      make: "Honda", model: "City", variant: "ZX CVT", year: 2021,
      fuel: "Petrol", transmission: "CVT", body: "Sedan", colour: "Platinum White", km: 38900,
      owners: 2, price: 1195000, original: 1490000, purchase: 1040000, refurb: 36000,
      branch: delhi.id, status: "available", ageDays: 46,
      reg: "DL8CAF2211", rto: "Delhi West", state: "Delhi", rating: 4.2,
      features: [...F_MID, "sunroof", "climate_control", "cruise_control", "led_headlights"],
      description:
        "Fifth-generation City ZX with LaneWatch camera and sunroof. Second owner, transferred within family. Interiors in excellent condition.",
      photoOffset: 12,
    },
    {
      make: "Mahindra", model: "XUV700", variant: "AX7 L Diesel AT", year: 2022,
      fuel: "Diesel", transmission: "Automatic", body: "SUV", colour: "Midnight Black", km: 44100,
      owners: 1, price: 2185000, original: 2640000, purchase: 1940000, refurb: 45000,
      branch: delhi.id, status: "available", ageDays: 34, featured: true,
      reg: "DL3CBK5566", rto: "Delhi South", state: "Delhi", rating: 4.7,
      features: [...F_TOP, "panoramic_sunroof", "navigation", "premium_audio", "electric_seats", "isofix"],
      description:
        "7-seat AX7 Luxury Pack with ADAS, dual HD screens and Sony 3D audio. Highway-driven, full Mahindra service history, extended warranty transferable.",
      photoOffset: 15,
    },
    {
      make: "Maruti Suzuki", model: "Swift", variant: "VXi", year: 2019,
      fuel: "Petrol", transmission: "Manual", body: "Hatchback", colour: "Fire Red", km: 56700,
      owners: 2, price: 495000, original: 640000, purchase: 418000, refurb: 22000,
      branch: ludhiana.id, status: "available", ageDays: 67,
      reg: "PB10DZ1234", rto: "Ludhiana West", state: "Punjab", rating: 3.9,
      features: [...F_BASE, "touchscreen", "alloy_wheels"],
      description:
        "Dependable Swift VXi, ideal first car. New clutch assembly and battery fitted during refurbishment. Minor scuffs on the rear bumper, priced accordingly.",
      photoOffset: 1,
    },
    {
      make: "Hyundai", model: "i20", variant: "Asta (O) Turbo iMT", year: 2022,
      fuel: "Petrol", transmission: "iMT", body: "Hatchback", colour: "Fiery Red", km: 26300,
      owners: 1, price: 895000, original: 1080000, purchase: 780000, refurb: 15000,
      branch: chandigarh.id, status: "available", ageDays: 15,
      reg: "CH01BN9012", rto: "Chandigarh", state: "Chandigarh", rating: 4.4,
      features: [...F_MID, "sunroof", "climate_control", "push_start", "premium_audio"],
      description:
        "Turbo-petrol i20 with the clutchless iMT gearbox, sunroof and Bose 7-speaker system. Showroom condition, non-smoker owner.",
      photoOffset: 4,
    },
    {
      make: "Toyota", model: "Innova Crysta", variant: "2.4 VX 7-STR", year: 2020,
      fuel: "Diesel", transmission: "Manual", body: "MUV", colour: "Super White", km: 78400,
      owners: 1, price: 1795000, original: 2090000, purchase: 1610000, refurb: 52000,
      branch: ludhiana.id, status: "available", ageDays: 92,
      reg: "PB10EB4455", rto: "Ludhiana Central", state: "Punjab", rating: 4.1,
      features: [...F_MID, "climate_control", "isofix", "rear_ac_vents"],
      description:
        "The most reliable people-mover on the market. Captain seats, full Toyota service history. Higher kilometres but a bulletproof 2.4 diesel — compression tested at intake.",
      photoOffset: 7,
    },
    {
      make: "Volkswagen", model: "Taigun", variant: "GT Plus 1.5 TSI DSG", year: 2022,
      fuel: "Petrol", transmission: "DCT", body: "Compact SUV", colour: "Curcuma Yellow", km: 31200,
      owners: 1, price: 1665000, original: 1930000, purchase: 1470000, refurb: 30000,
      branch: delhi.id, status: "available", ageDays: 27,
      reg: "DL2CAT8899", rto: "Delhi North", state: "Delhi", rating: 4.5,
      features: [...F_TOP, "navigation", "ventilated_seats"],
      description:
        "GT Plus with the 1.5 TSI EVO and 7-speed DSG. Electronic sunroof, ventilated seats and digital cockpit. DSG service completed at 30,000 km.",
      photoOffset: 10,
    },
    {
      make: "Tata", model: "Punch", variant: "Creative AMT", year: 2023,
      fuel: "Petrol", transmission: "AMT", body: "Compact SUV", colour: "Tropical Mist", km: 14800,
      owners: 1, price: 785000, original: 895000, purchase: 690000, refurb: 12000,
      branch: chandigarh.id, status: "available", ageDays: 6,
      reg: "CH01BT2233", rto: "Chandigarh", state: "Chandigarh", rating: 4.6,
      features: [...F_MID, "sunroof", "push_start"],
      description:
        "Nearly-new Punch Creative with the AMT gearbox and electric sunroof. Balance of factory warranty available. Barely used, still smells new.",
      photoOffset: 13,
    },
    {
      make: "Honda", model: "Amaze", variant: "VX CVT", year: 2020,
      fuel: "Petrol", transmission: "CVT", body: "Sedan", colour: "Radiant Red", km: 47500,
      owners: 2, price: 675000, original: 880000, purchase: 580000, refurb: 26000,
      branch: delhi.id, status: "available", ageDays: 118,
      reg: "DL9CAB6677", rto: "Delhi West", state: "Delhi", rating: 3.8,
      features: [...F_BASE, "touchscreen", "rear_camera", "alloy_wheels", "climate_control"],
      description:
        "Compact sedan with a smooth CVT — an easy city car. Second owner. Alloy wheels refurbished and both front tyres replaced.",
      photoOffset: 16,
    },
    {
      make: "MG", model: "Hector", variant: "Sharp 1.5 DCT", year: 2021,
      fuel: "Petrol", transmission: "DCT", body: "SUV", colour: "Starry Black", km: 52300,
      owners: 1, price: 1445000, original: 1880000, purchase: 1280000, refurb: 41000,
      branch: ludhiana.id, status: "available", ageDays: 74,
      reg: "PB10EL7788", rto: "Ludhiana West", state: "Punjab", rating: 4.0,
      features: [...F_TOP, "navigation", "panoramic_sunroof", "electric_seats"],
      description:
        "Loaded Sharp trim with the 14-inch portrait screen, panoramic sunroof and connected-car tech. Infotainment software updated to the latest build.",
      photoOffset: 2,
    },
    {
      make: "Maruti Suzuki", model: "Ertiga", variant: "ZXi Plus AT", year: 2022,
      fuel: "Petrol", transmission: "Automatic", body: "MUV", colour: "Pearl Metallic", km: 36100,
      owners: 1, price: 1095000, original: 1265000, purchase: 960000, refurb: 20000,
      branch: chandigarh.id, status: "booked", ageDays: 29,
      reg: "CH01BP4455", rto: "Chandigarh", state: "Chandigarh", rating: 4.3,
      features: [...F_MID, "climate_control", "rear_ac_vents", "cruise_control"],
      description:
        "7-seater ZXi Plus automatic with roof-mounted rear AC. Ideal family vehicle, single owner, complete Maruti Arena service history.",
      photoOffset: 5,
    },
    {
      make: "Skoda", model: "Slavia", variant: "Style 1.0 TSI AT", year: 2022,
      fuel: "Petrol", transmission: "Automatic", body: "Sedan", colour: "Candy White", km: 24700,
      owners: 1, price: 1385000, original: 1620000, purchase: 1220000, refurb: 18000,
      branch: delhi.id, status: "available", ageDays: 41,
      reg: "DL4CAS1122", rto: "Delhi South", state: "Delhi", rating: 4.5,
      features: [...F_TOP, "navigation", "ventilated_seats"],
      description:
        "European-built sedan with a 5-star GNCAP rating. Style trim adds sunroof, ventilated seats and subwoofer. Genuine low kilometres.",
      photoOffset: 8,
    },
    {
      make: "Renault", model: "Kiger", variant: "RXZ Turbo CVT", year: 2021,
      fuel: "Petrol", transmission: "CVT", body: "Compact SUV", colour: "Caspian Blue", km: 43600,
      owners: 2, price: 725000, original: 1020000, purchase: 620000, refurb: 28000,
      branch: ludhiana.id, status: "available", ageDays: 103,
      reg: "PB10EF3322", rto: "Ludhiana Central", state: "Punjab", rating: 3.7,
      features: [...F_MID, "climate_control", "push_start"],
      description:
        "Turbo-petrol Kiger in the top RXZ trim. Priced to move — sitting with us longer than we would like, so there is genuine room to negotiate.",
      photoOffset: 11,
    },
    {
      make: "Hyundai", model: "Venue", variant: "SX (O) Turbo DCT", year: 2023,
      fuel: "Petrol", transmission: "DCT", body: "Compact SUV", colour: "Denim Blue", km: 17900,
      owners: 1, price: 1225000, original: 1395000, purchase: 1090000, refurb: 14000,
      branch: chandigarh.id, status: "available", ageDays: 4, featured: true,
      reg: "CH01BV6677", rto: "Chandigarh", state: "Chandigarh", rating: 4.7,
      features: [...F_TOP, "navigation", "premium_audio"],
      description:
        "Facelift Venue SX(O) with the 1.0 turbo DCT, sunroof and Bose audio. Barely 18,000 km, balance warranty until 2028.",
      photoOffset: 14,
    },
    {
      make: "Mahindra", model: "Thar", variant: "LX 4x4 Diesel AT", year: 2021,
      fuel: "Diesel", transmission: "Automatic", body: "SUV", colour: "Napoli Black", km: 39400,
      owners: 1, price: 1495000, original: 1690000, purchase: 1330000, refurb: 35000,
      branch: delhi.id, status: "available", ageDays: 55,
      reg: "DL1CAT9900", rto: "Delhi North", state: "Delhi", rating: 4.4,
      features: [...F_MID, "cruise_control", "climate_control", "roof_rails"],
      description:
        "Hard-top LX 4x4 automatic in Napoli Black. Off-road tyres fitted, stock set included in the sale. No off-road damage — underbody inspected and photographed.",
      photoOffset: 17,
    },
    {
      make: "Maruti Suzuki", model: "Grand Vitara", variant: "Alpha+ Hybrid", year: 2023,
      fuel: "Hybrid", transmission: "Automatic", body: "SUV", colour: "Opulent Red", km: 21500,
      owners: 1, price: 1885000, original: 2075000, purchase: 1690000, refurb: 22000,
      branch: ludhiana.id, status: "available", ageDays: 10,
      reg: "PB10FH5566", rto: "Ludhiana West", state: "Punjab", rating: 4.8,
      features: [...F_TOP, "panoramic_sunroof", "navigation", "premium_audio", "ventilated_seats"],
      description:
        "Strong-hybrid Alpha+ delivering a genuine 25+ km/l in city traffic. Panoramic sunroof, 360 camera, Nexa Safety Shield. Battery health report available.",
      photoOffset: 18,
    },
    {
      make: "Tata", model: "Tiago", variant: "XZ+ CNG", year: 2022,
      fuel: "Petrol + CNG", transmission: "Manual", body: "Hatchback", colour: "Arizona Blue", km: 33800,
      owners: 1, price: 645000, original: 785000, purchase: 555000, refurb: 16000,
      branch: chandigarh.id, status: "available", ageDays: 19,
      reg: "CH01BQ8899", rto: "Chandigarh", state: "Chandigarh", rating: 4.2,
      features: [...F_MID],
      description:
        "Factory-fitted CNG Tiago with a company warranty on the kit. Running cost of roughly ₹2.4/km. Cylinder hydro-tested and certified.",
      photoOffset: 19,
    },
  ];

  const vehicles = [];
  for (let i = 0; i < vehicleSeeds.length; i++) {
    const s = vehicleSeeds[i];
    const listedAt = daysAgo(s.ageDays);
    const vehicle = await db.vehicle.create({
      data: {
        dealerId: dealer.id,
        branchId: s.branch,
        stockId: `STK-${String(i + 1).padStart(4, "0")}`,
        registrationNumber: s.reg,
        make: s.make,
        model: s.model,
        variant: s.variant,
        year: s.year,
        registrationYear: s.regYear ?? s.year,
        fuelType: s.fuel,
        transmission: s.transmission,
        bodyType: s.body,
        colour: s.colour,
        ownership: s.owners,
        kmDriven: s.km,
        registrationState: s.state,
        rto: s.rto,
        insuranceStatus: i % 4 === 0 ? "comprehensive" : i % 4 === 1 ? "zero_dep" : i % 4 === 2 ? "third_party" : "comprehensive",
        // A real yard always has a couple of lapsing papers. The first two cars
        // are deliberately close to expiry so the document alerts have something
        // real to find in a fresh install.
        insuranceValidTill: i === 0 ? daysAhead(9) : daysAhead(60 + i * 11),
        fitnessValidTill: daysAhead(400 + i * 9),
        pucValidTill: i === 1 ? daysAhead(-4) : daysAhead(34 + i * 7),
        sellingPrice: s.price,
        originalPrice: s.original,
        negotiable: s.ageDays > 30,
        minAcceptablePrice: Math.round(s.price * 0.94),
        purchasePrice: s.purchase,
        refurbishmentCost: s.refurb,
        conditionRating: s.rating,
        serviceHistory: s.rating >= 4.3 ? "full" : s.rating >= 4 ? "partial" : "partial",
        accidental: false,
        floodDamaged: false,
        repaintedPanels: s.rating >= 4.5 ? 0 : s.rating >= 4 ? 1 : 2,
        tyreCondition: s.rating >= 4.4 ? "Excellent (80%+)" : "Good (60-70%)",
        batteryCondition: "Good",
        engineCondition: s.rating >= 4 ? "Excellent" : "Good",
        interiorCondition: s.rating >= 4.4 ? "Excellent" : "Good",
        exteriorCondition: s.rating >= 4.4 ? "Excellent" : "Good",
        numberOfKeys: s.rating >= 4.3 ? 2 : 1,
        serviceRecordsAvailable: true,
        rcAvailable: true,
        insuranceAvailable: true,
        description: s.description,
        internalNotes:
          s.ageDays > 90
            ? "Ageing stock — approved for an additional 3% discount to clear."
            : "Inspection sheet filed. Photos shot at the Ludhiana studio.",
        features: JSON.stringify(s.features),
        status: s.status,
        isFeatured: s.featured ?? false,
        viewCount: Math.round(80 + Math.random() * 900),
        enquiryCount: 0,
        listedAt,
        createdAt: listedAt,
        createdById: inventoryMgr.id,
      },
    });

    // 5 photos per vehicle, cycled from the pool with a per-vehicle offset.
    for (let j = 0; j < 5; j++) {
      await db.vehicleImage.create({
        data: {
          vehicleId: vehicle.id,
          url: img(pick(PHOTOS, s.photoOffset + j)),
          kind: "photo",
          sortOrder: j,
          isCover: j === 0,
        },
      });
    }
    if (i % 5 === 0) {
      await db.vehicleImage.create({
        data: {
          vehicleId: vehicle.id,
          url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          kind: "youtube",
          caption: "Walkaround video",
          sortOrder: 90,
        },
      });
    }

    vehicles.push(vehicle);
  }

  /* -------------------------- TESTIMONIALS ----------------------- */
  const testimonials = [
    { name: "Gurpreet Singh", city: "Ludhiana", body: "Bought a Creta from the Ludhiana showroom. They showed me the actual inspection report and even pointed out a small scratch I had missed. Refreshing honesty in this business.", vehicleLabel: "Hyundai Creta SX", rating: 5 },
    { name: "Meenakshi Rao", city: "Chandigarh", body: "Finance was approved in two days and the paperwork was handled end to end. No hidden charges at delivery, exactly the number they quoted.", vehicleLabel: "Kia Seltos GTX+", rating: 5 },
    { name: "Aman Chhabra", city: "New Delhi", body: "I compared three cars over two weekends. The team never pushed me and shared service records for each one. Ended up with the Taigun and I am very happy.", vehicleLabel: "Volkswagen Taigun GT", rating: 5 },
    { name: "Simran Bedi", city: "Ludhiana", body: "Exchanged my old hatchback. Their valuation was better than two other dealers and the transfer of RC was completed within three weeks.", vehicleLabel: "Maruti Baleno Zeta", rating: 4 },
  ];
  for (let i = 0; i < testimonials.length; i++) {
    await db.testimonial.create({ data: { ...testimonials[i], dealerId: dealer.id, sortOrder: i } });
  }

  /* ------------------------ CUSTOMERS & LEADS -------------------- */
  console.log("Seeding CRM…");

  const salesTeam = [priya, arjun, sneha, vikram, anita, mohit];

  const leadSeeds = [
    { name: "Rahul Sharma", phone: "9878012345", city: "Ludhiana", vehicle: 0, stage: "test_drive_scheduled", source: "website", owner: priya.id, branch: ludhiana.id, age: 3, priority: "high", message: "Interested in the Creta SX(O). Is the sunroof the panoramic one? Can I see it this weekend?" },
    { name: "Simarjeet Kaur", phone: "9878023456", city: "Ludhiana", vehicle: 1, stage: "contacted", source: "whatsapp", owner: priya.id, branch: ludhiana.id, age: 2, priority: "medium", message: "Hi, is the Baleno Zeta still available? What is the final price?" },
    { name: "Nitin Aggarwal", phone: "9878034567", city: "Chandigarh", vehicle: 3, stage: "negotiation", source: "website", owner: arjun.id, branch: chandigarh.id, age: 9, priority: "high", message: "Seltos GTX+ looks great. I can close today if you do 17.2." },
    { name: "Pooja Nair", phone: "9878045678", city: "New Delhi", vehicle: 5, stage: "interested", source: "instagram", owner: sneha.id, branch: delhi.id, age: 5, priority: "high", message: "Need a 7-seater for family trips. Does the XUV700 have ADAS?" },
    { name: "Karan Malhotra", phone: "9878056789", city: "Chandigarh", vehicle: 2, stage: "follow_up", source: "google_ads", owner: arjun.id, branch: chandigarh.id, age: 7, priority: "medium", message: "Looking at the Nexon diesel. What is the mileage in real driving?" },
    { name: "Deepak Yadav", phone: "9878067890", city: "New Delhi", vehicle: 4, stage: "new", source: "website", owner: null, branch: delhi.id, age: 0, priority: "high", message: "Is the Honda City ZX available for a test drive tomorrow evening?" },
    { name: "Anjali Bhatt", phone: "9878078901", city: "Ludhiana", vehicle: 18, stage: "test_drive_completed", source: "walk_in", owner: priya.id, branch: ludhiana.id, age: 6, priority: "high", message: "Drove the Grand Vitara hybrid. Impressed with the mileage. Checking finance options." },
    { name: "Sandeep Rana", phone: "9878089012", city: "Chandigarh", vehicle: 10, stage: "booking_pending", source: "referral", owner: anita.id, branch: chandigarh.id, age: 11, priority: "high", message: "Punch AMT for my daughter. Ready to book once the insurance transfer is confirmed." },
    { name: "Vandana Kapoor", phone: "9878090123", city: "New Delhi", vehicle: 9, stage: "contacted", source: "facebook", owner: sneha.id, branch: delhi.id, age: 4, priority: "medium", message: "Taigun GT — has the DSG service been done? Any known issues?" },
    { name: "Manpreet Gill", phone: "9878001234", city: "Ludhiana", vehicle: 8, stage: "lost", source: "website", owner: priya.id, branch: ludhiana.id, age: 24, priority: "low", message: "Innova Crysta for my travel business.", lost: "Price too high" },
    { name: "Ritu Sethi", phone: "9878012000", city: "Chandigarh", vehicle: 7, stage: "new", source: "website", owner: null, branch: chandigarh.id, age: 1, priority: "medium", message: "i20 Asta turbo — can you share more photos of the interiors?" },
    { name: "Harsh Vardhan", phone: "9878023000", city: "New Delhi", vehicle: 17, stage: "interested", source: "meta_ads", owner: sneha.id, branch: delhi.id, age: 8, priority: "medium", message: "Thar 4x4 automatic. Has it been off-roaded? Need underbody photos." },
    { name: "Neelam Joshi", phone: "9878034000", city: "Ludhiana", vehicle: 15, stage: "not_interested", source: "phone", owner: priya.id, branch: ludhiana.id, age: 30, priority: "low", message: "Asked about the Kiger.", lost: "Bought elsewhere" },
    { name: "Tarun Bhalla", phone: "9878045000", city: "Chandigarh", vehicle: 16, stage: "follow_up", source: "website", owner: arjun.id, branch: chandigarh.id, age: 2, priority: "high", message: "Venue SX(O) DCT. Comparing with the Sonet. What is your best price?" },
    { name: "Preeti Sharma", phone: "9878056000", city: "New Delhi", vehicle: 14, stage: "contacted", source: "website", owner: sneha.id, branch: delhi.id, age: 13, priority: "medium", message: "Slavia Style AT — is it a single owner car?" },
  ];

  const createdLeads = [];
  for (let i = 0; i < leadSeeds.length; i++) {
    const s = leadSeeds[i];
    const created = daysAgo(s.age);
    const customer = await db.customer.create({
      data: {
        dealerId: dealer.id,
        name: s.name,
        phone: s.phone,
        whatsapp: s.phone,
        email: `${s.name.split(" ")[0].toLowerCase()}@example.com`,
        city: s.city,
        createdAt: created,
      },
    });

    const vehicle = vehicles[s.vehicle];
    const lead = await db.lead.create({
      data: {
        dealerId: dealer.id,
        reference: `LD-${String(i + 1).padStart(4, "0")}`,
        customerId: customer.id,
        vehicleId: vehicle.id,
        branchId: s.branch,
        ownerId: s.owner,
        stage: s.stage,
        priority: s.priority,
        source: s.source,
        message: s.message,
        lostReason: s.lost ?? null,
        closedAt: s.lost ? daysAgo(Math.max(0, s.age - 3)) : null,
        createdAt: created,
        lastActivityAt: daysAgo(Math.max(0, s.age - 1)),
        // Anything past "new" was contacted; give it a believable response time
        // so the SLA dashboard reflects a working team rather than a cold start.
        firstResponseAt:
          s.stage === "new" ? null : new Date(created.getTime() + (12 + i * 7) * 60000),
        firstContactAt:
          s.stage === "new" ? null : new Date(created.getTime() + (25 + i * 9) * 60000),
        assignmentMethod: s.owner ? "manual" : "manual",
        nextFollowUpAt:
          ["new", "won", "lost", "not_interested"].includes(s.stage)
            ? null
            : i % 3 === 0
              ? at(daysAgo(1), 11)
              : i % 3 === 1
                ? at(now, 16)
                : at(daysAhead(2), 12),
        utmSource: s.source === "google_ads" ? "google" : s.source === "meta_ads" ? "facebook" : null,
        utmCampaign: s.source.includes("ads") ? "used-cars-north-india" : null,
        pageUrl: `/d/sharma-auto/cars/${vehicle.stockId}`,
      },
    });

    await db.vehicle.update({ where: { id: vehicle.id }, data: { enquiryCount: { increment: 1 } } });

    await db.leadActivity.create({
      data: {
        dealerId: dealer.id, leadId: lead.id, type: "system",
        title: "Lead created",
        body: `Enquiry for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stockId})`,
        createdAt: created,
      },
    });

    if (s.owner) {
      await db.leadActivity.create({
        data: {
          dealerId: dealer.id, leadId: lead.id, userId: leadMgr.id, type: "assignment",
          title: `Assigned to ${salesTeam.find((u) => u.id === s.owner)?.name ?? "sales team"}`,
          createdAt: daysAgo(Math.max(0, s.age - 0.2)),
        },
      });
    }

    if (s.stage !== "new") {
      await db.leadActivity.create({
        data: {
          dealerId: dealer.id, leadId: lead.id, userId: s.owner, type: "call",
          title: "Outbound call — connected",
          body: "Confirmed requirement and budget. Customer asked for photos of the interiors and the service record.",
          createdAt: daysAgo(Math.max(0, s.age - 1)),
        },
      });
    }

    if (["negotiation", "booking_pending", "test_drive_completed"].includes(s.stage)) {
      await db.leadActivity.create({
        data: {
          dealerId: dealer.id, leadId: lead.id, userId: s.owner, type: "note",
          title: "Note added",
          body: "Customer is comparing against one other car. Willing to close this week if we can move on price by 2%.",
          createdAt: daysAgo(Math.max(0, s.age - 2)),
        },
      });
    }

    if (!["new", "lost", "not_interested"].includes(s.stage) && s.owner) {
      await db.followUp.create({
        data: {
          dealerId: dealer.id,
          leadId: lead.id,
          assignedToId: s.owner,
          dueAt: i % 3 === 0 ? at(daysAgo(1), 11) : i % 3 === 1 ? at(now, 16) : at(daysAhead(2), 12),
          type: i % 2 === 0 ? "call" : "whatsapp",
          note: i % 2 === 0 ? "Call back with the best price approved by the manager." : "Send the inspection report on WhatsApp.",
          status: "pending",
          createdAt: daysAgo(Math.max(0, s.age - 1)),
        },
      });
    }

    if (["test_drive_scheduled", "test_drive_completed", "booking_pending"].includes(s.stage)) {
      await db.testDrive.create({
        data: {
          dealerId: dealer.id,
          leadId: lead.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          branchId: s.branch,
          assignedToId: s.owner,
          scheduledAt: s.stage === "test_drive_completed" ? at(daysAgo(2), 15) : at(daysAhead(1), 11),
          status: s.stage === "test_drive_completed" ? "completed" : "confirmed",
          location: "Showroom",
          feedback: s.stage === "test_drive_completed" ? "Liked the drive. Concerned about the boot space." : null,
          createdAt: daysAgo(Math.max(0, s.age - 1)),
        },
      });
    }

    createdLeads.push({ lead, customer, vehicle, owner: s.owner, branch: s.branch });
  }

  /* -------------------- BOOKINGS, SALES, HISTORY ----------------- */

  // Live booking: Ertiga (index 12) is already `booked` in inventory.
  const bookingLead = createdLeads.find((l) => l.lead.stage === "booking_pending");
  const ertiga = vehicles[13];
  const bookingCustomer = bookingLead?.customer;
  if (bookingCustomer) {
    await db.booking.create({
      data: {
        dealerId: dealer.id,
        reference: "BK-0001",
        leadId: bookingLead.lead.id,
        customerId: bookingCustomer.id,
        vehicleId: ertiga.id,
        branchId: chandigarh.id,
        salesExecutiveId: anita.id,
        bookingAmount: 50000,
        agreedPrice: 1075000,
        bookedAt: daysAgo(3),
        paymentStatus: "partial",
        paymentMode: "UPI",
        status: "active",
        note: "Token received. Delivery planned after insurance transfer.",
      },
    });
  }

  // Completed sales history across the last five months.
  const soldSeeds = [
    { make: "Hyundai", model: "Verna", variant: "SX (O) Turbo DCT", year: 2021, price: 1345000, purchase: 1160000, refurb: 30000, branch: ludhiana.id, exec: priya.id, days: 12, customer: "Jaspreet Sidhu", phone: "9878100001", body: "Sedan", fuel: "Petrol", tx: "DCT", km: 41200, photo: 2 },
    { make: "Maruti Suzuki", model: "Vitara Brezza", variant: "ZXi Plus", year: 2020, price: 845000, purchase: 720000, refurb: 25000, branch: chandigarh.id, exec: arjun.id, days: 26, customer: "Rohit Bajaj", phone: "9878100002", body: "Compact SUV", fuel: "Petrol", tx: "Manual", km: 52800, photo: 5 },
    { make: "Tata", model: "Harrier", variant: "XZ Plus Dark", year: 2021, price: 1795000, purchase: 1560000, refurb: 48000, branch: delhi.id, exec: sneha.id, days: 41, customer: "Ayesha Khan", phone: "9878100003", body: "SUV", fuel: "Diesel", tx: "Manual", km: 46700, photo: 8 },
    { make: "Honda", model: "Jazz", variant: "VX CVT", year: 2019, price: 625000, purchase: 528000, refurb: 22000, branch: ludhiana.id, exec: priya.id, days: 58, customer: "Vikas Thakur", phone: "9878100004", body: "Hatchback", fuel: "Petrol", tx: "CVT", km: 61400, photo: 11 },
    { make: "Kia", model: "Sonet", variant: "HTX Plus Diesel", year: 2021, price: 1085000, purchase: 935000, refurb: 27000, branch: chandigarh.id, exec: anita.id, days: 73, customer: "Divya Menon", phone: "9878100005", body: "Compact SUV", fuel: "Diesel", tx: "Manual", km: 38900, photo: 14 },
    { make: "Mahindra", model: "Scorpio N", variant: "Z8 L Diesel AT", year: 2022, price: 2225000, purchase: 1980000, refurb: 42000, branch: delhi.id, exec: mohit.id, days: 96, customer: "Ranbir Chauhan", phone: "9878100006", body: "SUV", fuel: "Diesel", tx: "Automatic", km: 33500, photo: 17 },
    { make: "Maruti Suzuki", model: "Dzire", variant: "ZXi AMT", year: 2020, price: 675000, purchase: 575000, refurb: 19000, branch: ludhiana.id, exec: vikram.id, days: 118, customer: "Sunita Devi", phone: "9878100007", body: "Sedan", fuel: "Petrol", tx: "AMT", km: 57300, photo: 1 },
    { make: "Hyundai", model: "Alcazar", variant: "Signature 7-STR", year: 2022, price: 1795000, purchase: 1590000, refurb: 36000, branch: chandigarh.id, exec: arjun.id, days: 140, customer: "Mandeep Brar", phone: "9878100008", body: "SUV", fuel: "Petrol", tx: "Automatic", km: 29800, photo: 4 },
  ];

  for (let i = 0; i < soldSeeds.length; i++) {
    const s = soldSeeds[i];
    const soldAt = daysAgo(s.days);
    const listedAt = daysAgo(s.days + 25 + i * 4);

    const vehicle = await db.vehicle.create({
      data: {
        dealerId: dealer.id,
        branchId: s.branch,
        stockId: `STK-${String(vehicleSeeds.length + i + 1).padStart(4, "0")}`,
        make: s.make, model: s.model, variant: s.variant, year: s.year,
        registrationYear: s.year, fuelType: s.fuel, transmission: s.tx, bodyType: s.body,
        colour: "White", ownership: 1, kmDriven: s.km,
        registrationState: "Punjab", rto: "Ludhiana West",
        sellingPrice: s.price, originalPrice: Math.round(s.price * 1.22),
        purchasePrice: s.purchase, refurbishmentCost: s.refurb,
        minAcceptablePrice: Math.round(s.price * 0.95),
        conditionRating: 4.2, serviceHistory: "full",
        numberOfKeys: 2, serviceRecordsAvailable: true, rcAvailable: true, insuranceAvailable: true,
        features: JSON.stringify(F_MID),
        description: `${s.year} ${s.make} ${s.model} sold through our ${s.branch === ludhiana.id ? "Ludhiana" : s.branch === chandigarh.id ? "Chandigarh" : "Delhi"} showroom.`,
        status: "sold",
        listedAt, createdAt: listedAt, soldAt,
        createdById: inventoryMgr.id,
      },
    });

    for (let j = 0; j < 3; j++) {
      await db.vehicleImage.create({
        data: {
          vehicleId: vehicle.id,
          url: img(pick(PHOTOS, s.photo + j)),
          kind: "photo",
          sortOrder: j,
          isCover: j === 0,
        },
      });
    }

    const customer = await db.customer.create({
      data: {
        dealerId: dealer.id,
        name: s.customer,
        phone: s.phone,
        whatsapp: s.phone,
        city: s.branch === ludhiana.id ? "Ludhiana" : s.branch === chandigarh.id ? "Chandigarh" : "New Delhi",
        createdAt: daysAgo(s.days + 12),
      },
    });

    const lead = await db.lead.create({
      data: {
        dealerId: dealer.id,
        reference: `LD-${String(leadSeeds.length + i + 1).padStart(4, "0")}`,
        customerId: customer.id, vehicleId: vehicle.id, branchId: s.branch, ownerId: s.exec,
        stage: "won", priority: "high",
        source: pick(["website", "walk_in", "whatsapp", "referral", "facebook"], i),
        message: "Enquiry that converted into a sale.",
        createdAt: daysAgo(s.days + 12),
        closedAt: soldAt, lastActivityAt: soldAt,
        firstResponseAt: new Date(daysAgo(s.days + 12).getTime() + 18 * 60000),
        firstContactAt: new Date(daysAgo(s.days + 12).getTime() + 34 * 60000),
      },
    });

    await db.leadActivity.createMany({
      data: [
        { dealerId: dealer.id, leadId: lead.id, type: "system", title: "Lead created", createdAt: daysAgo(s.days + 12) },
        { dealerId: dealer.id, leadId: lead.id, userId: s.exec, type: "test_drive", title: "Test drive completed", createdAt: daysAgo(s.days + 6) },
        { dealerId: dealer.id, leadId: lead.id, userId: s.exec, type: "booking", title: "Booking confirmed", createdAt: daysAgo(s.days + 3) },
        { dealerId: dealer.id, leadId: lead.id, userId: s.exec, type: "sale", title: "Sale completed", createdAt: soldAt },
      ],
    });

    const booking = await db.booking.create({
      data: {
        dealerId: dealer.id,
        reference: `BK-${String(i + 2).padStart(4, "0")}`,
        leadId: lead.id, customerId: customer.id, vehicleId: vehicle.id,
        branchId: s.branch, salesExecutiveId: s.exec,
        bookingAmount: 50000, agreedPrice: s.price,
        bookedAt: daysAgo(s.days + 3), paymentStatus: "paid",
        paymentMode: "Bank Transfer", status: "converted",
      },
    });

    await db.sale.create({
      data: {
        dealerId: dealer.id,
        reference: `SL-${String(i + 1).padStart(4, "0")}`,
        bookingId: booking.id, leadId: lead.id, customerId: customer.id,
        vehicleId: vehicle.id, branchId: s.branch, salesExecutiveId: s.exec,
        salePrice: s.price,
        purchasePrice: s.purchase,
        refurbCost: s.refurb,
        otherCharges: 8000,
        grossProfit: s.price - s.purchase - s.refurb - 8000,
        soldAt,
        paymentMode: i % 2 === 0 ? "Finance" : "Full Payment",
        financeProvider: i % 2 === 0 ? "HDFC Bank" : null,
        createdAt: soldAt,
      },
    });
  }

  /* ---------------------- CUSTOMER REQUIREMENTS ------------------- */
  // Briefs from customers we could not satisfy on the spot. Deliberately a mix:
  // one that current stock answers well, one that nothing fits, one closed.
  const reqSeeds = [
    {
      lead: createdLeads[0],
      priority: "high",
      budgetMin: 1200000,
      budgetMax: 1800000,
      make: "Hyundai",
      fuelTypes: ["Petrol"],
      transmissions: ["Automatic"],
      bodyTypes: ["SUV"],
      yearMin: 2022,
      branchId: ludhiana.id,
      notes: "Also open to anything similar if the Creta does not work out. Wants a sunroof and a top variant.",
      status: "open",
      age: 6,
    },
    {
      lead: createdLeads[3],
      priority: "medium",
      budgetMin: 600000,
      budgetMax: 900000,
      make: "Toyota",
      fuelTypes: ["Diesel"],
      transmissions: ["Manual"],
      bodyTypes: ["MUV"],
      kmMax: 80000,
      branchId: delhi.id,
      notes: "Needs 7 seats for family trips. Nothing in this budget right now.",
      status: "open",
      age: 11,
    },
    {
      lead: createdLeads[9],
      priority: "low",
      budgetMin: 400000,
      budgetMax: 650000,
      fuelTypes: ["Petrol", "Petrol + CNG"],
      bodyTypes: ["Hatchback"],
      branchId: ludhiana.id,
      notes: "First car for their son.",
      status: "fulfilled",
      closedReason: "Bought a Tata Tiago from us.",
      age: 25,
    },
  ] as const;

  for (const r of reqSeeds) {
    if (!r.lead) continue;
    const closed = ["fulfilled", "expired", "cancelled"].includes(r.status);
    await db.customerRequirement.create({
      data: {
        dealerId: dealer.id,
        customerId: r.lead.customer.id,
        createdById: r.lead.owner ?? owner.id,
        branchId: r.branchId,
        leadId: r.lead.lead.id,
        budgetMin: r.budgetMin,
        budgetMax: r.budgetMax,
        make: "make" in r ? r.make : null,
        fuelTypes: JSON.stringify(r.fuelTypes ?? []),
        transmissions: JSON.stringify("transmissions" in r ? r.transmissions : []),
        bodyTypes: JSON.stringify(r.bodyTypes ?? []),
        yearMin: "yearMin" in r ? r.yearMin : null,
        kmMax: "kmMax" in r ? r.kmMax : null,
        notes: r.notes,
        priority: r.priority,
        status: r.status,
        closedAt: closed ? daysAgo(2) : null,
        closedReason: "closedReason" in r ? r.closedReason : null,
        createdAt: daysAgo(r.age),
      },
    });
  }

  /* ------------------------- NOTIFICATIONS ----------------------- */
  // Addressed to real people at real branches, exactly as the live engine
  // writes them — so the demo behaves the same as production.
  const newest = createdLeads.find((l) => l.lead.stage === "new");
  if (newest) {
    for (const recipient of [owner.id, leadMgr.id, sneha.id]) {
      await db.notification.create({
        data: {
          dealerId: dealer.id,
          userId: recipient,
          branchId: newest.branch,
          type: "lead.new",
          category: "lead",
          priority: "high",
          title: `New enquiry received from ${newest.customer.name}`,
          body: `For ${newest.vehicle.year} ${newest.vehicle.make} ${newest.vehicle.model} at Delhi Showroom`,
          link: `/leads/${newest.lead.id}`,
          entityType: "lead",
          entityId: newest.lead.id,
          meta: JSON.stringify({
            phone: newest.customer.phone,
            customerName: newest.customer.name,
          }),
          createdAt: daysAgo(0),
        },
      });
    }
  }

  const overdueLead = createdLeads.find((l) => l.owner === priya.id);
  const seedNotifications = [
    {
      userId: priya.id,
      branchId: ludhiana.id,
      type: "followup.overdue",
      category: "followup",
      priority: "critical",
      title: "Overdue: call Simarjeet Kaur",
      body: "LD-0002 · 1 d overdue · Wanted the final price on the Baleno",
      link: overdueLead ? `/leads/${overdueLead.lead.id}` : "/followups?bucket=overdue",
      entityType: "lead",
      entityId: overdueLead?.lead.id ?? null,
      meta: JSON.stringify({ phone: "9878023456", customerName: "Simarjeet Kaur" }),
      hoursAgo: 3,
    },
    {
      userId: priya.id,
      branchId: ludhiana.id,
      type: "testdrive.today",
      category: "testdrive",
      priority: "high",
      title: "Test drive today: Rahul Sharma",
      body: "2022 Hyundai Creta SX (O) 1.5 Petrol (STK-0001) at Ludhiana Showroom",
      link: "/test-drives",
      entityType: "testdrive",
      entityId: null,
      meta: JSON.stringify({ phone: "9878012345", customerName: "Rahul Sharma" }),
      hoursAgo: 5,
    },
    {
      userId: inventoryMgr.id,
      branchId: ludhiana.id,
      type: "vehicle.ageing_critical",
      category: "inventory",
      priority: "high",
      title: "STK-0007 has been in stock 74 days",
      body: "2019 Maruti Suzuki Swift VXi at ₹4.95 L. Two months of holding cost. Time to act on the price.",
      link: "/reports/ageing",
      entityType: "vehicle",
      entityId: null,
      meta: null,
      hoursAgo: 20,
    },
    {
      userId: owner.id,
      branchId: null,
      type: "vehicle.sold",
      category: "booking",
      priority: "medium",
      title: "STK-0021 sold",
      body: "2021 Hyundai Verna SX (O) Turbo DCT to Jaspreet Sidhu",
      link: "/sales",
      entityType: "sale",
      entityId: null,
      meta: null,
      hoursAgo: 26,
    },
    {
      userId: owner.id,
      branchId: null,
      type: "followup.summary",
      category: "followup",
      priority: "high",
      title: "Your day: 4 follow-ups due, 3 overdue",
      body: "Clear the overdue ones first — they are the deals most likely to slip.",
      link: "/followups",
      entityType: null,
      entityId: null,
      meta: null,
      hoursAgo: 4,
    },
  ];

  for (const n of seedNotifications) {
    const { hoursAgo, ...rest } = n;
    await db.notification.create({
      data: {
        dealerId: dealer.id,
        ...rest,
        isRead: hoursAgo > 24,
        readAt: hoursAgo > 24 ? new Date(Date.now() - hoursAgo * 3600 * 1000) : null,
        createdAt: new Date(Date.now() - hoursAgo * 3600 * 1000),
        expiresAt: daysAhead(90),
      },
    });
  }

  /* --------------------------- AUDIT LOG ------------------------- */
  await db.auditLog.createMany({
    data: [
      { dealerId: dealer.id, userId: owner.id, action: "login", entity: "user", summary: "Rajesh Sharma signed in", createdAt: daysAgo(0) },
      { dealerId: dealer.id, userId: inventoryMgr.id, action: "create", entity: "vehicle", summary: "Added STK-0017 Hyundai Venue SX (O) Turbo DCT", createdAt: daysAgo(4) },
      { dealerId: dealer.id, userId: leadMgr.id, action: "assign", entity: "lead", summary: "Assigned LD-0003 to Arjun Mehta", createdAt: daysAgo(9) },
      { dealerId: dealer.id, userId: anita.id, action: "status_change", entity: "vehicle", summary: "STK-0014 available → booked", createdAt: daysAgo(3) },
    ],
  });

  /* ---------------------- APPLY A COUPON ------------------------- */
  await db.couponRedemption.create({
    data: {
      couponId: launchCoupon.id,
      dealerId: dealer.id,
      planId: professional.id,
      originalPrice: professional.priceMonthly,
      discountAmount: Math.round(professional.priceMonthly * 0.5),
      finalPrice: professional.priceMonthly - Math.round(professional.priceMonthly * 0.5),
      startsAt: daysAgo(20),
      expiresAt: daysAhead(70),
      createdAt: daysAgo(20),
    },
  });
  await db.coupon.update({
    where: { id: launchCoupon.id },
    data: { redemptionCount: { increment: 1 } },
  });

  /* ------------------- A SECOND DEALER (isolation) --------------- */
  console.log("Seeding a second tenant to prove isolation…");
  const dealer2 = await db.dealer.create({
    data: {
      slug: "kohli-motors",
      name: "Kohli Motors",
      tagline: "Premium pre-owned, Jalandhar",
      about: "A boutique pre-owned showroom specialising in premium German cars.",
      city: "Jalandhar", state: "Punjab", phone: "9814500011", whatsapp: "9814500011",
      email: "hello@kohlimotors.in", status: "trial",
      coverUrl: img("photo-1503376780353-7e6692767b70", 1920),
    },
  });
  await db.subscription.create({
    data: {
      dealerId: dealer2.id,
      planId: starter.id,
      status: "trial",
      billingCycle: "yearly",
      trialEndsAt: daysAhead(9),
    },
  });
  const d2Roles: Record<string, string> = {};
  for (const t of ROLE_TEMPLATES) {
    const r = await db.role.create({
      data: {
        dealerId: dealer2.id, key: t.key, name: t.name, description: t.description, isSystem: true,
        permissions: JSON.stringify(t.key === "dealer_owner" ? ALL_PERMISSIONS : t.permissions),
      },
    });
    d2Roles[t.key] = r.id;
  }
  const d2Branch = await db.branch.create({
    data: { dealerId: dealer2.id, code: "JAL", name: "Jalandhar Showroom", city: "Jalandhar", state: "Punjab", phone: "9814500011" },
  });
  await db.user.create({
    data: {
      dealerId: dealer2.id, roleId: d2Roles.dealer_owner, name: "Amit Kohli",
      email: "owner@kohlimotors.in", phone: "9814500011", designation: "Proprietor", passwordHash: password,
    },
  });
  const d2Cars = [
    { make: "BMW", model: "3 Series", variant: "330i M Sport", year: 2021, price: 4250000, km: 28000, body: "Sedan", fuel: "Petrol", tx: "Automatic", photo: 1 },
    { make: "Mercedes-Benz", model: "GLA", variant: "200 AMG Line", year: 2022, price: 4890000, km: 19000, body: "SUV", fuel: "Petrol", tx: "Automatic", photo: 4 },
    { make: "Audi", model: "Q3", variant: "40 TFSI Technology", year: 2022, price: 4650000, km: 22500, body: "SUV", fuel: "Petrol", tx: "Automatic", photo: 7 },
  ];
  for (let i = 0; i < d2Cars.length; i++) {
    const c = d2Cars[i];
    const v = await db.vehicle.create({
      data: {
        dealerId: dealer2.id, branchId: d2Branch.id, stockId: `KM-${String(i + 1).padStart(4, "0")}`,
        make: c.make, model: c.model, variant: c.variant, year: c.year, registrationYear: c.year,
        fuelType: c.fuel, transmission: c.tx, bodyType: c.body, colour: "Black", ownership: 1,
        kmDriven: c.km, sellingPrice: c.price, purchasePrice: Math.round(c.price * 0.88),
        conditionRating: 4.7, features: JSON.stringify(F_TOP),
        description: `${c.year} ${c.make} ${c.model} — fully loaded, service history with the authorised dealer.`,
        status: "available", isFeatured: i === 0, listedAt: daysAgo(10 + i * 5), createdAt: daysAgo(10 + i * 5),
      },
    });
    for (let j = 0; j < 3; j++) {
      await db.vehicleImage.create({
        data: { vehicleId: v.id, url: img(pick(PHOTOS, c.photo + j)), kind: "photo", sortOrder: j, isCover: j === 0 },
      });
    }
  }

  /* ---------------------------- SUMMARY -------------------------- */
  const counts = {
    dealers: await db.dealer.count(),
    branches: await db.branch.count(),
    users: await db.user.count(),
    vehicles: await db.vehicle.count(),
    leads: await db.lead.count(),
    customers: await db.customer.count(),
    sales: await db.sale.count(),
    coupons: await db.coupon.count(),
  };

  console.log("\nSeed complete:", counts);
  console.log("\nSign in with:");
  console.log("  Dealer Owner      owner@sharmaautowheels.in / password123");
  console.log("  Branch Manager    vikram@sharmaautowheels.in / password123");
  console.log("  Sales Executive   priya@sharmaautowheels.in / password123");
  console.log("  Inventory Manager harpreet@sharmaautowheels.in / password123");
  console.log("  Lead Manager      neha@sharmaautowheels.in / password123");
  console.log("  View Only         ravi@sharmaautowheels.in / password123");
  console.log("  Super Admin       admin@carvyapar.in / password123");
  console.log("\nPublic showroom: http://localhost:3000/d/sharma-auto\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
