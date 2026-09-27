import type { CreateMotoristaInput, Motorista, UpdateMotoristaInput } from "@rigabras/shared";
import { supabaseAdmin } from "../../config/supabase.js";

const TABLE = "motoristas";

export class MotoristasRepository {
  async list(limit: number, cursor?: string): Promise<{ data: Motorista[]; nextCursor: string | null }> {
    let query = supabaseAdmin.from(TABLE).select("*").is("deleted_at", null).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.lt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Motorista[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async findById(id: string): Promise<Motorista | null> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return (data as Motorista | null) ?? null;
  }

  async findByCpf(cpf: string): Promise<Motorista | null> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("cpf", cpf).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return (data as Motorista | null) ?? null;
  }

  async create(input: CreateMotoristaInput): Promise<Motorista> {
    const { data, error } = await supabaseAdmin.from(TABLE).insert(input).select("*").single();
    if (error) throw error;
    return data as Motorista;
  }

  async update(id: string, input: UpdateMotoristaInput): Promise<Motorista> {
    const { data, error } = await supabaseAdmin.from(TABLE).update(input).eq("id", id).is("deleted_at", null).select("*").single();
    if (error) throw error;
    return data as Motorista;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }
}
