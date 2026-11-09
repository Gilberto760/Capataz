/* ===================== App: roteamento e navegação ===================== */
const App = {
  secoes: [
    { key: 'dashboard', label: 'Início', icon: '🏠', mod: Dashboard },
    { key: 'rebanho', label: 'Rebanho', icon: '🐄', mod: Rebanho },
    { key: 'compras', label: 'Financeiro', icon: '💰', mod: Compras },
    { key: 'empreendimentos', label: 'Atividades', icon: '🌱', mod: Empreendimentos },
    { key: 'relatorios', label: 'Relatórios', icon: '📊', mod: Relatorios },
    { key: 'cadastros', label: 'Cadastros', icon: '📋', mod: Cadastros },
    { key: 'mapa', label: 'Mapa', icon: '🗺️', mod: Mapa },
    { key: 'atividades', label: 'Lista de Afazeres', icon: '✅', mod: Atividades },
    { key: 'config', label: 'Config', icon: '⚙️', mod: Config }
  ],

  secaoAtual: 'dashboard',
  subAtual: null,

  init() {
    this.renderBottomNav();
    this.irPara('dashboard');

    window.addEventListener('hashchange', () => this.lerHash());
    this.lerHash();

    Api.onChange(() => this.refresh());
    window.addEventListener('online', () => this.refresh());
    window.addEventListener('offline', () => this.refresh());

    if (Api.configurado()) {
      Api.carregarTudo().then(() => this.refresh());
      // Tenta mandar pendências que ficaram na fila de uma sessão anterior — sem isso, elas só
      // tentam de novo quando o usuário edita algo novo ou clica em "Sincronizar agora".
      Api.sincronizar();
    }

    if ('serviceWorker' in navigator) {
      // Registra e, se já havia um Service Worker ativo (não é o primeiro acesso), força a
      // checagem por uma versão nova e recarrega a página sozinho assim que ela assumir —
      // antes disso, uma versão nova só aparecia depois do usuário fechar/reabrir o app
      // VÁRIAS vezes, porque o navegador podia demorar até 24h pra checar sw.js sozinho.
      let jaRecarregou = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (jaRecarregou) return;
        jaRecarregou = true;
        window.location.reload();
      });
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.update().catch(() => {});
      }).catch(() => {});
    }
  },

  lerHash() {
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    const [sec, sub] = hash.split('/');
    this.irPara(sec, sub, true);
  },

  irPara(secaoKey, subKey, semHash) {
    const achou = this.secoes.find(s => s.key === secaoKey);
    if (!achou) secaoKey = 'dashboard';
    this.secaoAtual = secaoKey;
    this.subAtual = subKey || null;
    if (!semHash) location.hash = secaoKey + (subKey ? '/' + subKey : '');
    this.renderBottomNav();
    this.renderTopBar();
    this.renderConteudo();
  },

  renderBottomNav() {
    const nav = document.getElementById('bottomNav');
    nav.innerHTML = this.secoes.map(s => `
      <button class="nav-btn ${s.key === this.secaoAtual ? 'active' : ''}" data-sec="${s.key}">
        <span class="nav-icon">${s.icon}</span><span class="nav-label">${s.label}</span>
      </button>`).join('');
    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.irPara(btn.dataset.sec));
    });
  },

  renderTopBar() {
    const atual = this.secoes.find(s => s.key === this.secaoAtual) || this.secoes[0];
    document.getElementById('topTitle').textContent = atual.label;

    const statusEl = document.getElementById('syncStatus');
    if (Api.configurado()) {
      const pend = Api.pendencias();
      statusEl.style.display = 'block';
      if (!navigator.onLine) statusEl.innerHTML = '🔴 Offline' + (pend ? ` · ${pend} pendente(s)` : '');
      else if (pend) statusEl.innerHTML = `🟡 Sincronizando ${pend} alteração(ões)...`;
      else statusEl.innerHTML = '🟢 Sincronizado';
    } else {
      statusEl.style.display = 'none';
    }

    const subtabsEl = document.getElementById('subtabs');
    const mod = atual.mod;
    if (mod && mod.subtabs && mod.subtabs.length > 1) {
      if (!this.subAtual) this.subAtual = mod.subtabs[0].key;
      subtabsEl.style.display = 'flex';
      // Quando as sub-abas têm "group" (ex: Cadastros), insere um rotulozinho antes do
      // primeiro chip de cada grupo novo, só pra organizar visualmente — a navegação
      // continua sendo pela mesma lista plana de sempre.
      let grupoAnterior = null;
      subtabsEl.innerHTML = mod.subtabs.map(st => {
        const rotuloGrupo = (st.group && st.group !== grupoAnterior) ? `<span class="subtab-group-label">${st.group}</span>` : '';
        grupoAnterior = st.group || grupoAnterior;
        return `${rotuloGrupo}<button class="chip ${st.key === this.subAtual ? 'active' : ''}" data-sub="${st.key}">${st.label}</button>`;
      }).join('');
      subtabsEl.querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => {
          this.subAtual = c.dataset.sub;
          location.hash = this.secaoAtual + '/' + this.subAtual;
          this.renderTopBar();
          this.renderConteudo();
        });
      });
    } else {
      subtabsEl.style.display = 'none';
      subtabsEl.innerHTML = '';
    }
  },

  renderConteudo() {
    const atual = this.secoes.find(s => s.key === this.secaoAtual) || this.secoes[0];
    const container = document.getElementById('content');
    container.scrollTop = 0;
    if (atual.mod) {
      atual.mod.render(container, this.subAtual);
    } else {
      container.innerHTML = '<div class="empty-state">Selecione uma opção.</div>';
    }
  },

  refresh() {
    this.renderTopBar();
    this.renderConteudo();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
