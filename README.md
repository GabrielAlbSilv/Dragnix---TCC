# Dragnix---TCC

Plataforma de trilhas de aprendizagem (estilo Duolingo). Este projeto contém apenas a estrutura — o conteúdo das trilhas é criado pelos ADMs no painel.

## Executar
```bash
Baixar node.js em https://nodejs.org/pt-br
Rodar no terminal:      
            node -v 
            npm install
            npm.cmd start
Para finalizar o servidor: Ctrl + C no terminal     
cp .env.example .env   # ajuste os valores
export $(cat .env | xargs) && npm start   # Windows: defina as variáveis manualmente
```
Acesse http://localhost:3000. O 1º ADM é criado com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Perfis
- **Comum**: cadastro público; acessa trilhas, faz lições, ganha XP.
- **ADM**: 
            E-mail: admin@exemplo.com
            Senha: admin123
    Tudo do comum + `/admin.html` (criar/editar/excluir trilhas, lições e questões; promover/rebaixar usuários).
## Estrutura
- `server.js` API REST (Express + JWT) · `db.js` SQLite e tabelas
- `public/index.html` login/cadastro · `app.html` trilhas e lições · `admin.html` painel ADM

## Segurança / próximos passos
Troque `JWT_SECRET`, use HTTPS em produção e considere adicionar rate limit no login.
