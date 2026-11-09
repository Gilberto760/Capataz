/* ===================== Motor genérico de UI (tabelas + formulários) ===================== */
const UI = {

  /* Renderiza uma lista em formato "cards" (melhor para celular) dentro de containerEl */
  renderList(containerEl, opts) {
    // opts: { data, renderCard(item) -> html string, emptyText, onCardClick(item) }
    containerEl.classList.add('rec-list');
    containerEl.innerHTML = '';
    if (!opts.data.length) {
      containerEl.innerHTML = `<div class="empty-state">${opts.emptyText || 'Nenhum registro ainda.'}</div>`;
      return;
    }
    opts.data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.innerHTML = opts.renderCard(item);
      if (opts.onCardClick) {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-stop]')) return;
          opts.onCardClick(item);
        });
      }
      containerEl.appendChild(card);
    });
  },

  badge(text, cls) {
    return `<span class="badge ${cls || ''}">${Utils.escapeHtml(text)}</span>`;
  },

  /* Abre modal de formulário com schema declarativo.
     schema: [{ key, label, type: text|number|date|select|textarea|checkbox,
                options:[{value,label}] | optionsFrom:{col,labelFn}, required, placeholder, step }]
  */
  abrirFormulario({ titulo, schema, dados, onSalvar, onExcluir, onRender, onCancelar }) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    dados = dados || {};

    let html = `<div class="modal-header">
      <h3>${Utils.escapeHtml(titulo)}</h3>
      <button type="button" class="icon-btn" data-close>&times;</button>
    </div><form id="dynForm" class="modal-body">`;

    schema.forEach(f => {
      const val = dados[f.key] !== undefined ? dados[f.key] : (f.default !== undefined ? f.default : '');
      html += `<div class="form-group">`;
      if (f.type !== 'checkbox') {
        html += `<label>${Utils.escapeHtml(f.label)}${f.required ? ' *' : ''}</label>`;
      }
      if (f.type === 'select' && f.busca) {
        let opts = f.options || [];
        if (f.optionsFrom) {
          const rows = f.optionsFrom.fetch ? f.optionsFrom.fetch() : DB.list(f.optionsFrom.col);
          const valueField = f.optionsFrom.valueField || 'id';
          opts = rows.map(r => ({ value: f.optionsFrom.fetch ? r[valueField] : r.id, label: f.optionsFrom.labelFn(r) }));
        }
        const atual = opts.find(o => String(o.value) === String(val));
        html += `<div class="combo-wrap" data-combo-select-field="${f.key}">
          <input type="hidden" name="${f.key}" value="${Utils.escapeHtml(val)}"/>
          <input type="text" class="combo-input" name="${f.key}__label" autocomplete="off" value="${Utils.escapeHtml(atual ? atual.label : '')}" placeholder="${Utils.escapeHtml(f.placeholder || 'Buscar...')}" ${f.required ? 'required' : ''}/>
          <button type="button" class="combo-arrow" tabindex="-1">▾</button>
          <div class="combo-list" id="comboSel_${f.key}" hidden></div>
        </div>`;
      } else if (f.type === 'select') {
        let opts = f.options || [];
        if (f.optionsFrom) {
          const rows = f.optionsFrom.fetch ? f.optionsFrom.fetch() : DB.list(f.optionsFrom.col);
          const valueField = f.optionsFrom.valueField || 'id';
          opts = rows.map(r => ({ value: f.optionsFrom.fetch ? r[valueField] : r.id, label: f.optionsFrom.labelFn(r) }));
        }
        html += `<select name="${f.key}" ${f.required ? 'required' : ''}>`;
        if (!f.required) html += `<option value="">—</option>`;
        opts.forEach(o => {
          html += `<option value="${Utils.escapeHtml(o.value)}" ${String(val) === String(o.value) ? 'selected' : ''}>${Utils.escapeHtml(o.label)}</option>`;
        });
        html += `</select>`;
      } else if (f.type === 'textarea') {
        html += `<textarea name="${f.key}" rows="3" placeholder="${Utils.escapeHtml(f.placeholder || '')}">${Utils.escapeHtml(val)}</textarea>`;
      } else if (f.type === 'checkbox') {
        html += `<label class="checkbox-line"><input type="checkbox" name="${f.key}" ${val ? 'checked' : ''}/> ${Utils.escapeHtml(f.label)}</label>`;
      } else if (f.type === 'multiselect') {
        let opts = f.options || [];
        if (f.optionsFrom) {
          const rows = f.optionsFrom.fetch ? f.optionsFrom.fetch() : DB.list(f.optionsFrom.col);
          const valueField = f.optionsFrom.valueField || 'id';
          opts = rows.map(r => ({ value: r[valueField], label: f.optionsFrom.labelFn(r) }));
        }
        const selecionados = (Array.isArray(val) ? val : []).map(String);
        html += `<div class="multiselect-list">${opts.length ? opts.map(o => `
          <label class="checkbox-line" style="padding:7px 0;">
            <input type="checkbox" name="${f.key}" value="${Utils.escapeHtml(o.value)}" ${selecionados.includes(String(o.value)) ? 'checked' : ''}/> ${Utils.escapeHtml(o.label)}
          </label>`).join('') : '<p class="hint">Nada cadastrado ainda.</p>'}</div>`;
      } else if (f.scanner) {
        html += `<div class="scan-wrap">
          <input type="text" name="${f.key}" value="${Utils.escapeHtml(val)}" placeholder="${Utils.escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}/>
          <button type="button" class="btn-scan" data-scan-field="${f.key}" title="Ler código de barras ou QR code">📷</button>
        </div>`;
      } else if (f.suggestions) {
        // Campo de texto livre + lista de sugestões que abre inteira ao clicar (combobox)
        html += `<div class="combo-wrap" data-combo-field="${f.key}">
          <input type="text" name="${f.key}" class="combo-input" autocomplete="off" value="${Utils.escapeHtml(val)}" placeholder="${Utils.escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}/>
          <button type="button" class="combo-arrow" tabindex="-1">▾</button>
          <div class="combo-list" id="combo_${f.key}" hidden></div>
        </div>`;
      } else {
        const step = f.type === 'number' ? `step="${f.step || 'any'}"` : '';
        html += `<input type="${f.type}" name="${f.key}" value="${Utils.escapeHtml(val)}" ${step} placeholder="${Utils.escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}/>`;
      }
      html += `</div>`;
    });

    html += `</form><div class="modal-footer">`;
    if (onExcluir) html += `<button type="button" class="btn btn-danger" id="btnExcluirReg">Excluir</button>`;
    html += `<div class="spacer"></div>
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="btnSalvarReg">Salvar</button>
    </div>`;

    box.innerHTML = html;
    overlay.classList.add('open');

    // Rede de segurança: nenhum botão do rodapé fica dentro do <form> (por isso clicar neles
    // já não dispara envio nativo), mas apertar Enter num campo de texto ainda pode tentar
    // submeter o form do jeito antigo do navegador — isso recarregaria a página inteira (perde
    // a navegação e volta pro Início) sem nem chamar o onSalvar. Bloqueia isso de vez.
    box.querySelector('#dynForm').addEventListener('submit', (e) => e.preventDefault());

    // Inicializa cada combobox (campo texto + sugestões)
    box.querySelectorAll('[data-combo-field]').forEach(wrap => {
      const key = wrap.dataset.comboField;
      const campo = schema.find(f => f.key === key);
      this._initCombo(wrap, campo.suggestions || []);
    });
    // Inicializa cada combobox de seleção com busca (campo texto + lista id/label filtrável)
    box.querySelectorAll('[data-combo-select-field]').forEach(wrap => {
      const key = wrap.dataset.comboSelectField;
      const campo = schema.find(f => f.key === key);
      let opts = campo.options || [];
      if (campo.optionsFrom) {
        const rows = campo.optionsFrom.fetch ? campo.optionsFrom.fetch() : DB.list(campo.optionsFrom.col);
        const valueField = campo.optionsFrom.valueField || 'id';
        opts = rows.map(r => ({ value: campo.optionsFrom.fetch ? r[valueField] : r.id, label: campo.optionsFrom.labelFn(r) }));
      }
      this._initSelectCombo(wrap, opts, campo.criarNovo);
    });
    // Liga o "+ Novo..." nos <select> simples que pedirem (campo.criarNovo) — combobox com
    // busca já trata isso dentro do _initSelectCombo acima.
    schema.filter(f => f.type === 'select' && !f.busca && f.criarNovo).forEach(f => {
      const sel = box.querySelector(`select[name="${f.key}"]`);
      if (!sel) return;
      const valorAnterior = sel.value;
      const optNovo = document.createElement('option');
      optNovo.value = '__criar_novo__';
      optNovo.textContent = '+ ' + f.criarNovo.label;
      sel.appendChild(optNovo);
      sel.addEventListener('change', () => {
        if (sel.value !== '__criar_novo__') return;
        sel.value = valorAnterior;
        f.criarNovo.abrir();
      });
    });
    // Clicar em qualquer lugar do formulário fora de um combobox fecha as listas abertas
    box.addEventListener('click', () => {
      box.querySelectorAll('.combo-list').forEach(l => { l.hidden = true; });
    });

    // Botões de leitura de código de barras/QR code (só funcionam com câmera + suporte do navegador)
    box.querySelectorAll('[data-scan-field]').forEach(btn => {
      if (!this._scannerDisponivel()) { btn.style.display = 'none'; return; }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.abrirScanner((valor) => {
          const input = box.querySelector(`[name="${btn.dataset.scanField}"]`);
          if (input) input.value = valor;
        });
      });
    });

    const close = () => overlay.classList.remove('open');
    // "Fechar sem salvar" (X, Cancelar, clicar fora) é diferente de fechar após Salvar —
    // só o primeiro caso dispara onCancelar (útil pra desfazer algo feito antes de abrir o
    // form, ex: um desenho no mapa que só deve valer se o usuário confirmar o formulário).
    const fecharCancelando = () => { if (onCancelar) onCancelar(); close(); };
    box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', fecharCancelando));
    // Só fecha clicando fora se o clique COMEÇOU no fundo (overlay) — assim, selecionar texto
    // arrastando o mouse de dentro de um campo pra fora do formulário não fecha ele sem querer.
    let mousedownNoFundo = false;
    overlay.onmousedown = (e) => { mousedownNoFundo = (e.target === overlay); };
    overlay.onclick = (e) => { if (e.target === overlay && mousedownNoFundo) fecharCancelando(); };

    box.querySelector('#btnSalvarReg').addEventListener('click', () => {
      const form = box.querySelector('#dynForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      const out = {};
      schema.forEach(f => {
        if (f.type === 'checkbox') {
          out[f.key] = form.querySelector(`[name="${f.key}"]`).checked;
        } else if (f.type === 'multiselect') {
          out[f.key] = Array.from(form.querySelectorAll(`[name="${f.key}"]:checked`)).map(el => el.value);
        } else if (f.type === 'number') {
          const v = fd.get(f.key);
          out[f.key] = v === '' ? null : Number(v);
        } else if (f.type === 'date' || f.type === 'select') {
          const v = fd.get(f.key);
          out[f.key] = v === '' ? null : v;
        } else {
          out[f.key] = fd.get(f.key) || '';
        }
      });
      onSalvar(out);
      close();
    });

    if (onExcluir) {
      box.querySelector('#btnExcluirReg').addEventListener('click', () => {
        if (Utils.confirmar('Excluir este registro? Essa ação não pode ser desfeita.')) {
          onExcluir();
          close();
        }
      });
    }

    if (onRender) onRender(box);
  },

  /* Abre o mesmo modal, mas com conteúdo livre (html) em vez de um formulário — para telas
     só de leitura, como a árvore genealógica. */
  abrirInfo({ titulo, html, acoes }) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    box.innerHTML = `
      <div class="modal-header"><h3>${Utils.escapeHtml(titulo)}</h3><button type="button" class="icon-btn" data-close>&times;</button></div>
      <div class="modal-body">${html}</div>
      <div class="modal-footer">${acoes || ''}<div class="spacer"></div><button type="button" class="btn btn-ghost" data-close>Fechar</button></div>
    `;
    overlay.classList.add('open');
    const close = () => overlay.classList.remove('open');
    box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    // Só fecha clicando fora se o clique COMEÇOU no fundo (overlay) — ver abrirFormulario.
    let mousedownNoFundo = false;
    overlay.onmousedown = (e) => { mousedownNoFundo = (e.target === overlay); };
    overlay.onclick = (e) => { if (e.target === overlay && mousedownNoFundo) close(); };
    return box;
  },

  /* Liga o comportamento de um combobox: clique na setinha (ou no campo) abre a lista inteira;
     digitar filtra; clicar numa opção preenche o campo. */
  _initCombo(wrap, suggestions) {
    const input = wrap.querySelector('.combo-input');
    const arrow = wrap.querySelector('.combo-arrow');
    const list = wrap.querySelector('.combo-list');
    wrap._suggestions = suggestions;

    const desenharLista = (filtro) => {
      const termo = (filtro || '').toLowerCase();
      const itens = wrap._suggestions.filter(s => !termo || s.toLowerCase().includes(termo));
      list.innerHTML = itens.length
        ? itens.map(s => `<div class="combo-item">${Utils.escapeHtml(s)}</div>`).join('')
        : `<div class="combo-item combo-empty">Nenhuma opção</div>`;
    };

    const abrirCompleta = () => {
      desenharLista('');
      list.hidden = false;
    };

    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!list.hidden) { list.hidden = true; return; }
      abrirCompleta();
    });
    input.addEventListener('focus', abrirCompleta);
    input.addEventListener('click', (e) => { e.stopPropagation(); if (list.hidden) abrirCompleta(); });
    input.addEventListener('input', () => { desenharLista(input.value); list.hidden = false; });
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.combo-item:not(.combo-empty)');
      if (!item) return;
      input.value = item.textContent;
      list.hidden = true;
    });
    wrap.addEventListener('click', (e) => e.stopPropagation());
  },

  /* Liga o comportamento de um combobox de seleção (id/label) com busca: digitar filtra por
     qualquer trecho do nome (não só pelo começo), clicar numa opção grava o id no campo oculto
     e mostra o nome no campo de texto. Se o campo perder foco sem bater com nenhuma opção,
     volta pro que estava selecionado antes (ou limpa). */
  _initSelectCombo(wrap, opts, criarNovo) {
    const hidden = wrap.querySelector('input[type="hidden"]');
    const input = wrap.querySelector('.combo-input');
    const arrow = wrap.querySelector('.combo-arrow');
    const list = wrap.querySelector('.combo-list');
    wrap._opts = opts;

    const desenharLista = (filtro) => {
      const termo = (filtro || '').toLowerCase();
      const itens = wrap._opts.filter(o => !termo || o.label.toLowerCase().includes(termo));
      list.innerHTML = (itens.length
        ? itens.map(o => `<div class="combo-item" data-value="${Utils.escapeHtml(o.value)}">${Utils.escapeHtml(o.label)}</div>`).join('')
        : `<div class="combo-item combo-empty">Nenhuma opção</div>`)
        + (criarNovo ? `<div class="combo-item combo-criar-novo">+ ${Utils.escapeHtml(criarNovo.label)}</div>` : '');
    };

    const abrirCompleta = () => { desenharLista(''); list.hidden = false; };

    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!list.hidden) { list.hidden = true; return; }
      abrirCompleta();
    });
    input.addEventListener('focus', abrirCompleta);
    input.addEventListener('click', (e) => { e.stopPropagation(); if (list.hidden) abrirCompleta(); });
    input.addEventListener('input', () => { desenharLista(input.value); list.hidden = false; });
    list.addEventListener('click', (e) => {
      if (e.target.closest('.combo-criar-novo')) {
        list.hidden = true;
        criarNovo.abrir();
        return;
      }
      const item = e.target.closest('.combo-item:not(.combo-empty)');
      if (!item) return;
      hidden.value = item.dataset.value;
      input.value = item.textContent;
      list.hidden = true;
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const atual = wrap._opts.find(o => String(o.value) === String(hidden.value));
        if (atual && atual.label === input.value) return;
        const match = wrap._opts.find(o => o.label.toLowerCase() === input.value.trim().toLowerCase());
        if (match) { hidden.value = match.value; input.value = match.label; }
        else { hidden.value = ''; input.value = ''; }
      }, 150);
    });
    wrap.addEventListener('click', (e) => e.stopPropagation());
  },

  /* Troca as sugestões de um combobox já renderizado (uso: sugestões que dependem de outro campo) */
  atualizarSugestoes(box, key, novasSugestoes) {
    const wrap = box.querySelector(`.combo-wrap[data-combo-field="${key}"]`);
    if (!wrap) return;
    wrap._suggestions = novasSugestoes;
  },

  fecharModal() {
    document.getElementById('modalOverlay').classList.remove('open');
  },

  /* Diz se dá pra ler código de barras/QR pela câmera: precisa de getUserMedia + um leitor
     (BarcodeDetector nativo do navegador; ou o ZXing, que lê código de barras e QR em
     qualquer navegador; ou, por último, o jsQR, que só lê QR code), e só faz sentido
     mostrar o botão em telas de celular. */
  _scannerDisponivel() {
    const temCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const temLeitor = !!(window.BarcodeDetector || window.ZXing || window.jsQR);
    return temCamera && temLeitor && window.matchMedia('(max-width: 859px)').matches;
  },

  /* Abre a câmera em tela cheia e fica lendo os frames até achar um código de barras/QR,
     chamando onLido(valor) com o texto decodificado. */
  abrirScanner(onLido) {
    const overlay = document.createElement('div');
    overlay.className = 'scanner-overlay';
    overlay.innerHTML = `
      <div class="scanner-box">
        <div class="scanner-header">
          <span>Aponte a câmera para o código</span>
          <button type="button" class="icon-btn" id="btnFecharScanner">&times;</button>
        </div>
        <video id="scannerVideo" autoplay playsinline muted></video>
        <div class="scanner-status" id="scannerStatus">Iniciando câmera...</div>
      </div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('#scannerVideo');
    const status = overlay.querySelector('#scannerStatus');
    let stream = null;
    let ativo = true;

    const parar = () => {
      ativo = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
    };
    overlay.querySelector('#btnFecharScanner').addEventListener('click', parar);

    // Ordem de preferência: BarcodeDetector nativo (barras+QR, só Chrome/Android) >
    // ZXing (barras+QR, qualquer navegador, se a biblioteca estiver carregada) >
    // jsQR (só QR code, último recurso, sempre disponível).
    const usarNativo = !!window.BarcodeDetector;
    const usarZXing = !usarNativo && !!window.ZXing;
    const usarJsQR = !usarNativo && !usarZXing && !!window.jsQR;

    if (usarZXing) {
      status.textContent = 'Procurando código...';
      const codeReader = new ZXing.BrowserMultiFormatReader();
      const pararZXing = () => { ativo = false; try { codeReader.reset(); } catch (e) {} overlay.remove(); };
      overlay.querySelector('#btnFecharScanner').removeEventListener('click', parar);
      overlay.querySelector('#btnFecharScanner').addEventListener('click', pararZXing);
      codeReader.decodeFromVideoDevice(undefined, video, (resultado, erro) => {
        if (!ativo) return;
        if (resultado) {
          const valor = resultado.getText();
          pararZXing();
          onLido(valor);
        }
        // erro "NotFoundException" é normal (nenhum código no frame atual) — ignora e segue tentando
      }).catch(() => {
        status.textContent = 'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
      });
      return;
    }

    const detector = usarNativo ? new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'codabar', 'itf'] }) : null;
    let canvas, ctx;
    if (usarJsQR) {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (!ativo) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        video.srcObject = s;

        const loop = async () => {
          if (!ativo) return;
          try {
            if (usarNativo) {
              const codigos = await detector.detect(video);
              if (codigos.length) {
                const valor = codigos[0].rawValue;
                parar();
                onLido(valor);
                return;
              }
            } else if (usarJsQR && video.videoWidth) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const resultado = jsQR(imagem.data, imagem.width, imagem.height);
              if (resultado && resultado.data) {
                parar();
                onLido(resultado.data);
                return;
              }
            }
          } catch (e) { /* frame sem leitura válida, tenta o próximo */ }
          requestAnimationFrame(loop);
        };
        status.textContent = usarNativo ? 'Procurando código...' : 'Procurando QR code...';
        requestAnimationFrame(loop);
      })
      .catch(() => {
        status.textContent = 'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
      });
  }
};
