# Dragnix---TCC

Plataforma de trilhas de aprendizagem (estilo Duolingo). Este projeto contém apenas a estrutura — o conteúdo das trilhas é criado pelos ADMs no painel.

## Executar
Acesse: https://dragnix-tcc-testecloud.onrender.com
Configurar acesso em: 
                    Render -> Projeto -> Environment Environment Variables

## Perfis
- **Comum**: cadastro público; acessa trilhas, faz lições, ganha XP.
- **Professor**: Tudo do comum + `/admin.html` (criar/editar/excluir trilhas, lições e questões), Não consegue manipular o banco, excluir ou promover contas
- **ADM**:
    Tudo do comum + `/admin.html` (criar/editar/excluir trilhas, lições e questões; promover/rebaixar usuários, gerar e ler backup do banco de dados.


## Estrutura

- `server.js` API REST (Express + JWT) · `db.js` acesso ao Turso (libSQL) e validação do esquema · `schema.js` esquema oficial do banco
- `npm run db:check` confere o esquema do Turso · `npm run db:provision` cria o esquema em um banco Turso vazio · `npm test` testes em banco local descartável
<<<<<<< HEAD
=======
- Conquistas criadas pelo ADM (tabela `custom_badges`): num banco que já existe, rode **uma vez** `node scripts/add-custom-badges.js` antes de publicar esta versão
- Regras de negócio (tabela `app_settings`): num banco que já existe, rode **uma vez** `node scripts/add-app-settings.js` antes de publicar esta versão
- Nix, o assistente de dúvidas com IA (`chatbot.js`): responde com base no conteúdo das trilhas. Configure `GROQ_API_KEY` no Render.
  - Os PDFs das trilhas ficam em `chatbot/trilhas/` (fora de `public/`, então não ficam acessíveis pelo site). Os de `Questões/` não entram na base, porque trazem o gabarito.
  - Para atualizar o Nix depois de mudar os PDFs: `pip install pymupdf` (só na primeira vez) e `npm run chatbot:base`. Isso recria `chatbot/base.json`; faça commit e deploy.
>>>>>>> 1907a42 (Alterações vindas da Versão Web x5)
- `public/index.html` login/cadastro · `app.html` trilhas e lições · `admin.html` painel ADM

## Segurança / próximos passos
Troque `JWT_SECRET`, use HTTPS em produção e considere adicionar rate limit no login.
