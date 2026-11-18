/* ============================================================
   DRAGNIX — js/inicio-painel.js  (CARDS DO TOPO DA PÁGINA INICIAL)
   ============================================================

   Preenche, com os dados do servidor, os cards que ficam entre o
   banner e as trilhas:
     • esquerda → último módulo aberto (ou convite para começar uma trilha)
     • direita  → foto, nível, nome, XP do curso e conquistas

   Precisa do js/api.js carregado ANTES (funções api() e me()).

   DE ONDE VÊM OS DADOS (rotas do server.js)
     /api/tracks            XP de cada módulo, o que já foi concluído, nível
     /api/me/profile        nome, conquistas (ganhas e bloqueadas)
     /api/auth/me           foto escolhida no cadastro (avatar)
     /api/me/last-activity  último módulo aberto

   COMO PROCURAR: Ctrl+F e digite o código entre colchetes.

   [CONFIG]      nomes dos 3 níveis e página que abre o módulo
   [INICIO]      só roda para quem está logado
   [AUXILIARES]  textos seguros, iniciais, ícones
   [XP]          cálculo do XP do curso inteiro
   [ULTIMO]      card da esquerda (último módulo aberto ou card vazio)
   [PERFIL]      card da direita (foto, nível, nome, XP)
   [CONQUISTAS]  faixa com as 3 conquistas
   [TRILHAS]     card "Educação Financeira" com o progresso real
   [CARREGAR]    busca os dados e desenha tudo
   ============================================================ */

