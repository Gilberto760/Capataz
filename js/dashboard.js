/* ===================== Módulo: Dashboard (Início) ===================== */
const Dashboard = {
  subtabs: [],

  render(container) {
    if (!Api.configurado()) {
      container.innerHTML = `
        <div class="hello-bar"><div class="hello-title">Bem-vindo ao Capataz</div></div>
        <div class="empty-state">
          Conecte o app à sua planilha para ver os dados do rebanho.<br/><br/>
          <button class="btn btn-primary" id="btnIrConfig">Conectar agora</button>
        </div>`;
      container.querySelector('#btnIrConfig').addEventListener('click', () => App.irPara('config'));
      return;
    }

    const hoje = Utils.hoje();
    const animais = Api.list('animais');
    const ativos = animais.filter(a => (a.situacao || 'Ativo') === 'Ativo');
    const porFazenda = {};
    const porEspecie = {};
    ativos.forEach(a => {
      if (a.fazenda) porFazenda[a.fazenda] = (porFazenda[a.fazenda] || 0) + 1;
      if (a.especie) porEspecie[a.especie] = (porEspecie[a.especie] || 0) + 1;
    });

    const partos = Api.list('partos');
    const partosRecentes = partos.filter(p => p.data_parto && Utils.diasEntre(p.data_parto) <= 30 && Utils.diasEntre(p.data_parto) >= 0);
    const lactacoesAtivas = Api.list('lactacoes').filter(l => l.data_inicio && !l.data_fim);
    const tarefasHoje = DB.list('atividades', t => t.status !== 'Concluída' && t.data === hoje);
    const tarefasAtrasadas = DB.list('atividades', t => t.status !== 'Concluída' && t.data && t.data < hoje);

    container.innerHTML = `
      <div class="hello-bar">
        <div class="hello-title">Capataz</div>
        <div class="hello-sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
      </div>

      <div class="cards-grid">
        <div class="stat-card"><div class="stat-label">Animais ativos</div><div class="stat-value">${ativos.length}</div></div>
        <div class="stat-card"><div class="stat-label">Em lactação</div><div class="stat-value green">${lactacoesAtivas.length}</div></div>
        <div class="stat-card"><div class="stat-label">Partos (30 dias)</div><div class="stat-value">${partosRecentes.length}</div></div>
        <div class="stat-card"><div class="stat-label">Tarefas hoje</div><div class="stat-value">${tarefasHoje.length}</div></div>
      </div>

      ${Object.keys(porFazenda).length ? `
      <h3 class="section-title">Rebanho por fazenda</h3>
      <div class="chip-summary">${Object.entries(porFazenda).map(([f, q]) => `<span class="chip-static">${Utils.escapeHtml(f)}: <b>${q}</b></span>`).join('')}</div>` : ''}

      ${Object.keys(porEspecie).length ? `
      <h3 class="section-title">Rebanho por espécie</h3>
      <div class="chip-summary">${Object.entries(porEspecie).map(([e, q]) => `<span class="chip-static">${Utils.escapeHtml(e)}: <b>${q}</b></span>`).join('')}</div>` : ''}

      <h3 class="section-title">Alertas</h3>
      <div id="listaAlertas"></div>
    `;

    const alertas = [];
    tarefasAtrasadas.forEach(t => alertas.push({ texto: `Tarefa atrasada: ${t.titulo}`, cls: 'red' }));

    // Lote que já passou do tempo previsto num piquete (rotação de pastagem) — compara dias
    // decorridos desde a entrada com dias_previstos, igual ao resto do app faz pra "atrasado".
    const talhoesPorId = {};
    Api.list('talhoes').forEach(t => { talhoesPorId[t.id] = t; });
    Api.list('talhao_ocupacoes').filter(o => !o.data_saida).forEach(o => {
      if (o.dias_previstos == null) return;
      const dias = Utils.diasEntre(o.data_entrada);
      if (dias > o.dias_previstos) {
        const talhao = talhoesPorId[o.talhao_id];
        alertas.push({ texto: `Piquete${talhao ? ' "' + talhao.nome + '"' : ''}: lote "${o.nome_lote}" há ${dias} dia(s) (previsto ${o.dias_previstos}) — hora de rodar.`, cls: 'orange' });
      }
    });

    if (Api.pendencias()) alertas.push({ texto: `${Api.pendencias()} alteração(ões) aguardando sincronizar com a planilha.`, cls: 'orange' });

    const elAlertas = container.querySelector('#listaAlertas');
    elAlertas.innerHTML = alertas.length
      ? alertas.map(a => `<div class="alert-item ${a.cls}">${Utils.escapeHtml(a.texto)}</div>`).join('')
      : `<div class="empty-state">Nenhum alerta pendente. Tudo em dia! ✅</div>`;
  }
};
