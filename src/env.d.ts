/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    editorialClient?: import('@supabase/supabase-js').SupabaseClient<import('./lib/editorial/database.types').Database>;
    editorialMember?: { userId: string; email: string; role: import('./lib/editorial/access').EditorialRole };
  }
}
