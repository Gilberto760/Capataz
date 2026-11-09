/* ===================== Módulo: Compras (Compras, Despesas) =====================
   Fornecedores e Produtos continuam implementados aqui embaixo (mesmas funções de sempre),
   mas o acesso por aba agora é só por Cadastros — pra não ter dois lugares fazendo a mesma
   coisa. Nada mudou nos dados nem na tela de "Nova compra", que ainda usa essas funções. */
const Compras = {
  subtabs: [
    { key: 'compras', label: 'Compras' },
    { key: 'despesas', label: 'Despesas' },
    { key: 'producao', label: 'Produção' },
    { key: 'vendas', label: 'Vendas' }
  ],

  categoriasProduto: ['Medicamentos', 'Vacinas', 'Vermífugos', 'Nutrição', 'Ferramentas', 'Equipamentos', 'Peças', 'Combustíveis', 'Lubrificantes', 'Agricultura', 'Alimento', 'Serviços', 'Diversos'],
  tiposDocumentoCompra: ['Nota Fiscal', 'Recibo', 'Cupom Fiscal', 'Outro'],

  // Guarda quais grupos (Ano/Fazenda/Categoria) estão abertos em cada tela, fora da função de
  // render — se ficasse dentro, toda vez que a tela redesenha (ex: depois de salvar um
  // formulário) o estado "lembrado" se perderia e a lista voltaria inteira fechada, dando a
  // impressão de ter saído da tela em que o usuário estava.
  _estadosGrupos: {},
  _estadoGrupo(chave) {
    if (!this._estadosGrupos[chave]) this._estadosGrupos[chave] = { anos: new Set(), fazendas: new Set(), categorias: new Set(), filtroAno: 'todos' };
    return this._estadosGrupos[chave];
  },

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">Conecte o app ao banco de dados primeiro.</div>`;
      return;
    }
    sub = sub || 'compras';
    const map = {
      compras: () => this.renderCompras(container),
      despesas: () => this.renderDespesas(container),
      producao: () => this.renderProducao(container),
      vendas: () => this.renderVendas(container),
      fornecedores: () => this.renderFornecedores(container),
      produtos: () => this.renderProdutos(container)
    };
    (map[sub] || map.compras)();
  },

  nomeFornecedor(id) {
    const f = Api.get('fornecedores', id);
    return f ? f.nome : '(removido)';
  },
  nomeProduto(id) {
    const p = Api.get('produtos', id);
    return p ? p.nome : '(removido)';
  },
  itensDaCompra(compraId) {
    return Api.list('itens_compra').filter(i => i.compra_id === compraId);
  },
  fazendasConhecidas() {
    return Rebanho.fazendasConhecidas();
  },

  // Agrupamento genérico "Ano > Fazenda" (colapsável, com total em cada nível) — usado em
  // Vendas, Despesas e Produção. campoData/campoFazenda/campoValor dizem quais chaves do
  // registro usar; itemLabel é o texto tipo "venda(s)"/"despesa(s)".
  _renderAgrupadoAnoFazenda(raiz, regs, opts) {
    const { campoData, campoFazenda = 'fazenda', campoValor, itemLabel = 'registro(s)', onCardClick, renderCard, estadoKey } = opts;
    const estado = this._estadoGrupo(estadoKey || 'anoFazenda_padrao');
    const anosAbertos = estado.anos;
    const fazendasAbertas = estado.fazendas;
    const prefixo = 'grp_' + Math.random().toString(36).slice(2, 8);

    const desenhar = () => {
      const porAno = {};
      regs.forEach(r => {
        const ano = (r[campoData] || '').slice(0, 4) || 'Sem data';
        (porAno[ano] = porAno[ano] || []).push(r);
      });
      const anosOrdenados = Object.keys(porAno).sort((a, b) => b.localeCompare(a));

      raiz.innerHTML = anosOrdenados.map(ano => {
        const doAno = porAno[ano];
        const totalAno = doAno.reduce((s, r) => s + Number(r[campoValor] || 0), 0);
        const anoAberto = anosAbertos.has(ano);
        let html = `
          <div class="rec-card" data-toggle-ano="${Utils.escapeHtml(ano)}" style="cursor:pointer;">
            <div class="rec-title">${anoAberto ? '▾' : '▸'} Ano ${Utils.escapeHtml(ano)}</div>
            <div class="rec-row"><span>${doAno.length} ${itemLabel}</span><span><b>${Utils.fmtMoeda(totalAno)}</b></span></div>
          </div>`;
        if (anoAberto) {
          const porFazenda = {};
          doAno.forEach(r => { const faz = r[campoFazenda] || 'Sem fazenda'; (porFazenda[faz] = porFazenda[faz] || []).push(r); });
          const fazendasOrdenadas = Object.keys(porFazenda).sort((a, b) => a.localeCompare(b));
          html += fazendasOrdenadas.map((faz, j) => {
            const doFaz = porFazenda[faz];
            const totalFaz = doFaz.reduce((s, r) => s + Number(r[campoValor] || 0), 0);
            const chave = ano + '||' + faz;
            const aberto = fazendasAbertas.has(chave);
            let h = `
              <div class="rec-card" data-toggle-faz="${Utils.escapeHtml(chave)}" style="cursor:pointer;margin-left:16px;background:var(--bg);">
                <div class="rec-title" style="font-size:13px;">${aberto ? '▾' : '▸'} Fazenda: ${Utils.escapeHtml(faz)}</div>
                <div class="rec-row"><span>${doFaz.length} ${itemLabel}</span><span><b>${Utils.fmtMoeda(totalFaz)}</b></span></div>
              </div>`;
            if (aberto) h += `<div id="${prefixo}_${j}_${Utils.escapeHtml(ano)}" style="margin-left:16px;"></div>`;
            return h;
          }).join('');
        }
        return html;
      }).join('');

      anosOrdenados.forEach(ano => {
        if (!anosAbertos.has(ano)) return;
        const doAno = porAno[ano];
        const porFazenda = {};
        doAno.forEach(r => { const faz = r[campoFazenda] || 'Sem fazenda'; (porFazenda[faz] = porFazenda[faz] || []).push(r); });
        const fazendasOrdenadas = Object.keys(porFazenda).sort((a, b) => a.localeCompare(b));
        fazendasOrdenadas.forEach((faz, j) => {
          const chave = ano + '||' + faz;
          if (!fazendasAbertas.has(chave)) return;
          const dados = porFazenda[faz].sort((a, b) => (b[campoData] || '').localeCompare(a[campoData] || ''));
          const alvo = document.getElementById(`${prefixo}_${j}_${ano}`);
          if (alvo) UI.renderList(alvo, { data: dados, onCardClick, renderCard });
        });
      });

      raiz.querySelectorAll('[data-toggle-ano]').forEach(el => {
        el.addEventListener('click', () => {
          const ano = el.dataset.toggleAno;
          if (anosAbertos.has(ano)) anosAbertos.delete(ano); else anosAbertos.add(ano);
          desenhar();
        });
      });
      raiz.querySelectorAll('[data-toggle-faz]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const chave = el.dataset.toggleFaz;
          if (fazendasAbertas.has(chave)) fazendasAbertas.delete(chave); else fazendasAbertas.add(chave);
          desenhar();
        });
      });
    };

    desenhar();
  },

  // Igual ao _renderAgrupadoAnoFazenda, mas com um terceiro nível (Categoria) — usado em
  // Despesas. Chaves de abertura: ano / "ano||fazenda" / "ano||fazenda||categoria".
  _renderAgrupadoAnoFazendaCategoria(raiz, regs, opts) {
    const { campoData, campoFazenda = 'fazenda', campoCategoria = 'categoria', campoValor, itemLabel = 'registro(s)', onCardClick, renderCard, estadoKey } = opts;
    const estado = this._estadoGrupo(estadoKey || 'anoFazendaCategoria_padrao');
    const anosAbertos = estado.anos;
    const fazendasAbertas = estado.fazendas;
    const categoriasAbertas = estado.categorias;
    const prefixo = 'grp3_' + Math.random().toString(36).slice(2, 8);

    const agrupar = (lista, campo, semRotulo) => {
      const grupos = {};
      lista.forEach(r => { const chave = r[campo] || semRotulo; (grupos[chave] = grupos[chave] || []).push(r); });
      return grupos;
    };
    const totalDe = (lista) => lista.reduce((s, r) => s + Number(r[campoValor] || 0), 0);

    const desenhar = () => {
      const porAnoReal = {};
      regs.forEach(r => {
        const ano = (r[campoData] || '').slice(0, 4) || 'Sem data';
        (porAnoReal[ano] = porAnoReal[ano] || []).push(r);
      });
      const anosOrdenados = Object.keys(porAnoReal).sort((a, b) => b.localeCompare(a));

      raiz.innerHTML = anosOrdenados.map(ano => {
        const doAno = porAnoReal[ano];
        const anoAberto = anosAbertos.has(ano);
        let html = `
          <div class="rec-card" data-toggle-ano="${Utils.escapeHtml(ano)}" style="cursor:pointer;">
            <div class="rec-title">${anoAberto ? '▾' : '▸'} Ano ${Utils.escapeHtml(ano)}</div>
            <div class="rec-row"><span>${doAno.length} ${itemLabel}</span><span><b>${Utils.fmtMoeda(totalDe(doAno))}</b></span></div>
          </div>`;
        if (!anoAberto) return html;

        const porFazenda = agrupar(doAno, campoFazenda, 'Sem fazenda');
        const fazendasOrdenadas = Object.keys(porFazenda).sort((a, b) => a.localeCompare(b));
        html += fazendasOrdenadas.map(faz => {
          const doFaz = porFazenda[faz];
          const chaveFaz = ano + '||' + faz;
          const fazAberta = fazendasAbertas.has(chaveFaz);
          let h = `
            <div class="rec-card" data-toggle-faz="${Utils.escapeHtml(chaveFaz)}" style="cursor:pointer;margin-left:16px;background:var(--bg);">
              <div class="rec-title" style="font-size:13px;">${fazAberta ? '▾' : '▸'} Fazenda: ${Utils.escapeHtml(faz)}</div>
              <div class="rec-row"><span>${doFaz.length} ${itemLabel}</span><span><b>${Utils.fmtMoeda(totalDe(doFaz))}</b></span></div>
            </div>`;
          if (!fazAberta) return h;

          const porCategoria = agrupar(doFaz, campoCategoria, 'Sem categoria');
          const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));
          h += categoriasOrdenadas.map((cat, j) => {
            const doCat = porCategoria[cat];
            const chaveCat = chaveFaz + '||' + cat;
            const catAberta = categoriasAbertas.has(chaveCat);
            let hc = `
              <div class="rec-card" data-toggle-cat="${Utils.escapeHtml(chaveCat)}" style="cursor:pointer;margin-left:32px;background:var(--card-bg, var(--bg));">
                <div class="rec-title" style="font-size:12px;">${catAberta ? '▾' : '▸'} ${Utils.escapeHtml(cat)}</div>
                <div class="rec-row"><span>${doCat.length} ${itemLabel}</span><span><b>${Utils.fmtMoeda(totalDe(doCat))}</b></span></div>
              </div>`;
            if (catAberta) {
              hc += `<div id="${prefixo}_${j}_${Utils.escapeHtml(chaveFaz)}" style="margin-left:32px;"></div>`;
            }
            return hc;
          }).join('');
          return h;
        }).join('');
        return html;
      }).join('');

      // Preenche as listas de detalhe só das categorias abertas.
      anosOrdenados.forEach(ano => {
        if (!anosAbertos.has(ano)) return;
        const doAno = porAnoReal[ano];
        const porFazenda = agrupar(doAno, campoFazenda, 'Sem fazenda');
        Object.keys(porFazenda).forEach(faz => {
          const chaveFaz = ano + '||' + faz;
          if (!fazendasAbertas.has(chaveFaz)) return;
          const porCategoria = agrupar(porFazenda[faz], campoCategoria, 'Sem categoria');
          Object.keys(porCategoria).sort((a, b) => a.localeCompare(b)).forEach((cat, j) => {
            const chaveCat = chaveFaz + '||' + cat;
            if (!categoriasAbertas.has(chaveCat)) return;
            const dados = porCategoria[cat].sort((a, b) => (b[campoData] || '').localeCompare(a[campoData] || ''));
            const alvo = document.getElementById(`${prefixo}_${j}_${chaveFaz}`);
            if (alvo) UI.renderList(alvo, { data: dados, onCardClick, renderCard });
          });
        });
      });

      raiz.querySelectorAll('[data-toggle-ano]').forEach(el => {
        el.addEventListener('click', () => {
          const ano = el.dataset.toggleAno;
          if (anosAbertos.has(ano)) anosAbertos.delete(ano); else anosAbertos.add(ano);
          desenhar();
        });
      });
      raiz.querySelectorAll('[data-toggle-faz]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const chave = el.dataset.toggleFaz;
          if (fazendasAbertas.has(chave)) fazendasAbertas.delete(chave); else fazendasAbertas.add(chave);
          desenhar();
        });
      });
      raiz.querySelectorAll('[data-toggle-cat]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const chave = el.dataset.toggleCat;
          if (categoriasAbertas.has(chave)) categoriasAbertas.delete(chave); else categoriasAbertas.add(chave);
          desenhar();
        });
      });
    };

    desenhar();
  },

  /* ---------- COMPRAS ---------- */
  renderCompras(container) {
    const todos = Api.list('compras');
    const mesAtual = Utils.hoje().slice(0, 7);
    const totalMes = todos.filter(r => (r.data || '').slice(0, 7) === mesAtual).reduce((s, r) => s + Number(r.valor_total || 0), 0);

    const anoAtual = mesAtual.slice(0, 4);
    const totalAno = todos.filter(r => (r.data || '').slice(0, 4) === anoAtual).reduce((s, r) => s + Number(r.valor_total || 0), 0);

    // Despesas "Planejado"/"Cancelado" ficam de fora, mesma regra da aba Despesas — ainda não
    // viraram gasto de verdade.
    const despesasExecutadas = Api.list('despesas').filter(d => d.status !== 'Planejado' && d.status !== 'Cancelado');
    const despesasMes = despesasExecutadas.filter(d => (d.data || '').slice(0, 7) === mesAtual).reduce((s, d) => s + Number(d.valor || 0), 0);
    const despesasAno = despesasExecutadas.filter(d => (d.data || '').slice(0, 4) === anoAtual).reduce((s, d) => s + Number(d.valor || 0), 0);
    const totalMesCompraseDespesas = totalMes + despesasMes;
    const totalAnoCompraseDespesas = totalAno + despesasAno;

    const anos = Array.from(new Set(todos.map(r => (r.data || '').slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));

    const estado = this._estadoGrupo('compras');

    container.innerHTML = `
      <div class="summary-box">
        Total comprado no mês: <b>${Utils.fmtMoeda(totalMes)}</b><br/>
        Total Compras + Despesas no mês: <b>${Utils.fmtMoeda(totalMesCompraseDespesas)}</b><br/>
        Total Compras + Despesas no ano: <b>${Utils.fmtMoeda(totalAnoCompraseDespesas)}</b>
      </div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaCompra">+ Nova compra</button></div>
      <div class="filter-chips" id="filtroAnoCompra">
        <button class="chip ${estado.filtroAno === 'todos' ? 'active' : ''}" data-ano="todos">Todos os anos</button>
        ${anos.map(a => `<button class="chip ${estado.filtroAno === a ? 'active' : ''}" data-ano="${a}">${a}</button>`).join('')}
      </div>
      <div id="listaCompras"></div>`;
    container.querySelector('#btnNovaCompra').addEventListener('click', () => this.abrirFormCompra(null));

    const renderCardCompra = (r) => {
      const itens = this.itensDaCompra(r.id);
      const nomesItens = itens.map(i => this.nomeProduto(i.produto_id)).filter(Boolean);
      const resumoItens = nomesItens.length
        ? (nomesItens.length > 2 ? nomesItens.slice(0, 2).join(', ') + ` e mais ${nomesItens.length - 2}` : nomesItens.join(', '))
        : `${itens.length} item(ns)`;
      return `
        <div class="rec-title">${Utils.escapeHtml(this.nomeFornecedor(r.fornecedor_id))} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-sub">${Utils.escapeHtml(r.tipo || '-')} · ${Utils.escapeHtml(resumoItens)}</div>
        <div class="rec-row">
          <span>${Utils.fmtData(r.data)}</span>
          <span>${Utils.fmtMoeda(r.valor_total)}</span>
          <span>${Utils.escapeHtml(r.fazenda || '-')}</span>
        </div>`;
    };

    const anosAbertos = estado.anos;
    const centrosAbertos = estado.fazendas; // chaves "ano||centro"

    const desenhar = () => {
      let lista = todos.slice();
      if (estado.filtroAno !== 'todos') lista = lista.filter(r => (r.data || '').slice(0, 4) === estado.filtroAno);

      const raiz = container.querySelector('#listaCompras');
      if (!lista.length) {
        raiz.innerHTML = `<div class="empty-state">Nenhuma compra encontrada.</div>`;
        return;
      }

      // Agrupa por Ano, e dentro de cada ano por Faturamento (fazenda).
      // Só mostra valores nos dois primeiros níveis; os detalhes de cada compra
      // só aparecem quando o grupo de faturamento é aberto (último nível).
      const porAno = {};
      lista.forEach(r => {
        const ano = (r.data || '').slice(0, 4) || 'Sem data';
        (porAno[ano] = porAno[ano] || []).push(r);
      });
      const anosOrdenados = Object.keys(porAno).sort((a, b) => b.localeCompare(a));

      raiz.innerHTML = anosOrdenados.map(ano => {
        const doAno = porAno[ano];
        const totalAno = doAno.reduce((s, r) => s + Number(r.valor_total || 0), 0);
        const anoAberto = anosAbertos.has(ano);

        let html = `
          <div class="rec-card" data-toggle-ano="${Utils.escapeHtml(ano)}" style="cursor:pointer;">
            <div class="rec-title">${anoAberto ? '▾' : '▸'} Ano ${Utils.escapeHtml(ano)}</div>
            <div class="rec-row"><span>${doAno.length} compra(s)</span><span><b>${Utils.fmtMoeda(totalAno)}</b></span></div>
          </div>`;

        if (anoAberto) {
          const porCentro = {};
          doAno.forEach(r => {
            const centro = r.fazenda || 'Sem faturamento';
            (porCentro[centro] = porCentro[centro] || []).push(r);
          });
          const centrosOrdenados = Object.keys(porCentro).sort((a, b) => a.localeCompare(b));
          html += centrosOrdenados.map((centro, j) => {
            const doCentro = porCentro[centro];
            const totalCentro = doCentro.reduce((s, r) => s + Number(r.valor_total || 0), 0);
            const chave = ano + '||' + centro;
            const centroAberto = centrosAbertos.has(chave);
            let h = `
              <div class="rec-card" data-toggle-centro="${Utils.escapeHtml(chave)}" style="cursor:pointer;margin-left:16px;background:var(--bg);">
                <div class="rec-title" style="font-size:13px;">${centroAberto ? '▾' : '▸'} Faturamento: ${Utils.escapeHtml(centro)}</div>
                <div class="rec-row"><span>${doCentro.length} compra(s)</span><span><b>${Utils.fmtMoeda(totalCentro)}</b></span></div>
              </div>`;
            if (centroAberto) {
              h += `<div id="grupoCompra_${j}_${Utils.escapeHtml(ano)}" style="margin-left:16px;"></div>`;
            }
            return h;
          }).join('');
        }
        return html;
      }).join('');

      // preenche os cards de detalhe só dos centros de custo abertos
      anosOrdenados.forEach(ano => {
        if (!anosAbertos.has(ano)) return;
        const doAno = porAno[ano];
        const porCentro = {};
        doAno.forEach(r => { const centro = r.fazenda || 'Sem centro de custo'; (porCentro[centro] = porCentro[centro] || []).push(r); });
        const centrosOrdenados = Object.keys(porCentro).sort((a, b) => a.localeCompare(b));
        centrosOrdenados.forEach((centro, j) => {
          const chave = ano + '||' + centro;
          if (!centrosAbertos.has(chave)) return;
          const dados = porCentro[centro].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
          const alvo = document.getElementById(`grupoCompra_${j}_${ano}`);
          if (alvo) UI.renderList(alvo, { data: dados, onCardClick: (r) => this.abrirFormCompra(r), renderCard: renderCardCompra });
        });
      });

      raiz.querySelectorAll('[data-toggle-ano]').forEach(el => {
        el.addEventListener('click', () => {
          const ano = el.dataset.toggleAno;
          if (anosAbertos.has(ano)) anosAbertos.delete(ano); else anosAbertos.add(ano);
          desenhar();
        });
      });
      raiz.querySelectorAll('[data-toggle-centro]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const chave = el.dataset.toggleCentro;
          if (centrosAbertos.has(chave)) centrosAbertos.delete(chave); else centrosAbertos.add(chave);
          desenhar();
        });
      });
    };

    container.querySelectorAll('#filtroAnoCompra .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroAnoCompra .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        estado.filtroAno = chip.dataset.ano;
        desenhar();
      });
    });

    desenhar();
  },

  async recalcularTotalCompra(compraId) {
    const itens = this.itensDaCompra(compraId);
    const compra = Api.get('compras', compraId);
    const subtotalItens = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
    const total = subtotalItens + Number(compra.frete || 0) - Number(compra.desconto || 0);
    await Api.atualizar('compras', compraId, { valor_total: total });
  },

  // opcoes (só usado quando reg é null, pra manter estado entre reaberturas do formulário
  // ao adicionar/editar itens antes da compra existir): { dadosIniciais, itensDraft }
  // opcoes.vinculo (quando a compra é lançada de dentro de uma Atividade): { empreendimentoId,
  // etapaId, etapas (lista pro select), fazenda } — acrescenta o campo Tarefa/Etapa no form e
  // já grava o vínculo na compra.
  abrirFormCompra(reg, opcoes) {
    opcoes = opcoes || {};
    const vinculo = opcoes.vinculo || null;
    const itensDraft = reg ? null : (opcoes.itensDraft || []);
    const schema = [
      { key: 'fornecedor_id', label: 'Fornecedor', type: 'select', busca: true, required: true, optionsFrom: { fetch: () => Api.list('fornecedores').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), valueField: 'id', labelFn: f => f.nome } },
      { key: 'tipo', label: 'Tipo', type: 'text', suggestions: this.tiposDocumentoCompra },
      { key: 'nf', label: 'Número da NF/documento', type: 'text', scanner: true },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'fazenda', label: 'Faturamento', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'centro_de_custo', label: 'Centro de Custo', type: 'text', suggestions: Cadastros.centrosCustoConhecidos() },
      { key: 'frete', label: 'Frete (R$)', type: 'number', step: '0.01' },
      { key: 'desconto', label: 'Desconto (R$)', type: 'number', step: '0.01' },
      { key: 'considerar_saida', label: 'Considerar como saída financeira', type: 'checkbox' },
      { key: 'irpf', label: 'Dedutível no IRPF', type: 'checkbox' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    if (vinculo) {
      schema.splice(1, 0,
        { key: 'etapa_id', label: 'Etapa (opcional)', type: 'select', optionsFrom: { fetch: () => vinculo.etapas, valueField: 'id', labelFn: e => e.nome } },
        { key: 'tarefa_id', label: 'Tarefa', type: 'select', optionsFrom: { fetch: () => Cadastros.tarefasConhecidas(), valueField: 'id', labelFn: t => t.nome } }
      );
    }
    UI.abrirFormulario({
      titulo: reg ? 'Editar compra' : 'Nova compra',
      schema,
      dados: reg || opcoes.dadosIniciais || Object.assign({ data: Utils.hoje(), tipo: 'Nota Fiscal', considerar_saida: true, irpf: true, frete: 0, desconto: 0 }, vinculo ? { fazenda: vinculo.fazenda, etapa_id: vinculo.etapaId || '' } : {}),
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const itens = reg ? this.itensDaCompra(reg.id) : itensDraft;
        const subtotalItens = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);

        const secao = document.createElement('div');
        secao.className = 'form-group';
        secao.innerHTML = `
          <label>Itens da compra (${itens.length}) — ${reg ? 'Total: ' + Utils.fmtMoeda(reg.valor_total) : 'Subtotal dos itens: ' + Utils.fmtMoeda(subtotalItens)}</label>
          <div class="ficha-lista">
            ${itens.length ? itens.map((i, idx) => `
              <div class="ficha-item" data-stop>
                <span>${Utils.escapeHtml(this.nomeProduto(i.produto_id))}</span>
                <span>${Utils.fmtNum(i.quantidade, 2)} ${Utils.escapeHtml(i.unidade || '')}</span>
                <span>${Utils.fmtMoeda(i.valor_unitario)}/un</span>
                <span>${Utils.fmtMoeda(i.quantidade * i.valor_unitario)}</span>
                <button type="button" class="btn btn-ghost" data-editar-item="${reg ? i.id : idx}" style="padding:4px 8px;">Editar</button>
              </div>`).join('') : '<div class="ficha-vazio">Nenhum item lançado ainda.</div>'}
          </div>
          <button type="button" class="btn btn-ghost" id="btnFichaItem" style="margin-top:8px;width:100%;">+ Adicionar item</button>
        `;

        // Posiciona a seção de itens entre "Centro de custo" e "Frete" em vez de no fim do formulário.
        const campoFrete = form.querySelector('[name="frete"]');
        const grupoFrete = campoFrete ? campoFrete.closest('.form-group') : null;
        if (grupoFrete) grupoFrete.parentNode.insertBefore(secao, grupoFrete);
        else form.appendChild(secao);

        // Captura o que o usuário já preencheu no formulário, pra não perder nada ao reabrir
        // a tela (adicionar/editar um item reabre o formulário da compra, já que os dois usam
        // o mesmo modal).
        const capturarDadosAtuais = () => {
          const fd = new FormData(form);
          const out = {};
          schema.forEach(f => {
            if (f.type === 'checkbox') out[f.key] = form.querySelector(`[name="${f.key}"]`).checked;
            else if (f.type === 'number') { const v = fd.get(f.key); out[f.key] = v === '' ? null : Number(v); }
            else if (f.type === 'date' || f.type === 'select') { const v = fd.get(f.key); out[f.key] = v === '' ? null : v; }
            else out[f.key] = fd.get(f.key) || '';
          });
          return out;
        };

        const abrirItem = (item) => {
          if (reg) {
            this.abrirFormItem(item, reg);
          } else {
            this.abrirFormItem(item, null, {
              lista: itensDraft,
              onMudou: () => this.abrirFormCompra(null, { dadosIniciais: capturarDadosAtuais(), itensDraft, vinculo })
            });
          }
        };
        secao.querySelector('#btnFichaItem').addEventListener('click', () => abrirItem(null));
        secao.querySelectorAll('[data-editar-item]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = reg ? Api.get('itens_compra', btn.dataset.editarItem) : itensDraft[Number(btn.dataset.editarItem)];
            abrirItem(item);
          });
        });
      },
      onSalvar: async (dados) => {
        if (reg) {
          await Api.atualizar('compras', reg.id, dados);
          await this.recalcularTotalCompra(reg.id);
          Utils.toast('Compra salva.');
          App.refresh();
        } else {
          const subtotalItens = itensDraft.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
          const total = subtotalItens + Number(dados.frete || 0) - Number(dados.desconto || 0);
          const vinculoDados = vinculo ? { empreendimento_id: vinculo.empreendimentoId } : {};
          const novaCompra = await Api.criar('compras', Object.assign({ valor_total: total }, vinculoDados, dados));
          for (const item of itensDraft) {
            await Api.criar('itens_compra', Object.assign({ compra_id: novaCompra.id }, item));
          }
          Utils.toast(`Compra salva com ${itensDraft.length} item(ns).`);
          App.refresh();
        }
      },
      onExcluir: reg ? async () => {
        await Api.excluir('compras', reg.id);
        Utils.toast('Compra excluída.');
        App.refresh();
      } : null
    });
  },

  // draft (só quando a compra ainda não existe): { lista, onMudou } — em vez de salvar o item
  // direto no banco, guarda num array local até a compra inteira ser salva.
  // opcoes.dadosIniciais: usado só quando item é null, pra reabrir o formulário com o que o
  // usuário já tinha preenchido depois de criar um produto novo pelo "+ Novo produto..." do select.
  abrirFormItem(item, compra, draft, opcoes) {
    opcoes = opcoes || {};
    const schema = [
      { key: 'produto_id', label: 'Produto', type: 'select', busca: true, required: true, optionsFrom: { fetch: () => Api.list('produtos').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), valueField: 'id', labelFn: p => p.nome },
        criarNovo: { label: 'Novo produto...', abrir: () => {
          const form = document.getElementById('dynForm');
          const fd = new FormData(form);
          const snapshot = {};
          schema.forEach(f => {
            if (f.type === 'number') { const v = fd.get(f.key); snapshot[f.key] = v === '' ? null : Number(v); }
            else snapshot[f.key] = fd.get(f.key) || '';
          });
          delete snapshot.produto_id;
          const reabrir = (dadosFinal) => {
            if (item) this.abrirFormItem(Object.assign({}, item, dadosFinal), compra, draft);
            else this.abrirFormItem(null, compra, draft, { dadosIniciais: dadosFinal });
          };
          this.abrirFormProduto(null, {
            onCriado: (novoProduto) => reabrir(Object.assign({}, snapshot, { produto_id: novoProduto.id })),
            onCancelado: () => reabrir(snapshot)
          });
        } } },
      { key: 'unidade', label: 'Unidade', type: 'text', suggestions: ['kg', 'g', 'Litro', 'un', 'Saco 60 Kg', 'Tonelada', 'Arroba', 'Cabeça', 'Caixa', 'Pacote', 'Rolo', 'Metro'] },
      { key: 'quantidade', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { key: 'valor_unitario', label: 'Valor unitário (R$)', type: 'number', step: '0.01', required: true }
    ];
    UI.abrirFormulario({
      titulo: item ? 'Editar item' : 'Novo item da compra',
      schema,
      dados: item || opcoes.dadosIniciais || { quantidade: 1 },
      onSalvar: async (dados) => {
        if (draft) {
          if (item) Object.assign(item, dados);
          else draft.lista.push(dados);
          // Esse form e o de "Nova compra" usam o mesmo modal; sem o await aqui, o close()
          // do próprio modal de item roda DEPOIS de reabrir o de compra e fecha ele de novo.
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        if (item) await Api.atualizar('itens_compra', item.id, dados);
        else await Api.criar('itens_compra', Object.assign({ compra_id: compra.id }, dados));
        await this.recalcularTotalCompra(compra.id);
        Utils.toast('Item salvo.');
        this.abrirFormCompra(Api.get('compras', compra.id));
      },
      onExcluir: item ? async () => {
        if (draft) {
          const idx = draft.lista.indexOf(item);
          if (idx >= 0) draft.lista.splice(idx, 1);
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        await Api.excluir('itens_compra', item.id);
        await this.recalcularTotalCompra(compra.id);
        Utils.toast('Item excluído.');
        this.abrirFormCompra(Api.get('compras', compra.id));
      } : null
    });
  },

  /* ---------- FORNECEDORES ---------- */
  renderFornecedores(container) {
    const regs = Api.list('fornecedores').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoFornecedor">+ Novo fornecedor</button></div>
      <div id="listaFornecedores"></div>`;
    container.querySelector('#btnNovoFornecedor').addEventListener('click', () => this.abrirFormFornecedor(null));
    UI.renderList(container.querySelector('#listaFornecedores'), {
      data: regs,
      emptyText: 'Nenhum fornecedor cadastrado ainda.',
      onCardClick: (r) => this.abrirFormFornecedor(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${Utils.escapeHtml(r.cpf_cnpj || '-')}</span>
          <span>${Utils.escapeHtml(r.telefone || '-')}</span>
          <span>${Utils.escapeHtml(r.cidade || '-')}</span>
        </div>`
    });
  },

  abrirFormFornecedor(reg) {
    const schema = [
      { key: 'nome', label: 'Nome/Razão social', type: 'text', required: true },
      { key: 'fantasia', label: 'Nome fantasia', type: 'text' },
      { key: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' },
      { key: 'contato', label: 'Contato', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'text' },
      { key: 'cidade', label: 'Cidade', type: 'text' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar fornecedor' : 'Novo fornecedor',
      schema,
      dados: reg || {},
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('fornecedores', reg.id, dados);
        else await Api.criar('fornecedores', dados);
        Utils.toast('Fornecedor salvo.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const emUso = Api.list('compras').some(c => c.fornecedor_id === reg.id);
        if (emUso && !Utils.confirmar('Existem compras lançadas com esse fornecedor. Excluir mesmo assim?')) return;
        await Api.excluir('fornecedores', reg.id);
        Utils.toast('Fornecedor excluído.');
        App.refresh();
      } : null
    });
  },

  /* ---------- PRODUTOS ---------- */
  renderProdutos(container) {
    const regs = Api.list('produtos').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoProduto">+ Novo produto</button></div>
      <div id="listaProdutos"></div>`;
    container.querySelector('#btnNovoProduto').addEventListener('click', () => this.abrirFormProduto(null));
    UI.renderList(container.querySelector('#listaProdutos'), {
      data: regs,
      emptyText: 'Nenhum produto cadastrado ainda.',
      onCardClick: (r) => this.abrirFormProduto(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r.categoria ? UI.badge(r.categoria, 'blue') : ''} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        ${r.estoque_minimo ? `<div class="rec-row"><span>Estoque mínimo: ${Utils.fmtNum(r.estoque_minimo, 2)}</span></div>` : ''}`
    });
  },

  // opcoes.onCriado(novoProduto)/opcoes.onCancelado(): usados quando o cadastro é aberto "por
  // dentro" de outro formulário (ex: "+ Novo produto..." dentro de Novo item da compra), pra
  // poder reabrir o formulário de origem já com o produto novo selecionado.
  abrirFormProduto(reg, opcoes) {
    opcoes = opcoes || {};
    const schema = [
      { key: 'nome', label: 'Nome do produto', type: 'text', required: true },
      { key: 'categoria', label: 'Categoria', type: 'text', suggestions: this.categoriasProduto },
      { key: 'estoque_minimo', label: 'Estoque mínimo (alerta)', type: 'number', step: '0.01' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar produto' : 'Novo produto',
      schema,
      dados: reg || {},
      onSalvar: async (dados) => {
        if (reg) {
          await Api.atualizar('produtos', reg.id, dados);
          Utils.toast('Produto salvo.');
          App.refresh();
        } else {
          const novo = await Api.criar('produtos', dados);
          Utils.toast('Produto salvo.');
          if (opcoes.onCriado) opcoes.onCriado(novo); else App.refresh();
        }
      },
      onExcluir: reg ? async () => {
        const emUso = Api.list('itens_compra').some(i => i.produto_id === reg.id);
        if (emUso && !Utils.confirmar('Existem compras com esse produto. Excluir mesmo assim?')) return;
        await Api.excluir('produtos', reg.id);
        Utils.toast('Produto excluído.');
        App.refresh();
      } : null,
      onCancelar: (!reg && opcoes.onCancelado) ? opcoes.onCancelado : undefined
    });
  },

  /* ---------- DESPESAS ----------
     Gastos que não passam por uma compra de produto com fornecedor/NF: salário, impostos,
     combustível avulso, serviços etc. Compras continua sendo só a compra de produto mesmo. */
  nomeFuncionario(id) {
    if (!id) return null;
    const f = Api.get('funcionarios', id);
    return f ? f.nome : '(removido)';
  },

  renderDespesas(container) {
    // Custos "Planejado" (vindos de uma planilha de custeio importada numa Atividade, ainda não
    // confirmados) e "Cancelado" não entram aqui — só aparecem no Financeiro depois que o
    // usuário confere e confirma que foram feitos de verdade.
    const todos = Api.list('despesas').filter(d => d.status !== 'Planejado' && d.status !== 'Cancelado');
    const mesAtual = Utils.hoje().slice(0, 7);
    const totalMes = todos.filter(r => (r.data || '').slice(0, 7) === mesAtual).reduce((s, r) => s + Number(r.valor || 0), 0);

    container.innerHTML = `
      <div class="summary-box">Total de despesas no mês: <b>${Utils.fmtMoeda(totalMes)}</b></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaDespesa">+ Nova despesa</button></div>
      <div id="listaDespesas"></div>`;
    container.querySelector('#btnNovaDespesa').addEventListener('click', () => this.abrirFormDespesa(null));

    const raiz = container.querySelector('#listaDespesas');
    if (!todos.length) {
      raiz.innerHTML = `<div class="empty-state">Nenhuma despesa lançada ainda.</div>`;
      return;
    }
    this._renderAgrupadoAnoFazendaCategoria(raiz, todos, {
      estadoKey: 'despesas',
      campoData: 'data',
      campoFazenda: 'fazenda',
      campoCategoria: 'categoria',
      campoValor: 'valor',
      itemLabel: 'despesa(s)',
      onCardClick: (r) => this.abrirFormDespesa(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.categoria || 'Despesa')} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-sub">${Utils.escapeHtml(r.descricao || '-')}${this.nomeFuncionario(r.funcionario_id) ? ' · ' + Utils.escapeHtml(this.nomeFuncionario(r.funcionario_id)) : ''}</div>
        <div class="rec-row">
          <span>${Utils.fmtData(r.data)}</span>
          <span>${Utils.fmtMoeda(r.valor)}</span>
          <span>${Utils.escapeHtml(r.fazenda || '-')}</span>
        </div>`
    });
  },

  abrirFormDespesa(reg) {
    const schema = [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'categoria', label: 'Categoria', type: 'text', suggestions: Cadastros.categoriasDespesaConhecidas() },
      { key: 'descricao', label: 'Descrição', type: 'text' },
      { key: 'numero_documento', label: 'Nº Documento', type: 'text' },
      { key: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
      // Só aparecem quando a categoria é "Salário" (ver onRender) — pagamento do salário em si
      // mais até 4 adiantamentos feitos ao longo do mês; "valor" acima vira o total calculado.
      { key: 'valor_salario', label: 'Pagamento do salário (R$)', type: 'number', step: '0.01' },
      { key: 'adiantamento_1', label: 'Adiantamento 1 (R$)', type: 'number', step: '0.01' },
      { key: 'adiantamento_2', label: 'Adiantamento 2 (R$)', type: 'number', step: '0.01' },
      { key: 'adiantamento_3', label: 'Adiantamento 3 (R$)', type: 'number', step: '0.01' },
      { key: 'adiantamento_4', label: 'Adiantamento 4 (R$)', type: 'number', step: '0.01' },
      { key: 'forma_pagamento', label: 'Forma de pagamento', type: 'text', suggestions: Cadastros.formasPagamentoConhecidas() },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: Rebanho.fazendasConhecidas() },
      { key: 'funcionario_id', label: 'Funcionário', type: 'select', optionsFrom: { fetch: () => Cadastros.funcionariosConhecidos(), valueField: 'id', labelFn: f => f.nome } },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar despesa' : 'Nova despesa',
      schema,
      dados: reg || { data: Utils.hoje() },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const campoCategoria = form.querySelector('[name="categoria"]');
        const campoValor = form.querySelector('[name="valor"]');
        const campoValorSalario = form.querySelector('[name="valor_salario"]');
        const camposAdiant = [1, 2, 3, 4].map(n => form.querySelector(`[name="adiantamento_${n}"]`));
        const campoFuncionario = form.querySelector('[name="funcionario_id"]');
        const grupoValor = campoValor.closest('.form-group');
        const grupoValorSalario = campoValorSalario.closest('.form-group');
        const gruposAdiant = camposAdiant.map(c => c.closest('.form-group'));
        const grupoFuncionario = campoFuncionario.closest('.form-group');
        const rotuloValor = grupoValor.querySelector('label');

        // O campo Funcionário só faz sentido pra despesas ligadas a pagamento de pessoal.
        // Comparação por palavra-chave (sem acento) pra cobrir as variações já lançadas
        // ("13 Salário parcela 1", "13º Salário", "Exame de admissão"/"demissão" etc.),
        // não só o nome exato da categoria.
        const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const categoriasFolhaPagamento = ['salario', 'fgts', 'exame', 'darf'];
        const ehDespesaDePessoal = () => {
          const cat = semAcento(campoCategoria.value);
          return categoriasFolhaPagamento.some(c => cat.includes(c));
        };

        // Só recalcula o total quando o usuário mexe de fato no salário/adiantamentos — nunca
        // ao só abrir o formulário, senão uma despesa de Salário antiga (sem esses campos
        // preenchidos) teria o Valor já salvo apagado só de abrir pra editar, e a sincronização
        // quebra porque o banco não aceita valor vazio.
        const recalcularTotal = () => {
          const soma = Number(campoValorSalario.value || 0) + camposAdiant.reduce((s, c) => s + Number(c.value || 0), 0);
          campoValor.value = soma.toFixed(2);
        };
        const aplicarVisibilidade = () => {
          const ehSalario = (campoCategoria.value || '').trim() === 'Salário';
          grupoValorSalario.style.display = ehSalario ? '' : 'none';
          gruposAdiant.forEach(g => g.style.display = ehSalario ? '' : 'none');
          campoValor.readOnly = ehSalario;
          rotuloValor.textContent = ehSalario ? 'Total pago (adiantamentos + salário)' : 'Valor (R$)';
          grupoFuncionario.style.display = ehDespesaDePessoal() ? '' : 'none';
        };

        let categoriaAnterior = (campoCategoria.value || '').trim();
        const aoMudarCategoria = () => {
          const agora = (campoCategoria.value || '').trim();
          const entrouAgoraEmSalario = agora === 'Salário' && categoriaAnterior !== 'Salário';
          aplicarVisibilidade();
          if (entrouAgoraEmSalario) recalcularTotal();
          categoriaAnterior = agora;
        };

        campoCategoria.addEventListener('input', aoMudarCategoria);
        campoCategoria.addEventListener('change', aoMudarCategoria);
        campoValorSalario.addEventListener('input', recalcularTotal);
        camposAdiant.forEach(c => c.addEventListener('input', recalcularTotal));
        aplicarVisibilidade();
      },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('despesas', reg.id, dados);
        else await Api.criar('despesas', dados);
        Utils.toast('Despesa salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('despesas', reg.id);
        Utils.toast('Despesa excluída.');
        App.refresh();
      } : null
    });
  },

  /* ---------- PRODUÇÃO ----------
     Vendas da produção agrícola (ex: grãos) — mesma estrutura do formulário "Produção" do
     Capataz antigo: safra, NF, data, destinatário, quantidade em toneladas, valor unitário
     e valor total (calculado). */
  safrasConhecidas() {
    return Array.from(new Set(Api.list('producao').map(r => r.safra).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  },
  destinatariosConhecidos() {
    return Array.from(new Set(Api.list('producao').map(r => r.destinatario).filter(Boolean)));
  },

  renderProducao(container) {
    const todos = Api.list('producao');
    const anoAtual = Utils.hoje().slice(0, 4);
    const totalAno = todos.filter(r => (r.data || '').slice(0, 4) === anoAtual).reduce((s, r) => s + Number(r.valor_total || 0), 0);

    container.innerHTML = `
      <div class="summary-box">Total vendido no ano: <b>${Utils.fmtMoeda(totalAno)}</b></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaProducao">+ Nova venda de produção</button></div>
      <div id="listaProducao"></div>`;
    container.querySelector('#btnNovaProducao').addEventListener('click', () => this.abrirFormProducao(null));

    const raiz = container.querySelector('#listaProducao');
    if (!todos.length) {
      raiz.innerHTML = `<div class="empty-state">Nenhuma venda de produção lançada ainda.</div>`;
      return;
    }
    this._renderAgrupadoAnoFazenda(raiz, todos, {
      estadoKey: 'producao',
      campoData: 'data',
      campoFazenda: 'fazenda',
      campoValor: 'valor_total',
      itemLabel: 'venda(s)',
      onCardClick: (r) => this.abrirFormProducao(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.destinatario || '-')} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-sub">${r.safra ? 'Safra ' + Utils.escapeHtml(r.safra) : '-'}${r.nf ? ' · NF ' + Utils.escapeHtml(r.nf) : ''}</div>
        <div class="rec-row">
          <span>${r.data ? Utils.fmtData(r.data) : '-'}</span>
          <span>${Utils.fmtNum(r.quantidade, 2)} ${Utils.escapeHtml(r.unidade || '')}</span>
          <span>${Utils.fmtMoeda(r.valor_total)}</span>
        </div>`
    });
  },

  atividadesProducaoConhecidas() {
    return Array.from(new Set(Api.list('producao').map(r => r.atividade).filter(Boolean)));
  },
  produtosProducaoConhecidos() {
    return Array.from(new Set(Api.list('producao').map(r => r.produto).filter(Boolean)));
  },

  abrirFormProducao(reg) {
    const schema = [
      { key: 'safra', label: 'Safra', type: 'text', suggestions: this.safrasConhecidas() },
      { key: 'atividade', label: 'Atividade', type: 'text', suggestions: ['Agricultura', 'Pecuária'].concat(this.atividadesProducaoConhecidas()) },
      { key: 'produto', label: 'Produto', type: 'text', suggestions: this.produtosProducaoConhecidos() },
      { key: 'nf', label: 'Número da NF', type: 'text', scanner: true },
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'destinatario', label: 'Destinatário (comprador)', type: 'text', suggestions: this.destinatariosConhecidos() },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'unidade', label: 'Unidade', type: 'text', suggestions: ['Saca 60 kg', 'Tonelada', 'Arroba', 'Cabeça', 'Litro'] },
      { key: 'quantidade', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { key: 'valor_unitario', label: 'Valor unitário (R$)', type: 'number', step: '0.01', required: true },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar venda de produção' : 'Nova venda de produção',
      schema,
      dados: reg || { data: Utils.hoje() },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const campoQtd = form.querySelector('[name="quantidade"]');
        const campoUnit = form.querySelector('[name="valor_unitario"]');
        const elTotal = document.createElement('div');
        elTotal.className = 'form-group';
        elTotal.innerHTML = `<label>Valor total</label><div style="font-weight:600;">${Utils.fmtMoeda((Number(reg && reg.quantidade) || 0) * (Number(reg && reg.valor_unitario) || 0))}</div>`;
        campoUnit.closest('.form-group').insertAdjacentElement('afterend', elTotal);
        const atualizarTotal = () => {
          const total = (Number(campoQtd.value) || 0) * (Number(campoUnit.value) || 0);
          elTotal.querySelector('div').textContent = Utils.fmtMoeda(total);
        };
        campoQtd.addEventListener('input', atualizarTotal);
        campoUnit.addEventListener('input', atualizarTotal);
      },
      onSalvar: async (dados) => {
        dados.valor_total = Number(dados.quantidade || 0) * Number(dados.valor_unitario || 0);
        if (reg) await Api.atualizar('producao', reg.id, dados);
        else await Api.criar('producao', dados);
        Utils.toast('Venda de produção salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('producao', reg.id);
        Utils.toast('Venda de produção excluída.');
        App.refresh();
      } : null
    });
  },

  /* ---------- VENDAS ----------
     Vendas de safra (soja/grãos por saca) — mesma estrutura do formulário "Vendas" do
     Capataz antigo: safra, data da venda, comprador, data de pagamento, preço por saca,
     quantidade de sacas e o Funrural (retido sobre o valor bruto), chegando no valor líquido. */
  safrasVendasConhecidas() {
    return Array.from(new Set(Api.list('vendas').map(r => r.safra).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  },
  compradoresConhecidos() {
    return Array.from(new Set(Api.list('vendas').map(r => r.comprador).filter(Boolean)));
  },
  produtosVendaConhecidos() {
    return Array.from(new Set(Api.list('vendas').map(r => r.produto).filter(Boolean)));
  },

  renderVendas(container) {
    const todos = Api.list('vendas');
    const anoAtual = Utils.hoje().slice(0, 4);
    const totalAno = todos.filter(r => (r.data_venda || '').slice(0, 4) === anoAtual).reduce((s, r) => s + Number(r.valor_total || 0), 0);

    container.innerHTML = `
      <div class="summary-box">Total líquido vendido no ano: <b>${Utils.fmtMoeda(totalAno)}</b></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaVenda">+ Nova venda</button></div>
      <div id="listaVendas"></div>`;
    container.querySelector('#btnNovaVenda').addEventListener('click', () => this.abrirFormVenda(null));

    const raiz = container.querySelector('#listaVendas');
    if (!todos.length) {
      raiz.innerHTML = `<div class="empty-state">Nenhuma venda lançada ainda.</div>`;
      return;
    }
    this._renderAgrupadoAnoFazenda(raiz, todos, {
      estadoKey: 'vendas',
      campoData: 'data_venda',
      campoFazenda: 'fazenda',
      campoValor: 'valor_total',
      itemLabel: 'venda(s)',
      onCardClick: (r) => this.abrirFormVenda(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.comprador || '-')} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-sub">${r.safra ? 'Safra ' + Utils.escapeHtml(r.safra) : '-'}</div>
        <div class="rec-row">
          <span>${r.data_venda ? Utils.fmtData(r.data_venda) : '-'}</span>
          <span>${Utils.fmtNum(r.quant_sc, 0)} sc</span>
          <span>${Utils.fmtMoeda(r.valor_total)}</span>
        </div>`
    });
  },

  abrirFormVenda(reg) {
    const schema = [
      { key: 'safra', label: 'Safra', type: 'text', suggestions: this.safrasVendasConhecidas() },
      { key: 'produto', label: 'Produto', type: 'text', suggestions: this.produtosVendaConhecidos() },
      { key: 'data_venda', label: 'Data da venda', type: 'date' },
      { key: 'comprador', label: 'Comprador', type: 'text', suggestions: this.compradoresConhecidos() },
      { key: 'data_pgto', label: 'Data do pagamento', type: 'date' },
      { key: 'unidade', label: 'Unidade', type: 'text', suggestions: ['Saco 60 Kg', 'Tonelada', 'Arroba', 'Cabeça'] },
      { key: 'preco_sc', label: 'Preço (R$/un)', type: 'number', step: '0.01', required: true },
      { key: 'cotacao_dolar', label: 'Cotação do dólar no dia (R$)', type: 'number', step: '0.01' },
      { key: 'preco_sc_usd', label: 'Preço unitário (US$)', type: 'number', step: '0.01' },
      { key: 'quant_sc', label: 'Quantidade', type: 'number', step: '1', required: true },
      { key: 'aliq_funrural', label: 'Alíquota Funrural (%)', type: 'number', step: '0.01' },
      { key: 'valor_pago', label: 'Valor já pago (R$)', type: 'number', step: '0.01' },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    const calcular = (dados) => {
      const bruto = Number(dados.preco_sc || 0) * Number(dados.quant_sc || 0);
      const funrural = bruto * Number(dados.aliq_funrural || 0) / 100;
      return { bruto, funrural, total: bruto - funrural };
    };
    UI.abrirFormulario({
      titulo: reg ? 'Editar venda' : 'Nova venda',
      schema,
      dados: reg || { data_venda: Utils.hoje(), aliq_funrural: 1.5 },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const campoPreco = form.querySelector('[name="preco_sc"]');
        const campoQtd = form.querySelector('[name="quant_sc"]');
        const campoAliq = form.querySelector('[name="aliq_funrural"]');
        const campoCotacao = form.querySelector('[name="cotacao_dolar"]');
        const campoPrecoUsd = form.querySelector('[name="preco_sc_usd"]');
        campoPrecoUsd.readOnly = true;
        campoPrecoUsd.closest('.form-group').querySelector('label').textContent = 'Preço unitário (US$) — calculado';

        const elResumo = document.createElement('div');
        elResumo.className = 'form-group';
        const montarResumo = () => {
          const dadosAtuais = { preco_sc: campoPreco.value, quant_sc: campoQtd.value, aliq_funrural: campoAliq.value };
          const { bruto, funrural, total } = calcular(dadosAtuais);
          const cotacao = Number(campoCotacao.value || 0);
          const brutoUsd = cotacao ? bruto / cotacao : null;
          const totalUsd = cotacao ? total / cotacao : null;
          elResumo.innerHTML = `
            <label>Resumo</label>
            <div class="rec-row"><span>Valor bruto</span><b>${Utils.fmtMoeda(bruto)}${brutoUsd !== null ? ' · US$ ' + Utils.fmtNum(brutoUsd, 2) : ''}</b></div>
            <div class="rec-row"><span>Funrural</span><b>${Utils.fmtMoeda(funrural)}</b></div>
            <div class="rec-row"><span>Valor líquido</span><b>${Utils.fmtMoeda(total)}${totalUsd !== null ? ' · US$ ' + Utils.fmtNum(totalUsd, 2) : ''}</b></div>`;
        };
        const recalcularPrecoUsd = () => {
          const cotacao = Number(campoCotacao.value || 0);
          campoPrecoUsd.value = cotacao ? (Number(campoPreco.value || 0) / cotacao).toFixed(2) : '';
        };
        const atualizarTudo = () => { recalcularPrecoUsd(); montarResumo(); };

        atualizarTudo();
        campoAliq.closest('.form-group').insertAdjacentElement('afterend', elResumo);
        [campoPreco, campoQtd, campoAliq, campoCotacao].forEach(el => el.addEventListener('input', atualizarTudo));
      },
      onSalvar: async (dados) => {
        const { funrural, total } = calcular(dados);
        dados.funrural = funrural;
        dados.valor_total = total;
        if (reg) await Api.atualizar('vendas', reg.id, dados);
        else await Api.criar('vendas', dados);
        Utils.toast('Venda salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('vendas', reg.id);
        Utils.toast('Venda excluída.');
        App.refresh();
      } : null
    });
  }
};
