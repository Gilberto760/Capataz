# Capataz

App de controle de rebanho, reconstruído a partir das suas planilhas "Capataz" / "Capataz 2.0", agora com um banco de dados de verdade (Postgres, via Supabase — plano gratuito) em vez de planilha. Funciona no celular, tablet ou computador, com visualização offline e sincronização automática quando a internet volta.

## Estado atual

Este é o **módulo de Rebanho** (etapa 1). Os demais módulos do Capataz original (Compras/Despesas, Contas a Pagar/Receber, Vendas de safra, Fornecedores/Compradores, Documentos) ainda **não foram migrados** — entram nas próximas etapas.

## Funcionalidades (Rebanho)

- **Animais**: cadastro completo (espécie, sexo, categoria, raça, pelagem, finalidade, nascimento, mãe, fazenda, proprietário, situação, descarte, desmame, morte).
- **Partos**: registro de partos, com opção de já cadastrar o bezerro(a) como novo animal automaticamente.
- **Lactações**: início/fim e produção média por animal.
- **Movimentações**: entrada/saída (compra, venda, morte, abate, transferência...) — atualiza a situação do animal automaticamente.
- **ADAPEC**: declaração de rebanho por faixa etária e sexo, **calculada automaticamente** a partir dos animais ativos (igual ao modelo que você já usava), com histórico de declarações salvas.
- **Tarefas**: lista simples de afazeres (fica só neste aparelho, não vai para o banco ainda).

## Banco de dados

Projeto Supabase próprio, criado na sua conta (`gilbertodpaulavet@gmail.com`), plano **gratuito**:
- Projeto: **Capataz** (`fuanbfdxpjgvmgvrtbxo`)
- Painel: https://supabase.com/dashboard/project/fuanbfdxpjgvmgvrtbxo
- Tabelas: `animais`, `partos`, `lactacoes`, `mov_rebanho`, `adapec_declaracoes`, `talhoes` (reservada para o próximo módulo).

O app já vem conectado a este banco por padrão — não precisa configurar nada. A conexão fica em Configurações, caso precise trocar de projeto no futuro.

**Sobre segurança:** por enquanto não há login de usuário — qualquer pessoa com o link do app consegue ler/gravar os dados (a chave pública fica no código do app, é assim que funciona sem um usuário logado). Para um app de uso pessoal/familiar isso é aceitável, mas se quiser restringir o acesso no futuro, dá para adicionar autenticação (e-mail/senha) ao Supabase.

**Sobre o plano gratuito:** um projeto Supabase free pausa sozinho depois de ~7 dias sem uso. Se isso acontecer, é só reativar com 1 clique no painel acima — os dados continuam lá.

## Como abrir no celular

**Opção 1 — arquivo local (mais simples):**
1. Copie a pasta `GestaoRural` para o celular (cabo USB, Google Drive, etc.).
2. Abra o `index.html` com o Chrome do celular.
3. Como o app já vem conectado ao Supabase, os dados aparecem assim que houver internet; sem internet, mostra o que já foi sincronizado antes.

**Opção 2 — instalável (PWA), recomendado:**
1. Hospede a pasta em um servidor estático gratuito (GitHub Pages, Netlify, Vercel).
2. Acesse pelo navegador do celular e use "Adicionar à tela inicial" / "Instalar app".

**Testar no computador:**
```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Depois acesse `http://localhost:8080`.

## Como funciona offline

- Toda vez que o app abre com internet, ele baixa os dados do Supabase e guarda uma cópia no aparelho.
- Sem internet, o app mostra essa cópia e permite continuar cadastrando — as alterações ficam numa "fila" local.
- Quando a internet volta, a fila é enviada automaticamente para o banco (veja o indicador no topo do app: 🟢 sincronizado / 🟡 sincronizando / 🔴 offline).

## Estrutura de arquivos

```
GestaoRural/
├── index.html
├── manifest.json
├── sw.js                  # service worker (cache offline do app)
├── serve.ps1               # servidor local só para testes no PC
├── css/style.css
├── js/
│   ├── db.js                # armazenamento local só das Tarefas
│   ├── utils.js
│   ├── api.js                # conexão com o Supabase + fila offline
│   ├── ui.js                  # formulários e listas genéricas
│   ├── dashboard.js
│   ├── rebanho.js             # Animais, Partos, Lactações, Movimentações, ADAPEC
│   ├── atividades.js          # Tarefas (local)
│   └── config.js
├── AppsScript/Code.gs       # (obsoleto — era a versão com Google Sheets; não usar mais)
└── icons/icon.svg
```

## Próximas etapas sugeridas

1. Migrar o restante dos dados da planilha "Capataz 2.0" que eu não consegui ler por completo (a ferramenta de leitura da planilha só me mostra uma amostra — alguns registros de Movimentações referenciam animais que não vi o cadastro completo).
2. Módulo financeiro (Compras, Despesas, Contas a Pagar/Receber, Fornecedores).
3. Módulo de agricultura (Produção, Vendas de safra, Cotações, cálculo de Funrural).
4. Autenticação (login) se o app for usado por mais de uma pessoa.
