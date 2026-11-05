/* ===================== Módulo: Rebanho (Postgres/Supabase) ===================== */
const Rebanho = {
  subtabs: [
    { key: 'animais', label: 'Animais' },
    { key: 'partos', label: 'Partos' },
    { key: 'lactacoes', label: 'Lactações' },
    { key: 'movimentacoes', label: 'Movimentações' },
    { key: 'adapec', label: 'ADAPEC' },
    { key: 'gta', label: 'Compras/Vendas GTA' },
    { key: 'inventario', label: 'Inventário SEFAZ' },
    { key: 'evolucao', label: 'Evolução do Rebanho' }
  ],

  // Categorias do modelo de Evolução do Rebanho (projeção zootécnica), na ordem em que
  // aparecem na planilha de referência. "ua" é o coeficiente de Unidade Animal de cada uma.
  categoriasEvolucao: [
    { key: 'matrizes', label: 'Matrizes', sexo: 'F', ua: 1.00 },
    { key: 'novilhas23', label: 'Novilhas 2/3 anos', sexo: 'F', ua: 0.80 },
    { key: 'novilhas12', label: 'Novilhas 1/2 anos', sexo: 'F', ua: 0.60 },
    { key: 'bezerras', label: 'Bezerras', sexo: 'F', ua: 0.40 },
    { key: 'bezerros', label: 'Bezerros', sexo: 'M', ua: 0.40 },
    { key: 'novilhos12', label: 'Novilhos 1/2 anos', sexo: 'M', ua: 0.60 },
    { key: 'novilhos23', label: 'Novilhos 2/3 anos', sexo: 'M', ua: 1.00 },
    { key: 'novilhos3', label: 'Novilhos + 3 anos', sexo: 'M', ua: 1.00 },
    { key: 'touros', label: 'Touros', sexo: 'M', ua: 1.25 }
  ],

  especies: ['Bovina', 'Equina', 'Ovina', 'Caprina', 'Suína', 'Outra'],
  // Categorias confirmadas no Capataz (planilhas antigas e atual) vêm primeiro; as demais são complementos de bom senso.
  categoriasPorEspecie: {
    Bovina: ['Bezerro(a)', 'Garrote(a)', 'Novilho(a)', 'Boi', 'Reprodutor', 'Vaca'],
    Equina: ['Potro(a)', 'Égua', 'Garanhão', 'Cavalo', 'Serviço'],
    Ovina: ['Cordeiro(a)', 'Borrego(a)', 'Ovelha', 'Carneiro', 'Reprodutor'],
    Caprina: ['Cabrito(a)', 'Cabra', 'Bode', 'Reprodutor'],
    Suína: ['Leitão(a)', 'Porca', 'Cachaço', 'Reprodutor'],
    Outra: []
  },
  racasSugestao: ['Nelore', 'Gir', 'Girolando', 'Angus', 'Brahman', 'Holandês', 'Holandesa', 'Jersey', 'Cruzado', 'Comum', 'Senepol', 'Tabapuã'],
  pelagemSugestao: ['Branca', 'Preta', 'Vermelha', 'Roxa', 'Fumaça', 'Amarela', 'Baia', 'Malhada', 'Tordilha'],
  finalidadesAnimal: ['Corte', 'Leite', 'Reprodução', 'Trabalho', 'Outra'],
  motivosMovimentacao: ['Compra', 'Venda', 'Nascimento', 'Morte', 'Abate', 'Transferência entre fazendas', 'Doação', 'Outro'],

  // Regra única usada em toda venda registrada fora do formulário de Animal (Movimentação,
  // importação de planilha da GTA): marca o animal como Vendido e, se for um(a) bezerro(a)
  // que ainda não tinha desmame registrado, assume o desmame na data da própria venda.
  patchSituacaoVendido(animalAtual, dataVenda) {
    const patch = { situacao: 'Vendido' };
    if (animalAtual && animalAtual.categoria === 'Bezerro(a)' && !animalAtual.desmame) {
      patch.desmame = dataVenda || Utils.hoje();
    }
    return patch;
  },

  categoriasSugestao(especie) {
    return this.categoriasPorEspecie[especie] || [];
  },

  // Categoria automática do gado bovino, por idade e sexo (regra da fazenda).
  categoriaAutomaticaBovina(nascimento, sexo) {
    if (!nascimento) return null;
    const meses = Math.floor(Utils.diasEntre(nascimento) / 30);
    if (meses < 9) return 'Bezerro(a)';
    if (meses <= 18) return 'Garrote(a)';
    if (meses <= 24) return 'Novilho(a)';
    if (sexo === 'F') return 'Vaca';
    return meses > 30 ? 'Reprodutor' : 'Boi';
  },

  render(container, sub) {
    if (!Api.configurado()) {
      container.innerHTML = `<div class="empty-state">
        Conecte o app ao banco de dados primeiro.<br/><br/>
        <button class="btn btn-primary" id="btnIrConfig">Ir para Configurações</button>
      </div>`;
      container.querySelector('#btnIrConfig').addEventListener('click', () => App.irPara('config'));
      return;
    }
    sub = sub || 'animais';
    const map = {
      animais: () => this.renderAnimais(container),
      partos: () => this.renderPartos(container),
      lactacoes: () => this.renderLactacoes(container),
      movimentacoes: () => this.renderMovimentacoes(container),
      adapec: () => this.renderAdapec(container),
      gta: () => this.renderGta(container),
      inventario: () => this.renderInventarioSefaz(container),
      evolucao: () => this.renderEvolucaoRebanho(container)
    };
    (map[sub] || map.animais)();
  },

  animais() { return Api.list('animais'); },
  nomeAnimal(id) {
    const a = Api.get('animais', id);
    return a ? a.nome : '(removido)';
  },
  // Nome do bezerro de um parto: sempre busca pelo cadastro (bezerro_id) quando existe,
  // assim renomear o animal em Animais atualiza aqui automaticamente.
  nomeBezerro(p) {
    if (p.bezerro_id) return this.nomeAnimal(p.bezerro_id);
    return p.brinco_bezerro || '-';
  },
  // Mapa IDParto -> dias desde o parto anterior DA MESMA vaca (null quando é o primeiro parto registrado dela)
  intervalosPartos() {
    const porMae = {};
    Api.list('partos').forEach(p => {
      if (!p.data_parto) return;
      (porMae[p.mae_id] = porMae[p.mae_id] || []).push(p);
    });
    const mapa = {};
    Object.values(porMae).forEach(lista => {
      lista.sort((a, b) => a.data_parto.localeCompare(b.data_parto));
      for (let i = 1; i < lista.length; i++) {
        mapa[lista[i].id] = Utils.diasEntre(lista[i - 1].data_parto, lista[i].data_parto);
      }
    });
    return mapa;
  },
  textoIntervalo(dias) {
    if (dias === null || dias === undefined) return null;
    return `${dias} dias (${(dias / 30).toFixed(1)} meses)`;
  },
  fazendasConhecidas() {
    const set = new Set();
    Api.list('fazendas').forEach(f => set.add(f.nome));
    this.animais().forEach(a => { if (a.fazenda) set.add(a.fazenda); });
    return Array.from(set);
  },
  municipiosConhecidos() {
    const set = new Set();
    Api.list('fazendas').forEach(f => { if (f.municipio) set.add(f.municipio); });
    return Array.from(set);
  },

  /* ---------- Árvore genealógica ----------
     Só a mãe é rastreada no cadastro (não há campo de pai), então a linhagem de
     ancestrais é só materna; os descendentes são todos os filhos (e netos etc.)
     que têm este animal como mãe. */
  ancestraisMaternos(animal) {
    const cadeia = [];
    let atual = animal;
    let guard = 0;
    while (atual && atual.mae_id && guard < 6) {
      const mae = Api.get('animais', atual.mae_id);
      if (!mae) break;
      cadeia.push(mae);
      atual = mae;
      guard++;
    }
    return cadeia;
  },

  descendentesHtml(animalId, geracoesRestantes) {
    const filhos = this.animais().filter(a => a.mae_id === animalId).sort((a, b) => (a.nascimento || '').localeCompare(b.nascimento || ''));
    if (!filhos.length) return '';
    if (geracoesRestantes <= 0) return `<div class="hint">+ ${filhos.length} descendente(s) (profundidade máxima atingida)</div>`;
    return `<ul class="arvore-filhos">${filhos.map(f => `
      <li>
        <div class="arvore-no-filho">
          <span class="arvore-nome">${Utils.escapeHtml(f.nome)}</span>
          ${UI.badge(f.sexo === 'F' ? 'F' : 'M', f.sexo === 'F' ? 'purple' : 'blue')}
          ${UI.badge(f.situacao || 'Ativo', (f.situacao || 'Ativo') === 'Ativo' ? 'green' : 'red')}
        </div>
        ${this.descendentesHtml(f.id, geracoesRestantes - 1)}
      </li>`).join('')}</ul>`;
  },

  abrirArvoreGenealogica(animal) {
    const ancestrais = this.ancestraisMaternos(animal);
    const labelGeracao = ['Mãe', 'Avó materna', 'Bisavó materna', 'Trisavó materna', 'Tataravó materna', 'Ancestral materna'];

    const htmlAncestrais = `
      <h3 class="section-title" style="margin-top:0;">Linhagem materna</h3>
      <div class="arvore-ancestrais">
        <div class="arvore-no-atual">${Utils.escapeHtml(animal.nome)}</div>
        ${ancestrais.length ? ancestrais.map((m, i) => `
          <div class="arvore-seta">↑ ${labelGeracao[i] || 'Ancestral materna'}</div>
          <div class="arvore-no">${Utils.escapeHtml(m.nome)}</div>
        `).join('') : '<div class="hint">Mãe não cadastrada.</div>'}
      </div>`;

    const descHtml = this.descendentesHtml(animal.id, 3);
    const htmlDescendentes = `
      <h3 class="section-title">Descendentes</h3>
      ${descHtml || '<div class="empty-state">Nenhum descendente cadastrado ainda.</div>'}`;

    UI.abrirInfo({
      titulo: `Árvore genealógica — ${animal.nome}`,
      html: htmlAncestrais + htmlDescendentes
    });
  },

  /* ---------- ANIMAIS ---------- */
  renderAnimais(container) {
    const todos = this.animais();
    const fazendas = this.fazendasConhecidas();
    container.innerHTML = `
      <div class="toolbar">
        <input type="search" id="buscaAnimal" placeholder="Buscar por nome/brinco..." class="search-input"/>
        <button class="btn btn-primary" id="btnNovoAnimal">+ Novo</button>
      </div>
      <div class="toolbar"><button class="btn btn-ghost" id="btnRecalcularCategorias">🔄 Recalcular categorias dos bovinos</button><div></div></div>
      <div class="filter-chips" id="filtroFazenda">
        <button class="chip active" data-fz="todas">Todas as fazendas</button>
        ${fazendas.map(f => `<button class="chip" data-fz="${Utils.escapeHtml(f)}">${Utils.escapeHtml(f)}</button>`).join('')}
      </div>
      <div class="filter-chips" id="filtroStatusAnimal">
        <button class="chip active" data-st="Ativo">Ativos</button>
        <button class="chip" data-st="Vendido">Vendidos</button>
        <button class="chip" data-st="Morreu">Morreram</button>
        <button class="chip" data-st="Inativo">Inativos</button>
        <button class="chip" data-st="todos">Todos</button>
      </div>
      <div id="listaAnimais"></div>`;

    let fazendaAtiva = 'todas';
    let statusAtivo = 'Ativo';

    const renderCardAnimal = (a) => {
      const stCls = { Ativo: 'green', Vendido: 'orange', Morreu: 'red' }[a.situacao || 'Ativo'] || 'red';
      const nPartos = Api.list('partos').filter(p => p.mae_id === a.id).length;
      return `
        <div class="rec-title">${Utils.escapeHtml(a.nome)} ${UI.badge(a.situacao || 'Ativo', stCls)} ${a._pendente ? UI.badge('Pendente de sincronização', 'orange') : ''}</div>
        <div class="rec-sub">${Utils.escapeHtml(a.especie || '-')} · ${Utils.escapeHtml(a.categoria || '-')} · ${Utils.escapeHtml(a.sexo || '-')}</div>
        <div class="rec-row">
          <span>Idade: ${Utils.idadeTexto(a.nascimento)}</span>
          <span>Raça: ${Utils.escapeHtml(a.raca || '-')}</span>
          <span>Fazenda: ${Utils.escapeHtml(a.fazenda || '-')}</span>
        </div>
        ${(a.peso_nascimento || a.peso_desmame) ? `
        <div class="rec-row">
          ${a.peso_nascimento ? `<span>Peso ao nascer: ${Utils.fmtNum(a.peso_nascimento, 1)} kg</span>` : ''}
          ${a.peso_desmame ? `<span>Peso ao desmame: ${Utils.fmtNum(a.peso_desmame, 1)} kg</span>` : ''}
        </div>` : ''}
        ${a.sexo === 'F' ? `
        <div class="rec-row" style="margin-top:8px;">
          <span>Parições: ${nPartos}</span>
          <button class="btn btn-ghost" data-stop data-parto-de="${a.id}" style="padding:6px 10px;">+ Registrar parição</button>
        </div>` : ''}`;
    };

    const desenhar = () => {
      const termo = (container.querySelector('#buscaAnimal').value || '').toLowerCase();
      let lista = todos.filter(a => statusAtivo === 'todos' ? true : (a.situacao || 'Ativo') === statusAtivo);
      if (fazendaAtiva !== 'todas') lista = lista.filter(a => a.fazenda === fazendaAtiva);
      if (termo) lista = lista.filter(a => (a.nome || '').toLowerCase().includes(termo) || (a.raca || '').toLowerCase().includes(termo));
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

      const raiz = container.querySelector('#listaAnimais');
      if (!lista.length) {
        raiz.innerHTML = `<div class="empty-state">Nenhum animal encontrado.</div>`;
        return;
      }

      // Agrupa por espécie, na ordem de this.especies, com "Não informada" por último
      const grupos = {};
      lista.forEach(a => {
        const esp = a.especie || 'Não informada';
        (grupos[esp] = grupos[esp] || []).push(a);
      });
      const ordemEspecies = [...this.especies, 'Não informada'];
      const especiesPresentes = Object.keys(grupos).sort((a, b) => ordemEspecies.indexOf(a) - ordemEspecies.indexOf(b));

      // Bovina ainda é subdividida por categoria (Bezerro(a), Garrote(a), Novilho(a), Boi, Reprodutor, Vaca...)
      const ordemCategoriasBovina = [...this.categoriasPorEspecie.Bovina, 'Sem categoria'];
      const categoriasDe = (esp, animaisEsp) => {
        if (esp !== 'Bovina') return null;
        const subgrupos = {};
        animaisEsp.forEach(a => {
          const cat = a.categoria || 'Sem categoria';
          (subgrupos[cat] = subgrupos[cat] || []).push(a);
        });
        return Object.keys(subgrupos).sort((a, b) => ordemCategoriasBovina.indexOf(a) - ordemCategoriasBovina.indexOf(b)).map(cat => ({ cat, itens: subgrupos[cat] }));
      };

      raiz.innerHTML = especiesPresentes.map((esp, i) => {
        const subgrupos = categoriasDe(esp, grupos[esp]);
        if (!subgrupos) {
          return `
            <h3 class="section-title">${Utils.escapeHtml(esp)} (${grupos[esp].length})</h3>
            <div id="grupoEspecie${i}"></div>`;
        }
        return `
          <h3 class="section-title">${Utils.escapeHtml(esp)} (${grupos[esp].length})</h3>
          ${subgrupos.map((sg, j) => `
            <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);margin:10px 0 8px;">${Utils.escapeHtml(sg.cat)} (${sg.itens.length})</h4>
            <div id="grupoEspecie${i}_cat${j}"></div>
          `).join('')}`;
      }).join('');

      especiesPresentes.forEach((esp, i) => {
        const subgrupos = categoriasDe(esp, grupos[esp]);
        if (!subgrupos) {
          UI.renderList(raiz.querySelector(`#grupoEspecie${i}`), {
            data: grupos[esp],
            onCardClick: (a) => this.abrirFormAnimal(a),
            renderCard: renderCardAnimal
          });
          return;
        }
        subgrupos.forEach((sg, j) => {
          UI.renderList(raiz.querySelector(`#grupoEspecie${i}_cat${j}`), {
            data: sg.itens,
            onCardClick: (a) => this.abrirFormAnimal(a),
            renderCard: renderCardAnimal
          });
        });
      });

      raiz.querySelectorAll('[data-parto-de]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mae = Api.get('animais', btn.dataset.partoDe);
          this.abrirFormParto(null, mae);
        });
      });
    };

    container.querySelector('#btnNovoAnimal').addEventListener('click', () => this.abrirFormAnimal(null));
    container.querySelector('#btnRecalcularCategorias').addEventListener('click', async () => {
      const bovinos = todos.filter(a => a.especie === 'Bovina' && (a.situacao || 'Ativo') === 'Ativo' && a.nascimento);
      const paraAtualizar = bovinos
        .map(a => ({ a, nova: this.categoriaAutomaticaBovina(a.nascimento, a.sexo) }))
        .filter(({ a, nova }) => nova && nova !== a.categoria);
      if (!paraAtualizar.length) { Utils.toast('Todas as categorias já estão corretas.'); return; }
      await Promise.all(paraAtualizar.map(({ a, nova }) => Api.atualizar('animais', a.id, { categoria: nova })));
      Utils.toast(`${paraAtualizar.length} categoria(s) atualizada(s).`);
      App.refresh();
    });
    container.querySelector('#buscaAnimal').addEventListener('input', desenhar);
    container.querySelectorAll('#filtroFazenda .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroFazenda .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fazendaAtiva = chip.dataset.fz;
        desenhar();
      });
    });
    container.querySelectorAll('#filtroStatusAnimal .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroStatusAnimal .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        statusAtivo = chip.dataset.st;
        desenhar();
      });
    });
    desenhar();
  },

  abrirFormAnimal(animal, dadosIniciais, onCriado) {
    const especieAtual = (animal && animal.especie) || (dadosIniciais && dadosIniciais.especie) || 'Bovina';
    const schema = [
      { key: 'nome', label: 'Nome/Brinco', type: 'text', required: true },
      { key: 'especie', label: 'Espécie', type: 'select', required: true, options: this.especies.map(e => ({ value: e, label: e })) },
      { key: 'sexo', label: 'Sexo', type: 'select', options: [{ value: 'M', label: 'Macho (M)' }, { value: 'F', label: 'Fêmea (F)' }] },
      { key: 'categoria', label: 'Categoria', type: 'text', suggestions: this.categoriasSugestao(especieAtual) },
      { key: 'raca', label: 'Raça', type: 'text', suggestions: this.racasSugestao },
      { key: 'classe_fiscal', label: 'Classe fiscal (Inventário SEFAZ-TO)', type: 'text', suggestions: this.classesFiscais },
      { key: 'pelagem', label: 'Pelagem', type: 'text', suggestions: this.pelagemSugestao },
      { key: 'finalidade', label: 'Finalidade', type: 'text', suggestions: this.finalidadesAnimal },
      { key: 'nascimento', label: 'Data de nascimento', type: 'date' },
      { key: 'peso_nascimento', label: 'Peso ao nascer (kg)', type: 'number', step: '0.1' },
      { key: 'mae_id', label: 'Mãe', type: 'select', optionsFrom: { fetch: () => this.animais().filter(a => a.sexo === 'F' && (!animal || a.id !== animal.id)), valueField: 'id', labelFn: a => a.nome } },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'proprietario_id', label: 'Proprietário(a)', type: 'select', optionsFrom: { fetch: () => Api.list('proprietarios'), valueField: 'id', labelFn: p => p.nome } },
      { key: 'situacao', label: 'Situação', type: 'select', options: [{ value: 'Ativo', label: 'Ativo' }, { value: 'Vendido', label: 'Vendido' }, { value: 'Morreu', label: 'Morreu' }, { value: 'Inativo', label: 'Inativo' }] },
      { key: 'descarte', label: 'Descarte', type: 'checkbox' },
      { key: 'desmame', label: 'Data de desmame', type: 'date' },
      { key: 'peso_desmame', label: 'Peso ao desmame (kg)', type: 'number', step: '0.1' },
      { key: 'morte', label: 'Data de morte', type: 'date' },
      { key: 'causa_morte', label: 'Causa da morte', type: 'text' },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: animal ? 'Editar animal' : (dadosIniciais ? `Novo animal (dados herdados de ${this.nomeAnimal(dadosIniciais.mae_id)})` : 'Novo animal'),
      schema,
      dados: animal || dadosIniciais || { situacao: 'Ativo', classe_fiscal: 'Comum' },
      onRender: (box) => {
        const campoEspecie = box.querySelector('[name="especie"]');
        const campoSexo = box.querySelector('[name="sexo"]');
        const campoNascimento = box.querySelector('[name="nascimento"]');
        const campoCategoria = box.querySelector('[name="categoria"]');

        // Para bovinos, a categoria é calculada pela idade/sexo e não precisa ser escolhida à mão
        const aplicarCategoriaAutomatica = () => {
          if (campoEspecie.value !== 'Bovina') return;
          const auto = this.categoriaAutomaticaBovina(campoNascimento.value, campoSexo.value);
          if (auto) campoCategoria.value = auto;
        };

        campoEspecie.addEventListener('change', (e) => {
          UI.atualizarSugestoes(box, 'categoria', this.categoriasSugestao(e.target.value));
          aplicarCategoriaAutomatica();
        });
        campoSexo.addEventListener('change', aplicarCategoriaAutomatica);
        campoNascimento.addEventListener('change', aplicarCategoriaAutomatica);
        aplicarCategoriaAutomatica();

        if (animal) {
          const form = box.querySelector('#dynForm');
          const btnArvore = document.createElement('button');
          btnArvore.type = 'button';
          btnArvore.className = 'btn btn-secondary';
          btnArvore.style.marginBottom = '14px';
          btnArvore.textContent = '🌳 Ver árvore genealógica';
          btnArvore.addEventListener('click', () => this.abrirArvoreGenealogica(animal));
          form.insertBefore(btnArvore, form.firstChild);
        }

        if (animal && animal.sexo === 'F') {
          const form = box.querySelector('#dynForm');
          const partos = Api.list('partos').filter(p => p.mae_id === animal.id).sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''));
          const lactacoes = Api.list('lactacoes').filter(l => l.animal_id === animal.id).sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
          const intervalos = this.intervalosPartos();
          const intervalosDaVaca = partos.map(p => intervalos[p.id]).filter(d => d !== undefined);
          const mediaIep = intervalosDaVaca.length ? Math.round(intervalosDaVaca.reduce((s, d) => s + d, 0) / intervalosDaVaca.length) : null;

          const secao = document.createElement('div');
          secao.className = 'form-group';
          secao.innerHTML = `
            <label>Histórico de parições (${partos.length})${mediaIep !== null ? ` — IEP médio: ${this.textoIntervalo(mediaIep)}` : ''}</label>
            <div class="ficha-lista">
              ${partos.length ? partos.map(p => `
                <div class="ficha-item">
                  <span>${Utils.fmtData(p.data_parto)}</span>
                  <span>${Utils.escapeHtml(p.sexo_bezerro || '-')}</span>
                  <span>${Utils.escapeHtml(this.nomeBezerro(p))}</span>
                  ${intervalos[p.id] !== undefined ? `<span>${UI.badge('Intervalo: ' + this.textoIntervalo(intervalos[p.id]), 'blue')}</span>` : ''}
                </div>`).join('') : '<div class="ficha-vazio">Nenhuma parição registrada ainda.</div>'}
            </div>
            <button type="button" class="btn btn-ghost" id="btnFichaParto" style="margin-top:8px;width:100%;">+ Registrar parição</button>
            ${animal.finalidade === 'Leite' ? `
            <label style="margin-top:16px;display:block;">Lactações (${lactacoes.length})</label>
            <div class="ficha-lista">
              ${lactacoes.length ? lactacoes.map(l => `
                <div class="ficha-item">
                  <span>Início: ${Utils.fmtData(l.data_inicio)}</span>
                  <span>${l.producao_media ? Utils.fmtNum(l.producao_media, 1) + ' L/dia' : '-'}</span>
                  <span>${l.data_fim ? 'Fim: ' + Utils.fmtData(l.data_fim) : 'Em lactação'}</span>
                </div>`).join('') : '<div class="ficha-vazio">Nenhuma lactação registrada ainda.</div>'}
            </div>` : ''}
          `;
          form.appendChild(secao);
          secao.querySelector('#btnFichaParto').addEventListener('click', () => this.abrirFormParto(null, animal));
        }
      },
      onSalvar: async (dados) => {
        if (!dados.mae_id) delete dados.mae_id;
        // Regras automáticas: morte sempre vira situação "Morreu"; venda de um(a) bezerro(a)
        // que ainda não tinha desmame registrado assume o desmame na data da venda.
        const situacaoAnterior = animal ? (animal.situacao || 'Ativo') : null;
        if (dados.morte) {
          dados.situacao = 'Morreu';
        } else if (dados.situacao === 'Vendido' && dados.categoria === 'Bezerro(a)' && !dados.desmame) {
          dados.desmame = Utils.hoje();
        }
        if (animal) {
          await Api.atualizar('animais', animal.id, dados);
        } else {
          const novo = await Api.criar('animais', dados);
          if (onCriado) await onCriado(novo);
        }
        // Marcar um animal já cadastrado como Vendido/Morreu direto por aqui (sem passar pelo
        // formulário de Movimentação) precisa deixar o mesmo rastro em Movimentações — senão a
        // saída não aparece lá nem entra nas contagens que dependem de mov_rebanho.
        if (animal && situacaoAnterior !== dados.situacao && ['Vendido', 'Morreu'].includes(dados.situacao)) {
          await Api.criar('mov_rebanho', {
            animal_id: animal.id,
            data: dados.situacao === 'Morreu' ? (dados.morte || Utils.hoje()) : Utils.hoje(),
            tipo: 'Saída',
            motivo: dados.situacao === 'Morreu' ? 'Morte' : 'Venda',
            fazenda: dados.fazenda,
            observacao: dados.situacao === 'Morreu' ? (dados.causa_morte || null) : 'Marcado como Vendido direto no cadastro do animal.'
          });
        }
        Utils.toast('Animal salvo.');
        App.refresh();
      },
      onExcluir: animal ? async () => {
        await Api.excluir('animais', animal.id);
        Utils.toast('Animal excluído.');
        App.refresh();
      } : null
    });
  },

  /* ---------- PARTOS ---------- */
  renderPartos(container) {
    const regs = Api.list('partos').sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''));
    const intervalos = this.intervalosPartos();
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovoParto">+ Novo parto</button></div>
      <div id="listaPartos"></div>`;
    container.querySelector('#btnNovoParto').addEventListener('click', () => this.abrirFormParto(null));
    UI.renderList(container.querySelector('#listaPartos'), {
      data: regs,
      emptyText: 'Nenhum parto registrado ainda.',
      onCardClick: (r) => this.abrirFormParto(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(this.nomeAnimal(r.mae_id))} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>${Utils.fmtData(r.data_parto)}</span>
          <span>${Utils.escapeHtml(r.sexo_bezerro || '-')}</span>
          <span>Filhote: ${Utils.escapeHtml(this.nomeBezerro(r))}</span>
        </div>
        ${intervalos[r.id] !== undefined ? `<div class="rec-row" style="margin-top:4px;">${UI.badge('Intervalo desde o parto anterior: ' + this.textoIntervalo(intervalos[r.id]), 'blue')}</div>` : ''}`
    });
  },

  abrirFormParto(reg, maeFixa) {
    const schema = [
      { key: 'mae_id', label: 'Mãe', type: 'select', required: true, optionsFrom: { fetch: () => this.animais().filter(a => a.sexo === 'F'), valueField: 'id', labelFn: a => a.nome } },
      { key: 'data_parto', label: 'Data do parto', type: 'date', required: true },
      { key: 'sexo_bezerro', label: 'Sexo do bezerro(a)', type: 'select', options: [{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }] },
      { key: 'brinco_bezerro', label: 'Brinco/identificação do bezerro(a)', type: 'text' },
      { key: 'cadastrarAnimal', label: 'Cadastrar o bezerro(a) como novo animal automaticamente', type: 'checkbox', default: !reg }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar parto' : (maeFixa ? `Registrar parição de ${maeFixa.nome}` : 'Novo parto'),
      schema,
      dados: reg || { data_parto: Utils.hoje(), mae_id: maeFixa ? maeFixa.id : '' },
      onSalvar: async (dados) => {
        const criarAnimal = dados.cadastrarAnimal;
        delete dados.cadastrarAnimal;
        const partoSalvo = reg ? (await Api.atualizar('partos', reg.id, dados), reg) : await Api.criar('partos', dados);

        const mae = Api.get('animais', dados.mae_id);

        if (!reg && criarAnimal && dados.brinco_bezerro) {
          // O bezerro herda os dados da mãe (raça, pelagem, finalidade, fazenda, proprietário);
          // só brinco e sexo são obrigatoriamente preenchidos agora — o resto pode ser ajustado na hora.
          const herdado = mae ? {
            especie: mae.especie,
            raca: mae.raca,
            pelagem: mae.pelagem,
            finalidade: mae.finalidade,
            fazenda: mae.fazenda,
            proprietario_id: mae.proprietario_id,
            classe_fiscal: mae.classe_fiscal || 'Comum'
          } : {};
          this.abrirFormAnimal(null, Object.assign({}, herdado, {
            nome: dados.brinco_bezerro,
            sexo: dados.sexo_bezerro,
            nascimento: dados.data_parto,
            mae_id: dados.mae_id,
            situacao: 'Ativo'
          }), async (novoAnimal) => {
            // liga o parto ao cadastro do bezerro, assim renomeá-lo depois atualiza aqui sozinho
            await Api.atualizar('partos', partoSalvo.id, { bezerro_id: novoAnimal.id });
          });
        }

        // Parição de uma fêmea de finalidade "Leite" abre lactação automaticamente
        if (!reg && mae && mae.finalidade === 'Leite') {
          await Api.criar('lactacoes', { animal_id: dados.mae_id, data_inicio: dados.data_parto });
          Utils.toast('Parto salvo e lactação iniciada.');
        } else {
          Utils.toast('Parto salvo.');
        }
        App.refresh();
      },
      onExcluir: reg ? async () => { await Api.excluir('partos', reg.id); Utils.toast('Parto excluído.'); App.refresh(); } : null
    });
  },

  /* ---------- LACTAÇÕES ---------- */
  renderLactacoes(container) {
    const regs = Api.list('lactacoes').sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaLactacao">+ Nova lactação</button></div>
      <div id="listaLactacoes"></div>`;
    container.querySelector('#btnNovaLactacao').addEventListener('click', () => this.abrirFormLactacao(null));
    UI.renderList(container.querySelector('#listaLactacoes'), {
      data: regs,
      emptyText: 'Nenhuma lactação registrada ainda.',
      onCardClick: (r) => this.abrirFormLactacao(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(this.nomeAnimal(r.animal_id))} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row">
          <span>Início: ${Utils.fmtData(r.data_inicio)}</span>
          <span>${r.producao_media ? Utils.fmtNum(r.producao_media, 1) + ' L/dia' : '-'}</span>
          <span>${r.data_fim ? 'Fim: ' + Utils.fmtData(r.data_fim) : UI.badge('Em lactação', 'green')}</span>
        </div>`
    });
  },

  abrirFormLactacao(reg) {
    const schema = [
      { key: 'animal_id', label: 'Animal', type: 'select', required: true, optionsFrom: { fetch: () => this.animais().filter(a => a.sexo === 'F'), valueField: 'id', labelFn: a => a.nome } },
      { key: 'data_inicio', label: 'Início da lactação', type: 'date', required: true },
      { key: 'producao_media', label: 'Produção média (L/dia)', type: 'number', step: '0.1' },
      { key: 'data_fim', label: 'Fim da lactação (secagem)', type: 'date' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar lactação' : 'Nova lactação',
      schema,
      dados: reg || { data_inicio: Utils.hoje() },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('lactacoes', reg.id, dados);
        else await Api.criar('lactacoes', dados);
        Utils.toast('Lactação salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => { await Api.excluir('lactacoes', reg.id); Utils.toast('Lactação excluída.'); App.refresh(); } : null
    });
  },

  /* ---------- MOVIMENTAÇÕES ---------- */
  renderMovimentacoes(container) {
    const regs = Api.list('mov_rebanho').sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    container.innerHTML = `
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaMov">+ Nova movimentação</button></div>
      <div id="listaMov"></div>`;
    container.querySelector('#btnNovaMov').addEventListener('click', () => this.abrirFormMovimentacao(null));
    UI.renderList(container.querySelector('#listaMov'), {
      data: regs,
      emptyText: 'Nenhuma movimentação registrada ainda.',
      onCardClick: (r) => this.abrirFormMovimentacao(r),
      renderCard: (r) => `
        <div class="rec-title">${Utils.escapeHtml(this.nomeAnimal(r.animal_id))} ${UI.badge(r.tipo, r.tipo === 'Entrada' ? 'green' : 'orange')} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-row"><span>${Utils.fmtData(r.data)}</span><span>${Utils.escapeHtml(r.motivo || '-')}</span><span>${Utils.escapeHtml(r.fazenda || '-')}</span></div>`
    });
  },

  abrirFormMovimentacao(reg) {
    const schema = [
      { key: 'animal_id', label: 'Animal', type: 'select', required: true, optionsFrom: { fetch: () => this.animais(), valueField: 'id', labelFn: a => a.nome } },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ value: 'Entrada', label: 'Entrada' }, { value: 'Saída', label: 'Saída' }] },
      { key: 'motivo', label: 'Motivo', type: 'text', suggestions: this.motivosMovimentacao },
      { key: 'fazenda', label: 'Fazenda', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'observacao', label: 'Observação', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar movimentação' : 'Nova movimentação',
      schema,
      dados: reg || { data: Utils.hoje(), tipo: 'Entrada' },
      onSalvar: async (dados) => {
        if (reg) await Api.atualizar('mov_rebanho', reg.id, dados);
        else await Api.criar('mov_rebanho', dados);

        if (dados.tipo === 'Saída' && ['Venda', 'Morte', 'Abate'].includes(dados.motivo) && dados.animal_id) {
          if (dados.motivo === 'Venda') {
            const animalAtual = Api.get('animais', dados.animal_id);
            await Api.atualizar('animais', dados.animal_id, this.patchSituacaoVendido(animalAtual, dados.data));
          } else if (dados.motivo === 'Morte') {
            await Api.atualizar('animais', dados.animal_id, { situacao: 'Morreu', morte: dados.data });
          } else {
            await Api.atualizar('animais', dados.animal_id, { situacao: 'Inativo' });
          }
        }
        Utils.toast('Movimentação salva.');
        App.refresh();
      },
      onExcluir: reg ? async () => { await Api.excluir('mov_rebanho', reg.id); Utils.toast('Movimentação excluída.'); App.refresh(); } : null
    });
  },

  /* ---------- ADAPEC (declaração de rebanho por faixa etária) ---------- */
  faixaEtaria(meses) {
    if (meses <= 2) return '0_2';
    if (meses <= 8) return '3_8';
    if (meses <= 12) return '9_12';
    if (meses <= 24) return '13_24';
    if (meses <= 36) return '25_36';
    return '36_mais';
  },

  renderAdapec(container) {
    const fazendas = this.fazendasConhecidas();
    container.innerHTML = `
      <div class="filter-chips" id="filtroFazendaAdapec">
        <button class="chip active" data-fz="todas">Todas as fazendas</button>
        ${fazendas.map(f => `<button class="chip" data-fz="${Utils.escapeHtml(f)}">${Utils.escapeHtml(f)}</button>`).join('')}
      </div>
      <div id="resumoAdapec"></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnSalvarAdapec">Salvar declaração de hoje</button></div>
      <h3 class="section-title">Declarações anteriores</h3>
      <div id="listaAdapec"></div>
    `;

    let fazendaAtiva = 'todas';
    let ultimoResumoBovina = null;

    const faixaVazia = () => ({ '0_2': { M: 0, F: 0 }, '3_8': { M: 0, F: 0 }, '9_12': { M: 0, F: 0 }, '13_24': { M: 0, F: 0 }, '25_36': { M: 0, F: 0 }, '36_mais': { M: 0, F: 0 } });

    // Agrupa TODOS os animais ativos por espécie (quem não tem data de nascimento entra em "idade não informada")
    const calcularPorEspecie = () => {
      let lista = this.animais().filter(a => (a.situacao || 'Ativo') === 'Ativo');
      if (fazendaAtiva !== 'todas') lista = lista.filter(a => a.fazenda === fazendaAtiva);
      const porEspecie = {};
      lista.forEach(a => {
        const esp = a.especie || 'Não informada';
        if (!porEspecie[esp]) porEspecie[esp] = { faixas: faixaVazia(), semIdade: { M: 0, F: 0 } };
        const sexo = a.sexo === 'F' ? 'F' : 'M';
        if (!a.nascimento) { porEspecie[esp].semIdade[sexo]++; return; }
        const meses = Math.floor(Utils.diasEntre(a.nascimento) / 30);
        porEspecie[esp].faixas[this.faixaEtaria(meses)][sexo]++;
      });
      return porEspecie;
    };

    const ordem = ['0_2', '3_8', '9_12', '13_24', '25_36', '36_mais'];
    const labelFaixa = { '0_2': '0-2 meses', '3_8': '3-8 meses', '9_12': '9-12 meses', '13_24': '13-24 meses', '25_36': '25-36 meses', '36_mais': 'acima de 36 meses' };

    // "Legal" é um total à parte, somado só dos itens das GTAs de compra/venda lançadas
    // (não depende do cadastro de Animais) — cada GTA pode ter vários itens (lotes).
    const calcularLegal = () => {
      const legal = faixaVazia();
      let gtas = Api.list('gta_movimentacoes');
      if (fazendaAtiva !== 'todas') gtas = gtas.filter(g => g.fazenda === fazendaAtiva);
      const idsGtas = new Set(gtas.map(g => g.id));
      const gtaPorId = {};
      gtas.forEach(g => { gtaPorId[g.id] = g; });
      Api.list('gta_itens').filter(i => idsGtas.has(i.gta_id)).forEach(i => {
        const g = gtaPorId[i.gta_id];
        const sinal = g.tipo === 'Compra' ? 1 : -1;
        if (legal[i.faixa_etaria_legal]) legal[i.faixa_etaria_legal][i.sexo] += sinal * (i.quantidade_legal || 0);
      });
      return legal;
    };

    const desenhar = () => {
      const porEspecie = calcularPorEspecie();
      const especiesOrdenadas = Object.keys(porEspecie).sort();
      ultimoResumoBovina = porEspecie['Bovina'] || { faixas: faixaVazia(), semIdade: { M: 0, F: 0 } };
      const legalBovina = calcularLegal();

      container.querySelector('#resumoAdapec').innerHTML = especiesOrdenadas.length ? `<div class="grid-2col">${especiesOrdenadas.map(esp => {
        const dados = porEspecie[esp];
        const ehBovina = esp === 'Bovina';
        let totalM = 0, totalF = 0, totalLegalM = 0, totalLegalF = 0;
        ordem.forEach(k => {
          totalM += dados.faixas[k].M; totalF += dados.faixas[k].F;
          if (ehBovina) { totalLegalM += legalBovina[k].M; totalLegalF += legalBovina[k].F; }
        });
        const semIdadeTotal = dados.semIdade.M + dados.semIdade.F;
        totalM += dados.semIdade.M; totalF += dados.semIdade.F;
        // Linha-modelo reaproveitada no cabeçalho e em cada linha de faixa etária, pra
        // "Real"/"Legal" ficarem sempre na mesma posição: 1 rótulo flexível + colunas fixas.
        const linhaAdapec = (rotulo, real, legal, extra) => `
          <div class="rec-row adapec-linha" style="${extra || ''}">
            <span class="adapec-rotulo">${rotulo}</span>
            <span class="adapec-col">${real}</span>
            ${ehBovina ? `<span class="adapec-col">${legal}</span>` : ''}
          </div>`;
        return `
          <div class="adapec-card">
            <h3 class="section-title">${Utils.escapeHtml(esp)} — ${totalM + totalF} ativo(s)${ehBovina ? ' · declaração ADAPEC' : ''}</h3>
            <div class="bar-chart">
              ${ehBovina ? linhaAdapec('', 'Real', 'Legal (GTA)', 'padding-bottom:4px;font-size:12px;color:var(--text-muted);') : ''}
              ${ordem.map(k => linhaAdapec(
                labelFaixa[k],
                ehBovina ? `M:${dados.faixas[k].M} F:${dados.faixas[k].F}` : `M: <b>${dados.faixas[k].M}</b> &nbsp; F: <b>${dados.faixas[k].F}</b>`,
                `M:${legalBovina[k].M} F:${legalBovina[k].F}`,
                'padding:6px 0;border-bottom:1px solid var(--border)'
              )).join('')}
              ${semIdadeTotal ? `
              <div class="rec-row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
                <span>Idade não informada</span>
                <span>M: <b>${dados.semIdade.M}</b> &nbsp; F: <b>${dados.semIdade.F}</b></span>
              </div>` : ''}
              <div class="rec-row" style="justify-content:space-between;padding:10px 0 0;font-weight:700">
                <span>Total Real</span>
                <span>M: ${totalM} &nbsp; F: ${totalF} &nbsp; Geral: ${totalM + totalF}</span>
              </div>
              ${ehBovina ? `
              <div class="rec-row" style="justify-content:space-between;padding-top:4px;font-weight:700;color:var(--blue-600)">
                <span>Total Legal (GTA)</span>
                <span>M: ${totalLegalM} &nbsp; F: ${totalLegalF} &nbsp; Geral: ${totalLegalM + totalLegalF}</span>
              </div>` : ''}
            </div>
          </div>`;
      }).join('')}</div>` : '<div class="empty-state">Nenhum animal ativo encontrado.</div>';

      const historico = Api.list('adapec_declaracoes').sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      UI.renderList(container.querySelector('#listaAdapec'), {
        data: historico,
        emptyText: 'Nenhuma declaração salva ainda.',
        renderCard: (r) => `
          <div class="rec-title">${Utils.fmtData(r.data)} ${r.fazenda ? UI.badge(r.fazenda, 'blue') : ''}</div>
          <div class="rec-row">
            <span>Total: ${r.total ?? '-'}</span><span>Machos: ${r.total_m ?? '-'}</span><span>Fêmeas: ${r.total_f ?? '-'}</span>
            <button class="btn btn-danger" data-stop data-excluir-adapec="${r.id}" style="padding:6px 10px;">Excluir</button>
          </div>`
      });
      container.querySelectorAll('[data-excluir-adapec]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!Utils.confirmar('Excluir esta declaração? Essa ação não pode ser desfeita.')) return;
          await Api.excluir('adapec_declaracoes', btn.dataset.excluirAdapec);
          Utils.toast('Declaração excluída.');
          App.refresh();
        });
      });
    };

    container.querySelectorAll('#filtroFazendaAdapec .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroFazendaAdapec .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fazendaAtiva = chip.dataset.fz;
        desenhar();
      });
    });

    container.querySelector('#btnSalvarAdapec').addEventListener('click', async () => {
      const faixas = ultimoResumoBovina.faixas;
      let totalM = 0, totalF = 0;
      ordem.forEach(k => { totalM += faixas[k].M; totalF += faixas[k].F; });
      const semIdade = ultimoResumoBovina.semIdade.M + ultimoResumoBovina.semIdade.F;
      if (totalM + totalF === 0) {
        Utils.toast('Nenhum bovino com data de nascimento para declarar.', 'error');
        return;
      }
      await Api.criar('adapec_declaracoes', {
        data: Utils.hoje(),
        fazenda: fazendaAtiva === 'todas' ? null : fazendaAtiva,
        m_0_2: faixas['0_2'].M, f_0_2: faixas['0_2'].F,
        m_3_8: faixas['3_8'].M, f_3_8: faixas['3_8'].F,
        m_9_12: faixas['9_12'].M, f_9_12: faixas['9_12'].F,
        m_13_24: faixas['13_24'].M, f_13_24: faixas['13_24'].F,
        m_25_36: faixas['25_36'].M, f_25_36: faixas['25_36'].F,
        m_36_mais: faixas['36_mais'].M, f_36_mais: faixas['36_mais'].F,
        total_m: totalM, total_f: totalF, total: totalM + totalF
      });
      Utils.toast(semIdade ? `Declaração salva (${semIdade} bovino(s) sem data de nascimento ficaram de fora).` : 'Declaração salva.');
      App.refresh();
    });

    desenhar();
  },

  /* ---------- COMPRAS/VENDAS (GTA) ----------
     Cada registro aqui é o CABEÇALHO de uma GTA de verdade (número, série, origem, destino...),
     igual ao documento emitido pela ADAPEC. Dentro dele ficam os itens (lotes por sexo/faixa
     etária), já que uma GTA real costuma trazer várias combinações numa tabela só. Cada item
     guarda a quantidade real (o que de fato aconteceu) e a quantidade legal (o que a GTA
     declara) — a diferença entre as duas é comum na prática e alimenta a coluna "Legal" da
     ADAPEC (que soma só a quantidade_legal). */
  labelFaixaAdapec: { '0_2': '0-2 meses', '3_8': '3-8 meses', '9_12': '9-12 meses', '13_24': '13-24 meses', '25_36': '25-36 meses', '36_mais': 'acima de 36 meses' },
  finalidadesGta: ['Engorda', 'Cria', 'Recria', 'Abate', 'Reprodução', 'Exposição/Feira', 'Outro'],

  itensDaGta(gtaId) {
    return Api.list('gta_itens').filter(i => i.gta_id === gtaId);
  },

  renderGta(container) {
    const regs = Api.list('gta_movimentacoes').sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    container.innerHTML = `
      <div class="hint" style="margin-bottom:10px;">Lançamentos de compra/venda por GTA, usados para calcular a coluna "Legal" da aba ADAPEC. A quantidade real é só para referência — quem entra na conta Legal é a quantidade da GTA.</div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnNovaGta">+ Nova compra/venda (GTA)</button></div>
      <div id="listaGta"></div>`;
    container.querySelector('#btnNovaGta').addEventListener('click', () => this.abrirFormGta(null));
    UI.renderList(container.querySelector('#listaGta'), {
      data: regs,
      emptyText: 'Nenhuma compra/venda por GTA registrada ainda.',
      onCardClick: (r) => this.abrirFormGta(r),
      renderCard: (r) => {
        const itens = this.itensDaGta(r.id);
        const totalReal = itens.reduce((s, i) => s + Number(i.quantidade_real || 0), 0);
        const totalLegal = itens.reduce((s, i) => s + Number(i.quantidade_legal || 0), 0);
        const contraparte = r.tipo === 'Compra' ? r.origem_nome : r.destino_nome;
        return `
        <div class="rec-title">${Utils.escapeHtml(r.tipo)} ${UI.badge(`${itens.length} lote(s)`, r.tipo === 'Compra' ? 'green' : 'orange')} ${r.anexo_url ? '📎' : ''} ${r._pendente ? UI.badge('Pendente', 'orange') : ''}</div>
        <div class="rec-sub">GTA ${Utils.escapeHtml(r.gta_numero || '-')}${r.gta_serie ? '/' + Utils.escapeHtml(r.gta_serie) : ''} · ${Utils.escapeHtml(r.fazenda || '-')} · ${Utils.escapeHtml(contraparte || '-')}</div>
        <div class="rec-row">
          <span>${Utils.fmtData(r.data)}</span>
          <span>Real: ${totalReal}</span>
          <span>Legal: ${totalLegal}</span>
        </div>`;
      }
    });
  },

  // Monta a área de anexo (PDF da GTA/outra imagem) dentro de um form já aberto pelo
  // UI.abrirFormulario. Usa dois campos ocultos do schema (anexo_url/anexo_nome) só pra
  // aproveitar a serialização automática do form — a parte visual é toda feita aqui.
  _montarCampoAnexoGta(form) {
    const campoUrl = form.querySelector('[name="anexo_url"]');
    const campoNome = form.querySelector('[name="anexo_nome"]');
    const grupoUrl = campoUrl.closest('.form-group');
    const grupoNome = campoNome.closest('.form-group');
    grupoUrl.style.display = 'none';
    grupoNome.style.display = 'none';

    const secao = document.createElement('div');
    secao.className = 'form-group';
    secao.innerHTML = `
      <label>Anexo</label>
      <input type="file" id="inputAnexoGta" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none;"/>
      <div id="anexoAtualGta"></div>
      <button type="button" class="btn btn-ghost" id="btnEnviarAnexoGta" style="width:100%;">📎 Anexar documento (PDF da GTA, foto, etc.)</button>
    `;
    grupoNome.parentNode.insertBefore(secao, grupoNome.nextSibling);

    const elAtual = secao.querySelector('#anexoAtualGta');
    const btnEnviar = secao.querySelector('#btnEnviarAnexoGta');
    const inputArquivo = secao.querySelector('#inputAnexoGta');

    const atualizar = () => {
      if (!campoUrl.value) { elAtual.innerHTML = ''; return; }
      elAtual.innerHTML = `
        <div class="rec-row" style="justify-content:space-between;align-items:center;padding:8px 0;">
          <a href="${Utils.escapeHtml(campoUrl.value)}" target="_blank" rel="noopener">📄 ${Utils.escapeHtml(campoNome.value || 'arquivo anexado')}</a>
          <button type="button" class="btn btn-ghost" id="btnRemoverAnexoGta" style="padding:4px 8px;">🗑️</button>
        </div>`;
      elAtual.querySelector('#btnRemoverAnexoGta').addEventListener('click', async () => {
        if (!Utils.confirmar('Remover o anexo?')) return;
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
        Utils.toast('Anexo enviado.');
      } catch (err) {
        Utils.toast(err.message || 'Não foi possível enviar o arquivo.', 'error');
      }
      btnEnviar.textContent = textoOriginal;
      btnEnviar.disabled = false;
      inputArquivo.value = '';
    });
  },

  // opcoes (só quando reg é null, pra manter os itens já lançados se reabrir o formulário
  // ao adicionar/editar um item antes da GTA existir): { dadosIniciais, itensDraft }
  abrirFormGta(reg, opcoes) {
    opcoes = opcoes || {};
    const itensDraft = reg ? null : (opcoes.itensDraft || []);
    const schema = [
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ value: 'Compra', label: 'Compra' }, { value: 'Venda', label: 'Venda' }] },
      { key: 'especie', label: 'Espécie', type: 'select', required: true, options: this.especies.map(e => ({ value: e, label: e })) },
      { key: 'gta_numero', label: 'Número da GTA', type: 'text', required: true },
      { key: 'gta_serie', label: 'Série', type: 'text' },
      { key: 'data', label: 'Data de emissão', type: 'date', required: true },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'finalidade', label: 'Finalidade', type: 'text', suggestions: this.finalidadesGta },
      { key: 'fazenda', label: 'Fazenda (qual das suas propriedades)', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'origem_estabelecimento', label: 'Origem — Estabelecimento', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'origem_nome', label: 'Origem — Nome/Produtor', type: 'text' },
      { key: 'origem_municipio', label: 'Origem — Município', type: 'text', suggestions: this.municipiosConhecidos() },
      { key: 'destino_estabelecimento', label: 'Destino — Estabelecimento', type: 'text', suggestions: this.fazendasConhecidas() },
      { key: 'destino_nome', label: 'Destino — Nome/Produtor', type: 'text' },
      { key: 'destino_municipio', label: 'Destino — Município', type: 'text', suggestions: this.municipiosConhecidos() },
      { key: 'observacao', label: 'Observação', type: 'textarea' },
      // Campos ocultos: guardam o anexo (URL + nome do arquivo no Supabase Storage). A tela de
      // upload de verdade é montada à mão no onRender, mas usar o schema normal pra esses dois
      // campos faz o form.onSalvar já pegar e salvar os valores automaticamente, sem código extra.
      { key: 'anexo_url', label: 'Anexo (URL)', type: 'text' },
      { key: 'anexo_nome', label: 'Anexo (nome do arquivo)', type: 'text' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar compra/venda (GTA)' : 'Nova compra/venda (GTA)',
      schema,
      dados: reg || opcoes.dadosIniciais || { data: Utils.hoje(), tipo: 'Compra', especie: 'Bovina' },
      onRender: (box) => {
        const form = box.querySelector('#dynForm');
        const itens = reg ? this.itensDaGta(reg.id) : itensDraft;
        const totalReal = itens.reduce((s, i) => s + Number(i.quantidade_real || 0), 0);
        const totalLegal = itens.reduce((s, i) => s + Number(i.quantidade_legal || 0), 0);

        const secao = document.createElement('div');
        secao.className = 'form-group';
        secao.innerHTML = `
          <label>Animais da GTA (${itens.length} lote${itens.length === 1 ? '' : 's'}) — Real: ${totalReal} · Legal: ${totalLegal}</label>
          <div class="ficha-lista">
            ${itens.length ? itens.map((i, idx) => `
              <div class="ficha-item" data-stop>
                <span>${i.sexo === 'F' ? 'Fêmeas' : 'Machos'}</span>
                <span>Real: ${i.quantidade_real} (${this.labelFaixaAdapec[i.faixa_etaria_real] || i.faixa_etaria_real})</span>
                <span>Legal: ${i.quantidade_legal} (${this.labelFaixaAdapec[i.faixa_etaria_legal] || i.faixa_etaria_legal})</span>
                <button type="button" class="btn btn-ghost" data-editar-item="${reg ? i.id : idx}" style="padding:4px 8px;">Editar</button>
              </div>`).join('') : '<div class="ficha-vazio">Nenhum lote lançado ainda.</div>'}
          </div>
          <button type="button" class="btn btn-ghost" id="btnFichaItemGta" style="margin-top:8px;width:100%;">+ Adicionar lote (sexo/faixa etária/quantidade)</button>
        `;

        // Posiciona entre "Fazenda" e "Origem — Estabelecimento"
        const campoOrigem = form.querySelector('[name="origem_estabelecimento"]');
        const grupoOrigem = campoOrigem ? campoOrigem.closest('.form-group') : null;
        if (grupoOrigem) grupoOrigem.parentNode.insertBefore(secao, grupoOrigem);
        else form.appendChild(secao);

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
            this.abrirFormGtaItem(item, reg);
          } else {
            this.abrirFormGtaItem(item, null, {
              lista: itensDraft,
              onMudou: () => this.abrirFormGta(null, { dadosIniciais: capturarDadosAtuais(), itensDraft })
            });
          }
        };
        secao.querySelector('#btnFichaItemGta').addEventListener('click', () => abrirItem(null));
        secao.querySelectorAll('[data-editar-item]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = reg ? Api.get('gta_itens', btn.dataset.editarItem) : itensDraft[Number(btn.dataset.editarItem)];
            abrirItem(item);
          });
        });

        this._montarCampoAnexoGta(form);
      },
      onSalvar: async (dados) => {
        if (reg) {
          await Api.atualizar('gta_movimentacoes', reg.id, dados);
          Utils.toast('GTA salva.');
          App.refresh();
        } else {
          const novaGta = await Api.criar('gta_movimentacoes', dados);
          for (const item of itensDraft) {
            const lancarRebanho = !!item.lancar_rebanho;
            const itemLimpo = Object.assign({}, item);
            delete itemLimpo.lancar_rebanho;
            const criado = await Api.criar('gta_itens', Object.assign({ gta_id: novaGta.id }, itemLimpo));
            if (lancarRebanho) await this.lancarAnimaisDoLoteGta(criado, novaGta);
          }
          Utils.toast(`GTA salva com ${itensDraft.length} lote(s).`);
          App.refresh();
        }
      },
      onExcluir: reg ? async () => { await Api.excluir('gta_movimentacoes', reg.id); Utils.toast('GTA excluída.'); App.refresh(); } : null
    });
  },

  // draft (só quando a GTA ainda não existe): { lista, onMudou } — guarda o lote num array
  // local até a GTA inteira ser salva, em vez de ir direto pro banco.
  abrirFormGtaItem(item, gta, draft) {
    const opcoesFaixa = Object.entries(this.labelFaixaAdapec).map(([value, label]) => ({ value, label }));
    const schema = [
      { key: 'sexo', label: 'Sexo dos animais', type: 'select', required: true, options: [{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }] },
      { key: 'faixa_etaria_real', label: 'Faixa etária — Real', type: 'select', required: true, options: opcoesFaixa },
      { key: 'quantidade_real', label: 'Quantidade real (o que realmente aconteceu)', type: 'number', step: '1', required: true },
      { key: 'faixa_etaria_legal', label: 'Faixa etária — Legal (como está na GTA)', type: 'select', required: true, options: opcoesFaixa },
      { key: 'quantidade_legal', label: 'Quantidade na GTA (legal)', type: 'number', step: '1', required: true },
      { key: 'lancar_rebanho', label: 'Lançar automaticamente no Rebanho (na Compra, cria os animais reais como Ativos; na Venda, só avisa pra você marcar manualmente quais ficam Inativos)', type: 'checkbox' }
    ];
    UI.abrirFormulario({
      titulo: item ? 'Editar lote' : 'Novo lote da GTA',
      schema,
      dados: item || {},
      onRender: (box) => {
        // Só faz sentido depois que o lote já existe de verdade (tem id numa GTA já salva) —
        // é a partir dele que sabemos sexo/quantidade pra montar o modelo certo.
        if (!item || !gta || draft) return;
        const form = box.querySelector('#dynForm');
        const secao = document.createElement('div');
        secao.className = 'form-group';
        secao.innerHTML = `
          <label>Planilha de animais deste lote (em vez de lançar um por um)</label>
          <p class="hint" style="margin-top:0;">${gta.tipo === 'Compra'
            ? 'Baixe o modelo, preencha o brinco/nome de cada animal e importe — cadastra todos de uma vez no Rebanho, já como Ativos.'
            : 'Baixe o modelo, preencha o brinco/nome de cada animal vendido e importe — marca todos como Inativo no Rebanho de uma vez.'}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost" id="btnModeloLoteGta">⬇ Baixar modelo (.csv)</button>
            <button type="button" class="btn btn-secondary" id="btnImportarLoteGta">📥 Importar planilha preenchida</button>
            <input type="file" id="inputImportarLoteGta" accept=".csv" style="display:none;"/>
          </div>
        `;
        form.appendChild(secao);
        secao.querySelector('#btnModeloLoteGta').addEventListener('click', () => this.baixarModeloLoteGta(gta, item));
        const inputImportar = secao.querySelector('#inputImportarLoteGta');
        secao.querySelector('#btnImportarLoteGta').addEventListener('click', () => inputImportar.click());
        inputImportar.addEventListener('change', async (e) => {
          const arquivo = e.target.files[0];
          if (!arquivo) return;
          await this.importarPlanilhaLoteGta(gta, item, arquivo);
          inputImportar.value = '';
        });
      },
      onSalvar: async (dados) => {
        const lancarRebanho = !!dados.lancar_rebanho;
        delete dados.lancar_rebanho;
        if (draft) {
          const registro = Object.assign({}, dados, { lancar_rebanho: lancarRebanho });
          if (item) Object.assign(item, registro);
          else draft.lista.push(registro);
          // O form do lote e o da GTA usam o mesmo modal; sem o await aqui, o close() do
          // próprio modal de lote roda DEPOIS de reabrir o da GTA e fecha ele de novo.
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        let itemSalvo;
        if (item) { await Api.atualizar('gta_itens', item.id, dados); itemSalvo = Object.assign({}, item, dados); }
        else { itemSalvo = await Api.criar('gta_itens', Object.assign({ gta_id: gta.id }, dados)); }
        if (lancarRebanho) await this.lancarAnimaisDoLoteGta(itemSalvo, gta);
        Utils.toast('Lote salvo.');
        this.abrirFormGta(Api.get('gta_movimentacoes', gta.id));
      },
      onExcluir: item ? async () => {
        if (draft) {
          const idx = draft.lista.indexOf(item);
          if (idx >= 0) draft.lista.splice(idx, 1);
          await Promise.resolve();
          draft.onMudou();
          return;
        }
        await Api.excluir('gta_itens', item.id);
        Utils.toast('Lote excluído.');
        this.abrirFormGta(Api.get('gta_movimentacoes', gta.id));
      } : null
    });
  },

  // Meses "representativos" de cada faixa etária da ADAPEC, usados só pra estimar uma data de
  // nascimento quando um lote da GTA é lançado automaticamente no Rebanho (a GTA só dá a faixa,
  // não a idade exata) — a categoria do animal (Bezerro/Garrote/Vaca...) continua sendo calculada
  // normalmente a partir dessa data estimada, igual a qualquer outro animal cadastrado.
  faixaEtariaMeioMeses(faixa) {
    return { '0_2': 1, '3_8': 5, '9_12': 10, '13_24': 18, '25_36': 30, '36_mais': 42 }[faixa] ?? 12;
  },

  // Transporta a quantidade REAL de um lote da GTA pro cadastro de Animais. Só sabemos fazer
  // isso com segurança numa Compra (cria animais novos, sem brinco/nome individual — quem
  // cadastrar o brinco depois pode editar o registro à vontade). Numa Venda não dá pra saber
  // COM CERTEZA quais animais específicos saíram só pela GTA, então só avisamos.
  async lancarAnimaisDoLoteGta(item, gta) {
    const sexoLabel = item.sexo === 'F' ? 'fêmea(s)' : 'macho(s)';
    if (gta.tipo !== 'Compra') {
      Utils.toast(`Venda: marque manualmente ${item.quantidade_real} ${sexoLabel} como Inativo(s) no Rebanho — a GTA não identifica quais animais especificamente.`, 'error');
      return;
    }
    const especie = gta.especie || 'Bovina';
    const nascimento = Utils.somarDias(Utils.hoje(), -this.faixaEtariaMeioMeses(item.faixa_etaria_real) * 30);
    const criacoes = [];
    for (let n = 1; n <= Number(item.quantidade_real || 0); n++) {
      const dados = {
        nome: `GTA ${gta.gta_numero}${gta.gta_serie ? '/' + gta.gta_serie : ''} - ${n}`,
        especie, sexo: item.sexo, nascimento,
        fazenda: gta.fazenda, situacao: 'Ativo',
        observacao: `Lançado automaticamente a partir da GTA ${gta.gta_numero}. Idade estimada pela faixa etária da GTA — edite o nome/brinco e a data de nascimento quando souber os dados exatos.`
      };
      if (especie === 'Bovina') dados.categoria = this.categoriaAutomaticaBovina(nascimento, item.sexo);
      criacoes.push(Api.criar('animais', dados));
    }
    await Promise.all(criacoes);
    Utils.toast(`${item.quantidade_real} animal(is) criado(s) no Rebanho a partir da GTA (idade estimada — edite os registros pra ajustar nome/brinco).`);
  },

  /* ---------- PLANILHA DE ANIMAIS DO LOTE (GTA) ----------
     Alternativa ao "lançar automaticamente": em vez de criar animais genéricos (Compra) ou só
     avisar pra marcar na mão (Venda), gera um modelo .csv do tamanho exato do lote (sexo e
     quantidade já vêm do lote) pro usuário preencher brinco/nome de cada animal de verdade, e
     importa de volta — já cadastrando tudo (Compra) ou já inativando tudo (Venda) de uma vez. */
  baixarModeloLoteGta(gta, item) {
    const n = Number(item.quantidade_real || 0) || 1;
    const sexoLabel = item.sexo === 'F' ? 'Fêmeas' : 'Machos';
    let cabecalho, linhaVazia;
    if (gta.tipo === 'Compra') {
      cabecalho = 'Nome_Brinco;Raca;Pelagem;Nascimento;Observacao';
      linhaVazia = ';;;;';
    } else {
      cabecalho = 'Nome_Brinco;Observacao';
      linhaVazia = ';';
    }
    const linhas = Array.from({ length: n }, () => linhaVazia);
    const conteudo = '﻿' + cabecalho + '\r\n' + linhas.join('\r\n') + '\r\n';
    Utils.downloadArquivo(`modelo-gta-${gta.gta_numero}-${sexoLabel.toLowerCase()}.csv`, conteudo, 'text/csv;charset=utf-8');
  },

  async importarPlanilhaLoteGta(gta, item, arquivo) {
    const texto = await arquivo.text();
    const linhas = Empreendimentos._parseCsv(texto).filter(l => (l['nome_brinco'] || '').trim());
    if (!linhas.length) { Utils.toast('Não encontrei nenhuma linha com nome/brinco preenchido nessa planilha.', 'error'); return; }
    if (!Utils.confirmar(`${gta.tipo === 'Compra' ? 'Cadastrar' : 'Marcar como vendido(a)'} ${linhas.length} animal(is) a partir dessa planilha?`)) return;

    const especie = gta.especie || 'Bovina';
    if (gta.tipo === 'Compra') {
      const nascimentoEstimado = Utils.somarDias(Utils.hoje(), -this.faixaEtariaMeioMeses(item.faixa_etaria_real) * 30);
      for (const linha of linhas) {
        const nascimento = Empreendimentos._parseDataPlanilha(linha['nascimento']) || nascimentoEstimado;
        const dados = {
          nome: linha['nome_brinco'].trim(),
          especie, sexo: item.sexo, nascimento,
          fazenda: gta.fazenda, situacao: 'Ativo',
          raca: linha['raca'] || null,
          pelagem: linha['pelagem'] || null,
          observacao: linha['observacao'] || `Lançado a partir da GTA ${gta.gta_numero} (planilha de lote).`
        };
        if (especie === 'Bovina') dados.categoria = this.categoriaAutomaticaBovina(nascimento, item.sexo);
        await Api.criar('animais', dados);
      }
      Utils.toast(`${linhas.length} animal(is) cadastrado(s) no Rebanho.`);
    } else {
      const naoEncontrados = [];
      for (const linha of linhas) {
        const nomeBuscado = linha['nome_brinco'].trim().toLowerCase();
        const animal = this.animais().find(a => (a.situacao || 'Ativo') === 'Ativo' && (a.nome || '').trim().toLowerCase() === nomeBuscado);
        if (!animal) { naoEncontrados.push(linha['nome_brinco'].trim()); continue; }
        await Api.atualizar('animais', animal.id, this.patchSituacaoVendido(animal, gta.data));
        await Api.criar('mov_rebanho', {
          animal_id: animal.id, data: gta.data, tipo: 'Saída',
          motivo: `Venda (GTA ${gta.gta_numero})`, fazenda: gta.fazenda,
          observacao: linha['observacao'] || null
        });
      }
      const qtdOk = linhas.length - naoEncontrados.length;
      Utils.toast(naoEncontrados.length
        ? `${qtdOk} animal(is) marcado(s) como vendido(s). Não encontrei (pelo nome/brinco, ativo): ${naoEncontrados.join(', ')}.`
        : `${qtdOk} animal(is) marcado(s) como vendido(s).`, naoEncontrados.length ? 'error' : undefined);
    }
    App.refresh();
  },

  /* ---------- INVENTÁRIO ANUAL (SEFAZ-TO) ----------
     Resumo para preparar o "Recibo de Resumo da Movimentação do Rebanho e
     Inventário de Gado" que a SEFAZ-TO exige todo ano (entregue/declarado em janeiro,
     referente ao ano anterior). Isto NÃO é o recibo oficial (que só a SEFAZ emite,
     com número de controle) — é a planilha de apoio com as contagens prontas. */
  classesFiscais: ['Comum', 'Girolanda', 'Holandês', 'Registrado', 'L.A.', 'Abate'],

  faixaEtariaSefaz(meses) {
    if (meses <= 12) return '0_12';
    if (meses <= 24) return '13_24';
    if (meses <= 36) return '25_36';
    return '36_mais';
  },

  // Guarda quais anos estão abertos no Inventário SEFAZ fora da função de render — senão,
  // toda vez que a tela redesenha, tudo voltaria a aparecer fechado (mesmo bug que já corrigimos
  // nas telas do Financeiro).
  _anosInventarioAbertos: new Set(),

  renderInventarioSefaz(container) {
    const fazendas = this.fazendasConhecidas();
    const anoAtual = new Date().getFullYear();
    container.innerHTML = `
      <div class="filter-chips" id="filtroFazendaInv">
        ${fazendas.map((f, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-fz="${Utils.escapeHtml(f)}">${Utils.escapeHtml(f)}</button>`).join('')}
        <button class="chip ${fazendas.length ? '' : 'active'}" data-fz="todas">Todas as fazendas</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Contagem de bovinos por sexo, faixa etária (0-12, 13-24, 25-36, 36+ meses) e classe fiscal, na posição de 31/12 de cada ano (ou hoje, no ano corrente) — use como apoio para preencher o Inventário Anual na SEFAZ-TO. Clique num ano pra abrir.</div>
      <div id="idInventario"></div>
      <div id="listaAnosInventario"></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnImprimirInv">🖨️ Imprimir / salvar em PDF</button></div>
    `;

    let fazendaAtiva = fazendas.length ? fazendas[0] : 'todas';

    const ordemFaixas = ['0_12', '13_24', '25_36', '36_mais'];
    const labelFaixa = { '0_12': '0 a 12 meses', '13_24': '13 a 24 meses', '25_36': '25 a 36 meses', '36_mais': 'acima de 36 meses' };

    // Um bovino conta no inventário de um ano se já tinha nascido até 31/12 daquele ano (ou
    // hoje, se for o ano corrente) e ainda não tinha saído do rebanho até essa mesma data —
    // "saído" aqui é morte (campo morte) ou venda/inativação (última movimentação de Saída
    // registrada pra ele). Sem um registro de saída, um animal não-Ativo fica de fora por
    // segurança (não dá pra saber se ele já tinha saído naquele ano ou não).
    const refDataDoAno = (ano) => ano >= anoAtual ? Utils.hoje() : `${ano}-12-31`;
    const aindaNoRebanhoEm = (a, refData) => {
      if (a.nascimento && a.nascimento > refData) return false;
      const situacao = a.situacao || 'Ativo';
      if (situacao === 'Ativo') return true;
      if (situacao === 'Morreu') return !a.morte || a.morte > refData;
      const saida = Api.list('mov_rebanho')
        .filter(m => m.animal_id === a.id && m.tipo === 'Saída' && m.data)
        .sort((x, y) => (y.data || '').localeCompare(x.data || ''))[0];
      return !!saida && saida.data > refData;
    };

    const calcularParaAno = (ano) => {
      const refData = refDataDoAno(ano);
      const vazio = () => ordemFaixas.reduce((acc, f) => { acc[f] = this.classesFiscais.reduce((a2, c) => { a2[c] = 0; return a2; }, {}); return acc; }, {});
      const contagem = { F: vazio(), M: vazio() };
      let semIdade = 0;
      let lista = this.animais().filter(a => a.especie === 'Bovina' && aindaNoRebanhoEm(a, refData));
      if (fazendaAtiva !== 'todas') lista = lista.filter(a => a.fazenda === fazendaAtiva);
      lista.forEach(a => {
        if (!a.nascimento) { semIdade++; return; }
        const meses = Math.floor(Utils.diasEntre(a.nascimento, refData) / 30);
        const faixa = this.faixaEtariaSefaz(meses);
        const sexo = a.sexo === 'F' ? 'F' : 'M';
        const classe = this.classesFiscais.includes(a.classe_fiscal) ? a.classe_fiscal : 'Comum';
        contagem[sexo][faixa][classe]++;
      });
      let total = 0;
      Object.values(contagem.F).forEach(f => Object.values(f).forEach(v => total += v));
      Object.values(contagem.M).forEach(f => Object.values(f).forEach(v => total += v));
      return { contagem, semIdade, total };
    };

    const colunaSexo = (contagemSexo, titulo) => {
      let subtotal = 0;
      const blocos = ordemFaixas.map(f => {
        const linhas = this.classesFiscais.map(c => {
          subtotal += contagemSexo[f][c];
          return `<div class="rec-row" style="justify-content:space-between;padding:4px 0;"><span>${Utils.escapeHtml(c)}</span><span><b>${contagemSexo[f][c]}</b></span></div>`;
        }).join('');
        return `<div style="margin-bottom:10px;"><div style="font-weight:600;font-size:13px;margin-bottom:4px;">${labelFaixa[f]}</div>${linhas}</div>`;
      }).join('');
      return `<div class="bar-chart" style="margin-bottom:14px;">
        <h3 class="section-title" style="margin-top:0;">${titulo}</h3>
        ${blocos}
        <div class="rec-row" style="justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);font-weight:700;">
          <span>Subtotal ${titulo}</span><span>${subtotal}</span>
        </div>
      </div>`;
    };

    const anosComDados = new Set(this.animais().filter(a => a.especie === 'Bovina' && a.nascimento).map(a => Number(a.nascimento.slice(0, 4))));
    const anoMin = anosComDados.size ? Math.min(...anosComDados) : anoAtual;
    const anos = [];
    for (let y = anoAtual; y >= anoMin; y--) anos.push(y);

    const desenhar = () => {
      // Identificação do produtor (só quando uma fazenda específica está selecionada)
      const idEl = container.querySelector('#idInventario');
      if (fazendaAtiva !== 'todas') {
        const fazenda = Api.list('fazendas').find(f => f.nome === fazendaAtiva);
        const donos = fazenda ? Cadastros.proprietariosDaFazenda(fazenda.id) : [];
        idEl.innerHTML = `
          <div class="form-card">
            <p class="hint" style="margin-top:0;"><b>Nome do estabelecimento:</b> ${Utils.escapeHtml(fazendaAtiva)}</p>
            ${fazenda ? `<p class="hint">${Utils.escapeHtml(fazenda.municipio || '-')} / ${Utils.escapeHtml(fazenda.uf || '-')} — CEP ${Utils.escapeHtml(fazenda.cep || '-')}</p>` : ''}
            ${donos.length ? donos.map(p => `<p class="hint">${Utils.escapeHtml(p.nome)} — CPF/CNPJ ${Utils.escapeHtml(p.cpf_cnpj || '-')}${p.inscricao_estadual ? ' — I.E. ' + Utils.escapeHtml(p.inscricao_estadual) : ''}</p>`).join('') : '<p class="hint">Nenhum proprietário vinculado a esta fazenda ainda.</p>'}
          </div>`;
      } else {
        idEl.innerHTML = '';
      }

      const raiz = container.querySelector('#listaAnosInventario');
      raiz.innerHTML = anos.map(ano => {
        const aberto = this._anosInventarioAbertos.has(ano);
        const { total } = calcularParaAno(ano);
        let html = `
          <div class="rec-card" data-toggle-ano-inv="${ano}" style="cursor:pointer;">
            <div class="rec-title">${aberto ? '▾' : '▸'} Ano ${ano}${ano === anoAtual ? ' (hoje)' : ''}</div>
            <div class="rec-row"><span>${total} bovino(s)</span></div>
          </div>`;
        if (aberto) html += `<div id="detalheInv_${ano}" style="margin:8px 0 14px;"></div>`;
        return html;
      }).join('');

      anos.forEach(ano => {
        if (!this._anosInventarioAbertos.has(ano)) return;
        const { contagem, semIdade } = calcularParaAno(ano);
        const alvo = document.getElementById(`detalheInv_${ano}`);
        if (!alvo) return;
        alvo.innerHTML = `
          <div class="grid-2col">
            ${colunaSexo(contagem.F, 'Fêmeas')}
            ${colunaSexo(contagem.M, 'Machos')}
          </div>
          ${semIdade ? `<div class="alert-item orange">${semIdade} bovino(s) sem data de nascimento não entraram na contagem — preencha a data de nascimento para incluir.</div>` : ''}
        `;
      });

      raiz.querySelectorAll('[data-toggle-ano-inv]').forEach(el => {
        el.addEventListener('click', () => {
          const ano = Number(el.dataset.toggleAnoInv);
          if (this._anosInventarioAbertos.has(ano)) this._anosInventarioAbertos.delete(ano); else this._anosInventarioAbertos.add(ano);
          desenhar();
        });
      });
    };

    container.querySelectorAll('#filtroFazendaInv .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroFazendaInv .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fazendaAtiva = chip.dataset.fz;
        desenhar();
      });
    });
    container.querySelector('#btnImprimirInv').addEventListener('click', () => window.print());

    desenhar();
  },

  /* ---------- EVOLUÇÃO DO REBANHO (projeção zootécnica, cohort por idade) ---------- */
  // Mapeia um bovino pra uma das 9 categorias do modelo, pela mesma faixa etária usada no
  // Inventário SEFAZ (0-12, 13-24, 25-36, 36+ meses) + sexo; machos acima de 36 meses só
  // contam como "Touros" se o campo categoria do animal já estiver marcado como Reprodutor,
  // senão entram em "Novilhos + 3 anos" (boi pronto pra engorda/venda).
  categoriaEvolucaoDoAnimal(a, meses) {
    const faixa = this.faixaEtariaSefaz(meses);
    if (a.sexo === 'F') {
      if (faixa === '0_12') return 'bezerras';
      if (faixa === '13_24') return 'novilhas12';
      if (faixa === '25_36') return 'novilhas23';
      return 'matrizes';
    }
    if (faixa === '0_12') return 'bezerros';
    if (faixa === '13_24') return 'novilhos12';
    if (faixa === '25_36') return 'novilhos23';
    return a.categoria === 'Reprodutor' ? 'touros' : 'novilhos3';
  },

  // Conta o rebanho bovino ATIVO de hoje (opcionalmente de uma fazenda) nas 9 categorias.
  contarRebanhoAtualEvolucao(fazendaAtiva) {
    const cab = this.categoriasEvolucao.reduce((acc, c) => { acc[c.key] = 0; return acc; }, {});
    let semIdade = 0;
    this.animais()
      .filter(a => a.especie === 'Bovina' && (a.situacao || 'Ativo') === 'Ativo' && (fazendaAtiva === 'todas' || a.fazenda === fazendaAtiva))
      .forEach(a => {
        if (!a.nascimento) { semIdade++; return; }
        const meses = Math.floor(Utils.diasEntre(a.nascimento) / 30);
        cab[this.categoriaEvolucaoDoAnimal(a, meses)]++;
      });
    return { cab, semIdade };
  },

  // Projeta a evolução do rebanho ano a ano a partir de um INÍCIO (cabeças por categoria) e um
  // jogo de coeficientes técnicos (taxas fixas, aplicadas em todos os anos). Nascimentos saem só
  // das matrizes; cada categoria perde cabeças por morte e depois por venda/descarte (nessa
  // ordem); a sobra de cada categoria "envelhece" pra categoria seguinte no próximo ano —
  // novilhas/novilhos que não foram descartados até os 3 anos viram matrizes/novilhos+3, e os
  // touros só repõem via a reposição anual informada (não existe "touro nascido na fazenda"
  // nesse modelo simples).
  projetarEvolucaoRebanho(inicio0, coefs, anos) {
    const taxaDescarte = {
      matrizes: coefs.descMatrizes, novilhas23: coefs.descNovilhas23, novilhas12: coefs.descNovilhas12,
      bezerras: coefs.descBezerras, bezerros: coefs.descBezerros, novilhos12: coefs.descNovilhos12,
      novilhos23: coefs.descNovilhos23, novilhos3: coefs.descNovilhos3, touros: coefs.descTouros
    };
    const taxaMortalidade = {
      matrizes: coefs.mortAdultos, novilhas23: coefs.mortAdultos, touros: coefs.mortAdultos, novilhos23: coefs.mortAdultos, novilhos3: coefs.mortAdultos,
      novilhas12: coefs.mort12, novilhos12: coefs.mort12,
      bezerras: coefs.mortBezerros, bezerros: coefs.mortBezerros
    };
    let inicio = Object.assign({}, inicio0);
    const anosCalculados = [];
    for (let t = 0; t <= anos; t++) {
      const totalNasc = Math.round((inicio.matrizes || 0) * coefs.natalidade / 100);
      const nascMachos = Math.floor(totalNasc / 2);
      const nascFemeas = totalNasc - nascMachos;
      const entradaAno = Object.assign({}, inicio, {
        bezerras: (inicio.bezerras || 0) + nascFemeas,
        bezerros: (inicio.bezerros || 0) + nascMachos
      });
      const nascimentos = { bezerras: nascFemeas, bezerros: nascMachos };
      const mortes = {}, vendas = {}, fim = {};
      this.categoriasEvolucao.forEach(({ key }) => {
        const entrada = entradaAno[key] || 0;
        const m = Math.round(entrada * (taxaMortalidade[key] || 0) / 100);
        const restante = entrada - m;
        const v = Math.round(restante * (taxaDescarte[key] || 0) / 100);
        mortes[key] = m; vendas[key] = v; fim[key] = restante - v;
      });
      anosCalculados.push({ ano: t, inicio: Object.assign({}, inicio), nascimentos, mortes, vendas, fim: Object.assign({}, fim) });
      inicio = {
        bezerras: 0, bezerros: 0,
        novilhas12: fim.bezerras, novilhos12: fim.bezerros,
        novilhas23: fim.novilhas12, novilhos23: fim.novilhos12,
        matrizes: (fim.matrizes || 0) + (fim.novilhas23 || 0),
        novilhos3: (fim.novilhos23 || 0) + (fim.novilhos3 || 0),
        touros: (fim.touros || 0) + (coefs.reposicaoTouros || 0)
      };
    }
    return anosCalculados;
  },

  _evolucaoCoefsPadrao: {
    natalidade: 75, mortAdultos: 1, mort12: 2, mortBezerros: 5,
    descMatrizes: 20, descNovilhas23: 30, descNovilhas12: 30, descBezerras: 5,
    descBezerros: 100, descNovilhos12: 100, descNovilhos23: 100, descNovilhos3: 100, descTouros: 15,
    reposicaoTouros: 0, anos: 10
  },

  // Estado do formulário de Evolução do Rebanho guardado fora da render (mesma razão do
  // _anosInventarioAbertos: senão volta ao padrão toda vez que a tela redesenha).
  _evolucaoState: null,
  _evolucaoAnosAbertos: new Set(),

  renderEvolucaoRebanho(container) {
    const fazendas = this.fazendasConhecidas();
    if (!this._evolucaoState) {
      let salvo = null;
      try { salvo = JSON.parse(localStorage.getItem('capataz_evolucao_rebanho') || 'null'); } catch (e) { salvo = null; }
      this._evolucaoState = Object.assign({
        modo: 'real',
        fazenda: fazendas.length ? fazendas[0] : 'todas',
        coefs: Object.assign({}, this._evolucaoCoefsPadrao),
        manual: this.categoriasEvolucao.reduce((acc, c) => { acc[c.key] = 0; return acc; }, {})
      }, salvo || {});
    }
    const estado = this._evolucaoState;
    const salvarEstado = () => { try { localStorage.setItem('capataz_evolucao_rebanho', JSON.stringify(estado)); } catch (e) { /* sem espaço, ignora */ } };

    const camposCoef = [
      { key: 'natalidade', label: 'Natalidade (%)' },
      { key: 'mortAdultos', label: 'Mortalidade adultos (%)' },
      { key: 'mort12', label: 'Mortalidade 1/2 anos (%)' },
      { key: 'mortBezerros', label: 'Mortalidade bezerros(as) (%)' },
      { key: 'descMatrizes', label: 'Descarte matrizes (%)' },
      { key: 'descNovilhas23', label: 'Descarte novilhas 2/3 anos (%)' },
      { key: 'descNovilhas12', label: 'Descarte novilhas 1/2 anos (%)' },
      { key: 'descBezerras', label: 'Descarte bezerras (%)' },
      { key: 'descBezerros', label: 'Descarte bezerros (%)' },
      { key: 'descNovilhos12', label: 'Descarte novilhos 1/2 anos (%)' },
      { key: 'descNovilhos23', label: 'Descarte novilhos 2/3 anos (%)' },
      { key: 'descNovilhos3', label: 'Descarte novilhos + 3 anos (%)' },
      { key: 'descTouros', label: 'Descarte touros (%)' },
      { key: 'reposicaoTouros', label: 'Reposição anual de touros (cab)' }
    ];

    container.innerHTML = `
      <div class="hint" style="margin-bottom:10px;">Projeção da composição do rebanho bovino ano a ano, a partir dos nascimentos das matrizes e das taxas de mortalidade/descarte de cada categoria — use pra planejar capacidade de pasto, reposição de touros e volume de vendas futuras. Edite os coeficientes conforme a realidade da fazenda.</div>
      <div class="form-card">
        <h3 class="section-title" style="margin-top:0;">Ano 0 (ponto de partida)</h3>
        <div class="filter-chips" style="margin-bottom:10px;">
          <button class="chip ${estado.modo === 'real' ? 'active' : ''}" data-modo="real">Rebanho real atual</button>
          <button class="chip ${estado.modo === 'manual' ? 'active' : ''}" data-modo="manual">Digitar manualmente</button>
        </div>
        <div id="evoAno0Real" ${estado.modo !== 'real' ? 'hidden' : ''}>
          <div class="filter-chips" id="filtroFazendaEvo" style="margin-bottom:10px;">
            ${fazendas.map(f => `<button class="chip ${estado.fazenda === f ? 'active' : ''}" data-fz="${Utils.escapeHtml(f)}">${Utils.escapeHtml(f)}</button>`).join('')}
            <button class="chip ${estado.fazenda === 'todas' ? 'active' : ''}" data-fz="todas">Todas as fazendas</button>
          </div>
          <div id="evoResumoReal" class="hint"></div>
        </div>
        <div id="evoAno0Manual" class="grid-2col" ${estado.modo !== 'manual' ? 'hidden' : ''}>
          ${this.categoriasEvolucao.map(c => `
            <div class="form-group">
              <label>${Utils.escapeHtml(c.label)} (cab)</label>
              <input type="number" min="0" step="1" data-manual-cat="${c.key}" value="${estado.manual[c.key] || 0}"/>
            </div>`).join('')}
        </div>
      </div>
      <div class="form-card">
        <h3 class="section-title" style="margin-top:0;">Coeficientes técnicos</h3>
        <div class="grid-2col">
          ${camposCoef.map(c => `
            <div class="form-group">
              <label>${Utils.escapeHtml(c.label)}</label>
              <input type="number" min="0" step="0.1" data-coef="${c.key}" value="${estado.coefs[c.key]}"/>
            </div>`).join('')}
          <div class="form-group">
            <label>Anos de projeção</label>
            <input type="number" min="1" max="20" step="1" id="evoAnos" value="${estado.coefs.anos}"/>
          </div>
        </div>
      </div>
      <div id="listaAnosEvo"></div>
      <div class="toolbar"><div></div><button class="btn btn-primary" id="btnImprimirEvo">🖨️ Imprimir / salvar em PDF</button></div>
    `;

    const desenhar = () => {
      if (estado.modo === 'real') {
        const { cab, semIdade } = this.contarRebanhoAtualEvolucao(estado.fazenda);
        const totalCab = Object.values(cab).reduce((s, v) => s + v, 0);
        container.querySelector('#evoResumoReal').innerHTML = `
          ${this.categoriasEvolucao.map(c => `${Utils.escapeHtml(c.label)}: <b>${cab[c.key]}</b>`).join(' &nbsp;·&nbsp; ')}
          <br/>Total: <b>${totalCab}</b> bovino(s) ativo(s)
          ${semIdade ? `<br/><span style="color:var(--orange,#c97a1a);">${semIdade} sem data de nascimento não entraram na contagem.</span>` : ''}
        `;
      }

      const inicio0 = estado.modo === 'real' ? this.contarRebanhoAtualEvolucao(estado.fazenda).cab : estado.manual;
      const resultados = this.projetarEvolucaoRebanho(inicio0, estado.coefs, Number(estado.coefs.anos) || 10);

      const raiz = container.querySelector('#listaAnosEvo');
      raiz.innerHTML = resultados.map(r => {
        const totalInicioCab = this.categoriasEvolucao.reduce((s, c) => s + (r.inicio[c.key] || 0), 0);
        const totalFimCab = this.categoriasEvolucao.reduce((s, c) => s + (r.fim[c.key] || 0), 0);
        const totalFimUa = this.categoriasEvolucao.reduce((s, c) => s + (r.fim[c.key] || 0) * c.ua, 0);
        const aberto = this._evolucaoAnosAbertos.has(r.ano);
        let html = `
          <div class="rec-card" data-toggle-ano-evo="${r.ano}" style="cursor:pointer;">
            <div class="rec-title">${aberto ? '▾' : '▸'} Ano ${r.ano}${r.ano === 0 ? ' (atual)' : ''}</div>
            <div class="rec-row"><span>Início: ${totalInicioCab} cab</span><span>Fim: ${totalFimCab} cab</span><span>${Utils.fmtNum(totalFimUa, 1)} UA</span></div>
          </div>`;
        if (aberto) html += `<div id="detalheEvo_${r.ano}" style="margin:8px 0 14px;overflow-x:auto;"></div>`;
        return html;
      }).join('');

      resultados.forEach(r => {
        if (!this._evolucaoAnosAbertos.has(r.ano)) return;
        const alvo = document.getElementById(`detalheEvo_${r.ano}`);
        if (!alvo) return;
        alvo.innerHTML = `
          <table class="tabela-evolucao">
            <thead><tr><th>Categoria</th><th>Início (cab)</th><th>Nasc.</th><th>Mortes</th><th>Vendas</th><th>Fim (cab)</th><th>Fim (UA)</th></tr></thead>
            <tbody>
              ${this.categoriasEvolucao.map(c => `
                <tr>
                  <td>${Utils.escapeHtml(c.label)}</td>
                  <td>${r.inicio[c.key] || 0}</td>
                  <td>${r.nascimentos[c.key] || 0}</td>
                  <td>${r.mortes[c.key] || 0}</td>
                  <td>${r.vendas[c.key] || 0}</td>
                  <td><b>${r.fim[c.key] || 0}</b></td>
                  <td>${Utils.fmtNum((r.fim[c.key] || 0) * c.ua, 1)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        `;
      });

      raiz.querySelectorAll('[data-toggle-ano-evo]').forEach(el => {
        el.addEventListener('click', () => {
          const ano = Number(el.dataset.toggleAnoEvo);
          if (this._evolucaoAnosAbertos.has(ano)) this._evolucaoAnosAbertos.delete(ano); else this._evolucaoAnosAbertos.add(ano);
          desenhar();
        });
      });
    };

    container.querySelectorAll('.filter-chips [data-modo]').forEach(chip => {
      chip.addEventListener('click', () => {
        estado.modo = chip.dataset.modo;
        salvarEstado();
        this.renderEvolucaoRebanho(container);
      });
    });
    container.querySelectorAll('#filtroFazendaEvo .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroFazendaEvo .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        estado.fazenda = chip.dataset.fz;
        salvarEstado();
        desenhar();
      });
    });
    container.querySelectorAll('[data-manual-cat]').forEach(inp => {
      inp.addEventListener('input', () => {
        estado.manual[inp.dataset.manualCat] = Number(inp.value) || 0;
        salvarEstado();
        desenhar();
      });
    });
    container.querySelectorAll('[data-coef]').forEach(inp => {
      inp.addEventListener('input', () => {
        estado.coefs[inp.dataset.coef] = Number(inp.value) || 0;
        salvarEstado();
        desenhar();
      });
    });
    container.querySelector('#evoAnos').addEventListener('input', (e) => {
      estado.coefs.anos = Math.max(1, Math.min(20, Number(e.target.value) || 10));
      salvarEstado();
      desenhar();
    });
    container.querySelector('#btnImprimirEvo').addEventListener('click', () => window.print());

    desenhar();
  }
};
