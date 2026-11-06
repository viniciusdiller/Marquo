import { cache } from "react";
import { publicApi, ApiError } from "@/lib/api";

// cache() dedupa chamadas repetidas dentro da mesma requisição: layout + page (e
// agendar/entrar/conta) podem cada um chamar getTenant(slug) sem gerar fetches extras.
export const getTenant = cache(async (slug: string) => {
  try {
    return await publicApi.getTenant(slug);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
});

