/* ===================== Módulo: Relatórios Gerenciais ===================== */
const Relatorios = {
  subtabs: [
    { key: 'rebanho', label: 'Rebanho' },
    { key: 'compras', label: 'Compras' }
  ],

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">Conecte o app ao banco de dados primeiro.</div>`;
      return;
    }
    sub = sub || 'rebanho';
    const map = {
      rebanho: () => this.renderRebanho(container),
      compras: () => this.renderCompras(container)
    };
    (map[sub] || map.rebanho)();
  },

  /* ---------- Utilidades de agregação ---------- */
  ultimosMeses(n) {
    const meses = [];
    const hoje = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(d.toISOString().slice(0, 7));
    }
    return meses;
  },
  labelMes(iso) {
    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const [y, m] = iso.split('-');
    return nomes[Number(m) - 1] + '/' + y.slice(2);
  },
  barChart(titulo, entries, fmt) {
    const max = entries.length ? Math.max(...entries.map(e => Number(e[1]) || 0), 1) : 1;
    return `
      <h3 class="section-title">${Utils.escapeHtml(titulo)}</h3>
      <div class="bar-chart">
        ${entries.length ? entries.map(([label, val]) => `
          <div class="bar-row">
            <div class="bar-label">${Utils.escapeHtml(label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(Number(val) / max * 100).toFixed(1)}%"></div></div>
            <div class="bar-value">${fmt ? fmt(val) : val}</div>
          </div>`).join('') : '<div class="empty-state">Sem dados ainda.</div>'}
      </div>`;
  },

  /* ---------- Relatório: Rebanho ---------- */
  renderRebanho(container) {
    const animais = Api.list('animais');
    const ativos = animais.filter(a => (a.situacao || 'Ativo') === 'Ativo');
    const partos = Api.list('partos');
    const movs = Api.list('mov_rebanho');

    const hoje = Utils.hoje();
    const ha12m = Utils.somarDias(hoje, -365);

    const nascimentos12m = partos.filter(p => p.data_parto && p.data_parto >= ha12m);
    const mortes12m = movs.filter(m => m.tipo === 'Saída' && ['Morte', 'Abate'].includes(m.motivo) && m.data >= ha12m);
    const vendas12m = movs.filter(m => m.tipo === 'Saída' && m.motivo === 'Venda' && m.data >= ha12m);

    const femeasBovinas = animais.filter(a => a.especie === 'Bovina' && a.sexo === 'F').length;
    const taxaNatalidade = femeasBovinas ? (nascimentos12m.length / femeasBovinas * 100) : 0;

    const intervalos = Rebanho.intervalosPartos();
    const iepValores = Object.values(intervalos);
    const iepMedioDias = iepValores.length ? Math.round(iepValores.reduce((s, d) => s + d, 0) / iepValores.length) : null;

    const porCategoriaBovina = {};
    ativos.filter(a => a.especie === 'Bovina').forEach(a => {
      const c = a.categoria || 'Sem categoria';
      porCategoriaBovina[c] = (porCategoriaBovina[c] || 0) + 1;
    });

    const porEspecie = {};
    ativos.forEach(a => { const e = a.especie || 'Sem espécie'; porEspecie[e] = (porEspecie[e] || 0) + 1; });

    const porFazenda = {};
    ativos.forEach(a => { const f = a.fazenda || 'Sem fazenda'; porFazenda[f] = (porFazenda[f] || 0) + 1; });

    const meses = this.ultimosMeses(12);
    const nascPorMes = {};
    meses.forEach(m => nascPorMes[m] = 0);
    partos.forEach(p => {
      const m = (p.data_parto || '').slice(0, 7);
      if (m in nascPorMes) nascPorMes[m]++;
    });

    const motivosSaida = {};
    movs.filter(m => m.tipo === 'Saída' && m.data >= ha12m).forEach(m => {
      const mo = m.motivo || 'Outro';
      motivosSaida[mo] = (motivosSaida[mo] || 0) + 1;
    });

    container.innerHTML = `
      <div class="cards-grid">
        <div class="stat-card"><div class="stat-label">Rebanho ativo</div><div class="stat-value">${ativos.length}</div></div>
        <div class="stat-card"><div class="stat-label">Nascimentos (12 meses)</div><div class="stat-value green">${nascimentos12m.length}</div></div>
        <div class="stat-card"><div class="stat-label">Mortes/Abates (12 meses)</div><div class="stat-value red">${mortes12m.length}</div></div>
        <div class="stat-card"><div class="stat-label">Vendas (12 meses)</div><div class="stat-value">${vendas12m.length}</div></div>
        <div class="stat-card"><div class="stat-label">Taxa de natalidade (12m)</div><div class="stat-value">${Utils.fmtNum(taxaNatalidade, 1)}%</div></div>
        <div class="stat-card"><div class="stat-label">IEP médio do rebanho</div><div class="stat-value">${iepMedioDias !== null ? (iepMedioDias / 30).toFixed(1) + ' meses' : '-'}</div></div>
      </div>

      ${this.barChart('Rebanho por espécie', Object.entries(porEspecie).sort((a, b) => b[1] - a[1]))}
      ${Object.keys(porCategoriaBovina).length ? this.barChart('Bovinos por categoria', Object.entries(porCategoriaBovina).sort((a, b) => b[1] - a[1])) : ''}
      ${this.barChart('Rebanho por fazenda', Object.entries(porFazenda).sort((a, b) => b[1] - a[1]))}
      ${this.barChart('Nascimentos por mês (últimos 12 meses)', meses.map(m => [this.labelMes(m), nascPorMes[m]]))}
      ${Object.keys(motivosSaida).length ? this.barChart('Saídas do rebanho por motivo (12 meses)', Object.entries(motivosSaida).sort((a, b) => b[1] - a[1])) : ''}

      <div class="toolbar"><div></div><button class="btn btn-ghost" id="btnExportarRebanhoCsv">Exportar rebanho (CSV)</button></div>
    `;

    container.querySelector('#btnExportarRebanhoCsv').addEventListener('click', () => {
      const csv = Utils.csvDe(animais, [
        { label: 'Nome/Brinco', value: 'nome' },
        { label: 'Espécie', value: 'especie' },
        { label: 'Categoria', value: 'categoria' },
        { label: 'Sexo', value: 'sexo' },
        { label: 'Situação', value: r => r.situacao || 'Ativo' },
        { label: 'Fazenda', value: 'fazenda' },
        { label: 'Nascimento', value: 'nascimento' }
      ]);
      Utils.downloadArquivo('relatorio_rebanho.csv', csv, 'text/csv');
    });
  },

  /* ---------- Relatório: Compras ---------- */
  renderCompras(container) {
    const compras = Api.list('compras');
    const itens = Api.list('itens_compra');
    const produtos = Api.list('produtos');
    const fornecedores = Api.list('fornecedores');
    const produtoById = {}; produtos.forEach(p => produtoById[p.id] = p);
    const fornecedorById = {}; fornecedores.forEach(f => fornecedorById[f.id] = f);

    const anos = Array.from(new Set(compras.map(c => (c.data || '').slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));

    container.innerHTML = `
      <div class="filter-chips" id="filtroAnoRelComp">
        <button class="chip active" data-ano="todos">Todos os anos</button>
        ${anos.map(a => `<button class="chip" data-ano="${a}">${a}</button>`).join('')}
      </div>
      <div id="corpoRelComp"></div>`;

    let anoAtivo = 'todos';
    const corpo = container.querySelector('#corpoRelComp');

    const desenhar = () => {
      const comprasFiltradas = anoAtivo === 'todos' ? compras : compras.filter(c => (c.data || '').slice(0, 4) === anoAtivo);
      const idsFiltrados = new Set(comprasFiltradas.map(c => c.id));
      const itensFiltrados = itens.filter(i => idsFiltrados.has(i.compra_id));

      const totalPeriodo = comprasFiltradas.reduce((s, c) => s + Number(c.valor_total || 0), 0);
      const ticketMedio = comprasFiltradas.length ? totalPeriodo / comprasFiltradas.length : 0;
      const fornecedoresUsados = new Set(comprasFiltradas.map(c => c.fornecedor_id).filter(Boolean)).size;

      const porAno = {};
      compras.forEach(c => { const a = (c.data || '').slice(0, 4) || 'Sem data'; porAno[a] = (porAno[a] || 0) + Number(c.valor_total || 0); });
      const anosOrdenadosAsc = Object.keys(porAno).sort();

      const porCentro = {};
      comprasFiltradas.forEach(c => { const f = c.fazenda || 'Sem centro de custo'; porCentro[f] = (porCentro[f] || 0) + Number(c.valor_total || 0); });

      const porFornecedor = {};
      comprasFiltradas.forEach(c => {
        const nome = (fornecedorById[c.fornecedor_id] && fornecedorById[c.fornecedor_id].nome) || '(sem fornecedor)';
        porFornecedor[nome] = (porFornecedor[nome] || 0) + Number(c.valor_total || 0);
      });
      const topFornecedores = Object.entries(porFornecedor).sort((a, b) => b[1] - a[1]).slice(0, 10);

      const porProdutoValor = {};
      const porProdutoQtd = {};
      itensFiltrados.forEach(i => {
        const nome = (produtoById[i.produto_id] && produtoById[i.produto_id].nome) || '(sem produto)';
        const valor = Number(i.quantidade || 0) * Number(i.valor_unitario || 0);
        porProdutoValor[nome] = (porProdutoValor[nome] || 0) + valor;
        porProdutoQtd[nome] = (porProdutoQtd[nome] || 0) + Number(i.quantidade || 0);
      });
      const topProdutosValor = Object.entries(porProdutoValor).sort((a, b) => b[1] - a[1]).slice(0, 10);

      const porCategoria = {};
      itensFiltrados.forEach(i => {
        const p = produtoById[i.produto_id];
        const cat = (p && p.categoria) || 'Sem categoria';
        const valor = Number(i.quantidade || 0) * Number(i.valor_unitario || 0);
        porCategoria[cat] = (porCategoria[cat] || 0) + valor;
      });
      const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

      corpo.innerHTML = `
        <div class="cards-grid">
          <div class="stat-card"><div class="stat-label">Total comprado (${anoAtivo === 'todos' ? 'todos os anos' : anoAtivo})</div><div class="stat-value">${Utils.fmtMoeda(totalPeriodo)}</div></div>
          <div class="stat-card"><div class="stat-label">Nº de compras</div><div class="stat-value">${comprasFiltradas.length}</div></div>
          <div class="stat-card"><div class="stat-label">Ticket médio por compra</div><div class="stat-value">${Utils.fmtMoeda(ticketMedio)}</div></div>
          <div class="stat-card"><div class="stat-label">Fornecedores no período</div><div class="stat-value">${fornecedoresUsados}</div></div>
        </div>

        ${anosOrdenadosAsc.length > 1 ? this.barChart('Gasto por ano', anosOrdenadosAsc.map(a => [a, porAno[a]]), Utils.fmtMoeda) : ''}
        ${this.barChart('Gasto por centro de custo', Object.entries(porCentro).sort((a, b) => b[1] - a[1]), Utils.fmtMoeda)}
        ${this.barChart('Top 10 fornecedores (valor comprado)', topFornecedores, Utils.fmtMoeda)}
        ${this.barChart('Top 10 produtos (valor comprado)', topProdutosValor, Utils.fmtMoeda)}
        ${topCategorias.length ? this.barChart('Gasto por categoria de produto', topCategorias, Utils.fmtMoeda) : ''}

        <div class="toolbar"><div></div><button class="btn btn-ghost" id="btnExportarComprasCsv">Exportar compras do período (CSV)</button></div>
      `;

      corpo.querySelector('#btnExportarComprasCsv').addEventListener('click', () => {
        const csv = Utils.csvDe(comprasFiltradas, [
          { label: 'Data', value: 'data' },
          { label: 'Fornecedor', value: r => (fornecedorById[r.fornecedor_id] && fornecedorById[r.fornecedor_id].nome) || '' },
          { label: 'Centro de custo', value: 'fazenda' },
          { label: 'Tipo', value: 'tipo' },
          { label: 'NF', value: 'nf' },
          { label: 'Valor total', value: 'valor_total' }
        ]);
        Utils.downloadArquivo(`relatorio_compras_${anoAtivo}.csv`, csv, 'text/csv');
      });
    };

    container.querySelectorAll('#filtroAnoRelComp .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroAnoRelComp .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        anoAtivo = chip.dataset.ano;
        desenhar();
      });
    });

    desenhar();
  }
};
