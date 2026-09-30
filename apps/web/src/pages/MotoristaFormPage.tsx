import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, ExternalLink, FileText, Loader2, ScanText, Trash2, Truck, X } from 'lucide-react';
import {
  TIPO_DOCUMENTO_MOTORISTA_LABEL,
  type Motorista,
  type MotoristaDocumento,
  type OcrCnh,
  type OcrCrlv,
  type OcrDocumentoResultado,
  type TipoDocumentoMotorista,
} from '@rigabras/shared';
import { api, ApiError, getCurrentUserRole } from '../lib/apiClient.js';
import { arquivosParaGuardar, imagensParaOcr } from '../lib/arquivosDocumento.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';

interface FormState {
  nome_completo: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  nome_mae: string;
  nome_pai: string;
  cnh: string;
  cnh_categoria: string;
  cnh_validade: string;
  cnh_primeira_habilitacao: string;
  telefone: string;
  nacionalidade: string;
  vinculo: string;
  placa_habitual: string;
  frota_propria: boolean;
  ativo: boolean;
  observacao: string;
}

const VAZIO: FormState = {
  nome_completo: '',
  cpf: '',
  rg: '',
  data_nascimento: '',
  nome_mae: '',
  nome_pai: '',
  cnh: '',
  cnh_categoria: '',
  cnh_validade: '',
  cnh_primeira_habilitacao: '',
  telefone: '',
  nacionalidade: 'Brasileira',
  vinculo: '',
  placa_habitual: '',
  frota_propria: true,
  ativo: true,
  observacao: '',
};

/** Pré-migration 0014 os dados novos ficam em dados_extras com estes rótulos. */
const EXTRA: Partial<Record<keyof FormState, string>> = {
  rg: 'RG',
  data_nascimento: 'Data de nascimento',
  nome_mae: 'Nome da mãe',
  nome_pai: 'Nome do pai',
  cnh_primeira_habilitacao: '1ª habilitação',
};

function doMotorista(m: Motorista): FormState {
  const ex = (m.dados_extras ?? {}) as Record<string, unknown>;
  const v = (k: keyof FormState) => {
    const direto = (m as Record<string, unknown>)[k];
    if (direto !== undefined && direto !== null) return String(direto);
    const e = EXTRA[k] ? ex[EXTRA[k]!] : undefined;
    return e !== undefined && e !== null ? String(e) : '';
  };
  return {
    nome_completo: m.nome_completo,
    cpf: fmtCpf(v('cpf')),
    rg: v('rg'),
    data_nascimento: v('data_nascimento').slice(0, 10),
    nome_mae: v('nome_mae'),
    nome_pai: v('nome_pai'),
    cnh: v('cnh'),
    cnh_categoria: v('cnh_categoria'),
    cnh_validade: v('cnh_validade').slice(0, 10),
    cnh_primeira_habilitacao: v('cnh_primeira_habilitacao').slice(0, 10),
    telefone: v('telefone'),
    nacionalidade: v('nacionalidade'),
    vinculo: v('vinculo'),
    placa_habitual: v('placa_habitual'),
    frota_propria: m.frota_propria ?? true,
    ativo: m.ativo ?? true,
    observacao: v('observacao'),
  };
}

const msg = (err: unknown) =>
  err instanceof ApiError
    ? `${err.problem.detail ?? err.problem.title}${
        err.problem.errors
          ? ` (${Object.entries(err.problem.errors)
              .map(([c, m]) => `${c}: ${m.join(', ')}`)
              .join('; ')})`
          : ''
      }`
    : err instanceof Error
      ? err.message
      : 'Erro inesperado';
const txt = (v: string) => (v.trim() === '' ? null : v.trim());
const fmtCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

interface CrlvState {
  arquivos: File[];
  placa: string;
  ocr: OcrCrlv | null;
  lendo: boolean;
  erro: string | null;
}
const CRLV_VAZIO: CrlvState = { arquivos: [], placa: '', ocr: null, lendo: false, erro: null };

