import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type TeamMember = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_pi: boolean;
  approved: boolean;
};

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersRes, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) throw new Error(usersErr.message);

    const { data: rolesRes } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const adminSet = new Set(
      (rolesRes || []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id),
    );
    const piSet = new Set(
      (rolesRes || []).filter((r: any) => r.role === "pro_infancia").map((r: any) => r.user_id),
    );

    const { data: profilesRes } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, approved");
    const nameById = new Map((profilesRes || []).map((p: any) => [p.id, p.full_name]));
    const approvedById = new Map((profilesRes || []).map((p: any) => [p.id, p.approved]));

    return usersRes.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      full_name:
        (nameById.get(u.id) as string) ||
        (u.user_metadata?.full_name as string) ||
        (u.user_metadata?.name as string) ||
        null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_admin: adminSet.has(u.id),
      is_pi: piSet.has(u.id),
      approved: approvedById.get(u.id) === true,
    }));
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);
      if (data.userId === context.userId) {
        return { ok: false, error: "Não podes eliminar-te a ti próprio." };
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (error) return { ok: false, error: error.message };
      return { ok: true, error: null };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Não foi possível remover o acesso.",
      };
    }
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; makeAdmin: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.makeAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) throw new Error("Não podes remover o teu próprio admin.");
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setPiRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; enable: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enable) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "pro_infancia" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "pro_infancia");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { email: string; fullName?: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: "https://agenda.fiodeariana.pt/auth?invite=1",
        data: { full_name: data.fullName ?? null },
      });
      if (error) return { ok: false, error: error.message };
      if (invited.user) {
        const { error: approvalError } = await supabaseAdmin
          .from("profiles")
          .update({
            approved: true,
            approved_at: new Date().toISOString(),
            approved_by: context.userId,
          })
          .eq("id", invited.user.id);
        if (approvalError) return { ok: false, error: approvalError.message };
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: invited.user.id, role: "therapist" }, { onConflict: "user_id,role" });
        if (roleError) return { ok: false, error: roleError.message };
      }
      return { ok: true, error: null };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Não foi possível enviar o convite.",
      };
    }
  });

export const setTeamMemberApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; approved: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.approved) {
      throw new Error("Não podes remover a tua própria aprovação.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        approved: data.approved,
        approved_at: data.approved ? new Date().toISOString() : null,
        approved_by: data.approved ? context.userId : null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    if (data.approved) {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
      if (!roles?.length) {
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: data.userId, role: "therapist" });
        if (roleError) throw new Error(roleError.message);
      }
    }
    return { ok: true };
  });

export const updateTeamMemberName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; fullName: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const name = data.fullName.trim();
    if (!name) throw new Error("Nome obrigatório");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: name })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: { full_name: name },
    });
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
