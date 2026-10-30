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
      <h3 class="section-title">Pastos / talhões desta fazenda</h3>
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

    // Pastos/talhões: cada um é um polígono editável dentro do grupo controlado pelo Leaflet.draw
    this._grupoPastos = L.featureGroup().addTo(mapa);
    this._pastosDaFazenda(fazenda).forEach(pasto => {
      const pontos = Cadastros.parseCoordenadasPoligono(pasto.poligono);
      if (!pontos) return;
      const layer = L.polygon(pontos, { color: '#4caf50', weight: 3, fillOpacity: 0.2 });
      layer.talhaoId = pasto.id;
      layer.bindTooltip(pasto.nome);
      this._grupoPastos.addLayer(layer);
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
        { key: 'tipo_uso', label: 'Tipo de uso', type: 'text', suggestions: this.tiposUsoPasto }
      ],
      dados: { tipo_uso: 'Pastagem' },
      onSalvar: async (dados) => {
        const novo = await Api.criar('talhoes', Object.assign({
          fazenda: fazenda.nome,
          poligono: pontos.map(p => p.join(',')).join(' '),
          hectares: Number(hectares.toFixed(2))
        }, dados));
        layer.talhaoId = novo.id;
        layer.bindTooltip(novo.nome);
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
    const pastos = this._pastosDaFazenda(fazenda).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    UI.renderList(container.querySelector('#listaPastos'), {
      data: pastos,
      emptyText: 'Nenhum pasto/talhão desenhado ainda.',
      onCardClick: (r) => this._focarPasto(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(r.nome)} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${r.hectares ? Utils.fmtNum(r.hectares, 2) + ' ha' : '-'}</span>
          <span>${Utils.escapeHtml(r.tipo_uso || '-')}</span>
          <button type="button" class="btn btn-ghost" data-stop data-editar-pasto="${r.id}" style="padding:4px 8px;margin-left:auto;">✏️ Renomear</button>
        </div>`
    });
    container.querySelectorAll('[data-editar-pasto]').forEach(btn => {
      btn.addEventListener('click', () => this._editarPasto(Api.get('talhoes', btn.dataset.editarPasto)));
    });
  },

  _editarPasto(pasto) {
    UI.abrirFormulario({
      titulo: 'Editar pasto/talhão',
      schema: [
        { key: 'nome', label: 'Nome do pasto', type: 'text', required: true },
        { key: 'tipo_uso', label: 'Tipo de uso', type: 'text', suggestions: this.tiposUsoPasto }
      ],
      dados: pasto,
      onSalvar: async (dados) => {
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
    if (!this._mapa || !this._grupoPastos) return;
    let layerAlvo = null;
    this._grupoPastos.eachLayer(l => { if (l.talhaoId === pasto.id) layerAlvo = l; });
    if (layerAlvo) this._mapa.fitBounds(layerAlvo.getBounds(), { padding: [30, 30] });
  }
};
