/* ===================== Camada de sincronização com o Supabase (Postgres) ===================== */
const CFG_KEY = 'capatazConfig_v2';
const CACHE_KEY = 'capatazCache_v2';
const OUTBOX_KEY = 'capatazOutbox_v2';

// Projeto Supabase "Capataz" (plano free) já criado e pronto para uso — não precisa configurar nada.
const PADRAO = {
  url: 'https://fuanbfdxpjgvmgvrtbxo.supabase.co',
  key: 'sb_publishable_mITkLkbTcHi4pz14U58ixg_pv0r-Qr6'
};

const TABELAS = ['animais', 'partos', 'lactacoes', 'mov_rebanho', 'adapec_declaracoes', 'talhoes', 'fazendas', 'proprietarios', 'fazenda_proprietarios', 'gta_movimentacoes', 'gta_itens', 'fornecedores', 'produtos', 'compras', 'itens_compra', 'funcionarios', 'despesas', 'centros_custo', 'producao', 'vendas', 'documentos', 'categorias_despesa', 'formas_pagamento',
  'empreendimentos', 'empreendimento_etapas', 'tarefas', 'insumos_tarefa', 'etapa_tarefas'];

const Api = {
  cfg: { url: '', key: '' },
  cache: {},     // { animais:[...], partos:[...], ... }
  outbox: [],    // [{ localId, tabela, op, id, payload }]
  ultimaSync: null,
  ouvintes: [],

  init() {
    try { this.cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) { this.cfg = null; }
    if (!this.cfg || !this.cfg.url || !this.cfg.key) this.cfg = Object.assign({}, PADRAO);
    try { this.cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) {}
    try { this.outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch (e) {}
    this.ultimaSync = localStorage.getItem('capatazUltimaSync') || null;
    window.addEventListener('online', () => this.sincronizar());
  },

  configurado() {
    return !!(this.cfg.url && this.cfg.key);
  },

  salvarConfig(url, key) {
    this.cfg = { url: url.trim().replace(/\/$/, ''), key: key.trim() };
    localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg));
  },

  restaurarPadrao() {
    this.cfg = Object.assign({}, PADRAO);
    localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg));
  },

  onChange(fn) { this.ouvintes.push(fn); },
  avisar() { this.ouvintes.forEach(fn => { try { fn(); } catch (e) {} }); },

  salvarCache() { localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache)); },
  salvarOutbox() { localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox)); },

  list(tabela) {
    return (this.cache[tabela] || []).slice();
  },

  get(tabela, id) {
    return (this.cache[tabela] || []).find(r => String(r.id) === String(id)) || null;
  },

  headers(extra) {
    return Object.assign({
      apikey: this.cfg.key,
      Authorization: `Bearer ${this.cfg.key}`,
      'Content-Type': 'application/json'
    }, extra || {});
  },

  /* ---------- Anexos (Supabase Storage) ----------
     Precisa de conexão (não dá pra enviar/baixar arquivo offline) — diferente do resto do app,
     que funciona offline com fila de sincronização. */
  async enviarAnexo(bucket, arquivo) {
    if (!this.configurado()) throw new Error('Conecte o app ao banco de dados primeiro.');
    const caminho = `${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const resp = await fetch(`${this.cfg.url}/storage/v1/object/${bucket}/${caminho}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': arquivo.type || 'application/octet-stream' }),
      body: arquivo
    });
    if (!resp.ok) throw new Error('Falha ao enviar o arquivo (' + resp.status + '). Verifique sua conexão.');
    return { url: `${this.cfg.url}/storage/v1/object/public/${bucket}/${caminho}`, caminho, nome: arquivo.name };
  },

  async excluirAnexo(bucket, caminho) {
    if (!caminho) return;
    // Sem body, o endpoint de Storage rejeita Content-Type: application/json (erro 400 do
    // Fastify) — então aqui NÃO usa this.headers(), só apikey/Authorization mesmo.
    await fetch(`${this.cfg.url}/storage/v1/object/${bucket}/${caminho}`, {
      method: 'DELETE',
      headers: { apikey: this.cfg.key, Authorization: `Bearer ${this.cfg.key}` }
    }).catch(() => {}); // se falhar (ex: offline), não trava o resto do fluxo
  },

  /* ---------- Carregar tudo do banco ---------- */
  async carregarTudo() {
    if (!this.configurado()) return { ok: false };
    try {
      const resultados = await Promise.all(TABELAS.map(t =>
        fetch(`${this.cfg.url}/rest/v1/${t}?select=*&order=created_at.desc`, { headers: this.headers() })
          .then(r => { if (!r.ok) throw new Error(t + ': ' + r.status); return r.json(); })
      ));
      TABELAS.forEach((t, i) => { this.cache[t] = resultados[i]; });
      this.salvarCache();
      this.ultimaSync = new Date().toISOString();
      localStorage.setItem('capatazUltimaSync', this.ultimaSync);
      this.avisar();
      return { ok: true };
    } catch (err) {
      console.error('Falha ao carregar do Supabase:', err);
      return { ok: false, erro: String(err) };
    }
  },

  /* ---------- Operações (criar/editar/excluir) com fila offline ---------- */
  uuid() {
    return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }));
  },

  async criar(tabela, dados) {
    const id = this.uuid();
    const objLocal = Object.assign({ id, created_at: new Date().toISOString(), _pendente: true }, dados);
    this.cache[tabela] = this.cache[tabela] || [];
    this.cache[tabela].unshift(objLocal);
    this.salvarCache();
    this.outbox.push({ localId: id, tabela, op: 'create', id, payload: Object.assign({ id }, dados) });
    this.salvarOutbox();
    this.avisar();
    this.sincronizar();
    return objLocal;
  },

  async atualizar(tabela, id, dados) {
    const item = this.get(tabela, id);
    if (item) Object.assign(item, dados, { _pendente: true });
    this.salvarCache();
    // Se já existe uma criação ou edição desse mesmo registro ainda não sincronizada, funde os
    // dados novos nela em vez de empilhar outro item na fila — senão uma edição que falhou (ex:
    // valor inválido) nunca some, mesmo depois do usuário corrigir e salvar de novo, porque o
    // item antigo com erro continua lá do mesmo jeito.
    const pendente = this.outbox.find(i => i.tabela === tabela && String(i.id) === String(id) && (i.op === 'create' || i.op === 'update'));
    if (pendente) {
      Object.assign(pendente.payload, dados);
      delete pendente.erro;
    } else {
      this.outbox.push({ localId: this.uuid(), tabela, op: 'update', id, payload: dados });
    }
    this.salvarOutbox();
    this.avisar();
    this.sincronizar();
  },

  async excluir(tabela, id) {
    this.cache[tabela] = (this.cache[tabela] || []).filter(r => String(r.id) !== String(id));
    this.salvarCache();
    // Se o registro nem chegou a ser criado no servidor ainda, só cancela a criação pendente —
    // não faz sentido mandar um DELETE pra algo que o banco nunca recebeu. Se havia uma edição
    // pendente, ela é substituída pelo delete (não faz sentido editar e depois excluir).
    const criacaoPendente = this.outbox.find(i => i.tabela === tabela && String(i.id) === String(id) && i.op === 'create');
    if (criacaoPendente) {
      this.outbox = this.outbox.filter(i => i !== criacaoPendente);
    } else {
      this.outbox = this.outbox.filter(i => !(i.tabela === tabela && String(i.id) === String(id) && i.op === 'update'));
      this.outbox.push({ localId: this.uuid(), tabela, op: 'delete', id });
    }
    this.salvarOutbox();
    this.avisar();
    this.sincronizar();
  },

  pendencias() {
    return this.outbox.length;
  },

  /* ---------- Sincronização da fila com o Supabase ---------- */
  sincronizando: false,

  async sincronizar() {
    if (this.sincronizando) return;
    if (!this.configurado()) return;
    if (!navigator.onLine) return;
    if (!this.outbox.length) return;

    this.sincronizando = true;
    // Processa a fila inteira em vez de parar no primeiro erro: um único item com problema
    // (ex: um valor inválido) não pode travar a sincronização dos outros pra sempre. Itens que
    // falham voltam pra fila (com o erro guardado nele, visível em Config) e são tentados de
    // novo na próxima sincronização; só uma falha de rede de verdade interrompe tudo.
    const restantes = [];
    let faltouRede = false;
    try {
      for (let i = 0; i < this.outbox.length; i++) {
        const item = this.outbox[i];
        if (faltouRede) { restantes.push(item); continue; }
        let resp;
        try {
          if (item.op === 'create') {
            resp = await fetch(`${this.cfg.url}/rest/v1/${item.tabela}`, {
              method: 'POST',
              headers: this.headers({ Prefer: 'return=minimal' }),
              body: JSON.stringify(item.payload)
            });
          } else if (item.op === 'update') {
            resp = await fetch(`${this.cfg.url}/rest/v1/${item.tabela}?id=eq.${item.id}`, {
              method: 'PATCH',
              headers: this.headers({ Prefer: 'return=minimal' }),
              body: JSON.stringify(item.payload)
            });
          } else {
            resp = await fetch(`${this.cfg.url}/rest/v1/${item.tabela}?id=eq.${item.id}`, {
              method: 'DELETE',
              headers: this.headers({ Prefer: 'return=minimal' })
            });
          }
        } catch (errRede) {
          console.error('Falha de rede ao sincronizar item, tentando o resto depois:', errRede);
          faltouRede = true;
          restantes.push(item);
          continue;
        }
        if (!resp.ok) {
          const texto = await resp.text().catch(() => '');
          console.error('Erro ao sincronizar item, mantendo na fila:', resp.status, texto);
          item.erro = texto || ('HTTP ' + resp.status);
          restantes.push(item);
          continue;
        }
        const local = this.get(item.tabela, item.id);
        if (local) delete local._pendente;
      }
      this.salvarCache();
      this.outbox = restantes;
      this.salvarOutbox();
      this.ultimaSync = new Date().toISOString();
      localStorage.setItem('capatazUltimaSync', this.ultimaSync);
    } catch (err) {
      console.error('Falha ao sincronizar:', err);
    } finally {
      this.sincronizando = false;
      this.avisar();
    }
  },

  // Remove um item da fila de sincronização sem aplicá-lo (usado quando o item está com dado
  // inválido e não tem mais conserto — ver tela de Pendências em Config).
  descartarPendencia(localId) {
    this.outbox = this.outbox.filter(i => i.localId !== localId);
    this.salvarOutbox();
    this.avisar();
  }
};

Api.init();
