"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDealerUser, hashPassword } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { TEMPLATES, isTemplateKey } from "@/lib/templates";
import { assertWithinLimit, PlanLimitError } from "@/lib/plan";
import { audit, notify, notifyRecipients } from "@/server/events";
import { normalisePhone, slugify } from "@/lib/utils";

export type OrgActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

/* ------------------------------ BRANCHES ------------------------------ */

const branchSchema = z.object({
  name: z.string().trim().min(2, "Branch name is required"),
  code: z.string().trim().min(2, "Branch code is required").max(8, "Keep the code short"),
  addressLine: z.string().trim().optional(),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  openingHours: z.string().trim().optional(),
  mapsUrl: z.string().trim().optional(),
  managerId: z.string().optional(),
  isActive: z.string().optional(),
});

export async function createBranch(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.BRANCHES_MANAGE);

  const parsed = branchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  try {
    await assertWithinLimit(user.dealerId, "branches");
  } catch (e) {
    if (e instanceof PlanLimitError) return { status: "error", message: e.message };
    throw e;
  }

  const code = parsed.data.code.toUpperCase();
  const exists = await db.branch.findFirst({ where: { dealerId: user.dealerId, code } });
  if (exists) {
    return {
      status: "error",
      message: `Branch code ${code} is already in use.`,
      fieldErrors: { code: "Already used" },
    };
  }

  const count = await db.branch.count({ where: { dealerId: user.dealerId } });
  const branch = await db.branch.create({
    data: {
      dealerId: user.dealerId,
      name: parsed.data.name,
      code,
      addressLine: parsed.data.addressLine || null,
      city: parsed.data.city,
      state: parsed.data.state || null,
      pincode: parsed.data.pincode || null,
      phone: parsed.data.phone ? normalisePhone(parsed.data.phone) : null,
      whatsapp: parsed.data.whatsapp ? normalisePhone(parsed.data.whatsapp) : null,
      email: parsed.data.email || null,
      openingHours: parsed.data.openingHours || null,
      mapsUrl: parsed.data.mapsUrl || null,
      managerId: parsed.data.managerId || null,
      isActive: parsed.data.isActive !== "off",
      sortOrder: count + 1,
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "branch",
    entityId: branch.id,
    summary: `Created branch ${branch.name} (${branch.code})`,
  });

  revalidatePath("/branches");
  redirect("/branches?created=1");
}

export async function updateBranch(
  branchId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.BRANCHES_MANAGE);

  const branch = await db.branch.findFirst({ where: { id: branchId, dealerId: user.dealerId } });
  if (!branch) return { status: "error", message: "Branch not found" };

  const parsed = branchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  await db.branch.update({
    where: { id: branchId },
    data: {
      name: parsed.data.name,
      code: parsed.data.code.toUpperCase(),
      addressLine: parsed.data.addressLine || null,
      city: parsed.data.city,
      state: parsed.data.state || null,
      pincode: parsed.data.pincode || null,
      phone: parsed.data.phone ? normalisePhone(parsed.data.phone) : null,
      whatsapp: parsed.data.whatsapp ? normalisePhone(parsed.data.whatsapp) : null,
      email: parsed.data.email || null,
      openingHours: parsed.data.openingHours || null,
      mapsUrl: parsed.data.mapsUrl || null,
      managerId: parsed.data.managerId || null,
      isActive: parsed.data.isActive === "on",
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "branch",
    entityId: branchId,
    summary: `Updated branch ${parsed.data.name}`,
  });

  revalidatePath("/branches");
  redirect("/branches?updated=1");
}

export async function toggleBranchActive(branchId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.BRANCHES_MANAGE);

  const branch = await db.branch.findFirst({ where: { id: branchId, dealerId: user.dealerId } });
  if (!branch) return { status: "error" as const, message: "Branch not found" };

  await db.branch.update({ where: { id: branchId }, data: { isActive: !branch.isActive } });
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "branch",
    entityId: branchId,
    summary: `${branch.name} ${branch.isActive ? "deactivated" : "activated"}`,
  });

  revalidatePath("/branches");
  return {
    status: "success" as const,
    message: branch.isActive
      ? "Branch deactivated — its stock is hidden from your website."
      : "Branch activated.",
  };
}

