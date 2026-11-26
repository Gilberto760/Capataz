/* ===================== Módulo: Mapa da propriedade ===================== */
const Mapa = {
  subtabs: [],

  _mapa: null,
  _grupoPastos: null,   // L.FeatureGroup com os polígonos editáveis (1 por talhão)
  _grupoFazenda: null,  // contorno da fazenda (referência, não editável)
  _grupoMedida: null,   // desenho temporário de medição (não salva)
  _medirDistancia: null,
  _medirArea: null,
  _modoDesenho: 'pasto', // 'pasto' | 'distancia' | 'area' — decide o que fazer no próximo draw:created
  _fazendaAtual: null,
  _pastoLayers: {},     // talhaoId -> layer do Leaflet (mesmo quando oculto, pra focar/recalcular bounds)
  _pastosOcultos: new Set(), // talhaoId dos pastos escondidos do mapa (só visualização, não persiste no banco)
  _pastasAbertas: new Set(), // pastaId das pastas que o usuário abriu (começam todas recolhidas)

  tiposUsoPasto: ['Pastagem', 'Lavoura', 'Reserva/APP', 'Benfeitoria', 'Outro'],

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">Conecte o app ao banco de dados primeiro.</div>`;
      return;
    }
    if (!window.L || !window.L.Draw) {
      container.innerHTML = `<div class="empty-state">O mapa precisa de conexão com a internet pra carregar (Leaflet/Leaflet.draw). Tente de novo com internet.</div>`;
      return;
    }

    const fazendas = Api.list('fazendas').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    if (!fazendas.length) {
      container.innerHTML = `<div class="empty-state">Cadastre uma fazenda primeiro (em Cadastros) pra poder usar o mapa.</div>`;
      return;
    }
    if (!this._fazendaAtual || !fazendas.some(f => f.id === this._fazendaAtual)) {
      this._fazendaAtual = fazendas[0].id;
    }

    container.innerHTML = `
      <div class="toolbar">
        <select id="selectFazendaMapa" style="flex:1;max-width:280px;"></select>
        <div></div>
      </div>
      <div class="map-toolbar">
        <input type="file" id="inputKmlPasto" accept=".kml,.kmz,.xml" style="display:none;"/>
        <button type="button" class="btn btn-ghost" id="btnImportarKml">📎 Importar KML/KMZ</button>
        <button type="button" class="btn btn-ghost" id="btnMedirDistancia">📏 Medir distância</button>
        <button type="button" class="btn btn-ghost" id="btnMedirArea">📐 Medir área</button>
        <button type="button" class="btn btn-ghost" id="btnLimparMedida" style="display:none;">Limpar medição</button>
        <span id="resultadoMedida" class="medida-resultado"></span>
      </div>
      <div id="mapaPropriedade" class="mapa-propriedade"></div>
      <p class="hint">Use o ícone de polígono no canto do mapa pra desenhar um novo pasto, os ícones de editar/excluir pra ajustar os já desenhados, ou importe um arquivo pronto do Google Earth.</p>
      <div class="toolbar" style="margin-top:14px;">
        <h3 class="section-title" style="margin:0;">Pastos / talhões desta fazenda</h3>
        <button type="button" class="btn btn-ghost" id="btnAlternarTodosPastos"></button>
        <button type="button" class="btn btn-ghost" id="btnNovaPastaMapa">📁 Nova pasta</button>
      </div>
      <p class="hint">Organize os pastos em pastas/subpastas pra separar projetos (ex: "Projeto Rotação 2026" &gt; "Piquetes Norte"). Use o olho 👁️ em cada pasto (ou em cada pasta) pra ocultar/mostrar no mapa, sem precisar excluir.</p>
      <div id="listaPastos"></div>
    `;

    const selectFazenda = container.querySelector('#selectFazendaMapa');
    selectFazenda.innerHTML = fazendas.map(f => `<option value="${f.id}" ${f.id === this._fazendaAtual ? 'selected' : ''}>${Utils.escapeHtml(f.nome)}</option>`).join('');
    selectFazenda.addEventListener('change', () => {
      this._fazendaAtual = selectFazenda.value;
      this.render(container, sub);
    });

    const fazenda = fazendas.find(f => f.id === this._fazendaAtual);
    this._iniciarMapa(container, fazenda);
    this._renderListaPastos(container, fazenda);
    this._ligarImportacaoKml(container, fazenda);
    container.querySelector('#btnNovaPastaMapa').addEventListener('click', () => this._abrirFormPasta(fazenda, null));
    this._atualizarBotaoAlternarTodos(container, fazenda);
    container.querySelector('#btnAlternarTodosPastos').addEventListener('click', () => {
      this._alternarVisibilidadeTodos(fazenda);
      this._atualizarBotaoAlternarTodos(container, fazenda);
      this._renderListaPastos(container, fazenda);
    });
  },

  _atualizarBotaoAlternarTodos(container, fazenda) {
    const pastos = this._pastosDaFazenda(fazenda);
    const todasOcultas = pastos.length > 0 && pastos.every(t => this._pastosOcultos.has(t.id));
    container.querySelector('#btnAlternarTodosPastos').textContent = todasOcultas ? '👁️ Mostrar todos' : '🚫 Ocultar todos';
  },

  _pastasDaFazenda(fazenda) {
    return Api.list('pastas_mapa').filter(p => p.fazenda === fazenda.nome);
  },

  /* Lista de pastas em ordem de árvore (pai antes dos filhos), com "nivel" pra indentar em selects */
  _arvorePastasOrdenada(fazenda) {
    const pastas = this._pastasDaFazenda(fazenda).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const porPai = {};
    pastas.forEach(p => {
      const chave = p.pasta_pai || '_raiz';
      (porPai[chave] = porPai[chave] || []).push(p);
    });
    const resultado = [];
    const percorrer = (paiId, nivel) => {
      (porPai[paiId || '_raiz'] || []).forEach(p => {
        resultado.push({ pasta: p, nivel });
        percorrer(p.id, nivel + 1);
      });
    };
    percorrer(null, 0);
    return resultado;
  },

  _opcoesPastaSelect(fazenda, excluirIds) {
    const excluir = excluirIds ? (Array.isArray(excluirIds) ? excluirIds : [excluirIds]) : [];
    return this._arvorePastasOrdenada(fazenda)
      .filter(({ pasta }) => !excluir.includes(pasta.id))
      .map(({ pasta, nivel }) => ({ value: pasta.id, label: '—'.repeat(nivel) + ' ' + pasta.nome }));
  },

  /* ids da própria pasta + todas as subpastas dela, pra nunca deixar o usuário escolher
     um desses como "pasta_pai" (criaria um ciclo na árvore). */
  _idsComDescendentes(fazenda, pastaId) {
    const todas = this._pastasDaFazenda(fazenda);
    const ids = [pastaId];
    const coletar = (id) => {
      todas.filter(p => p.pasta_pai === id).forEach(filha => { ids.push(filha.id); coletar(filha.id); });
    };
    coletar(pastaId);
    return ids;
  },

  _abrirFormPasta(fazenda, pastaPai, pastaExistente) {
    UI.abrirFormulario({
      titulo: pastaExistente ? 'Renomear pasta' : (pastaPai ? `Nova subpasta em "${pastaPai.nome}"` : 'Nova pasta'),
      schema: [
        { key: 'nome', label: 'Nome da pasta', type: 'text', required: true },
        { key: 'pasta_pai', label: 'Dentro da pasta', type: 'select', options: this._opcoesPastaSelect(fazenda, pastaExistente ? this._idsComDescendentes(fazenda, pastaExistente.id) : null) }
      ],
      dados: pastaExistente || { pasta_pai: pastaPai ? pastaPai.id : '' },
      onSalvar: async (dados) => {
        if (pastaExistente) {
          await Api.atualizar('pastas_mapa', pastaExistente.id, { nome: dados.nome, pasta_pai: dados.pasta_pai || null });
          Utils.toast('Pasta atualizada.');
        } else {
          await Api.criar('pastas_mapa', { fazenda: fazenda.nome, nome: dados.nome, pasta_pai: dados.pasta_pai || null });
          Utils.toast('Pasta criada.');
        }
        App.refresh();
      },
      onExcluir: pastaExistente ? async () => {
        if (!Utils.confirmar(`Excluir a pasta "${pastaExistente.nome}" e todas as suas subpastas? Os pastos dentro dela não são excluídos, só ficam sem pasta.`)) return;
        await this._excluirPastaEDescendentes(fazenda, pastaExistente.id);
        Utils.toast('Pasta excluída.');
        App.refresh();
      } : undefined
    });
  },

  async _excluirPastaEDescendentes(fazenda, pastaId) {
    const todas = this._pastasDaFazenda(fazenda);
    const descendentes = [];
    const coletar = (id) => {
      todas.filter(p => p.pasta_pai === id).forEach(filha => { coletar(filha.id); descendentes.push(filha.id); });
    };
    coletar(pastaId);
    const idsParaExcluir = [...descendentes, pastaId];
    const pastosAfetados = Api.list('talhoes').filter(t => idsParaExcluir.includes(t.pasta));
    for (const pasto of pastosAfetados) {
      await Api.atualizar('talhoes', pasto.id, { pasta: null });
    }
    // Exclui da ponta pra raiz (filhas antes das mães) pra nunca deixar uma pasta_pai orfã no meio do caminho.
    for (const id of idsParaExcluir) {
      await Api.excluir('pastas_mapa', id);
    }
  },

  _ligarImportacaoKml(container, fazenda) {
    const input = container.querySelector('#inputKmlPasto');
    container.querySelector('#btnImportarKml').addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      let texto;
      try {
        texto = await Cadastros.lerArquivoPoligono(arquivo);
      } catch (err) {
        Utils.toast(err.message || 'Não foi possível ler o arquivo.', 'error');
        return;
      }
      const poligonos = Cadastros.parseTodosPoligonosKml(texto);
      if (!poligonos) {
        Utils.toast('Nenhum polígono encontrado nesse arquivo.', 'error');
        return;
      }
      if (!Utils.confirmar(`Importar ${poligonos.length} polígono(s) como pasto(s) desta fazenda?`)) return;
      for (const p of poligonos) {
        const latlngs = p.pontos.map(pt => L.latLng(pt[0], pt[1]));
        const hectares = L.GeometryUtil.geodesicArea(latlngs) / 10000;
        await Api.criar('talhoes', {
          fazenda: fazenda.nome,
          nome: p.nome,
          tipo_uso: 'Pastagem',
          poligono: p.pontos.map(pt => pt.join(',')).join(' '),
          hectares: Number(hectares.toFixed(2))
        });
      }
      Utils.toast(`${poligonos.length} pasto(s) importado(s). Toque num deles na lista pra renomear ou ajustar o tipo.`);
      App.refresh();
    });
  },

  _pastosDaFazenda(fazenda) {
    return Api.list('talhoes').filter(t => t.fazenda === fazenda.nome);
  },

  _iniciarMapa(container, fazenda) {
    const elMapa = container.querySelector('#mapaPropriedade');
    const mapa = L.map(elMapa);
    this._mapa = mapa;
    this._modoDesenho = 'pasto';

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21,
      attribution: 'Tiles &copy; Esri'
    }).addTo(mapa);

    // Contorno da fazenda, só como referência (não editável — isso é feito em Cadastros)
    this._grupoFazenda = L.featureGroup().addTo(mapa);
    const pontosFazenda = Cadastros.parseCoordenadasPoligono(fazenda.poligono);
    if (pontosFazenda) {
      L.polygon(pontosFazenda, { color: '#fff', weight: 2, dashArray: '6 6', fillOpacity: 0, interactive: false }).addTo(this._grupoFazenda);
    }

    // Pastos/talhões: cada um é um polígono editável dentro do grupo controlado pelo Leaflet.draw.
    // Os ocultos (toggle de visualização) ganham o layer mas não entram no grupo — assim não aparecem
    // no mapa nem contam pros bounds/zoom automático, mas continuam na lista pra serem reativados.
    this._grupoPastos = L.featureGroup().addTo(mapa);
    this._pastoLayers = {};
    this._pastosDaFazenda(fazenda).forEach(pasto => {
      const pontos = Cadastros.parseCoordenadasPoligono(pasto.poligono);
      if (!pontos) return;
      const layer = L.polygon(pontos, { color: '#4caf50', weight: 3, fillOpacity: 0.2 });
      layer.talhaoId = pasto.id;
      layer.bindTooltip(pasto.nome);
      this._pastoLayers[pasto.id] = layer;
      if (!this._pastosOcultos.has(pasto.id)) this._grupoPastos.addLayer(layer);
    });

    const bounds = this._grupoFazenda.getBounds().isValid() ? this._grupoFazenda.getBounds()
      : (this._grupoPastos.getBounds().isValid() ? this._grupoPastos.getBounds() : null);
    if (bounds) mapa.fitBounds(bounds, { padding: [20, 20] });
    else mapa.setView([-10, -50], 5); // sem nenhum polígono ainda — visão geral do Brasil

    const controleDesenho = new L.Control.Draw({
      position: 'topright',
      draw: { polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#4caf50' } }, polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false },
      edit: { featureGroup: this._grupoPastos }
    });
    mapa.addControl(controleDesenho);

    this._grupoMedida = L.featureGroup().addTo(mapa);
    this._medirDistancia = new L.Draw.Polyline(mapa, { shapeOptions: { color: '#2196f3', weight: 4 } });
    this._medirArea = new L.Draw.Polygon(mapa, { allowIntersection: false, shapeOptions: { color: '#2196f3', weight: 3 } });

    // Um único handler pro mapa inteiro: o que fazer depende de qual botão iniciou o desenho
    // (ferramenta de pasto da barra padrão, ou um dos dois botões de medir).
    mapa.on(L.Draw.Event.CREATED, (e) => {
      const modo = this._modoDesenho;
      this._modoDesenho = 'pasto';
      if (modo === 'distancia') this._onMedidaDistanciaCriada(container, e.layer);
      else if (modo === 'area') this._onMedidaAreaCriada(container, e.layer);
      else this._onPastoCriado(e.layer, fazenda);
    });
    mapa.on(L.Draw.Event.EDITED, (e) => this._onPastosEditados(e.layers));
    mapa.on(L.Draw.Event.DELETED, (e) => this._onPastosExcluidos(e.layers));

    this._ligarBotoesMedida(container);

    setTimeout(() => mapa.invalidateSize(), 80);
  },

  _onPastoCriado(layer, fazenda) {
    this._grupoPastos.addLayer(layer); // mostra o desenho já, antes mesmo de confirmar o nome
    const pontos = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    const hectares = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]) / 10000;
    UI.abrirFormulario({
      titulo: `Novo pasto/talhão — ${Utils.fmtNum(hectares, 2)} ha`,
      schema: [
        { key: 'nome', label: 'Nome do pasto', type: 'text', required: true },
        { key: 'tipo_uso', label: 'Tipo de uso', type: 'text', suggestions: this.tiposUsoPasto },
        { key: 'pasta', label: 'Pasta (projeto)', type: 'select', options: this._opcoesPastaSelect(fazenda) }
      ],
      dados: { tipo_uso: 'Pastagem' },
      onSalvar: async (dados) => {
        dados.pasta = dados.pasta || null;
        const novo = await Api.criar('talhoes', Object.assign({
          fazenda: fazenda.nome,
          poligono: pontos.map(p => p.join(',')).join(' '),
          hectares: Number(hectares.toFixed(2))
        }, dados));
        layer.talhaoId = novo.id;
        layer.bindTooltip(novo.nome);
        this._pastoLayers[novo.id] = layer;
        Utils.toast(`Pasto salvo (${Utils.fmtNum(hectares, 2)} ha).`);
        App.refresh();
      },
      onCancelar: () => this._grupoPastos.removeLayer(layer)
    });
  },

  async _onPastosEditados(layers) {
    const atualizacoes = [];
    layers.eachLayer((layer) => {
      if (!layer.talhaoId) return;
      const pontos = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
      const hectares = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]) / 10000;
      atualizacoes.push(Api.atualizar('talhoes', layer.talhaoId, {
        poligono: pontos.map(p => p.join(',')).join(' '),
        hectares: Number(hectares.toFixed(2))
      }));
    });
    await Promise.all(atualizacoes);
    Utils.toast('Pasto(s) atualizado(s).');
    App.refresh();
  },

  async _onPastosExcluidos(layers) {
    const exclusoes = [];
    layers.eachLayer((layer) => {
      if (layer.talhaoId) exclusoes.push(Api.excluir('talhoes', layer.talhaoId));
    });
    await Promise.all(exclusoes);
    Utils.toast('Pasto(s) excluído(s).');
    App.refresh();
  },

  _onMedidaDistanciaCriada(container, layer) {
    const latlngs = layer.getLatLngs();
    let metros = 0;
    for (let i = 1; i < latlngs.length; i++) metros += latlngs[i - 1].distanceTo(latlngs[i]);
    container.querySelector('#resultadoMedida').textContent = metros >= 1000 ? `${Utils.fmtNum(metros / 1000, 2)} km` : `${Utils.fmtNum(metros, 0)} m`;
    this._grupoMedida.addLayer(layer);
    container.querySelector('#btnLimparMedida').style.display = '';
  },

  _onMedidaAreaCriada(container, layer) {
    const hectares = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]) / 10000;
    container.querySelector('#resultadoMedida').textContent = `${Utils.fmtNum(hectares, 2)} ha`;
    this._grupoMedida.addLayer(layer);
    container.querySelector('#btnLimparMedida').style.display = '';
  },

  _ligarBotoesMedida(container) {
    const limpar = () => {
      this._grupoMedida.clearLayers();
      container.querySelector('#resultadoMedida').textContent = '';
      container.querySelector('#btnLimparMedida').style.display = 'none';
    };
    container.querySelector('#btnMedirDistancia').addEventListener('click', () => {
      limpar();
      this._modoDesenho = 'distancia';
      this._medirDistancia.enable();
    });
    container.querySelector('#btnMedirArea').addEventListener('click', () => {
      limpar();
      this._modoDesenho = 'area';
      this._medirArea.enable();
    });
    container.querySelector('#btnLimparMedida').addEventListener('click', limpar);
  },

  _renderListaPastos(container, fazenda) {
    const elLista = container.querySelector('#listaPastos');
    const pastos = this._pastosDaFazenda(fazenda).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const pastas = this._pastasDaFazenda(fazenda);
    if (!pastos.length && !pastas.length) {
      elLista.innerHTML = `<div class="empty-state">Nenhum pasto/talhão desenhado ainda.</div>`;
      return;
    }

    const cardPasto = (r) => {
      const oculto = this._pastosOcultos.has(r.id);
      const ocupacao = this._ocupacaoAberta(r.id);
      let linhaOcupacao = '';
      if (ocupacao) {
        const dias = Utils.diasEntre(ocupacao.data_entrada);
        const atrasado = this._ocupacaoAtrasada(ocupacao);
        linhaOcupacao = `
          <div class="rec-row ocupacao-pasto ${atrasado ? 'atrasado' : ''}">
            <span>🐄 ${Utils.escapeHtml(ocupacao.nome_lote)}${ocupacao.quantidade_animais ? ' (' + ocupacao.quantidade_animais + ' animais)' : ''} — ${dias} dia(s)${ocupacao.dias_previstos != null ? ' / previsto ' + ocupacao.dias_previstos : ''}${ocupacao.data_saida_prevista ? ' / sai em ' + Utils.fmtData(ocupacao.data_saida_prevista) : ''}</span>
          </div>`;
      }
      return `
      <div class="rec-card ${oculto ? 'pasto-oculto' : ''}" data-pasto="${r.id}">
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${r.hectares ? Utils.fmtNum(r.hectares, 2) + ' ha' : '-'}</span>
          <span>${Utils.escapeHtml(r.tipo_uso || '-')}</span>
          <button type="button" class="btn btn-ghost" data-stop data-toggle-visivel="${r.id}" title="${oculto ? 'Mostrar no mapa' : 'Ocultar do mapa'}" style="padding:4px 8px;margin-left:auto;">${oculto ? '🚫' : '👁️'}</button>
          <button type="button" class="btn btn-ghost" data-stop data-editar-pasto="${r.id}" style="padding:4px 8px;">✏️ Renomear</button>
        </div>
        ${linhaOcupacao}
        <div class="rec-row">
          <button type="button" class="btn btn-ghost" data-stop data-historico-pasto="${r.id}" style="padding:4px 8px;">📜 Histórico</button>
          <button type="button" class="btn btn-ghost" data-stop data-ocupacao-pasto="${r.id}" style="padding:4px 8px;margin-left:auto;">${ocupacao ? '🐄 Gerenciar lote' : '🐄 Registrar entrada de lote'}</button>
        </div>
      </div>`;
    };

    const pastosDaPasta = (pastaId) => pastos.filter(p => (p.pasta || null) === pastaId);

    const renderPasta = (pasta) => {
      const filhas = pastas.filter(p => p.pasta_pai === pasta.id).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      const pastosAqui = pastosDaPasta(pasta.id);
      const todosDaPasta = this._pastosSobPasta(fazenda, pasta.id);
      const todosOcultos = todosDaPasta.length > 0 && todosDaPasta.every(t => this._pastosOcultos.has(t.id));
      return `
        <details class="pasta-mapa" data-pasta-id="${pasta.id}" ${this._pastasAbertas.has(pasta.id) ? 'open' : ''}>
          <summary>
            <span class="pasta-mapa-nome">📁 ${Utils.escapeHtml(pasta.nome)}</span>
            <span class="pasta-mapa-acoes">
              ${todosDaPasta.length ? `<button type="button" class="btn btn-ghost" data-stop data-toggle-pasta-vis="${pasta.id}" style="padding:4px 8px;">${todosOcultos ? '👁️ Mostrar todos' : '🚫 Ocultar todos'}</button>` : ''}
              <button type="button" class="btn btn-ghost" data-stop data-subpasta="${pasta.id}" style="padding:4px 8px;">+ Subpasta</button>
              <button type="button" class="btn btn-ghost" data-stop data-editar-pasta="${pasta.id}" style="padding:4px 8px;">✏️ Editar</button>
            </span>
          </summary>
          <div class="pasta-mapa-conteudo">
            ${filhas.map(renderPasta).join('')}
            ${pastosAqui.length ? pastosAqui.map(cardPasto).join('') : (filhas.length ? '' : '<div class="empty-state">Nenhum pasto nesta pasta ainda.</div>')}
          </div>
        </details>`;
    };

    const pastasRaiz = pastas.filter(p => !p.pasta_pai).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const pastosSemPasta = pastosDaPasta(null);

    elLista.classList.add('rec-list');
    elLista.innerHTML = `
      ${pastasRaiz.map(renderPasta).join('')}
      ${pastosSemPasta.map(cardPasto).join('')}
    `;

    elLista.querySelectorAll('[data-pasto]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop]')) return;
        this._focarPasto(Api.get('talhoes', card.dataset.pasto));
      });
    });
    elLista.querySelectorAll('[data-editar-pasto]').forEach(btn => {
      btn.addEventListener('click', () => this._editarPasto(Api.get('talhoes', btn.dataset.editarPasto), fazenda));
    });
    elLista.querySelectorAll('[data-editar-pasta]').forEach(btn => {
      btn.addEventListener('click', () => this._abrirFormPasta(fazenda, null, Api.get('pastas_mapa', btn.dataset.editarPasta)));
    });
    elLista.querySelectorAll('[data-subpasta]').forEach(btn => {
      btn.addEventListener('click', () => this._abrirFormPasta(fazenda, Api.get('pastas_mapa', btn.dataset.subpasta)));
    });
    elLista.querySelectorAll('[data-toggle-visivel]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._alternarVisibilidadePasto(btn.dataset.toggleVisivel);
        this._atualizarBotaoAlternarTodos(container, fazenda);
        this._renderListaPastos(container, fazenda);
      });
    });
    elLista.querySelectorAll('[data-toggle-pasta-vis]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._alternarVisibilidadePasta(fazenda, btn.dataset.togglePastaVis);
        this._atualizarBotaoAlternarTodos(container, fazenda);
        this._renderListaPastos(container, fazenda);
      });
    });
    elLista.querySelectorAll('[data-ocupacao-pasto]').forEach(btn => {
      btn.addEventListener('click', () => this._gerenciarOcupacao(container, fazenda, Api.get('talhoes', btn.dataset.ocupacaoPasto)));
    });
    elLista.querySelectorAll('[data-historico-pasto]').forEach(btn => {
      btn.addEventListener('click', () => this._abrirHistoricoOcupacoes(Api.get('talhoes', btn.dataset.historicoPasto)));
    });
    // Lembra quais pastas o usuário abriu, pra não recolher tudo de novo a cada re-render
    // (ex: depois de ocultar um pasto que está dentro de uma pasta aberta).
    elLista.querySelectorAll('details.pasta-mapa').forEach(det => {
      det.addEventListener('toggle', () => {
        if (det.open) this._pastasAbertas.add(det.dataset.pastaId);
        else this._pastasAbertas.delete(det.dataset.pastaId);
      });
    });
  },

  _editarPasto(pasto, fazenda) {
    UI.abrirFormulario({
      titulo: 'Editar pasto/talhão',
      schema: [
        { key: 'nome', label: 'Nome do pasto', type: 'text', required: true },
        { key: 'tipo_uso', label: 'Tipo de uso', type: 'text', suggestions: this.tiposUsoPasto },
        { key: 'pasta', label: 'Pasta (projeto)', type: 'select', options: this._opcoesPastaSelect(fazenda) }
      ],
      dados: pasto,
      onSalvar: async (dados) => {
        dados.pasta = dados.pasta || null;
        await Api.atualizar('talhoes', pasto.id, dados);
        Utils.toast('Pasto atualizado.');
        App.refresh();
      },
      onExcluir: async () => {
        await Api.excluir('talhoes', pasto.id);
        Utils.toast('Pasto excluído.');
        App.refresh();
      }
    });
  },

  _focarPasto(pasto) {
    if (!this._mapa) return;
    const layer = this._pastoLayers[pasto.id];
    if (layer) this._mapa.fitBounds(layer.getBounds(), { padding: [30, 30] });
  },

  /* Oculta/mostra um pasto no mapa (não exclui nada, só tira/coloca o polígono do grupo visível). */
  _alternarVisibilidadePasto(id) {
    const layer = this._pastoLayers[id];
    if (this._pastosOcultos.has(id)) {
      this._pastosOcultos.delete(id);
      if (layer) this._grupoPastos.addLayer(layer);
    } else {
      this._pastosOcultos.add(id);
      if (layer) this._grupoPastos.removeLayer(layer);
    }
  },

  /* ids dos pastos dentro de uma pasta, incluindo os das subpastas dela. */
  _pastosSobPasta(fazenda, pastaId) {
    const idsPastas = this._idsComDescendentes(fazenda, pastaId);
    return this._pastosDaFazenda(fazenda).filter(t => idsPastas.includes(t.pasta));
  },

  /* Oculta todos de uma vez se algum estiver visível; mostra todos se já estiverem todos ocultos. */
  _alternarVisibilidadeConjunto(pastos) {
    const todasOcultas = pastos.length > 0 && pastos.every(t => this._pastosOcultos.has(t.id));
    pastos.forEach(t => {
      if (todasOcultas) this._pastosOcultos.delete(t.id); else this._pastosOcultos.add(t.id);
      const layer = this._pastoLayers[t.id];
      if (!layer) return;
      if (todasOcultas) this._grupoPastos.addLayer(layer); else this._grupoPastos.removeLayer(layer);
    });
  },

  _alternarVisibilidadePasta(fazenda, pastaId) {
    this._alternarVisibilidadeConjunto(this._pastosSobPasta(fazenda, pastaId));
  },

  _alternarVisibilidadeTodos(fazenda) {
    this._alternarVisibilidadeConjunto(this._pastosDaFazenda(fazenda));
  },

  /* ---------- Rotação de pastagem: qual lote está em qual piquete, há quantos dias ---------- */

  /* A ocupação "aberta" de um piquete é a que ainda não tem data_saida — só pode haver uma por vez
     (quem cria uma nova entrada sempre encerra a anterior antes, ver _gerenciarOcupacao). */
  _ocupacaoAberta(talhaoId) {
    return Api.list('talhao_ocupacoes').find(o => o.talhao_id === talhaoId && !o.data_saida) || null;
  },

  /* Passou do previsto tanto por quantidade de dias quanto por já ter ultrapassado a data de
     saída prevista (programada na entrada ou ajustada depois) — qualquer um dos dois conta. */
  _ocupacaoAtrasada(ocupacao) {
    const dias = Utils.diasEntre(ocupacao.data_entrada);
    if (ocupacao.dias_previstos != null && dias > ocupacao.dias_previstos) return true;
    if (ocupacao.data_saida_prevista && ocupacao.data_saida_prevista < Utils.hoje()) return true;
    return false;
  },

  _gerenciarOcupacao(container, fazenda, pasto) {
    const ocupacao = this._ocupacaoAberta(pasto.id);
    if (!ocupacao) {
      this._abrirFormEntradaLote(container, fazenda, pasto);
      return;
    }

    const dias = Utils.diasEntre(ocupacao.data_entrada);
    const atrasado = this._ocupacaoAtrasada(ocupacao);
    const html = `
      <div class="rec-row" style="justify-content:space-between;padding:6px 0;"><span>Lote</span><b>${Utils.escapeHtml(ocupacao.nome_lote)}</b></div>
      ${ocupacao.quantidade_animais ? `<div class="rec-row" style="justify-content:space-between;padding:6px 0;"><span>Quantidade de animais</span><b>${ocupacao.quantidade_animais}</b></div>` : ''}
      <div class="rec-row" style="justify-content:space-between;padding:6px 0;"><span>Entrada</span><b>${Utils.fmtData(ocupacao.data_entrada)}</b></div>
      <div class="rec-row" style="justify-content:space-between;padding:6px 0;"><span>Dias neste piquete</span><b class="${atrasado ? 'texto-atrasado' : ''}">${dias} dia(s)${ocupacao.dias_previstos != null ? ' / previsto ' + ocupacao.dias_previstos : ''}</b></div>
      ${ocupacao.data_saida_prevista ? `<div class="rec-row" style="justify-content:space-between;padding:6px 0;"><span>Saída prevista</span><b class="${atrasado ? 'texto-atrasado' : ''}">${Utils.fmtData(ocupacao.data_saida_prevista)}</b></div>` : ''}
      ${atrasado ? `<p class="hint" style="color:var(--red-600);">⚠️ Esse lote já passou do previsto pra esse piquete.</p>` : ''}
      ${ocupacao.observacao ? `<p class="hint">${Utils.escapeHtml(ocupacao.observacao)}</p>` : ''}
    `;
    const box = UI.abrirInfo({
      titulo: `Lote em "${pasto.nome}"`,
      html,
      acoes: `
        <button type="button" class="btn btn-ghost" id="btnEditarOcupacao">✏️ Editar</button>
        <button type="button" class="btn btn-ghost" id="btnMoverOcupacao">➡️ Mover p/ outro piquete</button>
        <button type="button" class="btn btn-ghost" id="btnExcluirOcupacao" style="color:var(--red-600);">🗑️ Desfazer entrada</button>
        <button type="button" class="btn btn-danger" id="btnSairOcupacao">Registrar saída</button>
      `
    });
    box.querySelector('#btnEditarOcupacao').addEventListener('click', () => {
      document.getElementById('modalOverlay').classList.remove('open');
      this._abrirFormEditarOcupacao(container, fazenda, pasto, ocupacao);
    });
    box.querySelector('#btnMoverOcupacao').addEventListener('click', () => {
      document.getElementById('modalOverlay').classList.remove('open');
      this._abrirFormMoverOcupacao(container, fazenda, pasto, ocupacao);
    });
    box.querySelector('#btnSairOcupacao').addEventListener('click', () => {
      document.getElementById('modalOverlay').classList.remove('open');
      this._abrirFormRegistrarSaida(pasto, ocupacao);
    });
    box.querySelector('#btnExcluirOcupacao').addEventListener('click', async () => {
      if (!Utils.confirmar(`Desfazer essa entrada do lote "${ocupacao.nome_lote}" neste piquete? Isso apaga o registro, como se nunca tivesse acontecido.`)) return;
      await Api.excluir('talhao_ocupacoes', ocupacao.id);
      Utils.toast('Entrada desfeita.');
      App.refresh();
    });
  },

  /* Lista todas as passagens (abertas e encerradas) de um piquete, com opção de desfazer
     qualquer uma delas — seja uma entrada feita por engano (exclui o registro) ou uma saída/
     movimentação feita por engano (reabre, voltando o lote a "ativo" nesse piquete). */
  _abrirHistoricoOcupacoes(pasto) {
    const ocupacoes = Api.list('talhao_ocupacoes')
      .filter(o => o.talhao_id === pasto.id)
      .sort((a, b) => (b.data_entrada || '').localeCompare(a.data_entrada || ''));

    const render = () => {
      const linhas = ocupacoes.length ? ocupacoes.map(o => {
        const dias = Utils.diasEntre(o.data_entrada, o.data_saida);
        return `
        <div class="rec-row" style="justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
          <span>
            <b>${Utils.escapeHtml(o.nome_lote)}</b>${o.quantidade_animais ? ' (' + o.quantidade_animais + ' animais)' : ''}<br/>
            <span class="hint">${Utils.fmtData(o.data_entrada)} → ${o.data_saida ? Utils.fmtData(o.data_saida) : 'ainda neste piquete'} — ${dias} dia(s)</span>
          </span>
          <span style="display:flex;gap:6px;flex-shrink:0;">
            ${o.data_saida ? `<button type="button" class="btn btn-ghost" data-reabrir="${o.id}" style="padding:4px 8px;">↩️ Reabrir</button>` : ''}
            <button type="button" class="btn btn-ghost" data-excluir-ocupacao="${o.id}" style="padding:4px 8px;color:var(--red-600);">🗑️ Excluir</button>
          </span>
        </div>`;
      }).join('') : '<div class="empty-state">Nenhuma movimentação registrada neste piquete.</div>';

      const box = UI.abrirInfo({ titulo: `Histórico — ${pasto.nome}`, html: linhas });

      box.querySelectorAll('[data-reabrir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const o = ocupacoes.find(x => x.id === btn.dataset.reabrir);
          if (this._ocupacaoAberta(pasto.id)) {
            Utils.toast('Já existe um lote ativo neste piquete agora — registre a saída dele (ou exclua) antes de reabrir este.', 'error');
            return;
          }
          if (!Utils.confirmar(`Reabrir "${o.nome_lote}" neste piquete (desfazer a saída de ${Utils.fmtData(o.data_saida)})?`)) return;
          await Api.atualizar('talhao_ocupacoes', o.id, { data_saida: null });
          o.data_saida = null;
          Utils.toast('Saída desfeita — lote reaberto neste piquete.');
          App.refresh();
          render();
        });
      });
      box.querySelectorAll('[data-excluir-ocupacao]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const o = ocupacoes.find(x => x.id === btn.dataset.excluirOcupacao);
          if (!Utils.confirmar(`Excluir esse registro de "${o.nome_lote}" (${Utils.fmtData(o.data_entrada)})? Essa ação não pode ser desfeita.`)) return;
          await Api.excluir('talhao_ocupacoes', o.id);
          ocupacoes.splice(ocupacoes.indexOf(o), 1);
          Utils.toast('Registro excluído.');
          App.refresh();
          render();
        });
      });
    };
    render();
  },

  /* A data de saída prevista é calculada (data de entrada + dias previstos), mas continua sendo
     um campo de data normal que o usuário pode sobrescrever à mão — uma vez que ele mexe nela
     diretamente, os campos de entrada/dias previstos param de recalculá-la por cima.
     `campoEntradaNome`: nome do campo do form que serve de "data de entrada" pro cálculo (no
     "mover" é a própria data de saída do piquete atual, já que vira a entrada no novo).
     `calcularAoAbrir`: true recalcula assim que o form abre (útil quando dias_previstos já vem
     preenchido, ex: no "mover"); false preserva o valor que já estava salvo (ex: ao editar). */
  _ligarCalculoSaidaPrevista(box, { campoEntradaNome, calcularAoAbrir } = {}) {
    const form = box.querySelector('#dynForm');
    const campoEntrada = form.querySelector(`[name="${campoEntradaNome || 'data_entrada'}"]`);
    const campoDias = form.querySelector('[name="dias_previstos"]');
    const campoSaida = form.querySelector('[name="data_saida_prevista"]');
    if (!campoDias || !campoSaida) return;
    let editadaManualmente = false;
    const calcular = () => {
      const entrada = campoEntrada && campoEntrada.value;
      if (!entrada || !campoDias.value) return;
      const d = new Date(entrada + 'T00:00:00');
      d.setDate(d.getDate() + Number(campoDias.value));
      campoSaida.value = d.toISOString().slice(0, 10);
    };
    campoDias.addEventListener('input', () => { if (!editadaManualmente) calcular(); });
    if (campoEntrada) campoEntrada.addEventListener('input', () => { if (!editadaManualmente) calcular(); });
    campoSaida.addEventListener('input', () => { editadaManualmente = true; });
    if (calcularAoAbrir) calcular();
  },

  _abrirFormEntradaLote(container, fazenda, pasto, valoresIniciais) {
    UI.abrirFormulario({
      titulo: `Registrar entrada de lote — ${pasto.nome}`,
      schema: [
        { key: 'nome_lote', label: 'Nome/identificação do lote', type: 'text', required: true },
        { key: 'quantidade_animais', label: 'Quantidade de animais', type: 'number' },
        { key: 'data_entrada', label: 'Data de entrada', type: 'date', required: true, default: Utils.hoje() },
        { key: 'dias_previstos', label: 'Dias previstos neste piquete', type: 'number', placeholder: 'ex: 30' },
        { key: 'data_saida_prevista', label: 'Data de saída prevista (calculada — pode ajustar)', type: 'date' },
        { key: 'observacao', label: 'Observação', type: 'textarea' }
      ],
      dados: valoresIniciais || {},
      onRender: (box) => this._ligarCalculoSaidaPrevista(box, { calcularAoAbrir: true }),
      onSalvar: async (dados) => {
        await Api.criar('talhao_ocupacoes', Object.assign({ talhao_id: pasto.id }, dados));
        Utils.toast('Entrada do lote registrada.');
        App.refresh();
      }
    });
  },

  _abrirFormEditarOcupacao(container, fazenda, pasto, ocupacao) {
    UI.abrirFormulario({
      titulo: `Editar lote — ${pasto.nome}`,
      schema: [
        { key: 'nome_lote', label: 'Nome/identificação do lote', type: 'text', required: true },
        { key: 'quantidade_animais', label: 'Quantidade de animais', type: 'number' },
        { key: 'data_entrada', label: 'Data de entrada', type: 'date', required: true },
        { key: 'dias_previstos', label: 'Dias previstos neste piquete', type: 'number', placeholder: 'ex: 30' },
        { key: 'data_saida_prevista', label: 'Data de saída prevista (calculada — pode ajustar)', type: 'date' },
        { key: 'observacao', label: 'Observação', type: 'textarea' }
      ],
      dados: ocupacao,
      onRender: (box) => this._ligarCalculoSaidaPrevista(box, { calcularAoAbrir: false }),
      onSalvar: async (dados) => {
        await Api.atualizar('talhao_ocupacoes', ocupacao.id, dados);
        Utils.toast('Lote atualizado.');
        App.refresh();
      }
    });
  },

  /* A data de saída é um campo que o usuário escolhe (não necessariamente hoje) — assim dá pra
     tirar o lote antes do previsto, ou corrigir/lançar uma saída que já aconteceu em outro dia. */
  _abrirFormRegistrarSaida(pasto, ocupacao) {
    UI.abrirFormulario({
      titulo: `Registrar saída — ${ocupacao.nome_lote}`,
      schema: [
        { key: 'data_saida', label: 'Data de saída', type: 'date', required: true, default: Utils.hoje() }
      ],
      onSalvar: async (dados) => {
        await Api.atualizar('talhao_ocupacoes', ocupacao.id, { data_saida: dados.data_saida });
        Utils.toast('Saída registrada.');
        App.refresh();
      }
    });
  },

  _abrirFormMoverOcupacao(container, fazenda, pastoOrigem, ocupacao) {
    const opcoesPiquete = this._pastosDaFazenda(fazenda)
      .filter(t => t.id !== pastoOrigem.id)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      .map(t => ({ value: t.id, label: t.nome }));
    UI.abrirFormulario({
      titulo: `Mover lote "${ocupacao.nome_lote}" de "${pastoOrigem.nome}"`,
      schema: [
        { key: 'data_saida_origem', label: `Data de saída de "${pastoOrigem.nome}"`, type: 'date', required: true, default: Utils.hoje() },
        { key: 'talhao_destino', label: 'Novo piquete', type: 'select', options: opcoesPiquete, required: true },
        { key: 'dias_previstos', label: 'Dias previstos no novo piquete', type: 'number', placeholder: 'ex: 30', default: ocupacao.dias_previstos },
        { key: 'data_saida_prevista', label: 'Saída prevista no novo piquete (calculada — pode ajustar)', type: 'date' }
      ],
      onRender: (box) => this._ligarCalculoSaidaPrevista(box, { campoEntradaNome: 'data_saida_origem', calcularAoAbrir: true }),
      onSalvar: async (dados) => {
        await Api.atualizar('talhao_ocupacoes', ocupacao.id, { data_saida: dados.data_saida_origem });
        await Api.criar('talhao_ocupacoes', {
          talhao_id: dados.talhao_destino,
          nome_lote: ocupacao.nome_lote,
          quantidade_animais: ocupacao.quantidade_animais,
          data_entrada: dados.data_saida_origem,
          data_saida_prevista: dados.data_saida_prevista || null,
          dias_previstos: dados.dias_previstos || null
        });
        Utils.toast('Lote movido de piquete.');
        App.refresh();
      }
    });
  }
};