(function () {
    'use strict';


    /* ============================================================
       [CONFIG] — ajuste aqui
       ============================================================ */

    // Nomes das 3 partes da barra de XP (o XP total do curso é dividido em 3 partes iguais).
    const NIVEIS = ['Fácil', 'Intermediário', 'Avançado'];

    // Página que abre um módulo: o link fica  app.html?lesson=ID
    const PAGINA_MODULO = 'app.html';

    // Quantas conquistas aparecem na faixa
    const QTD_CONQUISTAS = 3;


    /* ============================================================
       [INICIO] — só roda para quem está logado
       ============================================================ */

    const $ = id => document.getElementById(id);

    const painel = $('painel');

    if (!painel) return;

    // Adm e professor veem o painel de gestão (js/painel-gestao.js), não o progresso de aluno
    if (window.dgxGestao) return;

    if (!localStorage.getItem('token')) {
        console.info('[inicio-painel] Sem login (token): os cards do topo ficam escondidos. Entre pela página de login.');
        return;
    }

    if (typeof api !== 'function') {
        console.warn('[inicio-painel] api() não encontrada: confira se js/api.js está carregando (aba Rede do navegador).');
        return;
    }


    /* ============================================================
       [AUXILIARES] — textos seguros, iniciais, ícones
       ============================================================ */

    // Evita que um texto vindo do servidor vire HTML
    const texto = valor =>
        String(valor ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

    // "Maria da Silva" -> "MS" | "Maria" -> "M" | vazio -> "?"
    function iniciais(nome) {
        const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);

        if (!partes.length) return '?';

        const primeira = partes[0][0];
        const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';

        return (primeira + ultima).toUpperCase();
    }

    // Só aceita imagens da pasta de avatares (a mesma regra do server.js)
    function caminhoAvatar(valor) {
        const caminho = String(valor || '').trim().replace(/^\//, '');

        /* aceita a foto guardada no banco (api/avatar/...), o formato antigo (uploads/arquivo)
           e os avatares prontos */
        if (/^api\/avatar\/(u\/\d+\/[a-f0-9]+|p\/\d+)$/.test(caminho)) return '/' + caminho;

        return /^(uploads|css\/images\/avatars)\/[\w.-]+\.(png|jpe?g|webp|gif|svg)$/i.test(caminho) &&
            !caminho.includes('..')
            ? '/' + caminho
            : '';
    }

    // Cor da trilha: só aceita #rgb / #rrggbb
    const corValida = (cor, padrao) =>
        /^#[0-9a-f]{3,8}$/i.test(String(cor || '')) ? cor : padrao;

    // Ícone da conquista: emoji, nome de ícone Lucide (se existir icon()) ou troféu
    function iconeConquista(valor) {
        const nome = String(valor || '').trim();

        // Conquista criada pelo adm com imagem
        const imagem = typeof conquistaImagem === 'function' && conquistaImagem(nome);
        if (imagem) return imagem;

        if (/^[a-z][a-z0-9-]*$/.test(nome)) {
            return typeof window.icon === 'function' ? window.icon(nome) : '🏆';
        }

        return texto(nome || '🏆');
    }


    /* ============================================================
       [XP] — XP DO CURSO INTEIRO
       Total = soma do XP de todos os módulos de todas as trilhas.
       Ganho = soma do XP dos módulos já concluídos.
       ============================================================ */

    function calcularXp(trilhas) {
        let total = 0;
        let ganho = 0;

        (Array.isArray(trilhas) ? trilhas : []).forEach(trilha => {
            (Array.isArray(trilha.lessons) ? trilha.lessons : []).forEach(modulo => {
                const xp = Number(modulo.xp) || 0;

                total += xp;
                if (modulo.done) ganho += xp;
            });
        });

        return {
            total,
            ganho,
            razao: total > 0 ? Math.min(1, ganho / total) : 0
        };
    }


    /* ============================================================
       [ULTIMO] — CARD DA ESQUERDA: ÚLTIMO MÓDULO ABERTO
       Sem nenhum módulo aberto, o card fica vazio e convida a começar uma trilha.
       ============================================================ */

    function desenharUltimo(ultimo) {
        const card = $('painelUltimo');

        if (!card) return;

        const corpo = card.querySelector('.painel-ultimo__corpo');
        const vazio = $('ultimoVazio');

        card.hidden = false;
        painel.classList.remove('painel--sem-ultimo');

        // nenhum módulo aberto: card vazio convidando a começar uma trilha
        if (!ultimo || !ultimo.lesson_id) {
            if (corpo) corpo.hidden = true;
            if (vazio) vazio.hidden = false;
            if ($('ultimoVazioBtn')) $('ultimoVazioBtn').href = PAGINA_MODULO;
            return;
        }

        if (corpo) corpo.hidden = false;
        if (vazio) vazio.hidden = true;

        const numero = Number(ultimo.module_number) || 1;
        const total = Number(ultimo.total_modules) || numero;
        const pct = Math.max(0, Math.min(100, Number(ultimo.pct) || 0));

        const thumb = $('ultimoThumb');
        if (typeof iconeTrilha === 'function') thumb.innerHTML = iconeTrilha(ultimo.track_icon);
        else thumb.textContent = ultimo.track_icon || '📚';
        thumb.style.setProperty('--thumb-bg', corValida(ultimo.track_color, '#58cc02'));

        $('ultimoTrilha').textContent =
            (ultimo.track_title || 'Trilha') + ' · módulo ' + numero + ' de ' + total;

        $('ultimoModulo').textContent =
            'Módulo ' + numero + (ultimo.lesson_title ? ': ' + ultimo.lesson_title : '');

        $('ultimoBarra').style.width = pct + '%';
        $('ultimoPct').textContent = pct + '%';

        $('ultimoBtnTxt').textContent =
            ultimo.done ? 'Rever módulo' : pct > 0 ? 'Continuar' : 'Começar';

        $('ultimoBtn').href =
            PAGINA_MODULO + '?lesson=' + encodeURIComponent(ultimo.lesson_id);

    }


    /* ============================================================
       [PERFIL] — CARD DA DIREITA: FOTO, NÍVEL, NOME E XP
       ============================================================ */

    function desenharPerfil(nome, avatar, nivel, xp, nomeNivel) {

        // foto (ou iniciais do nome)
        const caixa = $('perfilAvatar');
        const imagem = caminhoAvatar(avatar);

        caixa.textContent = iniciais(nome);

        if (imagem) {
            const img = document.createElement('img');

            img.src = imagem;
            img.alt = '';
            img.onerror = () => { img.remove(); caixa.textContent = iniciais(nome); };

            caixa.textContent = '';
            caixa.appendChild(img);
        }

        $('perfilNome').textContent = nome || 'Dragnixer';
        $('perfilNivel').textContent = 'Nível ' + (Number(nivel) || 1) + (nomeNivel ? ' · ' + nomeNivel : '');
        $('perfilXp').textContent =
            xp.ganho.toLocaleString('pt-BR') + ' / ' + xp.total.toLocaleString('pt-BR') + ' XP';

        // barra do curso inteiro: 3 partes iguais (Fácil | Intermediário | Avançado)
        const partes = NIVEIS.length;
        const segmentos = $('perfilBarra').querySelectorAll('.painel-seg > div');

        segmentos.forEach((preenchimento, i) => {
            const cheio = Math.max(0, Math.min(1, xp.razao * partes - i));
            preenchimento.style.width = (cheio * 100) + '%';
        });

        $('perfilBarra').setAttribute('aria-valuenow', String(Math.round(xp.razao * 100)));

        // destaca o nível em que a pessoa está
        const atual = Math.min(partes - 1, Math.floor(xp.razao * partes));

        $('perfilZonas').querySelectorAll('span').forEach((rotulo, i) => {
            rotulo.textContent = NIVEIS[i] || '';
            rotulo.classList.toggle('is-atual', i === atual);
        });
    }


    /* ============================================================
       [CONQUISTAS] — FAIXA COM AS 3 CONQUISTAS
       As ganhas aparecem primeiro; se faltar, completa com as bloqueadas.
       ============================================================ */

    function desenharConquistas(lista) {
        const faixa = $('perfilConquistas');

        const todas = Array.isArray(lista) ? lista : [];

        const escolhidas = [
            ...todas.filter(c => c.got),
            ...todas.filter(c => !c.got)
        ].slice(0, QTD_CONQUISTAS);

        if (!escolhidas.length) {
            faixa.hidden = true;
            return;
        }

        faixa.hidden = false;

        faixa.innerHTML = escolhidas.map(c => `
            <div class="painel-conq ${c.got ? '' : 'is-bloqueada'}"
                 title="${texto(c.desc)}">
                <span class="painel-conq__icone" aria-hidden="true">${iconeConquista(c.icon)}</span>
                <span class="painel-conq__texto">
                    <span class="painel-conq__nome">${texto(c.name)}</span>
                    <span class="painel-conq__desc">${texto(c.got ? c.desc : 'Bloqueada')}</span>
                </span>
            </div>
        `).join('');
    }


    /* ============================================================
       [TRILHAS] — CARD "EDUCAÇÃO FINANCEIRA" COM O PROGRESSO REAL
       Soma todas as trilhas: módulos, XP e % concluída
       (a % é a média do progresso dos módulos, igual ao app).
       ============================================================ */

    function desenharTrilhas(trilhas) {
        const modulos = (Array.isArray(trilhas) ? trilhas : [])
            .flatMap(t => Array.isArray(t.lessons) ? t.lessons : []);

        if (!modulos.length || !$('tcProg')) return;     // sem dados: mantém o texto do HTML

        const xp = modulos.reduce((soma, m) => soma + (Number(m.xp) || 0), 0);
        const pct = Math.round(
            modulos.reduce((soma, m) => soma + (Number(m.pct) || 0), 0) / modulos.length
        );

        $('tcModulos').textContent = modulos.length + (modulos.length === 1 ? ' módulo' : ' módulos');
        $('tcXp').textContent = xp.toLocaleString('pt-BR') + ' XP';
        $('tcBarra').style.width = pct + '%';
        $('tcPct').textContent = pct + '%';
        $('tcProg').setAttribute('aria-valuenow', String(pct));
    }


    /* ============================================================
       [CARREGAR] — busca os dados e desenha tudo
       ============================================================ */

    async function carregar() {
        try {

            const busca = Promise.all([
                api('/tracks'),
                api('/me/profile'),
                api('/auth/me').catch(() => (typeof me === 'function' ? me() : null) || {}),
                api('/me/last-activity').catch(() => ({ last: null }))
            ]);

            if (window.dgxCarregando) {
                window.dgxCarregando.cobrir(painel, 'Carregando seu progresso…', busca.catch(() => {}));
                window.dgxCarregando.cobrir(document.querySelector('.features'), 'Carregando suas trilhas…', busca.catch(() => {}));
            }

            const [dados, perfil, usuario, ultimo] = await busca;

            const xp = calcularXp(dados.tracks);

            desenharUltimo(ultimo && ultimo.last);
            desenharPerfil(
                perfil.name || usuario.name,
                usuario.avatar_url || usuario.avatar,
                dados.level || perfil.level,
                xp,
                perfil.level_name || dados.level_name
            );
            desenharConquistas(perfil.badges);
            desenharTrilhas(dados.tracks);

            painel.hidden = false;

        } catch (erro) {

            // Sem dados, os cards ficam escondidos e o resto da página continua normal.
            console.warn('Não foi possível carregar os cards do topo:', erro);
        }
    }

    carregar();

})();