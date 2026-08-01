import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VAPID_PUBLIC_KEY =
  "BI0MZj97iGBmVM0rHDxM5QpGFxNbYQcR-40sQxk2XzQLjuc4iMXAQEOFyU2AkiCQVjMbEZq3oGCUlBQtiG1kMFw";

type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

function validateSubscription(data: PushSubscriptionInput) {
  let endpoint: URL;
  try {
    endpoint = new URL(data.endpoint);
  } catch {
    throw new Error("Subscrição de notificações inválida.");
  }
  if (endpoint.protocol !== "https:" || !data.p256dh || !data.auth) {
    throw new Error("Subscrição de notificações inválida.");
  }
  if (data.endpoint.length > 2048 || data.p256dh.length > 512 || data.auth.length > 512) {
    throw new Error("Subscrição de notificações demasiado longa.");
  }
}

export const registerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PushSubscriptionInput) => input)
  .handler(async ({ data, context }) => {
    validateSubscription(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent?.slice(0, 500) || null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendCheckInPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { appointmentId: string }) => input)
  .handler(async ({ data, context }) => {
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!privateKey) throw new Error("Serviço de notificações não configurado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, therapist_id, co_therapist_id, additional_therapist_ids, check_in_at, check_in_by",
      )
      .eq("id", data.appointmentId)
      .single();
    if (appointmentError || !appointment) throw new Error("Sessão não encontrada.");
    if (appointment.check_in_by !== context.userId || !appointment.check_in_at) {
      throw new Error("Check-in inválido.");
    }
    if (Date.now() - new Date(appointment.check_in_at).getTime() > 5 * 60 * 1000) {
      throw new Error("Check-in expirado.");
    }

    const recipientIds = Array.from(
      new Set(
        [
          appointment.therapist_id,
          appointment.co_therapist_id,
          ...(appointment.additional_therapist_ids || []),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    if (!recipientIds.length) return { sent: 0 };

    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", recipientIds);
    if (subscriptionsError) throw new Error(subscriptionsError.message);
    if (!subscriptions?.length) return { sent: 0 };

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails("https://agenda.fiodeariana.pt", VAPID_PUBLIC_KEY, privateKey);

    const payload = JSON.stringify({
      title: "Paciente chegou",
      body: "Seu paciente fez check-in na receção e aguarda atendimento.",
      url: "/agenda",
      tag: `check-in-${appointment.id}`,
    });

    let sent = 0;
    const expiredIds: string[] = [];
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 300, urgency: "high" },
          );
          sent += 1;
        } catch (error) {
          const statusCode =
            error && typeof error === "object" && "statusCode" in error
              ? Number(error.statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
          else console.error("[push] Falha ao enviar notificação", statusCode || error);
        }
      }),
    );

    if (expiredIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
    }
    return { sent };
  });
