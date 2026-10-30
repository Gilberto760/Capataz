/* ===================== Módulo: Financeiro ===================== */
const Financeiro = {
  subtabs: [
    { key: 'lancamentos', label: 'Lançamentos' },
    { key: 'relatorio', label: 'Relatório' }
  ],

  categoriasReceita: ['Venda de animal', 'Venda de produção agrícola', 'Venda de leite', 'Arrendamento', 'Outro'],
  categoriasDespesa: ['Compra de animal', 'Insumo agrícola', 'Insumo pecuário', 'Ração', 'Manutenção', 'Combustível', 'Salário/Mão de obra', 'Impostos/Taxas', 'Veterinário', 'Outro'],

  render(container, sub) {
    sub = sub || 'lancamentos';
    const map = {
      lancamentos: () => this.renderLancamentos(container),
      relatorio: () => this.renderRelatorio(container)
    };
    (map[sub] || map.lancamentos)();
  },

  renderLancamentos(container) {
    const regs = DB.list('financeiro').sort((a, b) => b.data.localeCompare(a.data));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoLanc">+ Novo lançamento</button></div>
      <div class="filter-chips" id="filtroLanc">
        <button class="chip active" data-f="todos">Todos</button>
        <button class="chip" data-f="Receita">Receitas</button>
        <button class="chip" data-f="Despesa">Despesas</button>
      </div>
      <div id="listaLanc"></div>`;
    container.querySelector('#btnNovoLanc').addEventListener('click', () => this.abrirForm(null));

    let filtro = 'todos';
    const desenhar = () => {
      const lista = filtro === 'todos' ? regs : regs.filter(r => r.tipo === filtro);
      UI.renderList(container.querySelector('#listaLanc'), {
        data: lista,
        emptyText: 'Nenhum lançamento financeiro ainda.',
        onCardClick: (r) => this.abrirForm(r),
        renderCard: (r) => `
          <div class="rec-title">${Utils.escapeHtml(r.categoria || r.tipo)} ${UI.badge(r.tipo, r.tipo === 'Receita' ? 'green' : 'red')}</div>
          <div class="rec-sub">${Utils.escapeHtml(r.descricao || '')}</div>
          <div class="rec-row"><span>${Utils.fmtData(r.data)}</span><span>${Utils.fmtMoeda(r.valor)}</span></div>`
      });
    };
    container.querySelectorAll('#filtroLanc .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroLanc .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filtro = chip.dataset.f;
        desenhar();
      });
    });
    desenhar();
  },

  abrirForm(reg) {
    const tipoAtual = (reg && reg.tipo) || 'Despesa';
    const cats = (tipoAtual === 'Receita' ? this.categoriasReceita : this.categoriasDespesa).map(c => ({ value: c, label: c }));
    const schema = [
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ value: 'Receita', label: 'Receita' }, { value: 'Despesa', label: 'Despesa' }] },
      { key: 'categoria', label: 'Categoria', type: 'select', options: cats },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'descricao', label: 'Descrição', type: 'text' },
      { key: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
      { key: 'formaPagamento', label: 'Forma de pagamento', type: 'text' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar lançamento' : 'Novo lançamento financeiro',
      schema,
      dados: reg || { data: Utils.hoje(), tipo: 'Despesa' },
      onSalvar: (dados) => {
        if (reg) DB.update('financeiro', reg.id, dados);
        else DB.add('financeiro', dados);
        Utils.toast('Lançamento salvo.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('financeiro', reg.id); Utils.toast('Lançamento excluído.'); App.refresh(); } : null
    });
  },

  renderRelatorio(container) {
    const regs = DB.list('financeiro');
    const mesAtual = Utils.hoje().slice(0, 7);
    const doMes = regs.filter(r => r.data && r.data.slice(0, 7) === mesAtual);
    const receitasMes = doMes.filter(r => r.tipo === 'Receita').reduce((s, r) => s + Number(r.valor || 0), 0);
    const despesasMes = doMes.filter(r => r.tipo === 'Despesa').reduce((s, r) => s + Number(r.valor || 0), 0);

    const receitasAno = regs.filter(r => r.tipo === 'Receita' && r.data && r.data.slice(0, 4) === mesAtual.slice(0, 4)).reduce((s, r) => s + Number(r.valor || 0), 0);
    const despesasAno = regs.filter(r => r.tipo === 'Despesa' && r.data && r.data.slice(0, 4) === mesAtual.slice(0, 4)).reduce((s, r) => s + Number(r.valor || 0), 0);

    const porCategoria = {};
    regs.filter(r => r.tipo === 'Despesa').forEach(r => {
      const c = r.categoria || 'Outro';
      porCategoria[c] = (porCategoria[c] || 0) + Number(r.valor || 0);
    });
    const catsOrdenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    const maxCat = catsOrdenadas.length ? catsOrdenadas[0][1] : 1;

    container.innerHTML = `
      <div class="cards-grid">
        <div class="stat-card"><div class="stat-label">Receitas do mês</div><div class="stat-value green">${Utils.fmtMoeda(receitasMes)}</div></div>
        <div class="stat-card"><div class="stat-label">Despesas do mês</div><div class="stat-value red">${Utils.fmtMoeda(despesasMes)}</div></div>
        <div class="stat-card"><div class="stat-label">Saldo do mês</div><div class="stat-value ${receitasMes - despesasMes >= 0 ? 'green' : 'red'}">${Utils.fmtMoeda(receitasMes - despesasMes)}</div></div>
        <div class="stat-card"><div class="stat-label">Saldo do ano</div><div class="stat-value ${receitasAno - despesasAno >= 0 ? 'green' : 'red'}">${Utils.fmtMoeda(receitasAno - despesasAno)}</div></div>
      </div>
      <h3 class="section-title">Despesas por categoria (total)</h3>
      <div class="bar-chart">
        ${catsOrdenadas.map(([cat, val]) => `
          <div class="bar-row">
            <div class="bar-label">${Utils.escapeHtml(cat)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(val / maxCat * 100).toFixed(1)}%"></div></div>
            <div class="bar-value">${Utils.fmtMoeda(val)}</div>
          </div>`).join('') || '<div class="empty-state">Sem despesas registradas ainda.</div>'}
      </div>
      <div class="toolbar"><div></div><button class="btn btn-ghost" id="btnExportarFinCsv">Exportar CSV</button></div>
    `;

    container.querySelector('#btnExportarFinCsv').addEventListener('click', () => {
      const csv = Utils.csvDe(regs, [
        { label: 'Data', value: 'data' },
        { label: 'Tipo', value: 'tipo' },
        { label: 'Categoria', value: 'categoria' },
        { label: 'Descrição', value: 'descricao' },
        { label: 'Valor', value: 'valor' }
      ]);
      Utils.downloadArquivo('financeiro.csv', csv, 'text/csv');
    });
  }
};
