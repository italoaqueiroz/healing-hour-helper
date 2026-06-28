// supabase/functions/notify-appointment/index.ts
// Envia e-mail automático ao(s) terapeuta(s) quando um novo agendamento é criado.
// Usa o Resend (LOVABLE_API_KEY) com remetente padrão da Lovable até o domínio
// fiodeariana.pt ser verificado. Não bloqueia a criação caso falhe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY =
  Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
const FROM_EMAIL =
  Deno.env.get("EMAIL_FROM") ?? "Fio de Ariana <onboarding@resend.dev>";

function firstName(full: string | null | undefined, fallback: string) {
  const n = (full || "").trim();
  if (!n) return fallback;
  return n.split(" ")[0];
}

function fmtPT(d: Date) {
  return d.toLocaleString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
}

const EVENT_LABEL: Record<string, string> = {
  session: "Sessão terapêutica",
  meeting: "Reunião",
  online: "Consulta online",
  block: "Bloqueio de horário",
  vacation: "Férias",
  other: "Evento",
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) {
    console.warn("[notify-appointment] sem RESEND_API_KEY — pulando envio");
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[notify-appointment] resend erro", res.status, t);
    return { ok: false, error: t };
  }
  return { ok: true };
}

function buildBody(opts: {
  therapistName: string;
  isCo: boolean;
  appt: any;
  room: string;
  coName: string | null;
}) {
  const { therapistName, isCo, appt, room, coName } = opts;
  const starts = fmtPT(new Date(appt.starts_at));
  const ends = new Date(appt.ends_at).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  const typeLabel = EVENT_LABEL[appt.event_type] || "Evento";
  const who =
    appt.event_type === "session"
      ? `<strong>Paciente:</strong> ${appt.patient_name ?? "—"}`
      : `<strong>Título:</strong> ${appt.title ?? typeLabel}`;
  const coLine = coName
    ? `<p><strong>Co-terapeuta:</strong> ${coName}</p>`
    : "";

  return `
  <div style="font-family:Inter,Arial,sans-serif;color:#2a1a1d;max-width:560px;margin:0 auto;padding:24px;background:#fdf8f3;border-radius:12px">
    <h2 style="font-family:Georgia,serif;color:#5b1a25;margin:0 0 8px">Olá, ${therapistName} 👋</h2>
    <p style="margin:0 0 16px">
      ${isCo
        ? "Foi adicionado/a como <strong>co-terapeuta</strong> a um novo evento na agenda:"
        : "Foi marcado/a um novo evento na sua agenda:"}
    </p>

    <div style="background:#fff;border-left:4px solid #5b1a25;border-radius:8px;padding:14px 16px;margin:12px 0">
      <p style="margin:0 0 4px"><strong>Tipo:</strong> ${typeLabel}</p>
      <p style="margin:0 0 4px">${who}</p>
      <p style="margin:0 0 4px"><strong>Sala:</strong> ${room}</p>
      <p style="margin:0 0 4px"><strong>Quando:</strong> ${starts} — ${ends}</p>
      ${coLine}
      ${appt.notes ? `<p style="margin:8px 0 0"><em>${appt.notes}</em></p>` : ""}
    </div>

    <p style="margin:16px 0 4px">Pode consultar e gerir a agenda em
      <a href="https://agenda.fiodeariana.pt" style="color:#5b1a25">agenda.fiodeariana.pt</a>.
    </p>

    <hr style="border:none;border-top:1px solid #e7d9c8;margin:20px 0" />
    <p style="font-size:12px;color:#8a7568;margin:0">
      ✦ Esta é uma <strong>mensagem automática</strong> enviada pela plataforma O Fio de Ariana.
      Não responda a este e-mail.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { appointmentIds } = await req.json();
    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return new Response(JSON.stringify({ error: "appointmentIds vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: appts, error } = await admin
      .from("appointments")
      .select(
        "id, therapist_id, co_therapist_id, room_id, patient_name, title, event_type, starts_at, ends_at, notes, rooms(name)",
      )
      .in("id", appointmentIds);
    if (error) throw error;
    if (!appts?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });

    const ids = new Set<string>();
    appts.forEach((a: any) => {
      if (a.therapist_id) ids.add(a.therapist_id);
      if (a.co_therapist_id) ids.add(a.co_therapist_id);
    });

    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(ids));
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));

    // Para evitar inundar quem agenda 20 sessões recorrentes, enviamos
    // um e-mail por destinatário com a primeira ocorrência + total.
    const first = appts[0] as any;
    const room = first.rooms?.name ?? "Sala";
    const totalExtra = appts.length - 1;

    const recipients: Array<{ id: string; isCo: boolean }> = [];
    if (first.therapist_id) recipients.push({ id: first.therapist_id, isCo: false });
    if (first.co_therapist_id) recipients.push({ id: first.co_therapist_id, isCo: true });

    let sent = 0;
    for (const r of recipients) {
      const p: any = byId.get(r.id);
      if (!p?.email) continue;
      const name = firstName(p.full_name, "Terapeuta");
      const coName = first.co_therapist_id
        ? (byId.get(first.co_therapist_id) as any)?.full_name ?? null
        : null;
      let html = buildBody({
        therapistName: name,
        isCo: r.isCo,
        appt: first,
        room,
        coName: r.isCo ? null : coName,
      });
      if (totalExtra > 0) {
        html = html.replace(
          "</div>\n\n    <p style=\"margin:16px 0 4px\"",
          `<p style="margin:8px 0 0;color:#5b1a25"><strong>+ ${totalExtra} ocorrência(s) recorrente(s)</strong> agendada(s) na mesma série.</p></div>\n\n    <p style="margin:16px 0 4px"`,
        );
      }
      const subj =
        first.event_type === "session"
          ? `Nova sessão: ${first.patient_name ?? "paciente"} — ${fmtPT(new Date(first.starts_at))}`
          : `Novo evento: ${first.title ?? EVENT_LABEL[first.event_type]}`;
      const res = await sendEmail(p.email, subj, html);
      if ((res as any).ok) sent++;
    }

    return new Response(JSON.stringify({ sent, total: appts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-appointment]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
