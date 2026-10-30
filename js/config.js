/* ===================== Módulo: Configurações (conexão com o banco + extras locais) ===================== */
const Config = {
  subtabs: [],

  render(container) {
    const ultimaSync = Api.ultimaSync ? new Date(Api.ultimaSync).toLocaleString('pt-BR') : 'nunca';
    const pendencias = Api.pendencias();
    const comErro = Api.outbox.filter(i => i.erro).length;

    container.innerHTML = `
      <h3 class="section-title">Status da conexão</h3>
      <div class="form-card">
        <div class="rec-row" style="margin-bottom:8px;">
          <span>Status: ${navigator.onLine ? UI.badge('Online', 'green') : UI.badge('Offline', 'red')}</span>
          <span>Pendentes: ${pendencias ? UI.badge(pendencias, 'orange') : UI.badge('0', 'green')}</span>
        </div>
        <p class="hint">Banco de dados: Supabase (Postgres), plano gratuito.<br/>Última sincronização: ${ultimaSync}</p>
        <button class="btn btn-secondary" id="btnSincronizarAgora">🔄 Sincronizar agora</button>
      </div>

      ${pendencias ? `
      <h3 class="section-title">Pendências de sincronização (${pendencias})${comErro ? ' — ' + comErro + ' com erro' : ''}</h3>
      <div class="form-card">
        <p class="hint">Alterações feitas no app que ainda não chegaram ao banco de dados. As que têm "Erro" abaixo não vão sincronizar sozinhas — normalmente é um dado inválido (ex: um campo obrigatório vazio); abra o registro de novo, corrija e salve, ou descarte a pendência se já não interessa mais.</p>
        <div id="listaPendencias"></div>
      </div>` : ''}

      <h3 class="section-title">Conexão avançada</h3>
      <div class="form-card">
        <p class="hint">Só mexa aqui se for trocar para outro projeto Supabase. O padrão já funciona sem configurar nada.</p>
        <div class="form-group"><label>URL do projeto Supabase</label><input type="text" id="cfgUrl" value="${Utils.escapeHtml(Api.cfg.url)}"/></div>
        <div class="form-group"><label>Chave pública (anon/publishable)</label><input type="text" id="cfgKey" value="${Utils.escapeHtml(Api.cfg.key)}"/></div>
        <button class="btn btn-primary" id="btnSalvarConexao">Salvar e sincronizar</button>
        <button class="btn btn-ghost" id="btnPadrao" style="margin-top:8px;">Restaurar padrão</button>
      </div>

      <h3 class="section-title">Dados locais (tarefas) — backup</h3>
      <div class="form-card">
        <p class="hint">As tarefas do app ("Tarefas") ficam salvas apenas neste aparelho. Os dados de rebanho já ficam no banco de dados na nuvem.</p>
        <button class="btn btn-secondary" id="btnExportarBackup">⬇ Exportar tarefas locais (.json)</button>
      </div>

      <h3 class="section-title">Sobre</h3>
      <div class="form-card">
        <p class="hint">Capataz Web · banco de dados Supabase/Postgres.<br/>Módulo atual: Rebanho (Animais, Partos, Lactações, Movimentações, ADAPEC). Demais módulos (Agricultura, Financeiro, Propriedade) chegam nas próximas etapas.</p>
      </div>
    `;

    container.querySelector('#btnSalvarConexao').addEventListener('click', async () => {
      const url = container.querySelector('#cfgUrl').value;
      const key = container.querySelector('#cfgKey').value;
      if (!url || !key) { Utils.toast('Preencha URL e chave.', 'error'); return; }
      Api.salvarConfig(url, key);
      Utils.toast('Conectando...');
      const r = await Api.carregarTudo();
      if (r.ok) Utils.toast('Conectado! Dados carregados.');
      else Utils.toast('Não foi possível conectar agora.', 'error');
      App.refresh();
    });

    container.querySelector('#btnPadrao').addEventListener('click', async () => {
      Api.restaurarPadrao();
      await Api.carregarTudo();
      Utils.toast('Conexão padrão restaurada.');
      App.refresh();
    });

    container.querySelector('#btnSincronizarAgora').addEventListener('click', async () => {
      Utils.toast('Sincronizando...');
      await Api.sincronizar();
      await Api.carregarTudo();
      Utils.toast('Sincronização concluída.');
      App.refresh();
    });

    container.querySelector('#btnExportarBackup').addEventListener('click', () => {
      Utils.downloadArquivo(`backup-tarefas-${Utils.hoje()}.json`, DB.exportJSON());
      Utils.toast('Backup exportado.');
    });

    if (pendencias) this.renderListaPendencias(container.querySelector('#listaPendencias'));
  },

  resumoItem(item) {
    const opLabel = { create: 'Novo', update: 'Edição', delete: 'Exclusão' }[item.op] || item.op;
    const p = item.payload || {};
    const pedacos = [p.nome, p.categoria, p.descricao, p.data, p.data_venda].filter(Boolean);
    const valor = p.valor !== undefined ? p.valor : (p.valor_total !== undefined ? p.valor_total : null);
    return {
      titulo: `${opLabel} em ${item.tabela}`,
      detalhe: pedacos.join(' · ') || `id ${String(item.id).slice(0, 8)}`,
      valor
    };
  },

  renderListaPendencias(el) {
    UI.renderList(el, {
      data: Api.outbox,
      emptyText: '',
      renderCard: (item) => {
        const { titulo, detalhe, valor } = this.resumoItem(item);
        return `
          <div class="rec-title">${Utils.escapeHtml(titulo)} ${item.erro ? UI.badge('Erro', 'red') : UI.badge('Aguardando', 'orange')}</div>
          <div class="rec-sub">${Utils.escapeHtml(detalhe)}${valor !== null ? ' · ' + Utils.fmtMoeda(valor) : ''}</div>
          ${item.erro ? `<div class="rec-sub" style="color:var(--danger, #c0392b);">${Utils.escapeHtml(String(item.erro).slice(0, 200))}</div>` : ''}
          <div class="rec-row" data-stop>
            <button type="button" class="btn btn-ghost" data-descartar="${Utils.escapeHtml(item.localId)}" style="padding:4px 8px;">🗑️ Descartar pendência</button>
          </div>`;
      }
    });
    el.querySelectorAll('[data-descartar]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!Utils.confirmar('Descartar essa alteração pendente? Ela NÃO será enviada ao banco de dados.')) return;
        Api.descartarPendencia(btn.dataset.descartar);
        Utils.toast('Pendência descartada.');
        App.refresh();
      });
    });
  }
};
