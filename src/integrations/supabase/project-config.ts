// Fonte de verdade pública do projeto backend atual.
// Usada para evitar que variáveis de ambiente do host (ex.: Vercel) apontem
// para um projeto Supabase antigo/inválido. Apenas valores públicos (anon).
export const PROJECT_REF = 'rwiogtidrjqszjbboarc';

export const PROJECT_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

export const PROJECT_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3aW9ndGlkcmpxc3pqYmJvYXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjI1MzYsImV4cCI6MjA5OTY5ODUzNn0.CxAHQdG6QVNbSaXLwez56VlvkmKBLz3RZ_76UmubOSY';

/** Aceita o URL do ambiente apenas se corresponder ao projeto atual. */
export function resolveSupabaseUrl(candidate?: string | null): string {
  if (candidate && candidate.includes(PROJECT_REF)) return candidate;
  return PROJECT_SUPABASE_URL;
}

/** Aceita a publishable/anon key do ambiente apenas se for do projeto atual. */
export function resolveSupabasePublishableKey(candidate?: string | null): string {
  if (!candidate) return PROJECT_SUPABASE_PUBLISHABLE_KEY;
  // As novas chaves sb_publishable_ são opacas e não permitem confirmar a ref.
  // Para impedir que Lovable/Vercel reintroduzam uma chave de outro projeto,
  // usamos sempre a chave pública validada deste projeto nesses casos.
  if (candidate.startsWith('sb_publishable_')) return PROJECT_SUPABASE_PUBLISHABLE_KEY;
  try {
    const payload = JSON.parse(atob(candidate.split('.')[1] ?? ''));
    if (payload?.ref === PROJECT_REF) return candidate;
  } catch {
    // chave não legível: usa a do projeto atual
  }
  return PROJECT_SUPABASE_PUBLISHABLE_KEY;
}
