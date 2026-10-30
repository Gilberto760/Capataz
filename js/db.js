/* ===================== Camada de dados (offline, localStorage) ===================== */
const DB_KEY = 'gestaoRuralDB_v1';

const DEFAULT_DB = {
  config: {
    propriedade: 'Minha Propriedade',
    proprietario: '',
    unidadeArea: 'ha',
    moeda: 'R$',
    criadoEm: new Date().toISOString()
  },
  seq: 1,
  animais: [],
  pesagens: [],
  sanidade: [],
  reproducao: [],
  movimentacoes: [],
  lotes: [],
  areasAgricolas: [],
  safras: [],
  tratos: [],
  insumos: [],
  infraestrutura: [],
  clima: [],
  atividades: [],
  financeiro: []
};

const DB = {
  data: null,

  init() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        this.data = JSON.parse(raw);
        // garante que todas as coleções existam (upgrade de versões futuras)
        Object.keys(DEFAULT_DB).forEach(k => {
          if (this.data[k] === undefined) this.data[k] = DEFAULT_DB[k];
        });
      } catch (e) {
        console.error('Erro ao ler banco local, recriando.', e);
        this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    this.save();
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
  },

  nextId() {
    const id = this.data.seq++;
    this.save();
    return 'r' + id;
  },

  list(col, filterFn) {
    const arr = this.data[col] || [];
    return filterFn ? arr.filter(filterFn) : arr.slice();
  },

  get(col, id) {
    return (this.data[col] || []).find(x => x.id === id) || null;
  },

  add(col, obj) {
    if (!obj.id) obj.id = this.nextId();
    if (!obj.criadoEm) obj.criadoEm = new Date().toISOString();
    this.data[col].push(obj);
    this.save();
    return obj;
  },

  update(col, id, patch) {
    const item = this.get(col, id);
    if (!item) return null;
    Object.assign(item, patch, { atualizadoEm: new Date().toISOString() });
    this.save();
    return item;
  },

  remove(col, id) {
    this.data[col] = (this.data[col] || []).filter(x => x.id !== id);
    this.save();
  },

  count(col, filterFn) {
    return this.list(col, filterFn).length;
  },

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  },

  importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    Object.keys(DEFAULT_DB).forEach(k => {
      if (parsed[k] === undefined) parsed[k] = DEFAULT_DB[k];
    });
    this.data = parsed;
    this.save();
  },

  wipe() {
    this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
    this.save();
  }
};

DB.init();
