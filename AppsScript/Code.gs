/**
 * CAPATAZ — ponte entre o app web e esta planilha Google.
 *
 * COMO INSTALAR (uma vez só):
 * 1. Abra a planilha "Capataz 2.0 — Base" no navegador.
 * 2. Menu Extensões > Apps Script.
 * 3. Apague o conteúdo padrão e cole TODO o conteúdo deste arquivo.
 * 4. Troque o valor de TOKEN abaixo por uma senha sua (qualquer texto, sem espaços).
 * 5. Clique em "Implantar" (Deploy) > "Nova implantação".
 *    - Tipo: "App da Web" (Web app)
 *    - Executar como: "Eu" (seu usuário)
 *    - Quem pode acessar: "Qualquer pessoa" (Anyone) — não se preocupe, o TOKEN protege os dados.
 * 6. Autorize o acesso quando pedir (é a sua própria planilha).
 * 7. Copie a URL que aparecer (termina em /exec) e cole no app, em Configurações > Conexão.
 *
 * Sempre que editar este código, crie uma NOVA implantação (ou gerencie implantações
 * e atualize a existente) para as mudanças valerem.
 */

var TOKEN = 'TROQUE-ESTA-SENHA-123';

// Planilhas (abas) que o app tem permissão de ler/gravar.
var ABAS_PERMITIDAS = ['Animais', 'Partos', 'Lactações', 'MovRebanho', 'ADAPEC', 'Talhões'];

function doGet(e) {
  return tratar(e);
}

function doPost(e) {
  return tratar(e);
}

function tratar(e) {
  var resultado;
  try {
    var params = (e && e.parameter) || {};
    var corpo = {};
    if (e && e.postData && e.postData.contents) {
      corpo = JSON.parse(e.postData.contents);
    }
    var acao = params.action || corpo.action;
    var token = params.token || corpo.token;

    if (token !== TOKEN) {
      resultado = { ok: false, erro: 'Token inválido.' };
      return responder(resultado);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      switch (acao) {
        case 'listAll':
          resultado = { ok: true, dados: listarTudo() };
          break;
        case 'list':
          resultado = { ok: true, dados: listarAba(params.sheet || corpo.sheet) };
          break;
        case 'create':
          resultado = { ok: true, dados: criarLinha(corpo.sheet, corpo.data) };
          break;
        case 'update':
          resultado = { ok: true, dados: atualizarLinha(corpo.sheet, corpo.id, corpo.data) };
          break;
        case 'delete':
          resultado = { ok: true, dados: excluirLinha(corpo.sheet, corpo.id) };
          break;
        default:
          resultado = { ok: false, erro: 'Ação desconhecida: ' + acao };
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    resultado = { ok: false, erro: String(err) };
  }
  return responder(resultado);
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checarAba(nome) {
  if (ABAS_PERMITIDAS.indexOf(nome) === -1) {
    throw new Error('Aba não permitida: ' + nome);
  }
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(nome);
  if (!aba) throw new Error('Aba não encontrada: ' + nome);
  return aba;
}

function listarTudo() {
  var out = {};
  ABAS_PERMITIDAS.forEach(function (nome) {
    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
    out[nome] = aba ? lerLinhas(aba) : [];
  });
  return out;
}

function listarAba(nome) {
  return lerLinhas(checarAba(nome));
}

function lerLinhas(aba) {
  var valores = aba.getDataRange().getValues();
  if (valores.length < 1) return [];
  var cabecalho = valores[0];
  var linhas = [];
  for (var i = 1; i < valores.length; i++) {
    var linha = valores[i];
    var vazio = linha.every(function (v) { return v === '' || v === null; });
    if (vazio) continue;
    var obj = {};
    for (var c = 0; c < cabecalho.length; c++) {
      var chave = String(cabecalho[c]).trim();
      if (!chave) continue;
      obj[chave] = formatarValor(linha[c]);
    }
    obj._linha = i + 1; // útil para depuração
    linhas.push(obj);
  }
  return linhas;
}

function formatarValor(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    // normaliza datas para AAAA-MM-DD (o app usa <input type="date">)
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function criarLinha(nomeAba, dados) {
  var aba = checarAba(nomeAba);
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var colunaId = String(cabecalho[0]).trim();
  dados = dados || {};
  if (!dados[colunaId]) {
    dados[colunaId] = gerarId();
  }
  var linha = cabecalho.map(function (h) {
    var chave = String(h).trim();
    return dados[chave] !== undefined ? dados[chave] : '';
  });
  aba.appendRow(linha);
  return dados;
}

function atualizarLinha(nomeAba, id, dados) {
  var aba = checarAba(nomeAba);
  var valores = aba.getDataRange().getValues();
  var cabecalho = valores[0];
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][0]) === String(id)) {
      for (var c = 0; c < cabecalho.length; c++) {
        var chave = String(cabecalho[c]).trim();
        if (dados.hasOwnProperty(chave)) {
          aba.getRange(i + 1, c + 1).setValue(dados[chave]);
        }
      }
      return Object.assign({}, dados, { _id: id });
    }
  }
  throw new Error('Registro não encontrado: ' + id);
}

function excluirLinha(nomeAba, id) {
  var aba = checarAba(nomeAba);
  var valores = aba.getDataRange().getValues();
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][0]) === String(id)) {
      aba.deleteRow(i + 1);
      return { excluido: id };
    }
  }
  throw new Error('Registro não encontrado: ' + id);
}

function gerarId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8);
}
