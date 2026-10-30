/* ===================== Módulo: Agricultura ===================== */
const Agricultura = {
  subtabs: [
    { key: 'talhoes', label: 'Áreas/Talhões' },
    { key: 'safras', label: 'Safras' },
    { key: 'tratos', label: 'Tratos/Insumos' },
    { key: 'estoque', label: 'Estoque' }
  ],

  render(container, sub) {
    sub = sub || 'talhoes';
    const map = {
      talhoes: () => this.renderTalhoes(container),
      safras: () => this.renderSafras(container),
      tratos: () => this.renderTratos(container),
      estoque: () => this.renderEstoque(container)
    };
    (map[sub] || map.talhoes)();
  },

  nomeTalhao(id) {
    const t = DB.get('areasAgricolas', id);
    return t ? t.nome : '(removido)';
  },

  /* ---------- TALHÕES ---------- */
  renderTalhoes(container) {
    const regs = DB.list('areasAgricolas').sort((a, b) => a.nome.localeCompare(b.nome));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoTalhao">+ Nova área/talhão</button></div>
      <div id="listaTalhoes"></div>`;
    container.querySelector('#btnNovoTalhao').addEventListener('click', () => this.abrirFormTalhao(null));
    UI.renderList(container.querySelector('#listaTalhoes'), {
      data: regs,
      emptyText: 'Nenhuma área agrícola cadastrada ainda.',
      onCardClick: (r) => this.abrirFormTalhao(r),
      renderCard: (r) => {
        const safraAtiva = DB.list('safras').find(s => s.talhaoId === r.id && s.status !== 'Colhido');
        return `
        <div class="rec-title">${Utils.escapeHtml(r.nome)}</div>
        <div class="rec-row">
          <span>${r.areaHa ? Utils.fmtNum(r.areaHa, 1) + ' ha' : '-'}</span>
          <span>${Utils.escapeHtml(r.tipoSolo || '-')}</span>
        </div>
        ${safraAtiva ? `<div class="rec-sub">${UI.badge('Em uso: ' + safraAtiva.cultura, 'green')}</div>` : `<div class="rec-sub">${UI.badge('Livre', 'blue')}</div>`}`;
      }
    });
  },

  abrirFormTalhao(reg) {
    const schema = [
      { key: 'nome', label: 'Nome da área/talhão', type: 'text', required: true },
      { key: 'areaHa', label: 'Área (ha)', type: 'number', step: '0.01' },
      { key: 'tipoSolo', label: 'Tipo de solo', type: 'text' },
      { key: 'localizacao', label: 'Localização/referência', type: 'text' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar área/talhão' : 'Nova área/talhão',
      schema,
      dados: reg || {},
      onSalvar: (dados) => {
        if (reg) DB.update('areasAgricolas', reg.id, dados);
        else DB.add('areasAgricolas', dados);
        Utils.toast('Área salva.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('areasAgricolas', reg.id); Utils.toast('Área excluída.'); App.refresh(); } : null
    });
  },

  /* ---------- SAFRAS ---------- */
  renderSafras(container) {
    const regs = DB.list('safras').sort((a, b) => (b.dataPlantio || '').localeCompare(a.dataPlantio || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaSafra">+ Novo plantio/safra</button></div>
      <div id="listaSafras"></div>`;
    container.querySelector('#btnNovaSafra').addEventListener('click', () => this.abrirFormSafra(null));
    const clsPorStatus = { Planejado: 'blue', Plantado: 'orange', 'Em desenvolvimento': 'green', Colhido: 'purple' };
    UI.renderList(container.querySelector('#listaSafras'), {
      data: regs,
      emptyText: 'Nenhuma safra cadastrada ainda.',
      onCardClick: (r) => this.abrirFormSafra(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.cultura)} ${r.variedade ? '(' + Utils.escapeHtml(r.variedade) + ')' : ''} ${UI.badge(r.status || 'Planejado', clsPorStatus[r.status] || 'blue')}</div>
        <div class="rec-sub">${Utils.escapeHtml(this.nomeTalhao(r.talhaoId))} · ${r.areaHa ? Utils.fmtNum(r.areaHa, 1) + ' ha' : '-'}</div>
        <div class="rec-row">
          <span>Plantio: ${Utils.fmtData(r.dataPlantio)}</span>
          <span>Colheita prev.: ${Utils.fmtData(r.previsaoColheita)}</span>
        </div>
        ${r.producaoColhida ? `<div class="rec-sub">Produzido: ${Utils.fmtNum(r.producaoColhida, 1)} ${Utils.escapeHtml(r.unidadeProducao || '')}</div>` : ''}`
    });
  },

  abrirFormSafra(reg) {
    const schema = [
      { key: 'talhaoId', label: 'Área/Talhão', type: 'select', required: true, optionsFrom: { col: 'areasAgricolas', labelFn: t => t.nome } },
      { key: 'cultura', label: 'Cultura', type: 'text', required: true, placeholder: 'Ex: Milho, Soja, Pastagem...' },
      { key: 'variedade', label: 'Variedade/Cultivar', type: 'text' },
      { key: 'areaHa', label: 'Área plantada (ha)', type: 'number', step: '0.01' },
      { key: 'dataPlantio', label: 'Data do plantio', type: 'date' },
      { key: 'previsaoColheita', label: 'Previsão de colheita', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Planejado', label: 'Planejado' }, { value: 'Plantado', label: 'Plantado' }, { value: 'Em desenvolvimento', label: 'Em desenvolvimento' }, { value: 'Colhido', label: 'Colhido' }] },
      { key: 'dataColheitaReal', label: 'Data real da colheita', type: 'date' },
      { key: 'producaoColhida', label: 'Produção colhida', type: 'number', step: '0.01' },
      { key: 'unidadeProducao', label: 'Unidade (sc, kg, ton, fardos...)', type: 'text' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar safra' : 'Novo plantio/safra',
      schema,
      dados: reg || { status: 'Planejado' },
      onSalvar: (dados) => {
        if (reg) DB.update('safras', reg.id, dados);
        else DB.add('safras', dados);
        Utils.toast('Safra salva.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('safras', reg.id); Utils.toast('Safra excluída.'); App.refresh(); } : null
    });
  },

  /* ---------- TRATOS CULTURAIS / INSUMOS APLICADOS ---------- */
  renderTratos(container) {
    const regs = DB.list('tratos').sort((a, b) => b.data.localeCompare(a.data));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoTrato">+ Novo trato/aplicação</button></div>
      <div id="listaTratos"></div>`;
    container.querySelector('#btnNovoTrato').addEventListener('click', () => this.abrirFormTrato(null));
    UI.renderList(container.querySelector('#listaTratos'), {
      data: regs,
      emptyText: 'Nenhum trato cultural ou aplicação registrada ainda.',
      onCardClick: (r) => this.abrirFormTrato(r),
      renderCard: (r) => {
        const safra = DB.get('safras', r.safraId);
        return `
        <div class="rec-title">${Utils.escapeHtml(r.tipo)} ${UI.badge(safra ? safra.cultura : '-', 'green')}</div>
        <div class="rec-sub">${Utils.escapeHtml(r.produto || '-')} ${r.quantidade ? '· ' + Utils.fmtNum(r.quantidade, 2) + ' ' + Utils.escapeHtml(r.unidade || '') : ''}</div>
        <div class="rec-row"><span>${Utils.fmtData(r.data)}</span>${r.custo ? `<span>${Utils.fmtMoeda(r.custo)}</span>` : ''}</div>`;
      }
    });
  },

  abrirFormTrato(reg) {
    const schema = [
      { key: 'safraId', label: 'Safra/Plantio', type: 'select', required: true, optionsFrom: { col: 'safras', labelFn: s => s.cultura + ' - ' + this.nomeTalhao(s.talhaoId) } },
      { key: 'tipo', label: 'Tipo de trato', type: 'select', required: true, options: [{ value: 'Adubação', label: 'Adubação' }, { value: 'Defensivo/Praga', label: 'Defensivo/Praga' }, { value: 'Irrigação', label: 'Irrigação' }, { value: 'Cultivo/Capina', label: 'Cultivo/Capina' }, { value: 'Calagem', label: 'Calagem' }, { value: 'Outro', label: 'Outro' }] },
      { key: 'produto', label: 'Produto utilizado', type: 'text' },
      { key: 'quantidade', label: 'Quantidade', type: 'number', step: '0.01' },
      { key: 'unidade', label: 'Unidade (kg, L, sc...)', type: 'text' },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'custo', label: 'Custo (R$)', type: 'number', step: '0.01' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar trato/aplicação' : 'Novo trato/aplicação',
      schema,
      dados: reg || { data: Utils.hoje() },
      onSalvar: (dados) => {
        if (reg) DB.update('tratos', reg.id, dados);
        else DB.add('tratos', dados);
        if (!reg && dados.custo) {
          DB.add('financeiro', { data: dados.data, tipo: 'Despesa', categoria: 'Insumo agrícola', descricao: dados.tipo + (dados.produto ? ' - ' + dados.produto : ''), valor: dados.custo });
        }
        Utils.toast('Trato salvo.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('tratos', reg.id); Utils.toast('Trato excluído.'); App.refresh(); } : null
    });
  },

  /* ---------- ESTOQUE DE INSUMOS ---------- */
  renderEstoque(container) {
    const regs = DB.list('insumos').sort((a, b) => a.nome.localeCompare(b.nome));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoInsumo">+ Novo insumo</button></div>
      <div id="listaInsumos"></div>`;
    container.querySelector('#btnNovoInsumo').addEventListener('click', () => this.abrirFormInsumo(null));
    UI.renderList(container.querySelector('#listaInsumos'), {
      data: regs,
      emptyText: 'Nenhum insumo em estoque cadastrado ainda.',
      onCardClick: (r) => this.abrirFormInsumo(r),
      renderCard: (r) => {
        const baixo = r.estoqueMinimo && Number(r.quantidade) <= Number(r.estoqueMinimo);
        return `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${UI.badge(r.categoria || '-', 'blue')} ${baixo ? UI.badge('Estoque baixo', 'red') : ''}</div>
        <div class="rec-row"><span>${Utils.fmtNum(r.quantidade, 2)} ${Utils.escapeHtml(r.unidade || '')}</span>${r.validade ? `<span>Val.: ${Utils.fmtData(r.validade)}</span>` : ''}</div>`;
      }
    });
  },

  abrirFormInsumo(reg) {
    const schema = [
      { key: 'nome', label: 'Nome do insumo', type: 'text', required: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: [{ value: 'Semente', label: 'Semente' }, { value: 'Fertilizante', label: 'Fertilizante' }, { value: 'Defensivo', label: 'Defensivo' }, { value: 'Ração', label: 'Ração' }, { value: 'Medicamento veterinário', label: 'Medicamento veterinário' }, { value: 'Combustível', label: 'Combustível' }, { value: 'Outro', label: 'Outro' }] },
      { key: 'quantidade', label: 'Quantidade em estoque', type: 'number', step: '0.01' },
      { key: 'unidade', label: 'Unidade (kg, L, sc, un...)', type: 'text' },
      { key: 'estoqueMinimo', label: 'Estoque mínimo (alerta)', type: 'number', step: '0.01' },
      { key: 'custoUnitario', label: 'Custo unitário (R$)', type: 'number', step: '0.01' },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar insumo' : 'Novo insumo em estoque',
      schema,
      dados: reg || {},
      onSalvar: (dados) => {
        if (reg) DB.update('insumos', reg.id, dados);
        else DB.add('insumos', dados);
        Utils.toast('Insumo salvo.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('insumos', reg.id); Utils.toast('Insumo excluído.'); App.refresh(); } : null
    });
  }
};
