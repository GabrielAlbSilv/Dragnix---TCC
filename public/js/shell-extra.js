/* ============================================================
   DRAGNIX — js/shell-extra.js  (PEÇAS COMPARTILHADAS ENTRE AS PÁGINAS)
   ============================================================

   Coloque em toda página com cabeçalho + menu lateral, DEPOIS de
   api.js e profile.js:   <script src="js/shell-extra.js"></script>

   O que faz (tudo sozinho, sem precisar de HTML extra, exceto o submenu):
     [SX-CONFIG]    endereços da API (ÚNICO lugar para ajustar)
     [SX-SUBMENU]   abre/fecha submenus do menu lateral e destaca o subitem atual
     [SX-PERFIL]    transforma o botão do perfil em um card que abre/fecha
                    (conquistas + Sair + Painel ADM, se for administrador)
     [SX-CHAT]      balão fixo de Dúvidas em formato de chat
   ============================================================ */

(() => {
    'use strict';

    if (window.__sxIniciado) return;
    window.__sxIniciado = true;


    /* ============================================================
       [SX-CONFIG] — AJUSTE AQUI SE OS ENDEREÇOS DA API FOREM OUTROS
       (endereços conferidos no js/app.js: /me/profile e /doubts)
       ============================================================ */

    const CFG = {
        endpoints: {
            conquistas: '/me/profile',    // GET → { badges:[{name,desc,icon,got}] }
            duvidas:    '/doubts'         // GET → lista de dúvidas | POST → envia uma dúvida
        },
        campoDuvida: 'body',              // POST /doubts → { body, track_id }
        paginaAdmin: 'admin.html'
    };


    /* ============================================================
       UTILITÁRIOS
       ============================================================ */

    const $  = (seletor, raiz = document) => raiz.querySelector(seletor);
    const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

    const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const usuario = () => {
        try { return typeof me === 'function' ? me() : JSON.parse(localStorage.getItem('user') || 'null'); }  /* me() vem do api.js */
        catch { return null; }
    };

    const ehAdmin = () => {
        const u = usuario();
        return !!u && ['adm', 'professor'].includes(u.role);   /* igual ao app.js */
    };

    const guardar = {
        ler(chave, padrao) {
            try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
        },
        gravar(chave, valor) {
            try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem espaço/privado: ignora */ }
        }
    };

    /* ícones (Lucide) usados pelas peças injetadas */
    const ICONES = {
        chevron: '<path d="m6 9 6 6 6-6"/>',
        chat:    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
        enviar:  '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
        sair:    '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>',
        editar:  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
        escudo:  '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
    };

    const icone = (nome, classe = 'sx-ico') =>
        `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome]}</svg>`;

    const menorTela = () => window.matchMedia('(max-width: 760px)').matches;


    /* ============================================================
       [SX-SUBMENU] — SUBMENUS DO MENU LATERAL
       Procura .sx-group[data-sx-grupo="nome"] no HTML.
       ============================================================ */

    function iniciarSubmenus() {
        /* [SX-MENU-MINI] marca o menu como "mini" quando ele está estreito (só ícones) */
        const menu = $('.side-menu');
        if (menu && 'ResizeObserver' in window) {
            const LIMITE_MINI = 150;               /* px: abaixo disso o menu é só de ícones */
            const marcar = () => menu.classList.toggle('sx-mini', menu.getBoundingClientRect().width < LIMITE_MINI);
            new ResizeObserver(marcar).observe(menu);
            marcar();
        }
        $$('.sx-sublink').forEach(a => { if (!a.title) a.title = a.textContent.trim(); });   /* dica ao passar o mouse */

        const grupos = $$('[data-sx-grupo]');
        if (!grupos.length) return;

        const CHAVE = 'dragnix:menu-grupos';
        const salvo = guardar.ler(CHAVE, {});

        const definir = (grupo, aberto) => {
            grupo.classList.toggle('is-open', aberto);
            const botao = $('.sx-group__toggle', grupo);
            if (botao) {
                botao.setAttribute('aria-expanded', String(aberto));
                botao.setAttribute('aria-label', (aberto ? 'Recolher' : 'Mostrar') + ' subitens');
            }
        };

        /* marca a página atual: link principal pelo arquivo, subitem pelo arquivo + #hash */
        const marcarAtual = () => {
            const arquivoAtual = location.pathname;

            /* só links de verdade: os botões do menu (telas do app/admin) não têm endereço */
            $$('a.side-link[href]', document).forEach(link => {
                const url = new URL(link.getAttribute('href') || '#', location.href);
                if (url.pathname === arquivoAtual && !link.closest('[data-sx-grupo]')) {
                    link.setAttribute('aria-current', 'page');
                }
            });

            grupos.forEach(grupo => {
                const principal = $('.sx-group__head .side-link', grupo);
                const urlPrincipal = principal && new URL(principal.getAttribute('href') || '#', location.href);
                /* o link principal do grupo NÃO fica colorido: só o item realmente selecionado (subitem, CDB, Ranking...) */
                if (principal) principal.removeAttribute('aria-current');

                let temAtual = !!(urlPrincipal && urlPrincipal.pathname === arquivoAtual);

                $$('.sx-sublink', grupo).forEach(sub => {
                    const url = new URL(sub.getAttribute('href') || '#', location.href);
                    const atual = url.pathname === arquivoAtual && (!url.hash || url.hash === location.hash);
                    if (atual) { sub.setAttribute('aria-current', 'page'); temAtual = true; }
                    else sub.removeAttribute('aria-current');
                });

                if (temAtual) definir(grupo, true);
            });
        };

        grupos.forEach(grupo => {
            const id = grupo.dataset.sxGrupo;
            definir(grupo, id in salvo ? !!salvo[id] : false);

            const alternar = () => {
                const novo = !grupo.classList.contains('is-open');
                definir(grupo, novo);
                salvo[id] = novo;
                guardar.gravar(CHAVE, salvo);
            };
            $('.sx-group__toggle', grupo)?.addEventListener('click', alternar);
            /* clicar no nome do grupo (ex.: "Controle Financeiro") só abre/fecha o submenu, sem navegar */
            const cabeca = $('[data-sx-abrir]', grupo);
            if (cabeca) cabeca.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); alternar(); }, true);
        });

        marcarAtual();
        window.addEventListener('hashchange', marcarAtual);

        /* no celular, escolher um subitem fecha a gaveta do menu */
        $$('.sx-sublink').forEach(sub => sub.addEventListener('click', () => {
            if (menorTela()) $('#sideClose')?.click();
        }));
    }


    /* ============================================================
       [SX-PERFIL] — CARD DO PERFIL (conquistas + sair)
       Usa o botão/link .user-profile__link que já existe no cabeçalho.
       O js/profile.js continua trocando #userName e #userAvatar normalmente.
       ============================================================ */

    function iniciarPerfil() {
        const caixa = $('.user-profile');
        /* aceita o botão novo OU o link antigo da PagInicial (se o profile.js recriar o perfil) */
        const gatilho = caixa && ($('.user-profile__link', caixa) || $('a, button', caixa) || caixa);
        /* sem return: se o perfil só aparecer depois (profile.js), o clique delegado abaixo continua valendo */

        const pop = document.createElement('div');
        pop.className = 'sx-pop';
        pop.id = 'sxPerfil';
        pop.hidden = true;
        pop.style.display = 'none';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Perfil e conquistas');
        pop.innerHTML = `
            <div class="sx-pop__topo">
                <span class="sx-pop__avatar" id="sxAvatar" aria-hidden="true"></span>
                <div class="sx-pop__quem">
                    <strong id="sxNome">Seu nome</strong>
                    <small id="sxEmail"></small>
                </div>
            </div>
            <!-- [SX-EDITAR-PERFIL] abre a tela de perfil do app.html: trocar nome, enviar foto, escolher avatar -->
            <a class="sx-pop__item" id="sxEditar" href="app.html#perfil">${icone('editar')}<span>Editar perfil</span></a>
            <!-- [SX-PERFIL-CARGA] mini-tela de carregamento / erro, sempre visível
                 (as seções abaixo podem estar fechadas) -->
            <div class="sx-carga" id="sxCarga" aria-live="polite" hidden></div>
            <!-- [SX-PERFIL-SECOES] Progresso, Missões e Conquistas abrem/fecham ao clicar no título -->
            <section class="sx-pop__sec sx-dob" data-sx-dob="progresso">
                <h3 class="sx-dob__h">
                    <button class="sx-dob__botao" type="button" aria-expanded="false" aria-controls="sxDob-progresso">
                        <span class="sx-dob__nome">Progresso</span>
                        <span class="sx-dob__qtd" id="sxProgResumo"></span>
                        <span class="sx-dob__ponto" aria-hidden="true"></span>
                        <svg class="sx-dob__seta" viewBox="0 0 24 24" aria-hidden="true">${ICONES.chevron}</svg>
                    </button>
                </h3>
                <div class="sx-dob__corpo" id="sxDob-progresso"><div class="sx-dob__dentro">
            <div class="sx-nivel" id="sxNivel">
                <div class="sx-nivel__linha"><strong id="sxNv">Nível —</strong><span id="sxXp"></span></div>
                <div class="sx-barra" id="sxBarraBox" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <div class="sx-barra__preench" id="sxBarra"></div>
                </div>
                <small id="sxProx"></small>
            </div>
            <!-- [SX-PERFIL-EXTRA] sequência, moedas, lições, perfeitas e trilhas (mesmos campos do profile() do app.js) -->
            <div class="sx-fogo" id="sxFogo" aria-label="Sequência de dias"></div>
            <ul class="sx-stats" id="sxStats" aria-label="Estatísticas"></ul>
            <button class="sx-vidas" id="sxVidas" type="button">Recarregar vidas (30 moedas)</button>
                </div></div>
            </section>

            <section class="sx-pop__sec sx-dob" data-sx-dob="missoes">
                <h3 class="sx-dob__h">
                    <button class="sx-dob__botao" type="button" aria-expanded="false" aria-controls="sxDob-missoes">
                        <span class="sx-dob__nome">Missões de hoje</span>
                        <span class="sx-dob__qtd" id="sxMisQtd"></span>
                        <span class="sx-dob__ponto" aria-hidden="true"></span>
                        <svg class="sx-dob__seta" viewBox="0 0 24 24" aria-hidden="true">${ICONES.chevron}</svg>
                    </button>
                </h3>
                <div class="sx-dob__corpo" id="sxDob-missoes"><div class="sx-dob__dentro">
                    <div class="sx-mis" id="sxMis" aria-live="polite"></div>
                </div></div>
            </section>

            <section class="sx-pop__sec sx-dob" data-sx-dob="conquistas">
                <h3 class="sx-dob__h">
                    <button class="sx-dob__botao" type="button" aria-expanded="false" aria-controls="sxDob-conquistas">
                        <span class="sx-dob__nome">Conquistas</span>
                        <span class="sx-dob__qtd" id="sxConqQtd"></span>
                        <span class="sx-dob__ponto" aria-hidden="true"></span>
                        <svg class="sx-dob__seta" viewBox="0 0 24 24" aria-hidden="true">${ICONES.chevron}</svg>
                    </button>
                </h3>
                <div class="sx-dob__corpo" id="sxDob-conquistas"><div class="sx-dob__dentro">
                    <div class="sx-conq" id="sxConq" aria-live="polite"></div>
                </div></div>
            </section>

            <a class="sx-pop__item" id="sxAdm" href="${escapar(CFG.paginaAdmin)}" hidden>${icone('escudo')}<span>Painel ADM</span></a>
            <button class="sx-pop__sair" type="button">${icone('sair')}<span>Sair</span></button>
        `;
        document.body.appendChild(pop);

        /* [SX-PERFIL-SECOES] abre/fecha cada seção e lembra a escolha.
           Padrão: Progresso e Missões abertos, Conquistas fechada (lista longa). */
        const CHAVE_DOB = 'dragnix:perfil-secoes';
        const PADRAO_DOB = { progresso: true, missoes: true, conquistas: false };
        const estadoDob = guardar.ler(CHAVE_DOB, {});

        $$('.sx-dob', pop).forEach(secao => {
            const id = secao.dataset.sxDob;
            const botao = $('.sx-dob__botao', secao);
            const definir = aberta => {
                secao.classList.toggle('is-open', aberta);
                botao.setAttribute('aria-expanded', String(aberta));
            };

            definir(id in estadoDob ? !!estadoDob[id] : !!PADRAO_DOB[id]);

            botao.addEventListener('click', () => {
                const aberta = !secao.classList.contains('is-open');
                definir(aberta);
                estadoDob[id] = aberta;
                guardar.gravar(CHAVE_DOB, estadoDob);
            });
        });

        /* seta no botão do perfil */
        if (gatilho) gatilho.insertAdjacentHTML('beforeend', `<svg class="sx-chev" viewBox="0 0 24 24" aria-hidden="true">${ICONES.chevron}</svg>`);
        if (gatilho) {
            gatilho.setAttribute('aria-haspopup', 'dialog');
            gatilho.setAttribute('aria-expanded', 'false');
            gatilho.setAttribute('aria-controls', 'sxPerfil');
        }

        let conquistasCarregadas = false;

        const gatilhoAtual = () => document.querySelector('.user-profile__link') || document.querySelector('.user-profile') || document.body;

        pop.style.zIndex = '2147483000';        /* acima de qualquer cabeçalho/menu da página */

        const posicionar = () => {
            const r = gatilhoAtual().getBoundingClientRect();
            pop.style.top = Math.round(r.bottom + 10) + 'px';
            pop.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
        };

        const preencherCabecalho = () => {
            const u = usuario();
            const nomeTela = $('#userName')?.textContent?.trim();
            $('#sxNome', pop).textContent = (u?.name || nomeTela || 'Seu nome');
            $('#sxEmail', pop).textContent = u?.email || '';
            const av = $('#userAvatar');
            $('#sxAvatar', pop).innerHTML = av ? av.innerHTML : '?';
            $('#sxAdm', pop).hidden = !ehAdmin();
            /* professor vê "Painel Professor"; administrador, "Painel ADM" */
            $('#sxAdm span', pop).textContent = usuario()?.role === 'professor' ? 'Painel Professor' : 'Painel ADM';
        };

        const abrir = () => {
            preencherCabecalho();
            posicionar();
            pop.hidden = false;
            pop.style.display = 'block';          /* garante que aparece mesmo se algum CSS esconder [hidden] */
            gatilhoAtual().setAttribute('aria-expanded', 'true');
            if (!conquistasCarregadas) carregarConquistas();
        };

        const fechar = (devolverFoco = false) => {
            if (pop.hidden) return;
            pop.hidden = true;
            pop.style.display = 'none';
            gatilhoAtual().setAttribute('aria-expanded', 'false');
            if (devolverFoco) gatilhoAtual().focus();
        };

        /* conquistas: aceita formatos diferentes de resposta */
        const normalizar = b => ({
            nome:  b.name ?? 'Conquista',
            desc:  b.desc ?? '',
            icone: /^[a-z-]+$/.test(b.icon || '') ? '🏆' : (b.icon || '🏆'),   /* nomes de ícone do app viram 🏆 */
            ganha: !!b.got
        });

        async function carregarConquistas() {
            const lista = $('#sxConq', pop);
            lista.innerHTML = window.dgxCarregando ? window.dgxCarregando.html('Carregando conquistas…', { compacto: true }) : '<p class="sx-vazio">Carregando…</p>';
            $('#sxConqQtd', pop).textContent = '';

            const carga = $('#sxCarga', pop);
            carga.innerHTML = window.dgxCarregando
                ? window.dgxCarregando.html('Carregando seu perfil…', { compacto: true })
                : '<p class="sx-vazio">Carregando…</p>';
            carga.hidden = false;

            try {
                const d = await window.api(CFG.endpoints.conquistas);
                carga.hidden = true;
                carga.innerHTML = '';
                /* nível e barra de progresso (mesmos campos do profile() do app.js) */
                if (d && d.level != null) {
                    const nivel = Number(d.level) || 1;
                    const falta = (Number(d.nextXp) - Number(d.curXp)) || 1;
                    const pct = Math.max(0, Math.min(100, Math.round((Number(d.xp) - Number(d.curXp)) / falta * 100)));
                    $('#sxNv', pop).textContent = `Nível ${nivel}${d.level_name ? ' · ' + d.level_name : ''}`;
                    if (d.refillCost != null) $('#sxVidas', pop).textContent = `Recarregar vidas (${d.refillCost} moedas)`;
                    $('#sxXp', pop).textContent = `${d.xp} XP`;
                    $('#sxBarra', pop).style.width = pct + '%';
                    $('#sxBarraBox', pop).setAttribute('aria-valuenow', String(pct));
                    $('#sxBarraBox', pop).setAttribute('aria-valuetext', `${pct}% para o nível ${nivel + 1}`);
                    $('#sxProx', pop).textContent = `${d.xp} / ${d.nextXp} XP para o nível ${nivel + 1}`;
                }
                /* estatísticas e missões do dia */
                const svg = (c, tr) => `<svg class="sx-si" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${tr}</svg>`;
                const IC = {
                    fogo:   '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
                    moedas: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
                    livro:  '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
                    selo:   '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
                    bandeira: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>'
                };
                /* [SX-FOGO] card à parte da sequência (cores de fogo) */
                const dias = Number(d.streak) || 0;
                $('#sxProgResumo', pop).textContent =
                    (d && d.level != null ? 'Nv ' + (Number(d.level) || 1) + ' · ' : '') + dias + (dias === 1 ? ' dia' : ' dias');
                $('#sxFogo', pop).innerHTML = `${svg('fogo', IC.fogo)}<span class="sx-fogo__txt"><strong>${dias}</strong><small>${dias === 1 ? 'dia de sequência' : 'dias de sequência'}</small></span>`;
                const est = [['moedas', d.coins, 'moedas', 'moedas'], ['livro', d.lessons, 'lições', 'livro'], ['selo', d.perfect, 'perfeitas', 'selo'], ['bandeira', d.tracks, 'trilhas', 'bandeira']];
                $('#sxStats', pop).innerHTML = est.map(([k, v, r]) => `<li class="sx-st sx-st--${k}">${svg(k, IC[k])}<strong>${escapar(v ?? 0)}</strong><small>${r}</small></li>`).join('');
                const mis = Array.isArray(d.missions) ? d.missions : [];
                $('#sxMisQtd', pop).textContent = mis.length ? `${mis.filter(m => m.done).length} de ${mis.length}` : '';
                $('#sxMis', pop).innerHTML = mis.length ? mis.map(m => `
                    <div class="sx-mis__item${m.done ? ' is-feita' : ''}">
                        <span class="sx-mis__icone" aria-hidden="true">${escapar(m.icon || '🎯')}</span>
                        <span class="sx-mis__txt"><strong>${escapar(m.label)}</strong><small>${escapar(m.value)}/${escapar(m.goal)}</small></span>
                        ${m.claimed ? '<span class="sx-mis__ok">✔</span>'
                            : m.done ? `<button class="sx-mis__btn" type="button" data-sx-resgatar="${escapar(m.code)}">Resgatar +10</button>` : ''}
                    </div>`).join('') : '<p class="sx-vazio">Nenhuma missão hoje.</p>';
                $('[data-sx-dob="missoes"]', pop).classList.toggle('tem-resgate', !!$('[data-sx-resgatar]', pop));
                const bruto = Array.isArray(d.badges) ? d.badges : [];
                const itens = bruto.map(normalizar).sort((a, b) => Number(b.ganha) - Number(a.ganha));

                conquistasCarregadas = true;
                $('#sxConqQtd', pop).textContent = itens.length
                    ? `${itens.filter(i => i.ganha).length} de ${itens.length}`
                    : '';

                lista.innerHTML = itens.length
                    ? itens.map(i => `
                        <div class="sx-conq__item${i.ganha ? '' : ' is-bloqueada'}">
                            <span class="sx-conq__icone" aria-hidden="true">${(typeof conquistaImagem === 'function' && conquistaImagem(i.icone)) || escapar(i.icone)}</span>
                            <span class="sx-conq__texto">
                                <strong>${escapar(i.nome)}</strong>
                                <small>${escapar(i.desc)}${i.ganha ? '' : ' (bloqueada)'}</small>
                            </span>
                        </div>`).join('')
                    : '<p class="sx-vazio">Nenhuma conquista disponível ainda.</p>';
            } catch {
                lista.innerHTML = `<p class="sx-vazio">Não foi possível carregar as conquistas agora.</p>
                                   <button class="sx-link" type="button" data-sx-retry>Tentar de novo</button>`;
                carga.innerHTML = `<p class="sx-vazio">Não foi possível carregar o seu perfil agora.</p>
                                   <button class="sx-link" type="button" data-sx-retry>Tentar de novo</button>`;
                carga.hidden = false;
            }
        }

        /* resgatar / recarregar: roda e recarrega o card do perfil */
        const acao = async fn => {
            try { await fn(); } catch (e) { if (window.dgxAviso) window.dgxAviso(e.message || 'Não foi possível concluir.', 'erro'); }
            carregarConquistas();
            if (window.dgxGamificacao) window.dgxGamificacao.atualizar();
        };
        document.addEventListener('dgx:perfil-mudou', () => { if (!pop.hidden) carregarConquistas(); });

        /* eventos */
        /* [CELULAR/TODOS] clique no perfil: captura em fase inicial, assim nenhum outro script
           (profile.js, main.js) consegue impedir a abertura nem navegar para outra página */
        /* [TODOS] um único ouvinte de clique (fase de captura):
           dentro do card → nada; no perfil → abre/fecha; em qualquer outro lugar → fecha.
           Usa .closest('.user-profile') e não o elemento guardado, porque o profile.js pode recriar o botão. */
        const aoClicar = e => {
            if (e.__sxTratado) return;
            e.__sxTratado = true;
            if (pop.contains(e.target)) return;
            if (e.target.closest && e.target.closest('.user-profile')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                pop.hidden ? abrir() : fechar();
                return;
            }
            fechar();
        };
        /* window + captura = o primeiro a receber o clique, antes de qualquer outro script da página */
        window.addEventListener('click', aoClicar, true);
        /* reserva: o botão do HTML chama isto direto (onclick), caso algo bloqueie a captura */
        window.sxPerfil = aoClicar;
        console.info('[shell-extra] card do perfil pronto');

        pop.addEventListener('click', e => {
            if (e.target.closest('.sx-pop__x')) fechar(true);
            /* já no app.html: abre a tela de perfil direto (o #hash pode já ser #perfil) */
            if (e.target.closest('#sxEditar')) {
                fechar();
                if (typeof window.profile === 'function') {
                    e.preventDefault();
                    window.profile();
                    window.scrollTo({ top: 0 });
                }
            }
            if (e.target.closest('[data-sx-retry]')) carregarConquistas();
            const rg = e.target.closest('[data-sx-resgatar]');
            if (rg) acao(() => window.dgxMissoes ? window.dgxMissoes.resgatar(rg.dataset.sxResgatar) : window.api(`/missions/${rg.dataset.sxResgatar}/claim`, 'POST'));
            if (e.target.closest('#sxVidas')) acao(() => window.dgxMissoes ? window.dgxMissoes.recarregarVidas() : window.api('/shop/hearts', 'POST'));
            if (e.target.closest('.sx-pop__sair')) {
                if (typeof logout === 'function') logout();          /* logout() vem do api.js */
                else { const t = localStorage.getItem('dragnix-theme'); localStorage.clear(); if (t) localStorage.setItem('dragnix-theme', t); location.replace('splash.html?logout=1'); }
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') fechar(true);
        });

        window.addEventListener('resize', () => { if (!pop.hidden) posicionar(); });
        window.addEventListener('scroll', () => { if (!pop.hidden) posicionar(); }, { passive: true });
    }


    /* ============================================================
       [SX-CHAT] — BALÃO FIXO DE DÚVIDAS (formato de chat)
       ============================================================ */

    function iniciarChat() {
        const fab = document.createElement('button');
        fab.className = 'sx-chat-fab';
        fab.type = 'button';
        fab.setAttribute('aria-label', 'Abrir dúvidas');
        fab.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-controls', 'sxChat');
        fab.title = 'Dúvidas';
        fab.innerHTML = icone('chat', '');

        const chat = document.createElement('section');
        chat.className = 'sx-chat';
        chat.id = 'sxChat';
        chat.hidden = true;
        chat.setAttribute('aria-label', 'Dúvidas');
        chat.innerHTML = `
            <div class="sx-chat__topo">
                <div><strong>Dúvidas</strong><small>Fale com os professores</small></div>
                <button class="sx-pop__x" type="button" aria-label="Fechar dúvidas">&times;</button>
            </div>
            <!-- atalho para o Nix (assistente com IA da tela de Dúvidas) -->
            <a class="sx-chat__nix" href="app.html#nix">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                <span><b>Pergunte ao Nix</b><small>Assistente com IA · responde na hora</small></span>
            </a>
            <div class="sx-chat__msgs" id="sxMsgs" role="log" aria-live="polite"></div>
            <form class="sx-chat__form" id="sxForm">
                <textarea id="sxTexto" rows="1" maxlength="1000" placeholder="Escreva sua dúvida…" aria-label="Escreva sua dúvida"></textarea>
                <button class="sx-chat__send" type="submit" aria-label="Enviar">${icone('enviar', '')}</button>
            </form>
        `;
        document.body.append(chat, fab);

        const area = $('#sxMsgs', chat);
        const campo = $('#sxTexto', chat);
        const form = $('#sxForm', chat);

        const mensagens = [];
        let historicoCarregado = false;

        const hora = iso => {
            const d = iso ? new Date(iso) : null;
            return d && !isNaN(d) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        };

        function desenhar() {
            area.innerHTML = mensagens.map((m, i) => {
                if (m.de === 'aviso') return `<div class="sx-msg sx-msg--aviso">${escapar(m.texto)}</div>`;
                const rotulo = m.de === 'prof' ? (m.autor || 'Professor') : '';
                const quando = hora(m.quando);
                const erro = m.estado === 'erro'
                    ? `<small>Não enviada. <button type="button" data-sx-reenviar="${i}">Tentar de novo</button></small>`
                    : m.estado === 'enviando' ? '<small>Enviando…</small>' : '';
                return `<div class="sx-msg sx-msg--${m.de}${m.estado === 'erro' ? ' is-erro' : ''}">` +
                       (rotulo ? `<small>${escapar(rotulo)}</small>` : '') +
                       `<span class="sx-msg__txt">${escapar(m.texto)}</span>` +
                       (quando && !erro ? `<small>${escapar(quando)}</small>` : '') + erro +
                       '</div>';
            }).join('');
            area.scrollTop = area.scrollHeight;
        }

        /* histórico: cada dúvida vira uma bolha do aluno + (se houver) a resposta do professor */
        async function carregarHistorico() {
            historicoCarregado = true;
            mensagens.length = 0;
            mensagens.push({ de: 'aviso', texto: 'Escreva sua dúvida abaixo. Um professor responde por aqui.' });
            desenhar();

            try {
                const d = await window.api(CFG.endpoints.duvidas);
                const lista = Array.isArray(d.doubts) ? d.doubts : [];
                lista.forEach(item => {
                    if (item.body) mensagens.push({ de: 'eu', texto: item.body, quando: item.created_at });
                    (item.replies || []).forEach(r => mensagens.push({
                        de: (r.author && r.author.role !== 'comum') ? 'prof' : 'eu',
                        texto: r.body, autor: r.author ? r.author.name : '', quando: r.created_at
                    }));
                });
            } catch {
                mensagens.push({ de: 'aviso', texto: 'Não foi possível carregar suas dúvidas anteriores.' });
            }
            desenhar();
        }

        async function enviar(indice) {
            const msg = mensagens[indice];
            msg.estado = 'enviando';
            desenhar();
            try {
                await window.api(CFG.endpoints.duvidas, 'POST', { [CFG.campoDuvida]: msg.texto });
                msg.estado = 'ok';
                msg.quando = new Date().toISOString();
            } catch {
                msg.estado = 'erro';
            }
            desenhar();
        }

        const abrir = () => {
            chat.hidden = false;
            fab.setAttribute('aria-expanded', 'true');
            fab.setAttribute('aria-label', 'Fechar dúvidas');
            if (!historicoCarregado) carregarHistorico();
            campo.focus();
        };

        const fechar = (devolverFoco = false) => {
            if (chat.hidden) return;
            chat.hidden = true;
            fab.setAttribute('aria-expanded', 'false');
            fab.setAttribute('aria-label', 'Abrir dúvidas');
            if (devolverFoco) fab.focus();
        };

        const ajustarAltura = () => {
            campo.style.height = 'auto';
            campo.style.height = Math.min(campo.scrollHeight, 110) + 'px';
        };

        /* atalho "Pergunte ao Nix": fecha o balão (no app.html só troca o #) */
        $('.sx-chat__nix', chat).addEventListener('click', () => fechar(false));

        fab.addEventListener('click', () => (chat.hidden ? abrir() : fechar()));
        $('.sx-pop__x', chat).addEventListener('click', () => fechar(true));

        form.addEventListener('submit', e => {
            e.preventDefault();
            const texto = campo.value.trim();
            if (!texto) return;
            mensagens.push({ de: 'eu', texto, estado: 'enviando' });
            campo.value = '';
            ajustarAltura();
            enviar(mensagens.length - 1);
        });

        /* Enter envia | Shift+Enter quebra a linha */
        campo.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.requestSubmit();
            }
        });
        campo.addEventListener('input', ajustarAltura);

        area.addEventListener('click', e => {
            const b = e.target.closest('[data-sx-reenviar]');
            if (b) enviar(Number(b.dataset.sxReenviar));
        });

        chat.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.stopPropagation(); fechar(true); }
        });
    }


    /* ============================================================
       [SX-GESTAO] — OPÇÕES DO MENU DO ADMIN.HTML NO MENU LATERAL
       Respeita a hierarquia:
         aluno (comum) → não vê nada
         professor     → Trilhas e módulos, Nova trilha, Perguntas e respostas, Ver como aluno
         adm           → tudo do professor + Usuários, Avatares, Conquistas, Sistema / Banco
       Não roda no admin.html nem no admin-sistema.html (já têm esse menu).
       ============================================================ */

    const ICONES_MENU = {
        painel:   '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
        trilhas:  '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
        mais:     '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
        usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        avatares: '<path d="M15 10V9"/><path d="M16.472 15a6 6 0 01-8.943 0"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',
        sistema:  '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
        duvidas:  '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
        regras:   '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
        avaliacoes: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
        conquistas: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
        aluno:    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'
    };

    function iniciarMenuGestao() {
        const u = usuario();
        const papel = u && u.role;

        if (!['adm', 'professor'].includes(papel)) return;
        if (/admin(-sistema)?\.html$/i.test(location.pathname)) return;

        const aside = $('.side-menu');
        if (!aside || $('[data-sx-gestao]', aside)) return;

        const adm = papel === 'adm';
        // mesmo nome e mesma ordem do menu do admin.html
        const titulo = 'Gerenciamento';

        const itens = [
            // "Nova trilha" fica nos Atalhos (página inicial e Visão geral)
            { href: 'admin.html', ico: 'painel', texto: 'Visão geral' },
            { href: 'admin.html#trilhas', ico: 'trilhas', texto: 'Trilhas e módulos' },
            ...(adm ? [{ href: 'admin.html#usuarios', ico: 'usuarios', texto: 'Usuários' }] : []),
            { href: 'admin.html#avaliacoes', ico: 'avaliacoes', texto: 'Avaliações' },
            { href: 'app.html#duvidas', ico: 'duvidas', texto: 'Perguntas e respostas' },
            ...(adm ? [
                { href: 'admin.html#regras', ico: 'regras', texto: 'Regras de negócio' },
                { href: 'admin-sistema.html', ico: 'sistema', texto: 'Sistema / Banco' }
            ] : []),
            { href: 'app.html', ico: 'aluno', texto: 'Ver como aluno' }
        ];

        const bloco = document.createElement('div');
        bloco.className = 'sx-gestao';
        bloco.setAttribute('data-sx-gestao', papel);
        bloco.innerHTML = `
            <div class="side-head side-head--sec"><p class="side-title">${titulo}</p></div>
            <nav class="side-nav" aria-label="${titulo}">
                ${itens.map(i => `
                    <a class="side-link" href="${i.href}" data-sx-gestao-link>
                        <span class="side-link__icon"><svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES_MENU[i.ico]}</svg></span>
                        <span>${escapar(i.texto)}</span>
                    </a>
                `).join('')}
            </nav>
        `;

        const arte = $('.side-art', aside);
        if (arte) aside.insertBefore(bloco, arte);
        else aside.appendChild(bloco);

        // app.html: o link antigo "Painel admin" ficaria repetido
        const antigo = document.getElementById('adm');
        if (antigo) antigo.style.display = 'none';

        // No app.html, "Perguntas e respostas" e "Ver como aluno" trocam a tela sem recarregar
        if (typeof window.doubts === 'function' && typeof window.home === 'function') {
            $$('[data-sx-gestao-link]', bloco).forEach(link => {
                const destino = link.getAttribute('href');
                if (destino !== 'app.html#duvidas' && destino !== 'app.html') return;

                link.addEventListener('click', e => {
                    e.preventDefault();
                    (destino === 'app.html' ? window.home : window.doubts)();
                    window.scrollTo(0, 0);
                });
            });
        }
    }


    /* ============================================================
       [SX-MINHA-AREA] — "MINHA ÁREA" EM TODAS AS PÁGINAS
       O app.html já tem essa seção (botões que trocam a tela).
       Nas outras páginas ela é criada aqui, com links para as
       mesmas telas: app.html#conquistas, #perfil, #ranking...
       ============================================================ */

    const ICONES_MINHA = {
        trilhas:    '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
        conquistas: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
        perfil:     '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
        ranking:    '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
        duvidas:    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
        nix:        '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
        gestao:     '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'
    };

    function iniciarMinhaArea() {
        if (!localStorage.getItem('token')) return;

        const aside = $('.side-menu');
        if (!aside) return;

        /* o app.html já tem a "Minha área" dele */
        const jaTem = $$('.side-title', aside).some(t => t.textContent.trim().toLowerCase() === 'minha área');
        if (jaTem || $('[data-sx-minha]', aside)) return;

        const itens = [
            { href: 'app.html', ico: 'trilhas', texto: 'Trilhas' },
            { href: 'app.html#conquistas', ico: 'conquistas', texto: 'Conquistas' },
            { href: 'app.html#perfil', ico: 'perfil', texto: 'Perfil' },
            { href: 'app.html#ranking', ico: 'ranking', texto: 'Ranking' },
            { href: 'app.html#duvidas', ico: 'duvidas', texto: 'Dúvidas' },
            { href: 'app.html#nix', ico: 'nix', texto: 'Nix · Assistente IA' }
            /* "Gestão financeira" saiu: é o mesmo que Finanças > Controle financeiro */
        ];

        const bloco = document.createElement('div');
        bloco.className = 'sx-minha';
        bloco.setAttribute('data-sx-minha', '');
        bloco.innerHTML = `
            <div class="side-head side-head--sec"><p class="side-title">Minha área</p></div>
            <nav class="side-nav" aria-label="Minha área">
                ${itens.map(i => `
                    <a class="side-link" href="${i.href}">
                        <span class="side-link__icon"><svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES_MINHA[i.ico]}</svg></span>
                        <span>${escapar(i.texto)}</span>
                    </a>
                `).join('')}
            </nav>
        `;

        /* logo depois de "Finanças" (antes de Gerenciamento/Administração, se houver) */
        const depoisDeFinancas = $$('.side-nav', aside)[0];
        const alvo = depoisDeFinancas && depoisDeFinancas.closest('.side-menu > *');

        if (alvo && alvo.nextSibling) aside.insertBefore(bloco, alvo.nextSibling);
        else aside.insertBefore(bloco, $('.side-art', aside) || null);
    }


    /* ============================================================
       [SX-SECOES] — SEÇÕES DO MENU LATERAL QUE ABREM E FECHAM
       Cada título (Finanças, Minha área, Gerenciamento, Administração,
       Professor) vira um botão; as opções ficam guardadas e aparecem
       ao clicar, igual ao "Controle financeiro".
         • a seção da página/tela atual já abre sozinha
         • o que a pessoa abre/fecha fica guardado neste navegador
         • menu minimizado (só ícones): tudo à mostra, sem títulos
       Não precisa mudar o HTML: usa .side-head + .side-nav que já existem.
       ============================================================ */

    const ICONES_SECAO = {
        'finanças':      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
        'minha área':    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
        'gerenciamento': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
        'administração': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
        'professor':     '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'
    };

    const ICONE_SECAO_PADRAO = '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>';

    function iniciarSecoes() {
        const aside = $('.side-menu');
        if (!aside) return;

        const CHAVE = 'dragnix:menu-secoes';
        const salvo = guardar.ler(CHAVE, {});
        const secoes = [];

        $$('.side-head', aside).forEach((cabeca, n) => {
            const nav = cabeca.nextElementSibling;
            const titulo = $('.side-title', cabeca);

            if (!nav || !nav.classList.contains('side-nav') || !titulo || cabeca.dataset.sxSecao) return;

            const nome = titulo.textContent.trim();
            const chave = nome.toLowerCase();
            const idCorpo = 'sxSecao' + n;

            cabeca.dataset.sxSecao = chave;
            cabeca.classList.add('sx-secao__cabeca');

            /* o título vira botão (o "×" de fechar no celular continua no lugar) */
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'side-link sx-secao__botao';
            botao.setAttribute('aria-controls', idCorpo);
            botao.innerHTML = `
                <span class="side-link__icon"><svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES_SECAO[chave] || ICONE_SECAO_PADRAO}</svg></span>
                <span class="sx-secao__nome">${escapar(nome)}</span>
                <svg class="sx-secao__seta" viewBox="0 0 24 24" aria-hidden="true">${ICONES.chevron}</svg>
            `;
            botao.title = nome;
            titulo.replaceWith(botao);

            /* as opções vão para dentro do container que abre e fecha */
            const corpo = document.createElement('div');
            corpo.className = 'sx-secao__corpo';
            corpo.id = idCorpo;

            const dentro = document.createElement('div');
            dentro.className = 'sx-secao__dentro';

            nav.before(corpo);
            corpo.appendChild(dentro);
            dentro.appendChild(nav);

            const secao = { chave, cabeca, botao, corpo, nav };
            secoes.push(secao);

            botao.addEventListener('click', () => {
                const aberta = !cabeca.classList.contains('is-open');
                definirSecao(secao, aberta);
                salvo[chave] = aberta;
                guardar.gravar(CHAVE, salvo);
            });
        });

        if (!secoes.length) return;

        function definirSecao(secao, aberta) {
            secao.cabeca.classList.toggle('is-open', aberta);
            secao.corpo.classList.toggle('is-open', aberta);
            secao.botao.setAttribute('aria-expanded', String(aberta));
        }

        const itemAtual = secao =>
            secao.nav.querySelector('[aria-current="page"], .is-active, .active');

        /* estado inicial: como a pessoa deixou da última vez; se ela nunca mexeu,
           só a seção da página atual começa aberta */
        secoes.forEach(secao => {
            secao.atual = itemAtual(secao);
            definirSecao(secao, secao.chave in salvo ? !!salvo[secao.chave] : !!secao.atual);
        });

        /* só quando a tela atual MUDA para outro item (ex.: "Editar perfil" pelo cabeçalho)
           a seção dele abre sozinha. Abrir/fechar com o clique continua livre. */
        new MutationObserver(() => {
            secoes.forEach(secao => {
                const atual = itemAtual(secao);

                if (atual && atual !== secao.atual) {
                    definirSecao(secao, true);
                }

                secao.atual = atual;
            });
        }).observe(aside, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-current']
        });
    }


    /* ============================================================
       INÍCIO
       ============================================================ */

    /* cada parte roda separada: se uma falhar, as outras continuam funcionando */
    const iniciar = () => {
        [iniciarSubmenus, iniciarPerfil, iniciarChat, iniciarMinhaArea, iniciarMenuGestao, iniciarSecoes].forEach(fn => {
            try { fn(); } catch (erro) { console.error('[shell-extra]', fn.name, erro); }
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();