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

## Login

- E-mail: dragnixtcc@gmail.com
	Senha   @Nix_953721.

## Estrutura

- `server.js` API REST (Express + JWT) · `db.js` SQLite e tabelas
- `public/index.html` login/cadastro · `app.html` trilhas e lições · `admin.html` painel ADM

## Segurança / próximos passos
Troque `JWT_SECRET`, use HTTPS em produção e considere adicionar rate limit no login.
