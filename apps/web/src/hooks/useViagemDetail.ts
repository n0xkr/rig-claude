import { useCallback, useEffect, useState } from "react";
import type { EventoRisco, Viagem } from "@rigabras/shared";
import { api, ApiError } from "../lib/apiClient.js";
import type { LoadState } from "./useViagens.js";

export function useViagemDetail(id: string | undefined) {
  const [state, setState] = useState<LoadState>("idle");
  const [viagem, setViagem] = useState<Viagem | null>(null);
  const [eventos, setEventos] = useState<EventoRisco[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    setError(null);
    try {
      const [viagemData, eventosData] = await Promise.all([
        api.get<Viagem>(`/viagens/${id}`),
        api.get<EventoRisco[]>(`/viagens/${id}/eventos-risco`),
      ]);
      setViagem(viagemData);
      setEventos(eventosData);
      setState("success");
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.detail ?? err.problem.title : "Erro inesperado");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, viagem, eventos, error, reload: load };
}
