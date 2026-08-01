import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
const FROM_EMAIL = Deno.env.get("EMAIL_FROM") ?? "O Fio de Ariana <onboarding@resend.dev>";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function statusCode(status: string) {
  if (status === "present") return "P";
  if (status === "absent_therapist") return "FT";
  if (status === "absent" || status === "absent_unjustified") return "FI";
  if (status === "absent_justified") return "FJ";
  if (status === "cancelled") return "C";
  if (status === "rescheduled") return "R";
  return "-";
}

function previousMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
    if (!RESEND_KEY) return Response.json({ error: "RESEND_API_KEY ausente" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const now = new Date();
    if (!force && now.getUTCDate() !== 1) return Response.json({ skipped: "not_day_one" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { start, end, key } = previousMonth(now);
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name, email, approved")
      .eq("approved", true)
      .not("email", "is", null);
    if (profilesError) throw profilesError;

    const { data: appointments, error: appointmentsError } = await admin
      .from("appointments")
      .select("id, therapist_id, co_therapist_id, additional_therapist_ids, patient_name, event_type, starts_at, ends_at, attendance_status")
      .in("event_type", ["session", "online"])
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at");
    if (appointmentsError) throw appointmentsError;

    let sent = 0;
    for (const profile of profiles ?? []) {
      if (!profile.email) continue;
      const rows = (appointments ?? []).filter((appointment) =>
        appointment.therapist_id === profile.id ||
        appointment.co_therapist_id === profile.id ||
        (appointment.additional_therapist_ids ?? []).includes(profile.id)
      );
      if (rows.length === 0) continue;

      const { data: existing } = await admin
        .from("monthly_report_deliveries")
        .select("id")
        .eq("therapist_id", profile.id)
        .eq("report_month", `${key}-01`)
        .maybeSingle();
      if (existing && !force) continue;

      const counts = { P: 0, FT: 0, FI: 0, FJ: 0, C: 0, R: 0 };
      for (const row of rows) {
        const code = statusCode(row.attendance_status) as keyof typeof counts;
        if (code in counts) counts[code]++;
      }

      const detailRows = rows.map((row) => {
        const date = new Date(row.starts_at).toLocaleString("pt-PT", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
          timeZone: "Europe/Lisbon",
        });
        return `<tr><td>${escapeHtml(date)}</td><td>${escapeHtml(row.patient_name)}</td><td>${row.event_type === "online" ? "Online" : "Presencial"}</td><td>${statusCode(row.attendance_status)}</td></tr>`;
      }).join("");

      const csv = [
        ["Data", "Paciente", "Modalidade", "Estado"].map(csvCell).join(","),
        ...rows.map((row) => [
          new Date(row.starts_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }),
          row.patient_name,
          row.event_type === "online" ? "Online" : "Presencial",
          statusCode(row.attendance_status),
        ].map(csvCell).join(",")),
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;color:#2a1a1d;max-width:720px;margin:auto">
          <h1 style="color:#8b2e2e">Relatório mensal · O Fio de Ariana</h1>
          <p>Olá, ${escapeHtml(profile.full_name || "Terapeuta")}.</p>
          <p>Segue o seu relatório individual de <strong>${key}</strong>.</p>
          <p><strong>Total:</strong> ${rows.length} · P: ${counts.P} · FT: ${counts.FT} · FI: ${counts.FI} · FJ: ${counts.FJ} · C: ${counts.C}</p>
          <table style="width:100%;border-collapse:collapse"><thead><tr><th>Data</th><th>Paciente</th><th>Modalidade</th><th>Estado</th></tr></thead><tbody>${detailRows}</tbody></table>
          <p><a href="https://agenda.fiodeariana.pt/relatorios">Abrir relatórios na Agenda</a></p>
        </div>`;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: profile.email,
          subject: `Relatório mensal O Fio de Ariana · ${key}`,
          html,
          attachments: [{ filename: `relatorio-${key}.csv`, content: btoa(unescape(encodeURIComponent(csv))) }],
        }),
      });
      if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);

      await admin.from("monthly_report_deliveries").upsert({
        therapist_id: profile.id,
        report_month: `${key}-01`,
        recipient_email: profile.email,
        sent_at: new Date().toISOString(),
      }, { onConflict: "therapist_id,report_month" });
      sent++;
    }

    return Response.json({ sent, month: key });
  } catch (error) {
    console.error("[monthly-therapist-reports]", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});
