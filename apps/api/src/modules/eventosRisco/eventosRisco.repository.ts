import type { CreateEventoRiscoInput, EventoRisco, UpdateEventoRiscoInput } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const TABLE = 'eventos_risco';

export class EventosRiscoRepository {
  async listByViagem(viagemId: string): Promise<EventoRisco[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('viagem_id', viagemId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EventoRisco[];
  }

  async findById(id: string): Promise<EventoRisco | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as EventoRisco | null) ?? null;
  }

  async create(input: CreateEventoRiscoInput, createdBy: string | null): Promise<EventoRisco> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...input, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as EventoRisco;
  }

  async update(id: string, input: UpdateEventoRiscoInput): Promise<EventoRisco> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw error;
    return data as EventoRisco;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
