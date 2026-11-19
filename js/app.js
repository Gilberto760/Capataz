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

    // Clicar fora de qualquer dropdown de sub-abas agrupadas (ver renderTopBar) fecha todos —
    // um listener só, registrado uma vez; cada clique no próprio botão do dropdown já para a
    // propagação (e.stopPropagation()), então nunca chega aqui pra fechar o que acabou de abrir.
    document.addEventListener('click', () => {
      document.querySelectorAll('#subtabs .subtab-group-menu').forEach(m => { m.hidden = true; });
    });

    if (Api.configurado()) {
      // Manda primeiro o que ficou pendente de uma sessão anterior, e só DEPOIS busca tudo do
      // servidor — na ordem errada (os dois ao mesmo tempo), um carregarTudo() que termina antes
      // da fila acabar de subir sobrescreve o cache local inteiro com uma versão do servidor
      // que ainda não tem esses registros novos, e eles somem da tela pra sempre (mesmo com o
      // envio tendo dado certo depois, só silenciosamente no servidor).
      Api.sincronizar().then(() => Api.carregarTudo()).then(() => this.refresh());
    }

    // Botão de sincronizar manual na barra superior — igual ao "Sincronizar agora" de Config,
    // só que disponível em qualquer tela, sem precisar navegar até lá.
    document.getElementById('btnSyncGlobal').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('girando');
      Utils.toast('Sincronizando...');
      await Api.sincronizar();
      await Api.carregarTudo();
      Utils.toast('Sincronização concluída.');
      btn.classList.remove('girando');
      btn.disabled = false;
      this.refresh();
    });

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
    const btnSync = document.getElementById('btnSyncGlobal');
    if (Api.configurado()) {
      const pend = Api.pendencias();
      statusEl.style.display = 'block';
      btnSync.style.display = 'inline-flex';
      if (!navigator.onLine) statusEl.innerHTML = '🔴 Offline' + (pend ? ` · ${pend} pendente(s)` : '');
      else if (pend) statusEl.innerHTML = `🟡 Sincronizando ${pend} alteração(ões)...`;
      else statusEl.innerHTML = '🟢 Sincronizado';
    } else {
      statusEl.style.display = 'none';
      btnSync.style.display = 'none';
    }

    const subtabsEl = document.getElementById('subtabs');
    const mod = atual.mod;
    if (mod && mod.subtabs && mod.subtabs.length > 1) {
      if (!this.subAtual) this.subAtual = mod.subtabs[0].key;
      subtabsEl.style.display = 'flex';
      // Sub-abas com "group" (ex: Cadastros) viram UM dropdown por grupo em vez de um chip
      // pra cada uma — com muitas sub-abas (Fazendas, Proprietários, Fornecedores...) a barra
      // inteira em chips não cabia na tela e ficava um scroll horizontal gigante. Sub-abas sem
      // "group" continuam como chip avulso de sempre. A navegação em si não muda, só a apresentação.
      const blocos = [];
      const indicePorGrupo = {};
      mod.subtabs.forEach((st) => {
        if (!st.group) { blocos.push({ tipo: 'chip', item: st }); return; }
        if (!(st.group in indicePorGrupo)) {
          indicePorGrupo[st.group] = blocos.length;
          blocos.push({ tipo: 'grupo', nome: st.group, itens: [] });
        }
        blocos[indicePorGrupo[st.group]].itens.push(st);
      });
      subtabsEl.innerHTML = blocos.map((b) => {
        if (b.tipo === 'chip') {
          return `<button class="chip ${b.item.key === this.subAtual ? 'active' : ''}" data-sub="${b.item.key}">${b.item.label}</button>`;
        }
        const ativo = b.itens.find(it => it.key === this.subAtual);
        return `<div class="subtab-group-drop" data-grupo="${Utils.escapeHtml(b.nome)}">
          <button type="button" class="chip subtab-group-btn ${ativo ? 'active' : ''}" data-toggle-grupo="${Utils.escapeHtml(b.nome)}">
            ${Utils.escapeHtml(b.nome)}${ativo ? ': ' + Utils.escapeHtml(ativo.label) : ''} ▾
          </button>
          <div class="subtab-group-menu" hidden>
            ${b.itens.map(it => `<button type="button" class="subtab-group-item ${it.key === this.subAtual ? 'active' : ''}" data-sub="${it.key}">${Utils.escapeHtml(it.label)}</button>`).join('')}
          </div>
        </div>`;
      }).join('');

      const irPraSub = (key) => {
        this.subAtual = key;
        location.hash = this.secaoAtual + '/' + this.subAtual;
        this.renderTopBar();
        this.renderConteudo();
      };
      subtabsEl.querySelectorAll('.chip[data-sub]').forEach(c => {
        c.addEventListener('click', () => irPraSub(c.dataset.sub));
      });
      subtabsEl.querySelectorAll('.subtab-group-item').forEach(c => {
        c.addEventListener('click', () => irPraSub(c.dataset.sub));
      });
      subtabsEl.querySelectorAll('[data-toggle-grupo]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.nextElementSibling;
          const jaAberto = !menu.hidden;
          subtabsEl.querySelectorAll('.subtab-group-menu').forEach(m => { m.hidden = true; });
          menu.hidden = jaAberto;
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
