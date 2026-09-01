"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession, destroySession } from "@/lib/auth";
import { audit } from "@/server/events";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check your details",
      email: String(formData.get("email") ?? ""),
    };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "Those credentials do not match our records.", email: parsed.data.email };
  }

  await createSession(user.id);

  if (user.dealerId) {
    await audit({
      dealerId: user.dealerId,
      userId: user.id,
      action: "login",
      entity: "user",
      entityId: user.id,
      summary: `${user.name} signed in`,
    });
  }

  redirect(user.isSuperAdmin ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
