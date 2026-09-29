import type { CreateVeiculoInput, UpdateVeiculoInput, Veiculo } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fromPgError } from '../../lib/pgConstraintErrors.js';

const TABLE = 'veiculos';

export class VeiculosRepository {
  async list(
    limit: number,
    cursor?: string,
  ): Promise<{ data: Veiculo[]; nextCursor: string | null }> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt('id', cursor);
    const { data, error } = await query;
    if (error) throw fromPgError(error);
    const rows = (data ?? []) as Veiculo[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Veiculo | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw fromPgError(error);
    return (data as Veiculo | null) ?? null;
  }

  async findByPlaca(placa: string): Promise<Veiculo | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('placa', placa)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw fromPgError(error);
    return (data as Veiculo | null) ?? null;
  }

  async create(input: CreateVeiculoInput): Promise<Veiculo> {
    const { data, error } = await supabaseAdmin.from(TABLE).insert(input).select('*').single();
    if (error) throw fromPgError(error);
    return data as Veiculo;
  }

  async update(id: string, input: UpdateVeiculoInput): Promise<Veiculo> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) throw fromPgError(error);
    return data as Veiculo;
  }

  /**
   * Viagens ainda em andamento (não ENCERRADA/CANCELADA) que usam o veículo,
   * seja por `veiculo_id` ou pela FK `placa_cavalo` -> `veiculos.placa`.
   * O soft delete é um UPDATE, então a FK do banco não protege sozinha.
   */
  async countViagensAtivas(id: string, placa: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('viagens')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('status', 'in', '(ENCERRADA,CANCELADA)')
      .or(`veiculo_id.eq.${id},placa_cavalo.eq."${placa}"`);
    if (error) throw fromPgError(error);
    return count ?? 0;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fromPgError(error);
  }
}