/* -------------------------------- STAFF ------------------------------- */

const staffSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  roleId: z.string().min(1, "Choose a role"),
  password: z.string().optional(),
  isActive: z.string().optional(),
});

export async function createStaff(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.STAFF_MANAGE);

  const parsed = staffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  try {
    await assertWithinLimit(user.dealerId, "users");
  } catch (e) {
    if (e instanceof PlanLimitError) return { status: "error", message: e.message };
    throw e;
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return {
      status: "error",
      message: "That email address is already registered.",
      fieldErrors: { email: "Already in use" },
    };
  }

  const role = await db.role.findFirst({
    where: { id: parsed.data.roleId, dealerId: user.dealerId },
  });
  if (!role) return { status: "error", message: "That role does not belong to your dealership." };

  const password = parsed.data.password?.trim() || "password123";
  const branchIds = formData.getAll("branchIds").map(String).filter(Boolean);

  const staff = await db.user.create({
    data: {
      dealerId: user.dealerId,
      roleId: role.id,
      name: parsed.data.name,
      email,
      phone: parsed.data.phone ? normalisePhone(parsed.data.phone) : null,
      whatsapp: parsed.data.phone ? normalisePhone(parsed.data.phone) : null,
      designation: parsed.data.designation || null,
      passwordHash: await hashPassword(password),
      isActive: parsed.data.isActive !== "off",
      branches: { create: branchIds.map((branchId) => ({ branchId })) },
    },
  });

  // Access changes are a security matter: only people who manage staff hear it.
  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.STAFF_MANAGE],
      excludeUserIds: [user.id],
    },
    {
      type: "staff.added",
      title: `${staff.name} was added to the team`,
      body: `${role.name}${branchIds.length ? ` · ${branchIds.length} branch(es)` : " · all branches"}`,
      link: "/staff",
      actorId: user.id,
      entityType: "user",
      entityId: staff.id,
    },
  );

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "user",
    entityId: staff.id,
    summary: `Added staff member ${staff.name} as ${role.name}`,
  });

  revalidatePath("/staff");
  redirect("/staff?created=1");
}

export async function updateStaff(
  staffId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.STAFF_MANAGE);

  const staff = await db.user.findFirst({ where: { id: staffId, dealerId: user.dealerId } });
  if (!staff) return { status: "error", message: "Staff member not found" };

  const parsed = staffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fieldErrors };
  }

  const branchIds = formData.getAll("branchIds").map(String).filter(Boolean);

  await db.$transaction([
    db.userBranch.deleteMany({ where: { userId: staffId } }),
    db.user.update({
      where: { id: staffId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone ? normalisePhone(parsed.data.phone) : null,
        designation: parsed.data.designation || null,
        roleId: parsed.data.roleId,
        isActive: parsed.data.isActive === "on",
        ...(parsed.data.password?.trim()
          ? { passwordHash: await hashPassword(parsed.data.password.trim()) }
          : {}),
        branches: { create: branchIds.map((branchId) => ({ branchId })) },
      },
    }),
  ]);

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "user",
    entityId: staffId,
    summary: `Updated staff member ${parsed.data.name}`,
  });

  if (staff.roleId !== parsed.data.roleId) {
    const newRole = await db.role.findFirst({
      where: { id: parsed.data.roleId, dealerId: user.dealerId },
      select: { name: true },
    });
    await notifyRecipients(
      {
        dealerId: user.dealerId,
        permissions: [PERMISSIONS.STAFF_MANAGE],
        includeUserIds: [staffId],
        excludeUserIds: [user.id],
      },
      {
        type: "staff.role_changed",
        // Deliberately says what changed, never what the credentials are.
        title: `${parsed.data.name} is now ${newRole?.name ?? "on a new role"}`,
        body: `Changed by ${user.name}.`,
        link: "/staff",
        actorId: user.id,
        entityType: "user",
        entityId: staffId,
      },
    );
  }

  revalidatePath("/staff");
  redirect("/staff?updated=1");
}

