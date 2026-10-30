/* ===================== Módulo: Cadastros (Fazendas, Proprietários, Fornecedores, Produtos, Funcionários) ===================== */
const Cadastros = {
  // "group" organiza a barra de sub-abas em seções (ver App.renderTopBar) — só muda a
  // apresentação, a navegação continua sendo pela mesma lista de sempre.
  subtabs: [
    { key: 'fazendas', label: 'Fazendas', group: 'Propriedade' },
    { key: 'proprietarios', label: 'Proprietários', group: 'Propriedade' },
    { key: 'fornecedores', label: 'Fornecedores', group: 'Financeiro' },
    { key: 'produtos', label: 'Produtos', group: 'Financeiro' },
    { key: 'centrosCusto', label: 'Centros de Custo', group: 'Financeiro' },
    { key: 'categoriasDespesa', label: 'Categorias de Despesa', group: 'Financeiro' },
    { key: 'formasPagamento', label: 'Formas de Pagamento', group: 'Financeiro' },
    { key: 'tarefas', label: 'Tarefas', group: 'Atividades' },
    { key: 'funcionarios', label: 'Funcionários', group: 'Equipe' },
    { key: 'documentos', label: 'Documentos', group: 'Outros' }
  ],

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">Conecte o app ao banco de dados primeiro.</div>`;
      return;
    }
    sub = sub || 'fazendas';
    const map = {
      fazendas: () => this.renderFazendas(container),
      proprietarios: () => this.renderProprietarios(container),
      // Fornecedores e Produtos continuam implementados no módulo Compras (mesma tabela/dados
      // de sempre — só aparecem aqui também, pra ficar tudo num lugar só).
      fornecedores: () => Compras.renderFornecedores(container),
      produtos: () => Compras.renderProdutos(container),
      funcionarios: () => this.renderFuncionarios(container),
      centrosCusto: () => this.renderCentrosCusto(container),
      categoriasDespesa: () => this.renderCategoriasDespesa(container),
      formasPagamento: () => this.renderFormasPagamento(container),
      tarefas: () => this.renderTarefas(container),
      documentos: () => this.renderDocumentos(container)
    };
    (map[sub] || map.fazendas)();
  },

  proprietariosDaFazenda(fazendaId) {
    const vinculos = Api.list('fazenda_proprietarios').filter(v => v.fazenda_id === fazendaId);
    return vinculos.map(v => Api.get('proprietarios', v.proprietario_id)).filter(Boolean);
  },

  /* Lê um arquivo .kml (texto puro) ou .kmz (zip contendo um .kml dentro) e devolve o
     texto do KML. KMZ precisa do JSZip (carregado via CDN) pra descompactar. */
  async lerArquivoPoligono(arquivo) {
    const nome = (arquivo.name || '').toLowerCase();
    const ehKmz = nome.endsWith('.kmz');
    if (!ehKmz) {
      return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        leitor.readAsText(arquivo);
      });
    }
    if (!window.JSZip) throw new Error('Não deu pra abrir o .kmz (sem conexão pra carregar o descompactador). Tente de novo com internet, ou exporte como .kml.');
    const zip = await JSZip.loadAsync(arquivo);
    const entradaKml = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.kml'));
    if (!entradaKml) throw new Error('O arquivo .kmz não tem nenhum .kml dentro.');
    return entradaKml.async('text');
  },

  /* Extrai os pontos [lat, lng] do polígono a partir do texto salvo/colado: aceita um KML
     (lê a tag <coordinates>) ou uma lista simples "lat,lng lat,lng ...". */
  parseCoordenadasPoligono(texto) {
    if (!texto || !texto.trim()) return null;
    const bruto = texto.trim();
    if (bruto.startsWith('<')) {
      try {
        const xml = new DOMParser().parseFromString(bruto, 'text/xml');
        if (xml.querySelector('parsererror')) return null;
        const coordsEl = xml.querySelector('coordinates');
        if (!coordsEl) return null;
        const pontos = coordsEl.textContent.trim().split(/\s+/).map(par => {
          const [lon, lat] = par.split(',').map(Number);
          return [lat, lon];
        }).filter(p => isFinite(p[0]) && isFinite(p[1]));
        return pontos.length >= 3 ? pontos : null;
      } catch (e) { return null; }
    }
    const pontos = bruto.split(/\s+/).map(par => par.split(',').map(Number)).filter(p => p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
    return pontos.length >= 3 ? pontos : null;
  },

  /* Extrai TODOS os polígonos de um KML (um arquivo do Google Earth pode ter vários
     Placemarks, cada um com seu próprio polígono — ex: vários pastos marcados de uma vez).
     Devolve [{ nome, pontos }] ou null se não achar nenhum polígono. */
  parseTodosPoligonosKml(texto) {
    if (!texto || !texto.trim().startsWith('<')) return null;
    try {
      const xml = new DOMParser().parseFromString(texto.trim(), 'text/xml');
      if (xml.querySelector('parsererror')) return null;
      const resultado = [];
      Array.from(xml.querySelectorAll('Placemark')).forEach((pm) => {
        const coordsEl = pm.querySelector('Polygon coordinates');
        if (!coordsEl) return; // Placemark sem polígono (ponto, linha, pasta...) — ignora
        const pontos = coordsEl.textContent.trim().split(/\s+/).map(par => {
          const [lon, lat] = par.split(',').map(Number);
          return [lat, lon];
        }).filter(p => isFinite(p[0]) && isFinite(p[1]));
        if (pontos.length < 3) return;
        const nomeEl = pm.querySelector('name');
        const nome = (nomeEl && nomeEl.textContent.trim()) || `Pasto importado ${resultado.length + 1}`;
        resultado.push({ nome, pontos });
      });
      return resultado.length ? resultado : null;
    } catch (e) { return null; }
  },

  /* Desenha (ou redesenha) o preview do polígono sobre imagem de satélite no elemento informado. */
  renderMapaPoligono(elMapa, pontos) {
    if (!window.L) {
      elMapa.innerHTML = '<div class="empty-state">Mapa indisponível (sem conexão para carregar o Leaflet).</div>';
      return;
    }
    if (!pontos) {
      elMapa.innerHTML = '<div class="empty-state">Envie um arquivo KML ou cole as coordenadas acima pra ver a propriedade no satélite.</div>';
      return;
    }
    elMapa.innerHTML = '';
    const mapa = L.map(elMapa, { attributionControl: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(mapa);
    const area = L.polygon(pontos, { color: '#ffeb3b', weight: 3, fillOpacity: 0.12 }).addTo(mapa);
    mapa.fitBounds(area.getBounds(), { padding: [16, 16] });
  },

  /* ---------- FAZENDAS ---------- */
  renderFazendas(container) {
    const regs = Api.list('fazendas').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaFazenda">+ Nova fazenda</button></div>
      <div id="listaFazendas"></div>`;
    container.querySelector('#btnNovaFazenda').addEventListener('click', () => this.abrirFormFazenda(null));
    UI.renderList(container.querySelector('#listaFazendas'), {
      data: regs,
      emptyText: 'Nenhuma fazenda cadastrada ainda.',
      onCardClick: (r) => this.abrirFormFazenda(r),
      renderCard: (r) => {
        const nAnimais = Api.list('animais').filter(a => a.fazenda === r.nome && (a.situacao || 'Ativo') === 'Ativo').length;
        const donos = this.proprietariosDaFazenda(r.id).map(p => p.nome);
        return `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${r.hectares ? Utils.fmtNum(r.hectares, 1) + ' ha' : '-'}</span>
          <span>${Utils.escapeHtml(r.localizacao || '-')}</span>
          <span>${nAnimais} animal(is) ativo(s)</span>
        </div>
        <div class="rec-sub">Proprietário(s): ${donos.length ? Utils.escapeHtml(donos.join(', ')) : UI.badge('Nenhum vinculado', 'orange')}</div>`;
      }
    });
  },

  abrirFormFazenda(reg) {
    const schema = [
      { key: 'nome', label: 'Nome da fazenda', type: 'text', required: true },
      { key: 'proprietarios_ids', label: 'Proprietário(s)', type: 'multiselect', optionsFrom: { fetch: () => Api.list('proprietarios'), valueField: 'id', labelFn: p => p.nome } },
      { key: 'localizacao', label: 'Localização/referência', type: 'text' },
      { key: 'hectares', label: 'Área (ha)', type: 'number', step: '0.01' },
      { key: 'municipio', label: 'Município', type: 'text' },
      { key: 'uf', label: 'UF', type: 'text', placeholder: 'TO' },
      { key: 'cep', label: 'CEP', type: 'text' },
      { key: 'inscricao_estadual', label: 'Inscrição Estadual (do imóvel)', type: 'text' },
      { key: 'car', label: 'CAR (Cadastro Ambiental Rural)', type: 'text', placeholder: 'TO-XXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' },
      { key: 'poligono', label: 'Polígono da propriedade', type: 'textarea', placeholder: 'Cole aqui as coordenadas do polígono (conteúdo de um KML, ou lista de pontos lat,long) — ou use o botão abaixo pra enviar um arquivo .kml/.kmz' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    const donosAtuais = reg ? this.proprietariosDaFazenda(reg.id).map(p => p.id) : [];
    UI.abrirFormulario({
      titulo: reg ? 'Editar fazenda' : 'Nova fazenda',
      schema,
      dados: reg ? Object.assign({}, reg, { proprietarios_ids: donosAtuais }) : {},
      onRender: (box) => {
        const campoPoligono = box.querySelector('[name="poligono"]');
        const grupoPoligono = campoPoligono.closest('.form-group');

        const extra = document.createElement('div');
        extra.className = 'form-group';
        extra.innerHTML = `
          <input type="file" id="inputKml" accept=".kml,.kmz,.xml" style="display:none;"/>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button type="button" class="btn btn-ghost" id="btnEnviarKml" style="flex:1;">📎 Enviar arquivo KML ou KMZ (ex: exportado do SICAR)</button>
            <button type="button" class="btn btn-ghost" id="btnRemoverPoligono" title="Remover polígono" style="flex:0 0 auto;">🗑️</button>
          </div>
          <div id="mapaPoligono" class="mapa-poligono"></div>
        `;
        grupoPoligono.parentNode.insertBefore(extra, grupoPoligono.nextSibling);

        const elMapa = extra.querySelector('#mapaPoligono');
        const atualizarPreview = () => this.renderMapaPoligono(elMapa, this.parseCoordenadasPoligono(campoPoligono.value));

        extra.querySelector('#btnEnviarKml').addEventListener('click', () => extra.querySelector('#inputKml').click());
        extra.querySelector('#btnRemoverPoligono').addEventListener('click', () => {
          if (!campoPoligono.value.trim()) return;
          if (!Utils.confirmar('Remover o polígono salvo desta fazenda?')) return;
          campoPoligono.value = '';
          atualizarPreview();
        });
        extra.querySelector('#inputKml').addEventListener('change', async (e) => {
          const arquivo = e.target.files[0];
          if (!arquivo) return;
          try {
            campoPoligono.value = await this.lerArquivoPoligono(arquivo);
          } catch (err) {
            Utils.toast(err.message || 'Não foi possível ler o arquivo.', 'error');
            return;
          }
          atualizarPreview();
        });
        campoPoligono.addEventListener('input', () => atualizarPreview());
        campoPoligono.addEventListener('change', () => atualizarPreview());

        // Dá um tempo pro modal terminar de abrir (senão o Leaflet calcula o tamanho errado, com o box ainda em display:none)
        setTimeout(atualizarPreview, 50);
      },
      onSalvar: async (dados) => {
        const idsSelecionados = dados.proprietarios_ids || [];
        delete dados.proprietarios_ids;

        const fazendaSalva = reg ? (await Api.atualizar('fazendas', reg.id, dados), reg) : await Api.criar('fazendas', dados);

        // sincroniza a tabela de vínculo com o que foi marcado no formulário
        const vinculosAtuais = Api.list('fazenda_proprietarios').filter(v => v.fazenda_id === fazendaSalva.id);
        const paraRemover = vinculosAtuais.filter(v => !idsSelecionados.includes(v.proprietario_id));
        const paraAdicionar = idsSelecionados.filter(id => !vinculosAtuais.some(v => v.proprietario_id === id));
        await Promise.all([
          ...paraRemover.map(v => Api.excluir('fazenda_proprietarios', v.id)),
          ...paraAdicionar.map(id => Api.criar('fazenda_proprietarios', { fazenda_id: fazendaSalva.id, proprietario_id: id }))
        ]);

        Utils.toast('Fazenda salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const emUso = Api.list('animais').some(a => a.fazenda === reg.nome);
        if (emUso && !Utils.confirmar('Existem animais cadastrados nessa fazenda. Excluir mesmo assim?')) return;
        await Api.excluir('fazendas', reg.id);
        Utils.toast('Fazenda excluída.');
        App.refresh();
      } : null
    });
  },

  /* ---------- PROPRIETÁRIOS ---------- */
  renderProprietarios(container) {
    const regs = Api.list('proprietarios').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoProprietario">+ Novo proprietário</button></div>
      <div id="listaProprietarios"></div>`;
    container.querySelector('#btnNovoProprietario').addEventListener('click', () => this.abrirFormProprietario(null));
    UI.renderList(container.querySelector('#listaProprietarios'), {
      data: regs,
      emptyText: 'Nenhum proprietário cadastrado ainda.',
      onCardClick: (r) => this.abrirFormProprietario(r),
      renderCard: (r) => {
        const nAnimais = Api.list('animais').filter(a => a.proprietario_id === r.id && (a.situacao || 'Ativo') === 'Ativo').length;
        const fazendas = Api.list('fazenda_proprietarios').filter(v => v.proprietario_id === r.id).map(v => Api.get('fazendas', v.fazenda_id)).filter(Boolean).map(f => f.nome);
        return `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${Utils.escapeHtml(r.telefone || '-')}</span>
          <span>${Utils.escapeHtml(r.cpf_cnpj || '-')}</span>
          <span>${nAnimais} animal(is) ativo(s)</span>
        </div>
        <div class="rec-sub">Fazenda(s): ${fazendas.length ? Utils.escapeHtml(fazendas.join(', ')) : '-'}</div>`;
      }
    });
  },

  abrirFormProprietario(reg) {
    const schema = [
      { key: 'nome', label: 'Nome', type: 'text', required: true },
      { key: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' },
      { key: 'inscricao_estadual', label: 'Inscrição Estadual', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'text' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar proprietário' : 'Novo proprietário',
      schema,
      dados: reg || {},
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('proprietarios', reg.id, dados);
        else await Api.criar('proprietarios', dados);
        Utils.toast('Proprietário salvo.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const emUso = Api.list('animais').some(a => a.proprietario_id === reg.id);
        if (emUso && !Utils.confirmar('Existem animais cadastrados com esse proprietário. Excluir mesmo assim?')) return;
        await Api.excluir('proprietarios', reg.id);
        Utils.toast('Proprietário excluído.');
        App.refresh();
      } : null
    });
  },

  /* ---------- FUNCIONÁRIOS ---------- */
  cargosSugestao: ['Vaqueiro', 'Tratorista', 'Peão', 'Capataz', 'Diarista', 'Administrativo', 'Veterinário', 'Outro'],

  renderFuncionarios(container) {
    const regs = Api.list('funcionarios').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoFuncionario">+ Novo funcionário</button></div>
      <div class="filter-chips" id="filtroFuncionario">
        <button class="chip active" data-f="ativos">Ativos</button>
        <button class="chip" data-f="todos">Todos</button>
      </div>
      <div id="listaFuncionarios"></div>`;
    container.querySelector('#btnNovoFuncionario').addEventListener('click', () => this.abrirFormFuncionario(null));

    let filtro = 'ativos';
    const desenhar = () => {
      const lista = filtro === 'ativos' ? regs.filter(r => (r.situacao || 'Ativo') === 'Ativo') : regs;
      UI.renderList(container.querySelector('#listaFuncionarios'), {
        data: lista,
        emptyText: 'Nenhum funcionário cadastrado ainda.',
        onCardClick: (r) => this.abrirFormFuncionario(r),
        renderCard: (r) => `
          <div class="rec-title">${Utils.escapeHtml(r.nome)} ${(r.situacao || 'Ativo') === 'Inativo' ? UI.badge('Inativo', 'red') : ''} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
          <div class="rec-row">
            <span>${Utils.escapeHtml(r.cargo || '-')}</span>
            <span>${Utils.escapeHtml(r.telefone || '-')}</span>
            <span>${Utils.escapeHtml(r.fazenda || '-')}</span>
          </div>
          ${r.data_admissao ? `<div class="rec-sub">Admissão: ${Utils.fmtData(r.data_admissao)}</div>` : ''}`
      });
    };
    container.querySelectorAll('#filtroFuncionario .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroFuncionario .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filtro = chip.dataset.f;
        desenhar();
      });
    });
    desenhar();
  },

  funcionariosConhecidos() {
    return Api.list('funcionarios').filter(f => (f.situacao || 'Ativo') === 'Ativo').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  abrirFormFuncionario(reg) {
    const schema = [
      { key: 'nome', label: 'Nome', type: 'text', required: true },
      { key: 'cpf', label: 'CPF', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'text' },
      { key: 'cargo', label: 'Cargo/Função', type: 'text', suggestions: this.cargosSugestao },
      { key: 'fazenda', label: 'Fazenda onde trabalha', type: 'text', suggestions: Rebanho.fazendasConhecidas() },
      { key: 'data_admissao', label: 'Data de admissão', type: 'date' },
      { key: 'situacao', label: 'Situação', type: 'select', options: [{ value: 'Ativo', label: 'Ativo' }, { value: 'Inativo', label: 'Inativo' }] },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar funcionário' : 'Novo funcionário',
      schema,
      dados: reg || { situacao: 'Ativo' },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('funcionarios', reg.id, dados);
        else await Api.criar('funcionarios', dados);
        Utils.toast('Funcionário salvo.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const emUso = Api.list('despesas').some(d => d.funcionario_id === reg.id);
        if (emUso && !Utils.confirmar('Existem despesas lançadas com esse funcionário. Excluir mesmo assim?')) return;
        await Api.excluir('funcionarios', reg.id);
        Utils.toast('Funcionário excluído.');
        App.refresh();
      } : null
    });
  },

  /* ---------- CENTROS DE CUSTO ----------
     Lista gerenciável (antes era só texto livre baseado no histórico de compras — agora dá
     pra cadastrar/editar/excluir os nomes certos aqui, e eles aparecem como sugestão em
     Compras/Despesas). */
  renderCentrosCusto(container) {
    const regs = Api.list('centros_custo').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoCentroCusto">+ Novo centro de custo</button></div>
      <div id="listaCentrosCusto"></div>`;
    container.querySelector('#btnNovoCentroCusto').addEventListener('click', () => this.abrirFormCentroCusto(null));
    UI.renderList(container.querySelector('#listaCentrosCusto'), {
      data: regs,
      emptyText: 'Nenhum centro de custo cadastrado ainda.',
      onCardClick: (r) => this.abrirFormCentroCusto(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        ${r.observacao ? `<div class="rec-sub">${Utils.escapeHtml(r.observacao)}</div>` : ''}`
    });
  },

  centrosCustoConhecidos() {
    return Array.from(new Set(Api.list('centros_custo').map(c => c.nome).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  },

  abrirFormCentroCusto(reg) {
    const schema = [
      { key: 'nome', label: 'Nome do centro de custo', type: 'text', required: true },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar centro de custo' : 'Novo centro de custo',
      schema,
      dados: reg || {},
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('centros_custo', reg.id, dados);
        else await Api.criar('centros_custo', dados);
        Utils.toast('Centro de custo salvo.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir('centros_custo', reg.id);
        Utils.toast('Centro de custo excluído.');
        App.refresh();
      } : null
    });
  },

  /* ---------- LISTAS SIMPLES (nome + observação) ----------
     Fábrica genérica pra cadastros de uma lista só (Categorias de Despesa, Formas de
     Pagamento, e poderia valer pro Centro de Custo também) — evita repetir o mesmo
     render/form três vezes. */
  _listaSimples(tabela, rotulo) {
    return {
      conhecidos: () => Array.from(new Set(Api.list(tabela).map(r => r.nome).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      render: (container) => {
        const regs = Api.list(tabela).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        container.innerHTML = `
          <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoItemLista">+ Novo(a) ${Utils.escapeHtml(rotulo.toLowerCase())}</button></div>
          <div id="listaItemLista"></div>`;
        container.querySelector('#btnNovoItemLista').addEventListener('click', () => this._abrirFormListaSimples(tabela, rotulo, null));
        UI.renderList(container.querySelector('#listaItemLista'), {
          data: regs,
          emptyText: `Nenhum(a) ${rotulo.toLowerCase()} cadastrado(a) ainda.`,
          onCardClick: (r) => this._abrirFormListaSimples(tabela, rotulo, r),
          renderCard: (r) => `
            <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
            ${r.observacao ? `<div class="rec-sub">${Utils.escapeHtml(r.observacao)}</div>` : ''}`
        });
      }
    };
  },

  _abrirFormListaSimples(tabela, rotulo, reg) {
    const schema = [
      { key: 'nome', label: `Nome ${reg ? '' : '— ' + rotulo}`.trim(), type: 'text', required: true },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? `Editar ${rotulo.toLowerCase()}` : `Novo(a) ${rotulo.toLowerCase()}`,
      schema,
      dados: reg || {},
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar(tabela, reg.id, dados);
        else await Api.criar(tabela, dados);
        Utils.toast(`${rotulo} salvo(a).`);
        App.refresh();
      },
      onExcluir: reg ? async () => {
        await Api.excluir(tabela, reg.id);
        Utils.toast(`${rotulo} excluído(a).`);
        App.refresh();
      } : null
    });
  },

  renderCategoriasDespesa(container) { this._listaSimples('categorias_despesa', 'Categoria de despesa').render(container); },
  categoriasDespesaConhecidas() { return this._listaSimples('categorias_despesa').conhecidos(); },

  renderFormasPagamento(container) { this._listaSimples('formas_pagamento', 'Forma de pagamento').render(container); },
  formasPagamentoConhecidas() { return this._listaSimples('formas_pagamento').conhecidos(); },

  /* ---------- TAREFAS ----------
     Tipos de tarefa usados em "Lançar custo" dentro de uma Atividade (ex: Preparo do solo,
     Pulverização, Colheita, Vacinação) — não confundir com o menu "Lista de Afazeres" (checklist
     do dia a dia). Precisa do cadastro completo (com id), não só dos nomes, porque o formulário
     de custo usa um <select> de verdade (liga a despesa à tarefa por id). */
  renderTarefas(container) { this._listaSimples('tarefas', 'Tarefa').render(container); },
  tarefasConhecidas() { return Api.list('tarefas').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')); },

  /* ---------- DOCUMENTOS ----------
     Fotos/PDFs avulsos ligados a uma fazenda (declaração de rebanho, NF, GTA escaneada etc.),
     sem vínculo com um formulário específico — mesma ideia da aba "Documentos" do capataz
     antigo. Reaproveita o upload pro Supabase Storage (bucket "anexos") já usado na GTA. */
  renderDocumentos(container) {
    const regs = Api.list('documentos').sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoDocumento">+ Novo documento</button></div>
      <div id="listaDocumentos"></div>`;
    container.querySelector('#btnNovoDocumento').addEventListener('click', () => this.abrirFormDocumento(null));
    UI.renderList(container.querySelector('#listaDocumentos'), {
      data: regs,
      emptyText: 'Nenhum documento anexado ainda.',
      onCardClick: (r) => this.abrirFormDocumento(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.descricao || 'Documento')} ${r.arquivo_url ? '📎' : ''} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${r.data ? Utils.fmtData(r.data) : '-'}</span>
          <span>${Utils.escapeHtml(r.fazenda || '-')}</span>
        </div>`
    });
  },

  // Monta a UI de upload de arquivo num form genérico, igual à da GTA: usa dois campos ocultos
  // do schema (urlKey/nomeKey) só pra aproveitar a serialização automática do form.
  _montarCampoAnexo(form, urlKey, nomeKey, labelBotao) {
    const campoUrl = form.querySelector(`[name="${urlKey}"]`);
    const campoNome = form.querySelector(`[name="${nomeKey}"]`);
    const grupoUrl = campoUrl.closest('.form-group');
    const grupoNome = campoNome.closest('.form-group');
    grupoUrl.style.display = 'none';
    grupoNome.style.display = 'none';

    const secao = document.createElement('div');
    secao.className = 'form-group';
    const idInput = 'inputAnexo_' + urlKey;
    const idAtual = 'anexoAtual_' + urlKey;
    const idBtn = 'btnEnviarAnexo_' + urlKey;
    secao.innerHTML = `
      <label>Arquivo</label>
      <input type="file" id="${idInput}" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none;"/>
      <div id="${idAtual}"></div>
      <button type="button" class="btn btn-ghost" id="${idBtn}" style="width:100%;">📎 ${labelBotao || 'Anexar arquivo'}</button>
    `;
    grupoNome.parentNode.insertBefore(secao, grupoNome.nextSibling);

    const elAtual = secao.querySelector('#' + idAtual);
    const btnEnviar = secao.querySelector('#' + idBtn);
    const inputArquivo = secao.querySelector('#' + idInput);

    const atualizar = () => {
      if (!campoUrl.value) { elAtual.innerHTML = ''; return; }
      elAtual.innerHTML = `
        <div class="rec-row" style="justify-content:space-between;align-items:center;padding:8px 0;">
          <a href="${Utils.escapeHtml(campoUrl.value)}" target="_blank" rel="noopener">📄 ${Utils.escapeHtml(campoNome.value || 'arquivo anexado')}</a>
          <button type="button" class="btn btn-ghost" id="btnRemover_${urlKey}" style="padding:4px 8px;">🗑️</button>
        </div>`;
      elAtual.querySelector('#btnRemover_' + urlKey).addEventListener('click', async () => {
        if (!Utils.confirmar('Remover o arquivo?')) return;
        const prefixo = `${Api.cfg.url}/storage/v1/object/public/anexos/`;
        if (campoUrl.value.startsWith(prefixo)) await Api.excluirAnexo('anexos', campoUrl.value.slice(prefixo.length));
        campoUrl.value = '';
        campoNome.value = '';
        atualizar();
      });
    };
    atualizar();

    btnEnviar.addEventListener('click', () => inputArquivo.click());
    inputArquivo.addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const textoOriginal = btnEnviar.textContent;
      btnEnviar.textContent = 'Enviando...';
      btnEnviar.disabled = true;
      try {
        const resultado = await Api.enviarAnexo('anexos', arquivo);
        campoUrl.value = resultado.url;
        campoNome.value = resultado.nome;
        atualizar();
        Utils.toast('Arquivo enviado.');
      } catch (err) {
        Utils.toast(err.message || 'Não foi possível enviar o arquivo.', 'error');
      }
      btnEnviar.textContent = textoOriginal;
      btnEnviar.disabled = false;
      inputArquivo.value = '';
    });
  },

  abrirFormDocumento(reg) {
    const schema = [
      { key: 'descricao', label: 'Descrição', type: 'text', required: true },
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: Rebanho.fazendasConhecidas() },
      { key: 'arquivo_url', label: 'Arquivo (URL)', type: 'text' },
      { key: 'arquivo_nome', label: 'Arquivo (nome)', type: 'text' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar documento' : 'Novo documento',
      schema,
      dados: reg || { data: Utils.hoje() },
      onRender: (box) => {
        this._montarCampoAnexo(box.querySelector('#dynForm'), 'arquivo_url', 'arquivo_nome', 'Anexar foto ou PDF');
      },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('documentos', reg.id, dados);
        else await Api.criar('documentos', dados);
        Utils.toast('Documento salvo.');
        App.refresh();
      },
      onExcluir: reg ? async () => {
        const prefixo = `${Api.cfg.url}/storage/v1/object/public/anexos/`;
        if (reg.arquivo_url && reg.arquivo_url.startsWith(prefixo)) await Api.excluirAnexo('anexos', reg.arquivo_url.slice(prefixo.length));
        await Api.excluir('documentos', reg.id);
        Utils.toast('Documento excluído.');
        App.refresh();
      } : null
    });
  }
};
