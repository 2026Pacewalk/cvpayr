import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth";
import { resolvePlan } from "@/lib/plan";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

/**
 * Local disk upload. Files land in /public/uploads/<dealerId>/ so tenants stay
 * separated on disk as well as in the database. Swapping this route for S3 or
 * Cloudinary later touches nothing else in the app.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.dealerId) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const plan = await resolvePlan(session.dealerId);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "No files received" }, { status: 400 });
  }
  if (files.length > plan.limits.maxImagesPerVehicle) {
    return NextResponse.json(
      { error: `Your ${plan.planName} plan allows ${plan.limits.maxImagesPerVehicle} images per vehicle.` },
      { status: 400 },
    );
  }

  const dir = path.join(process.cwd(), "public", "uploads", session.dealerId);
  await mkdir(dir, { recursive: true });

  const urls: string[] = [];
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: only JPG, PNG, WebP and AVIF images are accepted.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name} is larger than 8 MB. Please compress it first.` },
        { status: 400 },
      );
    }

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const name = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), buffer);
    urls.push(`/uploads/${session.dealerId}/${name}`);
  }

  return NextResponse.json({ urls });
}