export async function toggleStaffActive(staffId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.STAFF_MANAGE);

  if (staffId === user.id) {
    return { status: "error" as const, message: "You cannot deactivate your own account." };
  }

  const staff = await db.user.findFirst({ where: { id: staffId, dealerId: user.dealerId } });
  if (!staff) return { status: "error" as const, message: "Staff member not found" };

  await db.user.update({ where: { id: staffId }, data: { isActive: !staff.isActive } });
  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "user",
    entityId: staffId,
    summary: `${staff.name} ${staff.isActive ? "deactivated" : "reactivated"}`,
  });

  await notifyRecipients(
    {
      dealerId: user.dealerId,
      permissions: [PERMISSIONS.STAFF_MANAGE],
      excludeUserIds: [user.id],
    },
    {
      type: "staff.removed",
      title: staff.isActive
        ? `${staff.name}'s access was removed`
        : `${staff.name}'s access was restored`,
      body: `Changed by ${user.name}.`,
      link: "/staff",
      actorId: user.id,
      entityType: "user",
      entityId: staffId,
    },
  );

  revalidatePath("/staff");
  return {
    status: "success" as const,
    message: staff.isActive ? `${staff.name} can no longer sign in.` : `${staff.name} can sign in again.`,
  };
}

/* -------------------------------- ROLES ------------------------------- */

export async function saveRole(input: {
  roleId?: string;
  name: string;
  description?: string;
  permissions: string[];
}) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.ROLES_MANAGE);

  const permissions = input.permissions.filter((p) =>
    ALL_PERMISSIONS.includes(p as PermissionKey),
  );

  if (input.roleId) {
    const role = await db.role.findFirst({
      where: { id: input.roleId, dealerId: user.dealerId },
    });
    if (!role) return { status: "error" as const, message: "Role not found" };

    // The owner role must keep full access or an account could lock itself out.
    if (role.key === "dealer_owner") {
      return {
        status: "error" as const,
        message: "The Dealer Owner role always keeps full access and cannot be restricted.",
      };
    }

    await db.role.update({
      where: { id: input.roleId },
      data: {
        name: input.name,
        description: input.description ?? role.description,
        permissions: JSON.stringify(permissions),
      },
    });

    await audit({
      dealerId: user.dealerId,
      userId: user.id,
      action: "update",
      entity: "role",
      entityId: role.id,
      summary: `Updated role ${input.name} (${permissions.length} permissions)`,
    });

    await notifyRecipients(
      {
        dealerId: user.dealerId,
        permissions: [PERMISSIONS.ROLES_MANAGE],
        excludeUserIds: [user.id],
      },
      {
        type: "staff.role_changed",
        title: `Permissions changed for the ${input.name} role`,
        body: `${permissions.length} permission${permissions.length === 1 ? "" : "s"} now granted. Changed by ${user.name}.`,
        link: "/roles",
        actorId: user.id,
        entityType: "role",
        entityId: role.id,
      },
    );

    revalidatePath("/roles");
    return { status: "success" as const, message: "Role updated" };
  }

  const key = slugify(input.name).replace(/-/g, "_") || `custom_${Date.now()}`;
  const exists = await db.role.findFirst({ where: { dealerId: user.dealerId, key } });
  if (exists) return { status: "error" as const, message: "A role with that name already exists." };

  const role = await db.role.create({
    data: {
      dealerId: user.dealerId,
      key,
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      permissions: JSON.stringify(permissions),
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "create",
    entity: "role",
    entityId: role.id,
    summary: `Created role ${input.name}`,
  });

  revalidatePath("/roles");
  return { status: "success" as const, message: "Role created" };
}

