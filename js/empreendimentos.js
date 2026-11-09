/* ===================== Módulo: Atividades (empreendimentos da propriedade) =====================
   "Atividade" aqui é um empreendimento/ciclo — ex: "Soja Safra 2025/2026", "Pecuária de Corte" —
   com etapas livres (ex: Preparo do solo, Plantio, Colheita) e custos/receitas lançados dentro
   dele. Cada custo/receita CRIA de verdade um lançamento em Despesas/Produção (Financeiro), só
   que já marcado com a atividade e a etapa — assim o Financeiro continua sendo o lugar único
   onde todo dinheiro aparece, e aqui dá pra ver o resultado (receita - custo) de cada atividade.
   Não confundir com "Lista de Afazeres" (o checklist do dia a dia, módulo separado) — "Tarefa"
   aqui é o cadastro de tipos de trabalho (ver Cadastros > Atividades), usado tanto em "Lançar
   custo" quanto, dentro de cada etapa, pra marcar o que precisa ser feito, em que período e
   por quem. */
const Empreendimentos = {
  subtabs: [
    { key: 'lista', label: 'Atividades' }
  ],

  tiposAtividade: ['Agricultura', 'Pecuária de Corte', 'Pecuária de Leite', 'Outro'],
  situacoesEtapa: ['Pendente', 'Em andamento', 'Concluída'],

  _abertoId: null,
  _etapasAbertas: new Set(),

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">Conecte o app ao banco de dados primeiro.</div>`;
      return;
    }
    if (this._abertoId) this.renderDetalhe(container, this._abertoId);
    else this.renderLista(container);
  },

  fazendasConhecidas() {
    return Rebanho.fazendasConhecidas();
  },

  // Custos "Planejado" (de uma planilha de custeio importada, ainda não conferidos) e
  // "Cancelado" ficam fora da conta — só contam depois que o usuário confirma que foi feito.
  custosDe(empreendimentoId) {
    return Api.list('despesas').filter(d => d.empreendimento_id === empreendimentoId && d.status !== 'Planejado' && d.status !== 'Cancelado');
  },
  custosPlanejadosDe(empreendimentoId) {
    return Api.list('despesas').filter(d => d.empreendimento_id === empreendimentoId && d.status === 'Planejado');
  },
  // Compras (fornecedor + itens) lançadas de dentro da atividade — ex: aquisição de animais,
  // insumos com nota fiscal. Contam no custo total igual a uma Despesa.
  comprasDe(empreendimentoId) {
    return Api.list('compras').filter(c => c.empreendimento_id === empreendimentoId);
  },
  receitasDe(empreendimentoId) {
    return Api.list('producao').filter(p => p.empreendimento_id === empreendimentoId);
  },
  totaisDe(empreendimentoId) {
    const custoDespesas = this.custosDe(empreendimentoId).reduce((s, d) => s + Number(d.valor || 0), 0);
    const custoCompras = this.comprasDe(empreendimentoId).reduce((s, c) => s + Number(c.valor_total || 0), 0);
    const custo = custoDespesas + custoCompras;
    const receita = this.receitasDe(empreendimentoId).reduce((s, p) => s + Number(p.valor_total || 0), 0);
    const planejado = this.custosPlanejadosDe(empreendimentoId).reduce((s, d) => s + Number(d.valor || 0), 0);
    return { custo, receita, lucro: receita - custo, planejado };
  },

  /* ---------- LISTA ---------- */
  renderLista(container) {
    const regs = Api.list('empreendimentos').sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaAtividade">+ Nova atividade</button></div>
      <div id="listaAtividadesProp"></div>`;
    container.querySelector('#btnNovaAtividade').addEventListener('click', () => this.abrirFormEmpreendimento(null));

    const clsStatus = { 'Em andamento': 'blue', 'Concluída': 'green' };
    UI.renderList(container.querySelector('#listaAtividadesProp'), {
      data: regs,
      emptyText: 'Nenhuma atividade cadastrada ainda.',
      onCardClick: (r) => { this._abertoId = r.id; App.refresh(); },
      renderCard: (r) => {
        const { custo, receita, lucro } = this.totaisDe(r.id);
        return `
          <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r.tipo ? UI.badge(r.tipo, 'purple') : ''} ${UI.badge(r.status || 'Em andamento', clsStatus[r.status] || 'blue')} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
          <div class="rec-sub">${Utils.escapeHtml(r.fazenda || '-')}${r.area_ha ? ' · ' + Utils.fmtNum(r.area_ha, 2) + ' ha' : ''}</div>
          <div class="rec-row">
            <span>Custo: ${Utils.fmtMoeda(custo)}</span>
            <span>Receita: ${Utils.fmtMoeda(receita)}</span>
            <span><b style="color:${lucro >= 0 ? 'var(--green-700)' : 'var(--red-700, #c0392b)'}">${Utils.fmtMoeda(lucro)}</b></span>
          </div>`;
      }
    });
  },

  abrirFormEmpreendimento(reg) {
    const schema = [
      { key: 'nome', label: 'Nome da atividade', type: 'text', required: true, placeholder: 'Ex: Soja Safra 2025/2026' },
      { key: 'tipo', label: 'Tipo', type: 'text', suggestions: this.tiposAtividade },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'area_ha', label: 'Área da atividade (ha)', type: 'number', step: '0.01' },
      { key: 'data_inicio', label: 'Data de início', type: 'date' },
      { key: 'data_fim', label: 'Data de fim (se já encerrou)', type: 'date' },
      { key: 'status', label: 'Situação', type: 'select', options: [{ value: 'Em andamento', label: 'Em andamento' }, { value: 'Concluída', label: 'Concluída' }] },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar atividade' : 'Nova atividade',
      schema,
      dados: reg || { data_inicio: Utils.hoje(), status: 'Em andamento' },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('empreendimentos', reg.id, dados);
        else await Api.criar('empreendimentos', dados);
        Utils.toast('Atividade salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const temLancamento = this.custosDe(reg.id).length || this.receitasDe(reg.id).length || Api.list('empreendimento_etapas').some(e => e.empreendimento_id === reg.id);
        if (temLancamento && !Utils.confirmar('Essa atividade tem etapas e/ou lançamentos financeiros ligados a ela. Excluir mesmo assim? (as etapas somem junto; os lançamentos em Despesas/Produção continuam existindo, só perdem o vínculo)')) return;
        await Api.excluir('empreendimentos', reg.id);
        Utils.toast('Atividade excluída.');
        this._abertoId = null;
        App.refresh();
      } : null
    });
  },

  /* ---------- DETALHE (etapas + custos + receitas de uma atividade) ---------- */
  renderDetalhe(container, id) {
    const emp = Api.get('empreendimentos', id);
    if (!emp) { this._abertoId = null; this.renderLista(container); return; }

    const etapas = Api.list('empreendimento_etapas').filter(e => e.empreendimento_id === id).sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));
    const custos = this.custosDe(id).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const receitas = this.receitasDe(id).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const planejados = this.custosPlanejadosDe(id).sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));
    const { custo, receita, lucro, planejado } = this.totaisDe(id);

    container.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-ghost" id="btnVoltarAtividade">← Voltar</button>
        <button class="btn btn-secondary" id="btnEditarAtividade">✏️ Editar</button>
      </div>
      <h2 style="margin:4px 0 0;">${Utils.escapeHtml(emp.nome)}</h2>
      <div class="rec-sub">${emp.tipo ? Utils.escapeHtml(emp.tipo) + ' · ' : ''}${Utils.escapeHtml(emp.fazenda || '-')}${emp.area_ha ? ' · ' + Utils.fmtNum(emp.area_ha, 2) + ' ha' : ''} · ${Utils.escapeHtml(emp.status || 'Em andamento')}</div>

      <div class="summary-box" style="margin-top:12px;">
        Custo total: <b>${Utils.fmtMoeda(custo)}</b> · Receita total: <b>${Utils.fmtMoeda(receita)}</b> ·
        Resultado: <b style="color:${lucro >= 0 ? 'var(--green-700)' : 'var(--red-700, #c0392b)'}">${Utils.fmtMoeda(lucro)}</b>
        ${planejado ? ` · Planejado (aguardando conferência): <b>${Utils.fmtMoeda(planejado)}</b>` : ''}
      </div>

      <h3 class="section-title">Etapas</h3>
      <div class="toolbar"><div></div><button class="btn btn-secondary" id="btnNovaEtapa">+ Nova etapa</button></div>
      <div id="listaEtapas"></div>

      <h3 class="section-title">Planilha de custeio</h3>
      <div class="form-card">
        <p class="hint">Baixe o modelo, preencha com os custos planejados da atividade (etapa, tarefa, insumo, quantidade, valor) e importe de volta. Cada linha vira um custo "Planejado" — confira e confirme abaixo antes de contar no Financeiro.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="btnModeloCusteio">⬇ Baixar modelo (.csv)</button>
          <button class="btn btn-secondary" id="btnImportarCusteio">📥 Importar planilha preenchida</button>
          <input type="file" id="inputImportarCusteio" accept=".csv" style="display:none;"/>
        </div>
      </div>

      ${planejados.length ? `
      <h3 class="section-title">Custos planejados aguardando conferência (${planejados.length})</h3>
      <div id="listaPlanejados"></div>` : ''}

      <h3 class="section-title">Custos e receitas</h3>
      <div class="toolbar">
        <div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="btnNovaDespesa">+ Despesa</button>
          <button class="btn btn-secondary" id="btnNovaCompra">+ Compra</button>
          <button class="btn btn-primary" id="btnNovaReceita">+ Lançar receita</button>
        </div>
      </div>
      <div id="listaLancamentos"></div>
    `;

    // "Despesa" é um custo solto (sem fornecedor/NF). "Compra" usa o formulário de Compras de
    // sempre (fornecedor, NF, itens) — pra coisas como aquisição de animais ou insumos com nota
    // fiscal, que fazem mais sentido lá do que numa despesa genérica.
    const vinculoCompra = () => ({ empreendimentoId: emp.id, etapaId: null, etapas, fazenda: emp.fazenda });

    container.querySelector('#btnVoltarAtividade').addEventListener('click', () => { this._abertoId = null; App.refresh(); });
    container.querySelector('#btnEditarAtividade').addEventListener('click', () => this.abrirFormEmpreendimento(emp));
    container.querySelector('#btnNovaEtapa').addEventListener('click', () => this.abrirFormEtapa(emp, null));
    container.querySelector('#btnNovaDespesa').addEventListener('click', () => this.abrirFormCusto(emp, null, null));
    container.querySelector('#btnNovaCompra').addEventListener('click', () => Compras.abrirFormCompra(null, { vinculo: vinculoCompra() }));
    container.querySelector('#btnNovaReceita').addEventListener('click', () => this.abrirFormReceita(emp, null, null));
    container.querySelector('#btnModeloCusteio').addEventListener('click', () => this.baixarModeloCusteio());
    const inputImportar = container.querySelector('#inputImportarCusteio');
    container.querySelector('#btnImportarCusteio').addEventListener('click', () => inputImportar.click());
    inputImportar.addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      await this.importarPlanilhaCusteio(emp, arquivo);
      inputImportar.value = '';
    });

    const clsSituacao = { 'Pendente': 'orange', 'Em andamento': 'blue', 'Concluída': 'green' };
    this.renderEtapas(container.querySelector('#listaEtapas'), emp, etapas, clsSituacao);

    if (planejados.length) {
      UI.renderList(container.querySelector('#listaPlanejados'), {
        data: planejados,
        renderCard: (d) => `
          <div class="rec-title">🟡 ${Utils.escapeHtml(d.categoria || 'Custo')} ${d._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
          <div class="rec-sub">${this._nomeEtapa(etapas, d.etapa_id) || '-'}${d.descricao ? ' · ' + Utils.escapeHtml(d.descricao) : ''}</div>
          <div class="rec-row">
            <span>${d.data ? Utils.fmtData(d.data) : '-'}</span>
            <span><b>${Utils.fmtMoeda(d.valor)}</b></span>
          </div>
          <div class="rec-row" data-stop style="margin-top:6px;gap:8px;">
            <button type="button" class="btn btn-secondary" data-ver-custo="${d.id}" style="padding:4px 10px;">Ver / corrigir</button>
            <button type="button" class="btn btn-primary" data-confirmar-custo="${d.id}" style="padding:4px 10px;">✅ Feito</button>
            <button type="button" class="btn btn-ghost" data-cancelar-custo="${d.id}" style="padding:4px 10px;">❌ Não realizado</button>
          </div>`
      });
      container.querySelectorAll('[data-ver-custo]').forEach(btn => {
        btn.addEventListener('click', () => this.abrirFormCusto(emp, this._etapaDoLancamento(etapas, { etapa_id: Api.get('despesas', btn.dataset.verCusto).etapa_id }), Api.get('despesas', btn.dataset.verCusto)));
      });
      container.querySelectorAll('[data-confirmar-custo]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await Api.atualizar('despesas', btn.dataset.confirmarCusto, { status: 'Executado' });
          Utils.toast('Custo confirmado.');
          App.refresh();
        });
      });
      container.querySelectorAll('[data-cancelar-custo]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!Utils.confirmar('Marcar esse custo planejado como não realizado? Ele sai da conta do Financeiro.')) return;
          await Api.atualizar('despesas', btn.dataset.cancelarCusto, { status: 'Cancelado' });
          Utils.toast('Marcado como não realizado.');
          App.refresh();
        });
      });
    }

    const compras = this.comprasDe(id).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const lancamentos = [
      ...custos.map(c => Object.assign({ _tipo: 'custo' }, c)),
      ...compras.map(c => Object.assign({ _tipo: 'compra' }, c)),
      ...receitas.map(r => Object.assign({ _tipo: 'receita' }, r))
    ].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    UI.renderList(container.querySelector('#listaLancamentos'), {
      data: lancamentos,
      emptyText: 'Nenhum custo ou receita lançado ainda.',
      onCardClick: (l) => {
        if (l._tipo === 'custo') this.abrirFormCusto(emp, this._etapaDoLancamento(etapas, l), l);
        else if (l._tipo === 'compra') Compras.abrirFormCompra(l, { vinculo: vinculoCompra() });
        else this.abrirFormReceita(emp, this._etapaDoLancamento(etapas, l), l);
      },
      renderCard: (l) => {
        const icone = l._tipo === 'receita' ? '🟢' : (l._tipo === 'compra' ? '🛒' : '🔴');
        const titulo = l._tipo === 'receita' ? (l.destinatario || 'Receita') : (l._tipo === 'compra' ? (l.fornecedor_id ? this.nomeFornecedorCompra(l.fornecedor_id) : 'Compra') : (l.categoria || 'Custo'));
        const valor = l._tipo === 'receita' ? l.valor_total : (l._tipo === 'compra' ? l.valor_total : l.valor);
        return `
          <div class="rec-title">${icone} ${Utils.escapeHtml(titulo)} ${l._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
          <div class="rec-sub">${this._nomeEtapa(etapas, l.etapa_id) || '-'}</div>
          <div class="rec-row">
            <span>${l.data ? Utils.fmtData(l.data) : '-'}</span>
            <span><b>${Utils.fmtMoeda(valor)}</b></span>
          </div>`;
      }
    });
  },

  nomeFornecedorCompra(id) {
    return Compras.nomeFornecedor(id);
  },

  // Cada etapa é expansível — clicar nela abre/fecha a lista de tarefas lançadas ali dentro
  // (tipo de tarefa + período + responsável). O botão de editar fica separado (ícone ✏️) pra
  // não abrir o form de edição sem querer ao só expandir pra ver as tarefas.
  renderEtapas(raiz, emp, etapas, clsSituacao) {
    const clsSituacaoTarefa = { 'Pendente': 'orange', 'Em andamento': 'blue', 'Concluída': 'green' };
    const tarefasConhecidas = () => Cadastros.tarefasConhecidas();
    const nomeTarefa = (id) => { const t = Api.get('tarefas', id); return t ? t.nome : '(não definida)'; };
    const nomeResponsavel = (id) => { if (!id) return null; const f = Api.get('funcionarios', id); return f ? f.nome : null; };
    const periodo = (t) => {
      if (t.data_inicio && t.data_fim) return `${Utils.fmtData(t.data_inicio)} a ${Utils.fmtData(t.data_fim)}`;
      if (t.data_inicio) return 'A partir de ' + Utils.fmtData(t.data_inicio);
      if (t.data_fim) return 'Até ' + Utils.fmtData(t.data_fim);
      return 'Sem período definido';
    };

    if (!etapas.length) {
      raiz.innerHTML = `<div class="empty-state">Nenhuma etapa lançada ainda.</div>`;
      return;
    }

    raiz.innerHTML = etapas.map(e => {
      const aberta = this._etapasAbertas.has(e.id);
      const tarefasDaEtapa = Api.list('etapa_tarefas').filter(t => t.etapa_id === e.id);
      let html = `
        <div class="rec-card" data-toggle-etapa="${e.id}" style="cursor:pointer;">
          <div class="rec-title">
            ${aberta ? '▾' : '▸'} ${Utils.escapeHtml(e.nome)} ${UI.badge(e.situacao || 'Pendente', clsSituacao[e.situacao] || 'orange')} ${e._pendente ? UI.badge('Pendente', 'orange') : ''}
            <button type="button" class="btn btn-ghost" data-editar-etapa="${e.id}" style="float:right;padding:2px 8px;">✏️</button>
          </div>
          <div class="rec-row"><span>${e.data ? Utils.fmtData(e.data) : 'Sem data'}</span><span>${tarefasDaEtapa.length} tarefa(s)</span></div>
          ${e.observacao ? `<div class="rec-sub">${Utils.escapeHtml(e.observacao)}</div>` : ''}
        </div>`;
      if (aberta) {
        html += `
          <div style="margin-left:16px;">
            <div class="toolbar"><div></div><button type="button" class="btn btn-secondary" data-nova-tarefa-etapa="${e.id}">+ Lançar tarefa</button></div>
            <div id="tarefasEtapa_${e.id}"></div>
          </div>`;
      }
      return html;
    }).join('');

    etapas.forEach(e => {
      if (!this._etapasAbertas.has(e.id)) return;
      const tarefasDaEtapa = Api.list('etapa_tarefas').filter(t => t.etapa_id === e.id).sort((a, b) => (a.data_inicio || '').localeCompare(b.data_inicio || ''));
      const alvo = document.getElementById(`tarefasEtapa_${e.id}`);
      if (!alvo) return;
      UI.renderList(alvo, {
        data: tarefasDaEtapa,
        emptyText: 'Nenhuma tarefa lançada nessa etapa ainda.',
        onCardClick: (t) => this.abrirFormTarefaEtapa(emp, e, t),
        renderCard: (t) => `
          <div class="rec-title">${Utils.escapeHtml(nomeTarefa(t.tarefa_id))} ${UI.badge(t.situacao || 'Pendente', clsSituacaoTarefa[t.situacao] || 'orange')} ${t._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
          <div class="rec-row"><span>${periodo(t)}</span>${nomeResponsavel(t.responsavel_id) ? `<span>${Utils.escapeHtml(nomeResponsavel(t.responsavel_id))}</span>` : ''}</div>`
      });
    });

    raiz.querySelectorAll('[data-toggle-etapa]').forEach(el => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-editar-etapa]') || ev.target.closest('[data-nova-tarefa-etapa]')) return;
        const id = el.dataset.toggleEtapa;
        if (this._etapasAbertas.has(id)) this._etapasAbertas.delete(id); else this._etapasAbertas.add(id);
        this.renderEtapas(raiz, emp, etapas, clsSituacao);
      });
    });
    raiz.querySelectorAll('[data-editar-etapa]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.abrirFormEtapa(emp, etapas.find(e => e.id === btn.dataset.editarEtapa));
      });
    });
    raiz.querySelectorAll('[data-nova-tarefa-etapa]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.abrirFormTarefaEtapa(emp, etapas.find(e => e.id === btn.dataset.novaTarefaEtapa), null);
      });
    });
  },

  // opcoes.dadosIniciais: usado só quando reg é null, pra reabrir o formulário com o que o
  // usuário já tinha preenchido depois de criar uma tarefa nova pelo "+ Nova tarefa..." do select.
  abrirFormTarefaEtapa(emp, etapa, reg, opcoes) {
    opcoes = opcoes || {};
    const schema = [
      { key: 'tarefa_id', label: 'Tarefa', type: 'select', required: true, optionsFrom: { fetch: () => Cadastros.tarefasConhecidas(), valueField: 'id', labelFn: t => t.nome } },
      { key: 'data_inicio', label: 'Data de início', type: 'date' },
      { key: 'data_fim', label: 'Data de fim', type: 'date' },
      { key: 'responsavel_id', label: 'Responsável', type: 'select', optionsFrom: { fetch: () => Cadastros.funcionariosConhecidos(), valueField: 'id', labelFn: f => f.nome } },
      { key: 'situacao', label: 'Situação', type: 'select', options: this.situacoesEtapa.map(s => ({ value: s, label: s })) },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar tarefa da etapa' : 'Lançar tarefa',
      schema,
      dados: reg || opcoes.dadosIniciais || { data_inicio: Utils.hoje(), situacao: 'Pendente' },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        this._ligarCriarTarefaInline(form, schema, (snapshot) => {
          if (reg) this.abrirFormTarefaEtapa(emp, etapa, Object.assign({}, reg, snapshot));
          else this.abrirFormTarefaEtapa(emp, etapa, null, { dadosIniciais: snapshot });
        });

        // Atalho: a tarefa costuma ser "comprar tal coisa" — em vez de o usuário ter que ir em
        // Financeiro > Compras e preencher etapa/tarefa na mão, abre a Nova compra já vinculada
        // a essa etapa/tarefa/atividade, preservando o que já foi digitado aqui.
        const btnCompra = document.createElement('button');
        btnCompra.type = 'button';
        btnCompra.className = 'btn btn-ghost';
        btnCompra.style.cssText = 'width:100%;margin-top:4px;';
        btnCompra.textContent = '🛒 Lançar compra desta tarefa';
        form.appendChild(btnCompra);
        btnCompra.addEventListener('click', () => {
          const fd = new FormData(form);
          const snapshot = {};
          schema.forEach(f => {
            if (f.type === 'number') { const v = fd.get(f.key); snapshot[f.key] = v === '' ? null : Number(v); }
            else if (f.type === 'date' || f.type === 'select') { const v = fd.get(f.key); snapshot[f.key] = v === '' ? null : v; }
            else snapshot[f.key] = fd.get(f.key) || '';
          });
          const etapas = Api.list('empreendimento_etapas').filter(e2 => e2.empreendimento_id === emp.id);
          Compras.abrirFormCompra(null, {
            vinculo: { etapas, etapaId: etapa.id, fazenda: emp.fazenda, empreendimentoId: emp.id },
            dadosIniciais: Object.assign({ data: Utils.hoje(), tipo: 'Nota Fiscal', considerar_saida: true, irpf: true, frete: 0, desconto: 0, fazenda: emp.fazenda, etapa_id: etapa.id }, snapshot.tarefa_id && snapshot.tarefa_id !== '__nova__' ? { tarefa_id: snapshot.tarefa_id } : {})
          });
        });
      },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('etapa_tarefas', reg.id, dados);
        else await Api.criar('etapa_tarefas', Object.assign({ etapa_id: etapa.id }, dados));
        Utils.toast('Tarefa salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('etapa_tarefas', reg.id);
        Utils.toast('Tarefa excluída.');
        App.refresh();
      } : null
    });
  },

  // Liga o "+ Nova tarefa..." no fim do <select> de Tarefa de um formulário já aberto: ao
  // escolher essa opção, guarda o que o usuário já preenchia nesse formulário, abre o cadastro
  // rápido de Tarefa (mesmo cadastro de Cadastros > Tarefas) e, ao salvar, chama
  // reabrirCom(snapshotComNovaTarefa) pra reabrir o formulário de origem já com a tarefa nova
  // selecionada. Cancelando a criação, reabre do mesmo jeito mas sem trocar a tarefa — nos dois
  // casos o resto do que o usuário já tinha preenchido (data, observação etc.) é preservado.
  _ligarCriarTarefaInline(form, schema, reabrirCom) {
    const sel = form.querySelector('[name="tarefa_id"]');
    if (!sel || sel.querySelector('option[value="__nova__"]')) return;
    sel.insertAdjacentHTML('beforeend', '<option value="__nova__">+ Nova tarefa...</option>');
    sel.addEventListener('change', () => {
      if (sel.value !== '__nova__') return;
      const fd = new FormData(form);
      const snapshot = {};
      schema.forEach(f => {
        if (f.type === 'number') { const v = fd.get(f.key); snapshot[f.key] = v === '' ? null : Number(v); }
        else if (f.type === 'date' || f.type === 'select') { const v = fd.get(f.key); snapshot[f.key] = v === '' ? null : v; }
        else snapshot[f.key] = fd.get(f.key) || '';
      });
      const tarefaAnterior = snapshot.tarefa_id;
      delete snapshot.tarefa_id;
      Cadastros._abrirFormListaSimples('tarefas', 'Tarefa', null, {
        onCriado: (novaTarefa) => reabrirCom(Object.assign({}, snapshot, { tarefa_id: novaTarefa.id })),
        onCancelado: () => reabrirCom(Object.assign({}, snapshot, { tarefa_id: tarefaAnterior && tarefaAnterior !== '__nova__' ? tarefaAnterior : null }))
      });
    });
  },

  _nomeEtapa(etapas, etapaId) {
    if (!etapaId) return null;
    const e = etapas.find(et => et.id === etapaId);
    return e ? e.nome : null;
  },
  _etapaDoLancamento(etapas, l) {
    return etapas.find(e => e.id === l.etapa_id) || null;
  },

  abrirFormEtapa(emp, reg) {
    const schema = [
      { key: 'nome', label: 'Nome da etapa', type: 'text', required: true, placeholder: 'Ex: Preparo do solo, Plantio, Colheita' },
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'situacao', label: 'Situação', type: 'select', options: this.situacoesEtapa.map(s => ({ value: s, label: s })) },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar etapa' : 'Nova etapa',
      schema,
      dados: reg || { data: Utils.hoje(), situacao: 'Pendente' },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('empreendimento_etapas', reg.id, dados);
        else await Api.criar('empreendimento_etapas', Object.assign({ empreendimento_id: emp.id }, dados));
        Utils.toast('Etapa salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('empreendimento_etapas', reg.id);
        Utils.toast('Etapa excluída.');
        App.refresh();
      } : null
    });
  },

  /* ---------- CUSTO (cria/edita um lançamento de verdade em Despesas) ---------- */
  insumosDoCusto(despesaId) {
    return Api.list('insumos_tarefa').filter(i => i.despesa_id === despesaId);
  },
  nomeProdutoInsumo(id) {
    return Compras.nomeProduto(id);
  },

  async recalcularTotalCusto(despesaId) {
    const itens = this.insumosDoCusto(despesaId);
    const total = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
    await Api.atualizar('despesas', despesaId, { valor: total });
  },

  // opcoes (só quando reg é null, pra manter os insumos já lançados se reabrir o formulário
  // ao adicionar/editar um insumo antes do custo existir): { dadosIniciais, itensDraft }
  abrirFormCusto(emp, etapa, reg, opcoes) {
    opcoes = opcoes || {};
    const itensDraft = reg ? null : (opcoes.itensDraft || []);
    const etapas = Api.list('empreendimento_etapas').filter(e => e.empreendimento_id === emp.id);
    const schema = [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'etapa_id', label: 'Etapa (opcional)', type: 'select', optionsFrom: { fetch: () => etapas, valueField: 'id', labelFn: e => e.nome } },
      { key: 'tarefa_id', label: 'Tarefa', type: 'select', optionsFrom: { fetch: () => Cadastros.tarefasConhecidas(), valueField: 'id', labelFn: t => t.nome } },
      { key: 'descricao', label: 'Descrição', type: 'text' },
      { key: 'valor', label: 'Valor (R$) — soma dos insumos', type: 'number', step: '0.01', required: true },
      { key: 'status', label: 'Situação', type: 'select', options: [{ value: 'Executado', label: 'Executado (conta no Financeiro)' }, { value: 'Planejado', label: 'Planejado (ainda não aconteceu)' }, { value: 'Cancelado', label: 'Não realizado' }] },
      { key: 'forma_pagamento', label: 'Forma de pagamento', type: 'text', suggestions: Cadastros.formasPagamentoConhecidas() },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar custo' : 'Novo custo',
      schema,
      dados: reg || opcoes.dadosIniciais || { data: Utils.hoje(), etapa_id: etapa ? etapa.id : '', fazenda: emp.fazenda, status: 'Executado' },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const itens = reg ? this.insumosDoCusto(reg.id) : itensDraft;
        const subtotalItens = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);

        const secao = document.createElement('div');
        secao.className = 'form-group';
        secao.innerHTML = `
          <label>Insumos usados na tarefa (${itens.length}) — ${reg ? 'Total: ' + Utils.fmtMoeda(reg.valor) : 'Subtotal: ' + Utils.fmtMoeda(subtotalItens)}</label>
          <div class="ficha-lista">
            ${itens.length ? itens.map((i, idx) => `
              <div class="ficha-item" data-stop>
                <span>${Utils.escapeHtml(this.nomeProdutoInsumo(i.produto_id))}</span>
                <span>${Utils.fmtNum(i.quantidade, 2)} ${Utils.escapeHtml(i.unidade || '')}</span>
                <span>${Utils.fmtMoeda(i.valor_unitario)}/un</span>
                <span>${Utils.fmtMoeda(i.quantidade * i.valor_unitario)}</span>
                <button type="button" class="btn btn-ghost" data-editar-insumo="${reg ? i.id : idx}" style="padding:4px 8px;">Editar</button>
              </div>`).join('') : '<div class="ficha-vazio">Nenhum insumo lançado ainda.</div>'}
          </div>
          <button type="button" class="btn btn-ghost" id="btnFichaInsumo" style="margin-top:8px;width:100%;">+ Adicionar insumo</button>
        `;

        // Posiciona a seção de insumos antes do campo Valor, já que o total vem dela. O campo
        // em si vira só-leitura mostrando a soma — sem isso ele fica vazio e, sendo obrigatório,
        // trava o envio do formulário mesmo com os insumos certinhos.
        const campoValor = form.querySelector('[name="valor"]');
        const grupoValor = campoValor ? campoValor.closest('.form-group') : null;
        if (campoValor) {
          campoValor.readOnly = true;
          campoValor.value = (reg ? Number(reg.valor || 0) : subtotalItens).toFixed(2);
        }
        if (grupoValor) grupoValor.parentNode.insertBefore(secao, grupoValor);
        else form.appendChild(secao);

        this._ligarCriarTarefaInline(form, schema, (snapshot) => {
          if (reg) this.abrirFormCusto(emp, etapa, Object.assign({}, reg, snapshot), opcoes);
          else this.abrirFormCusto(emp, etapa, null, Object.assign({}, opcoes, { dadosIniciais: snapshot, itensDraft }));
        });

        const capturarDadosAtuais = () => {
          const fd = new FormData(form);
          const out = {};
          schema.forEach(f => {
            if (f.type === 'number') { const v = fd.get(f.key); out[f.key] = v === '' ? null : Number(v); }
            else if (f.type === 'date' || f.type === 'select') { const v = fd.get(f.key); out[f.key] = v === '' ? null : v; }
            else out[f.key] = fd.get(f.key) || '';
          });
          return out;
        };

        const abrirInsumo = (item) => {
          if (reg) {
            this.abrirFormInsumo(item, reg);
          } else {
            this.abrirFormInsumo(item, null, {
              lista: itensDraft,
              onMudou: () => this.abrirFormCusto(emp, etapa, null, { dadosIniciais: capturarDadosAtuais(), itensDraft })
            });
          }
        };
        secao.querySelector('#btnFichaInsumo').addEventListener('click', () => abrirInsumo(null));
        secao.querySelectorAll('[data-editar-insumo]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = reg ? Api.get('insumos_tarefa', btn.dataset.editarInsumo) : itensDraft[Number(btn.dataset.editarInsumo)];
            abrirInsumo(item);
          });
        });
      },
      onSalvar: async (dados) => {
        dados.fazenda = emp.fazenda;
        const tarefa = dados.tarefa_id ? Api.get('tarefas', dados.tarefa_id) : null;
        dados.categoria = tarefa ? tarefa.nome : (reg ? reg.categoria : null);
        if (reg) {
          await Api.atualizar('despesas', reg.id, dados);
          await this.recalcularTotalCusto(reg.id);
          Utils.toast('Custo salvo.');
          App.refresh();
        } else {
          const subtotalItens = itensDraft.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
          const novoCusto = await Api.criar('despesas', Object.assign({ empreendimento_id: emp.id, valor: subtotalItens }, dados));
          for (const item of itensDraft) {
            await Api.criar('insumos_tarefa', Object.assign({ despesa_id: novoCusto.id }, item));
          }
          Utils.toast(`Custo lançado com ${itensDraft.length} insumo(s).`);
          App.refresh();
        }
      },
      onExcluir: reg ? async () => {
        await Api.excluir('despesas', reg.id);
        Utils.toast('Custo excluído.');
        App.refresh();
      } : null
    });
  },

  // draft (só quando o custo ainda não existe): { lista, onMudou } — em vez de salvar o insumo
  // direto no banco, guarda num array local até o custo inteiro ser salvo.
  abrirFormInsumo(item, custo, draft) {
    const schema = [
      { key: 'produto_id', label: 'Insumo (produto)', type: 'select', required: true, optionsFrom: { fetch: () => Api.list('produtos').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), valueField: 'id', labelFn: p => p.nome } },
      { key: 'unidade', label: 'Unidade (kg, L, un, sc...)', type: 'text' },
      { key: 'quantidade', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { key: 'valor_unitario', label: 'Valor unitário (R$)', type: 'number', step: '0.01', required: true }
    ];
    UI.abrirFormulario({
      titulo: item ? 'Editar insumo' : 'Novo insumo',
      schema,
      dados: item || { quantidade: 1 },
      onSalvar: async (dados) => {
        if (draft) {
          if (item) Object.assign(item, dados);
          else draft.lista.push(dados);
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        if (item) await Api.atualizar('insumos_tarefa', item.id, dados);
        else await Api.criar('insumos_tarefa', Object.assign({ despesa_id: custo.id }, dados));
        await this.recalcularTotalCusto(custo.id);
        Utils.toast('Insumo salvo.');
        this.abrirFormCusto(Api.get('empreendimentos', custo.empreendimento_id), null, Api.get('despesas', custo.id));
      },
      onExcluir: item ? async () => {
        if (draft) {
          const idx = draft.lista.indexOf(item);
          if (idx >= 0) draft.lista.splice(idx, 1);
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        await Api.excluir('insumos_tarefa', item.id);
        await this.recalcularTotalCusto(custo.id);
        Utils.toast('Insumo excluído.');
        this.abrirFormCusto(Api.get('empreendimentos', custo.empreendimento_id), null, Api.get('despesas', custo.id));
      } : null
    });
  },

  /* ---------- PLANILHA DE CUSTEIO (importa custos planejados de uma vez) ----------
     Formato: CSV separado por ";" (padrão do Excel em português), colunas:
     Etapa; Tarefa; Produto; Unidade; Quantidade; Valor Unitario; Data Planejada; Observacao
     Cada linha vira um custo com status "Planejado" — não conta no Financeiro até o usuário
     conferir e confirmar (botão "✅ Feito" na tela da atividade). Etapa/Tarefa/Produto que
     ainda não existem são criados automaticamente, pelo nome. */
  baixarModeloCusteio() {
    const cabecalho = 'Etapa;Tarefa;Produto;Unidade;Quantidade;Valor Unitario;Data Planejada;Observacao';
    const exemplo = 'Plantio;Semeadura;Semente de Soja;sc;10;450,00;2026-11-01;Exemplo — pode apagar essa linha';
    const conteudo = '﻿' + cabecalho + '\r\n' + exemplo + '\r\n';
    Utils.downloadArquivo('modelo-custeio.csv', conteudo, 'text/csv;charset=utf-8');
  },

  // Aceita vírgula OU ponto como separador decimal (ex: "450,00" ou "450.00"), e ponto como
  // separador de milhar quando os dois aparecem juntos (ex: "1.234,56").
  _parseNumeroPlanilha(str) {
    if (str === undefined || str === null) return 0;
    let s = String(str).trim();
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  },

  // Converte "01/11/2026" ou "2026-11-01" pro formato ISO que o app usa (yyyy-mm-dd).
  _parseDataPlanilha(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  },

  // Parser de CSV simples (detecta ";" ou "," como separador pela primeira linha), com suporte
  // a campos entre aspas. Suficiente pro modelo que o próprio app gera.
  _parseCsv(texto) {
    const semBom = texto.replace(/^﻿/, '');
    const linhas = semBom.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
    if (!linhas.length) return [];
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    const parseLinha = (linha) => {
      const campos = [];
      let atual = '';
      let dentroAspas = false;
      for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
          if (dentroAspas && linha[i + 1] === '"') { atual += '"'; i++; }
          else dentroAspas = !dentroAspas;
        } else if (c === sep && !dentroAspas) {
          campos.push(atual); atual = '';
        } else {
          atual += c;
        }
      }
      campos.push(atual);
      return campos.map(c => c.trim());
    };
    const cabecalho = parseLinha(linhas[0]).map(h => h.toLowerCase());
    return linhas.slice(1).map(linha => {
      const campos = parseLinha(linha);
      const obj = {};
      cabecalho.forEach((h, i) => { obj[h] = campos[i] !== undefined ? campos[i] : ''; });
      return obj;
    });
  },

  async _encontrarOuCriarEtapa(empreendimentoId, nome) {
    if (!nome) return null;
    const existente = Api.list('empreendimento_etapas').find(e => e.empreendimento_id === empreendimentoId && (e.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
    if (existente) return existente;
    return Api.criar('empreendimento_etapas', { empreendimento_id: empreendimentoId, nome: nome.trim(), situacao: 'Pendente' });
  },
  async _encontrarOuCriarTarefa(nome) {
    if (!nome) return null;
    const existente = Api.list('tarefas').find(t => (t.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
    if (existente) return existente;
    return Api.criar('tarefas', { nome: nome.trim() });
  },
  async _encontrarOuCriarProduto(nome) {
    if (!nome) return null;
    const existente = Api.list('produtos').find(p => (p.nome || '').trim().toLowerCase() === nome.trim().toLowerCase());
    if (existente) return existente;
    return Api.criar('produtos', { nome: nome.trim() });
  },

  async importarPlanilhaCusteio(emp, arquivo) {
    const texto = await arquivo.text();
    const linhas = this._parseCsv(texto).filter(l => (l.produto || l.tarefa || l.etapa));
    if (!linhas.length) { Utils.toast('Não encontrei nenhuma linha com dados nessa planilha.', 'error'); return; }
    if (!Utils.confirmar(`Importar ${linhas.length} linha(s) como custos planejados? Depois é só conferir e confirmar cada um.`)) return;

    Utils.toast(`Importando ${linhas.length} linha(s)...`);
    let importados = 0;
    for (const linha of linhas) {
      const nomeEtapa = linha['etapa'] || '';
      const nomeTarefa = linha['tarefa'] || '';
      const nomeProduto = linha['produto'] || '';
      const unidade = linha['unidade'] || '';
      const quantidade = this._parseNumeroPlanilha(linha['quantidade']) || 1;
      const valorUnitario = this._parseNumeroPlanilha(linha['valor unitario']);
      const data = this._parseDataPlanilha(linha['data planejada']);
      const observacao = linha['observacao'] || '';

      const etapa = await this._encontrarOuCriarEtapa(emp.id, nomeEtapa);
      const tarefa = await this._encontrarOuCriarTarefa(nomeTarefa);
      const produto = await this._encontrarOuCriarProduto(nomeProduto);
      const valorTotal = quantidade * valorUnitario;

      const despesa = await Api.criar('despesas', {
        empreendimento_id: emp.id,
        etapa_id: etapa ? etapa.id : null,
        tarefa_id: tarefa ? tarefa.id : null,
        categoria: tarefa ? tarefa.nome : (nomeProduto || 'Custeio'),
        descricao: nomeProduto || observacao || null,
        data,
        valor: valorTotal,
        fazenda: emp.fazenda,
        status: 'Planejado',
        observacao: observacao || null
      });
      if (produto) {
        await Api.criar('insumos_tarefa', { despesa_id: despesa.id, produto_id: produto.id, unidade, quantidade, valor_unitario: valorUnitario });
      }
      importados++;
    }
    Utils.toast(`${importados} custo(s) planejado(s) importado(s). Confira e confirme cada um.`);
    App.refresh();
  },

  /* ---------- RECEITA (cria/edita um lançamento de verdade em Produção) ---------- */
  abrirFormReceita(emp, etapa, reg) {
    const etapas = Api.list('empreendimento_etapas').filter(e => e.empreendimento_id === emp.id);
    const schema = [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'etapa_id', label: 'Etapa (opcional)', type: 'select', optionsFrom: { fetch: () => etapas, valueField: 'id', labelFn: e => e.nome } },
      { key: 'destinatario', label: 'Destinatário (comprador)', type: 'text', suggestions: Compras.destinatariosConhecidos() },
      { key: 'produto', label: 'Produto', type: 'text', suggestions: Compras.produtosProducaoConhecidos() },
      { key: 'unidade', label: 'Unidade', type: 'text', suggestions: ['Saca 60 kg', 'Tonelada', 'Arroba', 'Cabeça', 'Litro'] },
      { key: 'quantidade', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { key: 'valor_unitario', label: 'Valor unitário (R$)', type: 'number', step: '0.01', required: true },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar receita' : 'Nova receita',
      schema,
      dados: reg || { data: Utils.hoje(), etapa_id: etapa ? etapa.id : '', atividade: emp.tipo, fazenda: emp.fazenda },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const campoQtd = form.querySelector('[name="quantidade"]');
        const campoUnit = form.querySelector('[name="valor_unitario"]');
        const elTotal = document.createElement('div');
        elTotal.className = 'form-group';
        const atualizarTotal = () => {
          const total = (Number(campoQtd.value) || 0) * (Number(campoUnit.value) || 0);
          elTotal.innerHTML = `<label>Valor total</label><div style="font-weight:600;">${Utils.fmtMoeda(total)}</div>`;
        };
        atualizarTotal();
        campoUnit.closest('.form-group').insertAdjacentElement('afterend', elTotal);
        campoQtd.addEventListener('input', atualizarTotal);
        campoUnit.addEventListener('input', atualizarTotal);
      },
      onSalvar: async (dados) => {
        dados.valor_total = Number(dados.quantidade || 0) * Number(dados.valor_unitario || 0);
        dados.atividade = emp.tipo;
        dados.fazenda = emp.fazenda;
        if (reg) await Api.atualizar('producao', reg.id, dados);
        else await Api.criar('producao', Object.assign({ empreendimento_id: emp.id }, dados));
        Utils.toast('Receita lançada em Produção.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('producao', reg.id);
        Utils.toast('Receita excluída.');
        App.refresh();
      } : null
    });
  }
};
