/* ===================== Utilitários ===================== */
const Utils = {
  hoje() {
    return new Date().toISOString().slice(0, 10);
  },

  fmtData(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  },

  fmtMoeda(valor) {
    const n = Number(valor || 0);
    return (DB.data.config.moeda || 'R$') + ' ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtNum(valor, casas) {
    const n = Number(valor || 0);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 2 });
  },

  diasEntre(isoInicio, isoFim) {
    const a = new Date(isoInicio);
    const b = isoFim ? new Date(isoFim) : new Date();
    return Math.floor((b - a) / 86400000);
  },

  somarDias(iso, dias) {
    const d = new Date(iso);
    d.setDate(d.getDate() + Number(dias));
    return d.toISOString().slice(0, 10);
  },

  idadeTexto(dataNascimento) {
    if (!dataNascimento) return '-';
    const dias = this.diasEntre(dataNascimento);
    if (dias < 0) return '-';
    const anos = Math.floor(dias / 365);
    const meses = Math.floor((dias % 365) / 30);
    if (anos > 0) return `${anos}a ${meses}m`;
    if (meses > 0) return `${meses}m`;
    return `${dias}d`;
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  toast(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  },

  confirmar(msg) {
    return window.confirm(msg);
  },

  downloadArquivo(nomeArquivo, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  csvDe(linhas, colunas) {
    const header = colunas.map(c => '"' + c.label.replace(/"/g, '""') + '"').join(';');
    const corpo = linhas.map(l =>
      colunas.map(c => {
        let v = typeof c.value === 'function' ? c.value(l) : l[c.value];
        if (v === null || v === undefined) v = '';
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(';')
    );
    return [header, ...corpo].join('\n');
  }
};
