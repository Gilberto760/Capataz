/* ===================== Módulo: Propriedade (Infraestrutura + Clima) ===================== */
const Propriedade = {
  subtabs: [
    { key: 'infraestrutura', label: 'Infraestrutura' },
    { key: 'clima', label: 'Clima/Chuva' }
  ],

  render(container, sub) {
    sub = sub || 'infraestrutura';
    const map = {
      infraestrutura: () => this.renderInfra(container),
      clima: () => this.renderClima(container)
    };
    (map[sub] || map.infraestrutura)();
  },

  /* ---------- INFRAESTRUTURA ---------- */
  renderInfra(container) {
    const regs = DB.list('infraestrutura').sort((a, b) => a.nome.localeCompare(b.nome));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaInfra">+ Nova benfeitoria</button></div>
      <div id="listaInfra"></div>`;
    container.querySelector('#btnNovaInfra').addEventListener('click', () => this.abrirFormInfra(null));
    UI.renderList(container.querySelector('#listaInfra'), {
      data: regs,
      emptyText: 'Nenhuma benfeitoria (cerca, aguada, curral...) cadastrada ainda.',
      onCardClick: (r) => this.abrirFormInfra(r),
      renderCard: (r) => {
        const atraso = r.proximaManutencao && r.proximaManutencao < Utils.hoje();
        return `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${UI.badge(r.tipo || '-', 'blue')}</div>
        <div class="rec-sub">${Utils.escapeHtml(r.localizacao || '')}</div>
        <div class="rec-row">
          <span>${UI.badge(r.statusManutencao || 'Boa', r.statusManutencao === 'Precisa de reparo' ? 'red' : 'green')}</span>
          ${r.proximaManutencao ? `<span>${atraso ? UI.badge('Manutenção atrasada', 'red') : 'Próx. manutenção: ' + Utils.fmtData(r.proximaManutencao)}</span>` : ''}
        </div>`;
      }
    });
  },

  abrirFormInfra(reg) {
    const schema = [
      { key: 'nome', label: 'Nome', type: 'text', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: [{ value: 'Cerca', label: 'Cerca' }, { value: 'Aguada/Bebedouro', label: 'Aguada/Bebedouro' }, { value: 'Curral', label: 'Curral' }, { value: 'Galpão/Depósito', label: 'Galpão/Depósito' }, { value: 'Casa/Sede', label: 'Casa/Sede' }, { value: 'Estrada/Acesso', label: 'Estrada/Acesso' }, { value: 'Maquinário', label: 'Maquinário' }, { value: 'Outro', label: 'Outro' }] },
      { key: 'localizacao', label: 'Localização/referência', type: 'text' },
      { key: 'statusManutencao', label: 'Status', type: 'select', options: [{ value: 'Boa', label: 'Boa' }, { value: 'Atenção', label: 'Atenção' }, { value: 'Precisa de reparo', label: 'Precisa de reparo' }] },
      { key: 'ultimaManutencao', label: 'Última manutenção', type: 'date' },
      { key: 'proximaManutencao', label: 'Próxima manutenção prevista', type: 'date' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar benfeitoria' : 'Nova benfeitoria',
      schema,
      dados: reg || { statusManutencao: 'Boa' },
      onSalvar: (dados) => {
        if (reg) DB.update('infraestrutura', reg.id, dados);
        else DB.add('infraestrutura', dados);
        Utils.toast('Benfeitoria salva.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('infraestrutura', reg.id); Utils.toast('Benfeitoria excluída.'); App.refresh(); } : null
    });
  },

  /* ---------- CLIMA / CHUVA ---------- */
  renderClima(container) {
    const regs = DB.list('clima').sort((a, b) => b.data.localeCompare(a.data));
    const mesAtual = Utils.hoje().slice(0, 7);
    const totalMes = regs.filter(r => r.data.slice(0, 7) === mesAtual).reduce((s, r) => s + Number(r.chuvaMm || 0), 0);
    container.innerHTML = `
      <div class="summary-box">Chuva acumulada no mês: <b>${Utils.fmtNum(totalMes, 1)} mm</b></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoClima">+ Registrar dia</button></div>
      <div id="listaClima"></div>`;
    container.querySelector('#btnNovoClima').addEventListener('click', () => this.abrirFormClima(null));
    UI.renderList(container.querySelector('#listaClima'), {
      data: regs,
      emptyText: 'Nenhum registro de clima ainda.',
      onCardClick: (r) => this.abrirFormClima(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.fmtData(r.data)}</div>
        <div class="rec-row">
          <span>Chuva: ${Utils.fmtNum(r.chuvaMm, 1)} mm</span>
          ${r.tempMin || r.tempMax ? `<span>${r.tempMin || '-'}° / ${r.tempMax || '-'}°</span>` : ''}
        </div>`
    });
  },

  abrirFormClima(reg) {
    const schema = [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'chuvaMm', label: 'Chuva (mm)', type: 'number', step: '0.1' },
      { key: 'tempMin', label: 'Temperatura mínima (°C)', type: 'number', step: '0.1' },
      { key: 'tempMax', label: 'Temperatura máxima (°C)', type: 'number', step: '0.1' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar registro de clima' : 'Registrar dia',
      schema,
      dados: reg || { data: Utils.hoje() },
      onSalvar: (dados) => {
        if (reg) DB.update('clima', reg.id, dados);
        else DB.add('clima', dados);
        Utils.toast('Registro salvo.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('clima', reg.id); Utils.toast('Registro excluído.'); App.refresh(); } : null
    });
  }
};