export async function deleteRole(roleId: string) {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.ROLES_MANAGE);

  const role = await db.role.findFirst({
    where: { id: roleId, dealerId: user.dealerId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return { status: "error" as const, message: "Role not found" };
  if (role.isSystem) {
    return { status: "error" as const, message: "Built-in roles cannot be deleted, only edited." };
  }
  if (role._count.users > 0) {
    return {
      status: "error" as const,
      message: `${role._count.users} staff member(s) still use this role. Move them first.`,
    };
  }

  await db.role.delete({ where: { id: roleId } });
  revalidatePath("/roles");
  return { status: "success" as const, message: "Role deleted" };
}

/* ------------------------------ SETTINGS ------------------------------ */

export async function updateDealerSettings(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.SETTINGS_MANAGE);

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const workingHours = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  ].map((day) => ({
    day,
    open: String(formData.get(`open_${day}`) ?? "09:30"),
    close: String(formData.get(`close_${day}`) ?? "19:30"),
    closed: formData.get(`closed_${day}`) === "on",
  }));

  await db.dealer.update({
    where: { id: user.dealerId },
    data: {
      name: get("name") ?? user.dealerName ?? "Dealership",
      legalName: get("legalName"),
      tagline: get("tagline"),
      about: get("about"),
      contactPerson: get("contactPerson"),
      phone: get("phone"),
      whatsapp: get("whatsapp"),
      email: get("email"),
      website: get("website"),
      addressLine: get("addressLine"),
      city: get("city"),
      state: get("state"),
      pincode: get("pincode"),
      mapsUrl: get("mapsUrl"),
      gstin: get("gstin"),
      panNumber: get("panNumber"),
      facebookUrl: get("facebookUrl"),
      instagramUrl: get("instagramUrl"),
      youtubeUrl: get("youtubeUrl"),
      linkedinUrl: get("linkedinUrl"),
      logoUrl: get("logoUrl"),
      coverUrl: get("coverUrl"),
      workingHours: JSON.stringify(workingHours),
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "dealer",
    entityId: user.dealerId,
    summary: "Updated dealership settings",
  });

  revalidatePath("/settings");
  revalidatePath(`/d/${user.dealerSlug}`);
  return { status: "success", message: "Settings saved" };
}

export async function updateWebsiteSettings(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireDealerUser();
  assertCan(user, PERMISSIONS.WEBSITE_MANAGE);

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const whyChooseUs = [0, 1, 2, 3]
    .map((i) => ({
      icon: String(formData.get(`why_icon_${i}`) ?? "shield"),
      title: String(formData.get(`why_title_${i}`) ?? "").trim(),
      body: String(formData.get(`why_body_${i}`) ?? "").trim(),
    }))
    .filter((w) => w.title);

  // Only a key from the catalogue is ever stored, so a crafted form value
  // cannot leave the showroom trying to render a template that does not exist.
  const submittedTemplate = String(formData.get("template") ?? "");
  const template = isTemplateKey(submittedTemplate) ? submittedTemplate : "momentum";

  // A blank accent means "use whatever the template ships with".
  const accent = get("themeAccent");
  const themeAccent =
    accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : TEMPLATES[template].defaultAccent;

  await db.websiteSettings.upsert({
    where: { dealerId: user.dealerId },
    create: {
      dealerId: user.dealerId,
      heroHeadline: get("heroHeadline"),
      heroSubheadline: get("heroSubheadline"),
      heroImageUrl: get("heroImageUrl"),
      metaTitle: get("metaTitle"),
      metaDescription: get("metaDescription"),
      showFinance: formData.get("showFinance") === "on",
      showSellYourCar: formData.get("showSellYourCar") === "on",
      showTestimonials: formData.get("showTestimonials") === "on",
      isPublished: formData.get("isPublished") === "on",
      whyChooseUs: JSON.stringify(whyChooseUs),
      template,
      themeAccent,
    },
    update: {
      heroHeadline: get("heroHeadline"),
      heroSubheadline: get("heroSubheadline"),
      heroImageUrl: get("heroImageUrl"),
      metaTitle: get("metaTitle"),
      metaDescription: get("metaDescription"),
      showFinance: formData.get("showFinance") === "on",
      showSellYourCar: formData.get("showSellYourCar") === "on",
      showTestimonials: formData.get("showTestimonials") === "on",
      isPublished: formData.get("isPublished") === "on",
      whyChooseUs: JSON.stringify(whyChooseUs),
      template,
      themeAccent,
    },
  });

  await audit({
    dealerId: user.dealerId,
    userId: user.id,
    action: "update",
    entity: "website",
    entityId: user.dealerId,
    summary: `Updated the public website (template: ${template})`,
  });

  revalidatePath("/website");
  // "layout", not the default: the template is applied in the showroom layout,
  // so revalidating only the page would leave every sub-page on the old design.
  revalidatePath(`/d/${user.dealerSlug}`, "layout");
  return { status: "success", message: "Website updated" };
}