/** Novo motorista (/motoristas/novo) e edição (/motoristas/:id). */
export default function MotoristaFormPage() {
  const { id } = useParams<{ id: string }>();
  const editando = !!id;
  const navigate = useNavigate();
  const role = getCurrentUserRole();
  const podeEditar = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const podeExcluirDoc = role === 'SUPERADMIN' || role === 'ADMIN';
  const [form, setForm] = useState<FormState>(VAZIO);
  const [carregando, setCarregando] = useState(editando);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [documentos, setDocumentos] = useState<MotoristaDocumento[]>([]);
  const [cnhArquivos, setCnhArquivos] = useState<File[]>([]);
  const [cnhOcr, setCnhOcr] = useState<OcrDocumentoResultado | null>(null);
  const [lendoCnh, setLendoCnh] = useState(false);
  const [erroOcr, setErroOcr] = useState<string | null>(null);
  const [cavalo, setCavalo] = useState<CrlvState>(CRLV_VAZIO);
  const [carreta, setCarreta] = useState<CrlvState>(CRLV_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregarDocs = useCallback(async () => {
    if (!id) return;
    try {
      setDocumentos(await api.get<MotoristaDocumento[]>(`/motoristas/${id}/documentos`));
    } catch {
      setDocumentos([]);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setCarregando(true);
    api
      .get<Motorista>(`/motoristas/${id}`)
      .then((m) => setForm(doMotorista(m)))
      .catch((err) => setErroCarga(msg(err)))
      .finally(() => setCarregando(false));
    void carregarDocs();
  }, [id, carregarDocs]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function lerCnh(files: File[]) {
    setCnhArquivos(files);
    setErroOcr(null);
    setCnhOcr(null);
    if (files.length === 0) return;
    setLendoCnh(true);
    try {
      const imagens = await imagensParaOcr(files);
      if (imagens.length === 0) throw new Error('Não foi possível abrir as imagens. Use JPG, PNG ou PDF.');
      const r = await api.post<OcrDocumentoResultado>('/motoristas/ocr', { tipo: 'CNH', imagens });
      setCnhOcr(r);
      const d = r.dados as OcrCnh;
      // Preenche só o que foi lido; o que o usuário já digitou e o OCR não leu fica como está.
      setForm((f) => ({
        ...f,
        nome_completo: d.nome_completo ?? f.nome_completo,
        cpf: d.cpf ? fmtCpf(d.cpf) : f.cpf,
        rg: d.rg ?? f.rg,
        data_nascimento: d.data_nascimento ?? f.data_nascimento,
        nome_mae: d.nome_mae ?? f.nome_mae,
        nome_pai: d.nome_pai ?? f.nome_pai,
        cnh: d.cnh ?? f.cnh,
        cnh_categoria: d.cnh_categoria ?? f.cnh_categoria,
        cnh_validade: d.cnh_validade ?? f.cnh_validade,
        cnh_primeira_habilitacao: d.cnh_primeira_habilitacao ?? f.cnh_primeira_habilitacao,
        nacionalidade: d.nacionalidade ?? f.nacionalidade,
      }));
    } catch (err) {
      const m = msg(err);
      setErroOcr(/manualmente/i.test(m) ? m : `${m} Você pode preencher os campos manualmente.`);
    } finally {
      setLendoCnh(false);
    }
  }

  async function lerCrlv(files: File[], atualizar: React.Dispatch<React.SetStateAction<CrlvState>>) {
    atualizar((s) => ({ ...s, arquivos: files, erro: null, ocr: null }));
    if (files.length === 0) return;
    atualizar((s) => ({ ...s, lendo: true }));
    try {
      const imagens = await imagensParaOcr(files);
      if (imagens.length === 0) throw new Error('Não foi possível abrir as imagens.');
      const r = await api.post<OcrDocumentoResultado>('/motoristas/ocr', { tipo: 'CRLV', imagens });
      const d = r.dados as OcrCrlv;
      atualizar((s) => ({ ...s, ocr: d, placa: d.placa ?? s.placa, lendo: false }));
    } catch (err) {
      atualizar((s) => ({ ...s, lendo: false, erro: `${msg(err)} Informe a placa manualmente — o arquivo será guardado mesmo assim.` }));
    }
  }

  async function enviarDoc(motoristaId: string, tipo: TipoDocumentoMotorista, files: File[], placa?: string, ocr?: unknown) {
    if (files.length === 0) return;
    const arquivos = await arquivosParaGuardar(files);
    await api.post(`/motoristas/${motoristaId}/documentos`, {
      tipo,
      placa: placa?.trim() ? placa.trim() : null,
      arquivos,
      ocr_dados: ocr ?? null,
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    const cpf = form.cpf.replace(/\D/g, '');
    if (cpf && cpf.length !== 11) {
      setErro('CPF deve ter 11 dígitos.');
      return;
    }
    const payload = {
      nome_completo: form.nome_completo.trim(),
      cpf: cpf || null,
      rg: txt(form.rg),
      data_nascimento: txt(form.data_nascimento),
      nome_mae: txt(form.nome_mae),
      nome_pai: txt(form.nome_pai),
      cnh: txt(form.cnh),
      cnh_categoria: txt(form.cnh_categoria),
      cnh_validade: txt(form.cnh_validade),
      cnh_primeira_habilitacao: txt(form.cnh_primeira_habilitacao),
      telefone: txt(form.telefone),
      nacionalidade: txt(form.nacionalidade),
      vinculo: txt(form.vinculo),
      placa_habitual: txt(form.placa_habitual.toUpperCase().replace(/[\s-]/g, '')),
      frota_propria: form.frota_propria,
      ativo: form.ativo,
      observacao: txt(form.observacao),
    };
    setSalvando(true);
    let motoristaId = id ?? null;
    try {
      if (editando) await api.patch(`/motoristas/${id}`, payload);
      else motoristaId = (await api.post<Motorista>('/motoristas', payload)).id;
    } catch (err) {
      setErro(msg(err));
      setSalvando(false);
      return;
    }
    // Documentos: o motorista já está salvo; falha no upload não desfaz o cadastro.
    const falhas: string[] = [];
    for (const [tipo, files, placa, ocr] of [
      ['CNH', cnhArquivos, undefined, cnhOcr?.dados],
      ['CRLV_CAVALO', cavalo.arquivos, cavalo.placa, cavalo.ocr],
      ['CRLV_CARRETA', carreta.arquivos, carreta.placa, carreta.ocr],
    ] as Array<[TipoDocumentoMotorista, File[], string | undefined, unknown]>) {
      try {
        await enviarDoc(motoristaId!, tipo, files, placa, ocr);
      } catch (err) {
        falhas.push(`${TIPO_DOCUMENTO_MOTORISTA_LABEL[tipo]}: ${msg(err)}`);
      }
    }
    setSalvando(false);
    if (falhas.length > 0) {
      setErro(`Motorista salvo, mas alguns documentos não foram enviados — ${falhas.join(' | ')}`);
      if (!editando) navigate(`/motoristas/${motoristaId}`, { replace: true });
      return;
    }
    if (editando) {
      setCnhArquivos([]);
      setCavalo(CRLV_VAZIO);
      setCarreta(CRLV_VAZIO);
      setCnhOcr(null);
      setOk('Alterações salvas.');
      void carregarDocs();
    } else navigate(`/motoristas/${motoristaId}`);
  }

  async function excluirDoc(d: MotoristaDocumento) {
    if (!window.confirm(`Excluir o arquivo ${d.nome_arquivo}?`)) return;
    try {
      await api.delete(`/motoristas/${id}/documentos/${d.id}`);
      void carregarDocs();
    } catch (err) {
      setErro(msg(err));
    }
  }

  if (carregando)
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <LoadingSkeleton rows={4} />
      </div>
    );
  if (erroCarga)
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorCard message={erroCarga} onRetry={() => window.location.reload()} />
      </div>
    );

  const ilegiveis = new Set(cnhOcr?.ilegiveis ?? []);
  const campo = (k: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">
        {label}
        {ilegiveis.has(k) && <span className="ml-1 text-xs text-amber-600">(confira — leitura incerta)</span>}
      </span>
      <input
        className={`input ${ilegiveis.has(k) ? 'border-amber-300 bg-amber-50' : ''}`}
        value={form[k] as string}
        onChange={(e) => set(k, (k === 'cpf' ? fmtCpf(e.target.value) : e.target.value) as never)}
        disabled={!podeEditar}
        data-testid={`mf-${k}`}
        {...props}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/motoristas" className="mb-2 inline-block text-xs text-slate-500 hover:text-blue-600">
        ← Motoristas
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{editando ? form.nome_completo || 'Motorista' : 'Novo motorista'}</h1>

      <form onSubmit={salvar} className="space-y-6" data-testid="motorista-form">
        {podeEditar && (
          <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
              <ScanText className="h-4 w-4 text-blue-600" /> Preencher lendo a CNH (recomendado)
            </h2>
            <p className="mb-3 text-xs text-slate-600">
              Anexe até 3 fotos ou PDFs da CNH (frente, verso ou CNH digital). O sistema lê nome, CPF, RG, nascimento,
              filiação e dados da habilitação e preenche o formulário — confira antes de salvar. Os arquivos ficam
              guardados no cadastro.
            </p>
            <SeletorArquivos
              arquivos={cnhArquivos}
              onChange={(fs) => void lerCnh(fs)}
              testid="mf-cnh-arquivos"
              rotulo="Anexar CNH (fotos ou PDF)"
            />
            {lendoCnh && (
              <p className="mt-2 flex items-center gap-2 text-xs text-blue-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a CNH...
              </p>
            )}
            {cnhOcr && (
              <p className="mt-2 text-xs text-emerald-700" data-testid="mf-ocr-ok">
                Dados lidos e preenchidos abaixo.
                {cnhOcr.ilegiveis.length > 0 && ` Confira: ${cnhOcr.ilegiveis.join(', ')}.`}
                {cnhOcr.observacao && <span className="ml-1 font-semibold text-red-600">{cnhOcr.observacao}</span>}
              </p>
            )}
            {erroOcr && <p className="mt-2 text-xs text-amber-700">{erroOcr}</p>}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-700">Dados pessoais</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{campo('nome_completo', 'Nome completo *', { required: true, minLength: 3 })}</div>
            {campo('cpf', 'CPF', { inputMode: 'numeric', placeholder: '000.000.000-00' })}
            {campo('rg', 'RG / órgão emissor')}
            {campo('data_nascimento', 'Data de nascimento', { type: 'date' })}
            {campo('nacionalidade', 'Nacionalidade')}
            {campo('nome_mae', 'Filiação — mãe (se houver)')}
            {campo('nome_pai', 'Filiação — pai (se houver)')}
            {campo('telefone', 'Telefone / WhatsApp', { inputMode: 'tel' })}
            {campo('vinculo', 'Vínculo', { placeholder: 'Frota própria (CLT), agregado, terceiro...' })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-700">Habilitação</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('cnh', 'Nº de registro da CNH', { inputMode: 'numeric' })}
            {campo('cnh_categoria', 'Categoria', { placeholder: 'E' })}
            {campo('cnh_validade', 'Validade', { type: 'date' })}
            {campo('cnh_primeira_habilitacao', '1ª habilitação', { type: 'date' })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-700">
            <Truck className="h-4 w-4" /> CRLV do cavalo e da carreta (opcional)
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Anexe o CRLV (foto ou PDF): a placa, marca, modelo e ano são lidos e o veículo é cadastrado/atualizado na frota.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['Cavalo', cavalo, setCavalo, 'mf-crlv-cavalo'],
                ['Carreta', carreta, setCarreta, 'mf-crlv-carreta'],
              ] as const
            ).map(([rotulo, st, setSt, tid]) => (
              <div key={rotulo} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">CRLV do {rotulo.toLowerCase()}</p>
                <SeletorArquivos
                  arquivos={st.arquivos}
                  onChange={(fs) => void lerCrlv(fs, setSt)}
                  testid={tid}
                  rotulo="Anexar CRLV"
                  disabled={!podeEditar}
                />
                {st.lendo && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-blue-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo...
                  </p>
                )}
                {st.arquivos.length > 0 && (
                  <label className="mt-2 block text-xs text-slate-600">
                    Placa
                    <input
                      className="input mt-1 uppercase"
                      maxLength={8}
                      value={st.placa}
                      onChange={(e) => setSt((s) => ({ ...s, placa: e.target.value.toUpperCase() }))}
                    />
                  </label>
                )}
                {st.ocr && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {[st.ocr.marca, st.ocr.modelo, st.ocr.ano_fabricacao, st.ocr.renavam && `RENAVAM ${st.ocr.renavam}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {st.erro && <p className="mt-1 text-[11px] text-amber-700">{st.erro}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('placa_habitual', 'Placa habitual (cavalo)', { maxLength: 8 })}
            <div className="flex flex-wrap items-end gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.frota_propria} onChange={(e) => set('frota_propria', e.target.checked)} />
                Frota própria
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
                Ativo
              </label>
            </div>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-600">Observação</span>
              <textarea className="input" rows={2} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} />
            </label>
          </div>
        </section>

        {editando && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="mf-documentos">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <FileText className="h-4 w-4" /> Documentos guardados
            </h2>
            {documentos.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum documento anexado.</p>
            ) : (
              <ul className="divide-y divide-slate-200 text-sm">
                {documentos.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {TIPO_DOCUMENTO_MOTORISTA_LABEL[d.tipo]}
                        {d.placa ? ` · ${d.placa}` : ''}
                      </span>
                      {d.nome_arquivo}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600" title="Abrir">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {podeExcluirDoc && (
                        <button type="button" onClick={() => void excluirDoc(d)} className="text-red-600" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {erro && (
          <p className="text-sm text-red-600" data-testid="mf-erro">
            {erro}
          </p>
        )}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        {podeEditar && (
          <button
            type="submit"
            disabled={salvando || lendoCnh}
            className="w-full rounded-xl bg-rigabras-500 px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
            data-testid="mf-salvar"
          >
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar motorista'}
          </button>
        )}
        {editando && podeExcluirDoc && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Excluir o motorista ${form.nome_completo || ''}? Ele sai das listas.`)) return;
              try {
                await api.delete(`/motoristas/${id}`);
                navigate('/motoristas', { replace: true });
              } catch (err) {
                setErro(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro ao excluir');
              }
            }}
            className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-medium text-red-600 hover:bg-red-50"
            data-testid="mf-excluir"
          >
            Excluir motorista
          </button>
        )}
      </form>
    </div>
  );
}

function SeletorArquivos({
  arquivos,
  onChange,
  rotulo,
  testid,
  disabled,
}: {
  arquivos: File[];
  onChange: (files: File[]) => void;
  rotulo: string;
  testid: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" /> {rotulo}
        </button>
        <span className="text-[11px] text-slate-500">até 3 arquivos</span>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        data-testid={testid}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []).slice(0, 3);
          e.target.value = '';
          onChange(fs);
        }}
      />
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 text-[11px] text-slate-600">
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => onChange(arquivos.filter((_, j) => j !== i))} title="Remover">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
