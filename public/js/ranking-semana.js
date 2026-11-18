/* ============================================================
   DRAGNIX — js/ranking-semana.js  (RANKING DA SEMANA + GANHADOR)
   ============================================================

   Monta a tela de Ranking (usada no app.html e no Controle financeiro):

     [RKS-BANNER]  banner "Ganhador(a) da semana": foto e nome do 1º
                   colocado da semana (vem do servidor) e os prêmios
     [RKS-PODIO]   pódio com o top 3 da semana
     [RKS-LISTA]   demais posições + a sua posição, se estiver fora do top

   Dados: GET /api/ranking/semana (server.js) — XP ganho de segunda a
   domingo. Quem terminar a semana em 1º leva os prêmios.

   PARA TROCAR OS PRÊMIOS: edite a lista PREMIOS logo abaixo
   (nome e imagem em css/images/ranking/).

   Uso:  dgxRankingSemana.montar(elemento)   → devolve uma promessa
   ============================================================ */

(function () {
    'use strict';

    /* [RKS-PREMIOS] — prêmios do 1º lugar da semana (edite aqui) */
    const PREMIOS = [
        { nome: 'Fone', imagem: 'css/images/ranking/premio-fone.png', cor: '#58cc02' },
        { nome: 'Livro', imagem: 'css/images/ranking/premio-livro.png', cor: '#8b3fd9' },
        { nome: 'Voucher', imagem: 'css/images/ranking/premio-cafe.png', cor: '#58cc02' }
    ];

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => Number(v || 0).toLocaleString('pt-BR');
    const dataCurta = iso => {
        const [a, m, d] = String(iso || '').split('-');
        return d && m ? `${d}/${m}` : '';
    };
    const iniciais = nome =>
        String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

    const avatar = (u, classe) => `
        <span class="${classe}" aria-hidden="true">
            ${u && u.avatar_url
                ? `<img src="${esc(u.avatar_url)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="rks-iniciais" hidden>${esc(iniciais(u.name))}</span>`
                : `<span class="rks-iniciais">${esc(iniciais(u && u.name))}</span>`}
        </span>`;

    /* ---------------- [RKS-BANNER] ---------------- */
    function banner(d) {
        const g = d.ganhador;
        const sou = g && g.me;
        const faltam = Number(d.semana?.dias_restantes ?? 0);

        return `
            <section class="rks-banner" aria-labelledby="rksTituloBanner">
                <div class="rks-banner__esq">
                    <img class="rks-banner__logo" src="css/images/dranix_logo_white_nobackground.png" alt="Dragnix">
                    <p class="rks-banner__chamada">
                        Faça uma semana perfeita e ganhe <strong>BRINDES!</strong>
                        <span class="rks-brilho" aria-hidden="true">✦</span>
                    </p>
                    <p class="rks-banner__semana">
                        Semana de ${esc(dataCurta(d.semana?.inicio))} a ${esc(dataCurta(d.semana?.fim))}
                        · ${faltam === 0 ? 'último dia!' : `faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}`}
                    </p>
                </div>

                <div class="rks-banner__centro">
                    ${g
                        ? avatar(g, 'rks-banner__foto')
                        : '<span class="rks-banner__foto rks-banner__foto--vazia" aria-hidden="true"><span class="rks-iniciais">?</span></span>'}
                </div>

                <div class="rks-banner__dir">
                    <h2 class="rks-banner__titulo" id="rksTituloBanner">
                        <img src="css/images/ranking/trofeu.png" alt="" aria-hidden="true">
                        Ganhador(a) da semana
                    </h2>

                    <p class="rks-banner__nome">
                        ${g ? esc(g.name) : 'Ainda sem ganhador(a)'}
                        ${sou ? '<span class="rks-voce">É você!</span>' : ''}
                    </p>
                    <p class="rks-banner__info">
                        ${g
                            ? `${num(g.week_xp)} XP nesta semana · nível ${num(g.level)}${g.level_name ? ' — ' + esc(g.level_name) : ''}`
                            : 'Ninguém pontuou ainda nesta semana. Conclua uma lição e assuma a liderança!'}
                    </p>

                    <ul class="rks-premios" aria-label="Prêmios do 1º lugar">
                        ${PREMIOS.map(p => `
                            <li class="rks-premio" style="--rks-premio:${p.cor}">
                                <b>${esc(p.nome)}</b>
                                <img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy">
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <span class="rks-chao" aria-hidden="true"></span>
            </section>
        `;
    }

    /* ---------------- [RKS-PODIO] ---------------- */
    function podio(lista) {
        const top = lista.slice(0, 3);
        if (!top.length) return '';

        // ordem visual: 2º, 1º, 3º
        const ordem = [top[1], top[0], top[2]].filter(Boolean);
        const MEDALHA = { 1: 'ouro', 2: 'prata', 3: 'bronze' };

        return `
            <section class="rks-podio" aria-label="Pódio da semana">
                ${ordem.map(u => `
                    <div class="rks-podio__lugar rks-podio__lugar--${u.posicao} is-${MEDALHA[u.posicao]}${u.me ? ' is-eu' : ''}">
                        ${u.posicao === 1 ? '<span class="rks-coroa" aria-hidden="true">👑</span>' : ''}
                        ${avatar(u, 'rks-podio__foto')}
                        <b class="rks-podio__nome">${esc(u.name)}${u.me ? ' <small>(você)</small>' : ''}</b>
                        <span class="rks-podio__xp">${num(u.week_xp)} XP</span>
                        <span class="rks-podio__bloco" aria-label="${u.posicao}º lugar">${u.posicao}º</span>
                    </div>
                `).join('')}
            </section>
        `;
    }

    /* ---------------- [RKS-LISTA] ---------------- */
    function linha(u) {
        return `
            <li class="rks-linha${u.me ? ' is-eu' : ''}"${u.me ? ' aria-current="true"' : ''}>
                <span class="rks-linha__pos">${u.posicao}º</span>
                ${avatar(u, 'rks-linha__foto')}
                <span class="rks-linha__nome">
                    <b>${esc(u.name)}${u.me ? ' <small>(você)</small>' : ''}</b>
                    <small>Nível ${num(u.level)}${u.level_name ? ' · ' + esc(u.level_name) : ''} · ${num(u.xp)} XP no total · 🔥 ${num(u.streak)}</small>
                </span>
                <span class="rks-linha__xp"><b>${num(u.week_xp)}</b><small>XP na semana</small></span>
            </li>
        `;
    }

    function lista(d) {
        const resto = d.ranking.slice(3);
        const euFora = d.eu && !d.ranking.some(u => u.me) ? d.eu : null;

        if (!resto.length && !euFora) return '';

        return `
            <section class="rks-lista" aria-label="Classificação da semana">
                <ol>
                    ${resto.map(linha).join('')}
                    ${euFora ? `<li class="rks-sep" aria-hidden="true">···</li>${linha(euFora)}` : ''}
                </ol>
            </section>
        `;
    }

    /* ---------------- [RKS-GERAL] tabela de classificação geral ----------------
       Todo o XP acumulado (módulos + desafios), de GET /api/ranking?completo=1 */
    const MEDALHA_GERAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

    function linhaGeral(u) {
        return `
            <tr class="rkg-linha${u.me ? ' is-eu' : ''}${u.posicao <= 3 ? ' is-top' : ''}"${u.me ? ' aria-current="true"' : ''}>
                <td class="rkg-pos">
                    ${MEDALHA_GERAL[u.posicao] ? `<span aria-hidden="true">${MEDALHA_GERAL[u.posicao]}</span><span class="rks-sr">${u.posicao}º</span>` : `${u.posicao}º`}
                </td>
                <th scope="row" class="rkg-aluno">
                    ${avatar(u, 'rkg-foto')}
                    <span>${esc(u.name)}${u.me ? ' <small>(você)</small>' : ''}</span>
                </th>
                <td class="rkg-nivel">
                    <b>Nv ${num(u.level)}</b>
                    ${u.level_name ? `<small>${esc(u.level_name)}</small>` : ''}
                </td>
                <td class="rkg-xp">${num(u.xp)} <small>XP</small></td>
                <td class="rkg-seq"><span aria-hidden="true">🔥</span> ${num(u.streak)}<span class="rks-sr"> dias seguidos</span></td>
            </tr>
        `;
    }

    function tabelaGeral(g) {
        const lista = g && Array.isArray(g.ranking) ? g.ranking : null;
        if (!lista) return '';

        const euFora = g.eu && !lista.some(u => u.me) ? g.eu : null;

        return `
            <section class="rkg" aria-labelledby="rkgTitulo">
                <h3 class="rks-subtitulo" id="rkgTitulo">Classificação geral</h3>
                <p class="rkg-desc">Todo o XP acumulado desde o início (módulos e desafios).</p>

                ${lista.length ? `
                    <div class="rkg-caixa">
                        <table class="rkg-tabela">
                            <caption class="rks-sr">Classificação geral dos alunos por XP total</caption>
                            <thead>
                                <tr>
                                    <th scope="col" class="rkg-pos">Posição</th>
                                    <th scope="col">Aluno</th>
                                    <th scope="col">Nível</th>
                                    <th scope="col" class="rkg-xp">XP total</th>
                                    <th scope="col" class="rkg-seq">Sequência</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lista.map(linhaGeral).join('')}
                                ${euFora ? `<tr class="rkg-sep" aria-hidden="true"><td colspan="5">···</td></tr>${linhaGeral(euFora)}` : ''}
                            </tbody>
                        </table>
                    </div>
                    ${g.eu ? `<p class="rks-nota">Na classificação geral você está em <b>${g.eu.posicao}º</b> de ${num(g.total_alunos)} alunos.</p>` : ''}
                ` : '<p class="rks-nota">Ainda não há alunos na classificação geral.</p>'}
            </section>
        `;
    }

    function html(d, geral) {
        const lista1 = Array.isArray(d.ranking) ? d.ranking : [];

        return `
            <div class="rks">
                ${banner(d)}
                ${lista1.length
                    ? `
                        <h3 class="rks-subtitulo">Classificação da semana</h3>
                        ${podio(lista1)}
                        ${lista({ ...d, ranking: lista1 })}
                        <p class="rks-nota">
                            O ranking soma o XP ganho de segunda a domingo. Quem terminar a semana em 1º leva os prêmios.
                            ${d.eu ? `Você está em <b>${d.eu.posicao}º</b> de ${num(d.total_alunos)} alunos.` : ''}
                        </p>
                    `
                    : '<p class="rks-nota">Ainda não há alunos no ranking.</p>'}
                ${tabelaGeral(geral)}
            </div>
        `;
    }

    async function montar(elemento) {
        if (!elemento) return;
        // semana e geral ao mesmo tempo; se a geral falhar, a semana aparece igual
        const [d, geral] = await Promise.all([
            window.api('/ranking/semana'),
            window.api('/ranking?completo=1').catch(() => null)
        ]);
        elemento.innerHTML = html(d || {}, geral);
        return d;
    }

    window.dgxRankingSemana = { montar, html, PREMIOS };
})();
