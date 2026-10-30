/* ===================== Módulo: Atividades/Tarefas ===================== */
const Atividades = {
  subtabs: [
    { key: 'lista', label: 'Tarefas' }
  ],

  categoriasTarefa: ['Rebanho', 'Agricultura', 'Manutenção', 'Geral'],

  render(container, sub) {
    this.renderLista(container);
  },

  renderLista(container) {
    const regs = DB.list('atividades').sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));
    container.innerHTML = `
      <div class="toolbar">
        <div></div>
        <button class="btn btn-primary" id="btnNovaAtividade">+ Nova tarefa</button>
      </div>
      <div class="filter-chips" id="filtroAtividade">
        <button class="chip active" data-f="pendentes">Pendentes</button>
        <button class="chip" data-f="concluidas">Concluídas</button>
        <button class="chip" data-f="todas">Todas</button>
      </div>
      <div id="listaAtividades"></div>`;

    container.querySelector('#btnNovaAtividade').addEventListener('click', () => this.abrirForm(null));

    let filtro = 'pendentes';
    const desenhar = () => {
      let lista = regs;
      if (filtro === 'pendentes') lista = regs.filter(r => r.status !== 'Concluída');
      if (filtro === 'concluidas') lista = regs.filter(r => r.status === 'Concluída');
      const clsCat = { Rebanho: 'green', Agricultura: 'orange', Manutenção: 'blue', Geral: 'purple' };
      UI.renderList(container.querySelector('#listaAtividades'), {
        data: lista,
        emptyText: 'Nenhuma tarefa aqui.',
        onCardClick: (r) => this.abrirForm(r),
        renderCard: (r) => {
          const atrasada = r.status !== 'Concluída' && r.data && r.data < Utils.hoje();
          return `
          <div class="rec-title">
            <label data-stop style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" data-stop data-id="${r.id}" class="chkConcluir" ${r.status === 'Concluída' ? 'checked' : ''}/>
              <span style="${r.status === 'Concluída' ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${Utils.escapeHtml(r.titulo)}</span>
            </label>
            ${UI.badge(r.categoria || 'Geral', clsCat[r.categoria] || 'purple')}
            ${atrasada ? UI.badge('Atrasada', 'red') : ''}
          </div>
          <div class="rec-row">
            <span>${r.data ? Utils.fmtData(r.data) : 'Sem data'}</span>
            ${r.responsavel ? `<span>${Utils.escapeHtml(r.responsavel)}</span>` : ''}
            ${r.prioridade ? `<span>${Utils.escapeHtml(r.prioridade)}</span>` : ''}
          </div>`;
        }
      });
      container.querySelectorAll('.chkConcluir').forEach(chk => {
        chk.addEventListener('change', () => {
          DB.update('atividades', chk.dataset.id, { status: chk.checked ? 'Concluída' : 'Pendente' });
          App.refresh();
        });
      });
    };

    container.querySelectorAll('#filtroAtividade .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#filtroAtividade .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filtro = chip.dataset.f;
        desenhar();
      });
    });

    desenhar();
  },

  abrirForm(reg) {
    const schema = [
      { key: 'titulo', label: 'Título da tarefa', type: 'text', required: true },
      { key: 'categoria', label: 'Categoria', type: 'text', suggestions: this.categoriasTarefa },
      { key: 'data', label: 'Data prevista', type: 'date' },
      { key: 'responsavel', label: 'Responsável', type: 'text' },
      { key: 'prioridade', label: 'Prioridade', type: 'select', options: [{ value: 'Baixa', label: 'Baixa' }, { value: 'Média', label: 'Média' }, { value: 'Alta', label: 'Alta' }] },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Pendente', label: 'Pendente' }, { value: 'Em andamento', label: 'Em andamento' }, { value: 'Concluída', label: 'Concluída' }] },
      { key: 'descricao', label: 'Descrição', type: 'textarea' }
    ];
    UI.abrirFormulario({
      titulo: reg ? 'Editar tarefa' : 'Nova tarefa',
      schema,
      dados: reg || { data: Utils.hoje(), status: 'Pendente', prioridade: 'Média' },
      onSalvar: (dados) => {
        if (reg) DB.update('atividades', reg.id, dados);
        else DB.add('atividades', dados);
        Utils.toast('Tarefa salva.');
        App.refresh();
      },
      onExcluir: reg ? () => { DB.remove('atividades', reg.id); Utils.toast('Tarefa excluída.'); App.refresh(); } : null
    });
  }
};
