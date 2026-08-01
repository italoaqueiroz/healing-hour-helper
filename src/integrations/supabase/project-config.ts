// Fonte de verdade pública do projeto backend atual.
// Usada para evitar que variáveis de ambiente do host (ex.: Vercel) apontem
// para um projeto Supabase antigo/inválido. Apenas valores públicos (anon).
export const PROJECT_REF = 'mowptnlvgmyqcfcgtwie';

export const PROJECT_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

export const PROJECT_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vd3B0bmx2Z215cWNmY2d0d2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODk2ODQsImV4cCI6MjA5ODA2NTY4NH0.MVXUJnpNalpGcTOrjqdH4iVY4yEBbus4gcLaT7tSonE';

/** Aceita o URL do ambiente apenas se corresponder ao projeto atual. */
export function resolveSupabaseUrl(candidate?: string | null): string {
  if (candidate && candidate.includes(PROJECT_REF)) return candidate;
  return PROJECT_SUPABASE_URL;
}

/** Aceita a publishable/anon key do ambiente apenas se for do projeto atual. */
export function resolveSupabasePublishableKey(candidate?: string | null): string {
  if (!candidate) return PROJECT_SUPABASE_PUBLISHABLE_KEY;
  if (candidate.startsWith('sb_publishable_')) return candidate;
  try {
    const payload = JSON.parse(atob(candidate.split('.')[1] ?? ''));
    if (payload?.ref === PROJECT_REF) return candidate;
  } catch {
    // chave não legível: usa a do projeto atual
  }
  return PROJECT_SUPABASE_PUBLISHABLE_KEY;
}
