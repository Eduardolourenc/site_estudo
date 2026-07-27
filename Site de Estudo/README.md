# Focus — Monitoramento de Estudos

Aplicação web para registrar horas diárias de estudo, quantidade de questões feitas e acertos, com controle por matéria, ofensiva (streak), conquistas, checklist, modo Pomodoro, calendário e relatórios com gráficos.

## Requisitos

- Node.js 18+ instalado
- Um banco PostgreSQL novo/vazio (Neon, Supabase, Render Postgres ou outro)

## Instalação

```bash
npm install
npm start
```

O servidor ficará disponível em: http://localhost:3000

### Configuração do banco de dados

A connection string do banco fica em variável de ambiente, em vez de hardcoded no código:

1. Copie `.env.example` para `.env`.
2. Preencha `DATABASE_URL` com a sua connection string do Postgres novo/vazio.

```
DATABASE_URL=postgresql://usuario:senha@host/banco?sslmode=require
```

Use uma connection string de um banco novo se quiser começar sem dados anteriores. O sistema cria as tabelas automaticamente na primeira inicialização e só grava os dados cadastrados daqui para frente.

## Funcionalidades

- Cadastro de matérias, cada uma com uma cor de identificação própria
- Registro diário de estudos (data, matéria, horas, questões, acertos) com cronômetro embutido
- Dashboard com anel de progresso da meta diária, gráfico da semana, distribuição de horas por matéria e conquistas desbloqueáveis
- Ofensiva (streak) de dias seguidos batendo a meta
- Histórico com filtro por matéria, edição e exclusão de sessões
- Checklist de tarefas de estudo com barra de progresso
- Modo Pomodoro configurável com alarme sonoro
- Calendário mensal (FullCalendar) colorido conforme a meta batida ou não
- Relatório por período com gráficos (Chart.js) de horas e de questões/acertos
- Tema claro e escuro, com preferência salva no navegador
- Banco de dados PostgreSQL

## Sobre as cores (psicologia das cores)

A paleta foi escolhida com propósito, não por estética aleatória:

| Cor | Uso | Por quê |
|---|---|---|
| **Índigo** (`--primary`) | Navegação, ações principais, horas estudadas | Associada a foco, concentração e confiança |
| **Esmeralda** (`--success`) | Metas batidas, acertos, progresso | Sinal de "crescimento" e conquista |
| **Âmbar** (`--warning`) | Ofensiva (streak), conquistas/badges | Energia, motivação, recompensa |
| **Coral** (`--danger`) | Só em ações destrutivas (excluir) | Usada com moderação, reservada para alertas reais |
| **Violeta** (`--accent`) | Detalhes, tags de matérias, gráficos secundários | Criatividade, variedade visual |
| **Fundo escuro azul-petróleo** | Tema padrão | Reduz fadiga visual em sessões de estudo à noite |

## Hospedagem

O projeto usa apenas a `DATABASE_URL` informada no ambiente. Para começar sem histórico, configure essa variável com a connection string de um banco Postgres novo/vazio.

### Deploy na Vercel (passo a passo)

O `vercel.json` foi atualizado para usar o formato atual recomendado pela Vercel (o antigo, baseado em `builds`/`routes`, está depreciado) e garante que a pasta `views/` (templates EJS) seja incluída na função serverless — uma causa comum de erro "não encontra a página" em deploys desse tipo de projeto.

**Opção A — pelo site da Vercel (recomendado):**

1. Suba este projeto para um repositório no GitHub (ou GitLab/Bitbucket).
2. Acesse [vercel.com/new](https://vercel.com/new) e importe esse repositório.
3. Em **Environment Variables**, adicione:
   - `DATABASE_URL` → a connection string do seu banco Postgres novo/vazio (veja `.env.example`)
4. Clique em **Deploy**. Depois de alguns segundos, a Vercel te dá a URL pública (algo como `https://seu-projeto.vercel.app`).

**Opção B — pelo terminal (Vercel CLI):**

```bash
npm install -g vercel
vercel login
vercel            # deploy de preview
vercel --prod     # deploy de produção
```

Na primeira execução, a CLI vai perguntar para qual conta/projeto vincular — depois disso, configure a variável `DATABASE_URL` com:

```bash
vercel env add DATABASE_URL production
```

> **Importante:** o `.env` local (com a connection string) está no `.gitignore` e **não** é enviado no deploy — por isso é necessário cadastrar `DATABASE_URL` manualmente no painel da Vercel (passo 3 acima) ou via `vercel env add`. Sem isso, o site não inicia. Para não trazer dados antigos, use uma `DATABASE_URL` de banco novo.

### Deploy no Render

- **Build command:** `npm install`
- **Start command:** `npm start`
- Configure a variável de ambiente `DATABASE_URL` com a connection string de um Postgres novo/vazio no painel do Render.

Como o banco é PostgreSQL remoto, os dados **não dependem de disco local** — funcionam normalmente em qualquer plataforma serverless, sem precisar de disco persistente.
