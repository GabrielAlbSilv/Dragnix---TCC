/* ============================================================
   DRAGNIX — js/admin-avaliacoes.js  (RESULTADOS DAS AVALIAÇÕES)
   ============================================================

   Área "Avaliações" do admin.html (botão #t5).
   Administradores E professores podem ver (o professor cria os
   conteúdos que estão sendo avaliados). Alunos não entram no admin.

   O que mostra:
     [AV-RESUMO]    total de avaliações, média geral, notas de
                    trilhas e de módulos
     [AV-TRILHAS]   cada trilha: nota da trilha, distribuição das
                    notas (1 a 5) e a nota de cada módulo
     [AV-RECENTES]  as últimas avaliações enviadas pelos alunos

   Rota (server.js): GET /api/admin/evaluations
   Precisa vir DEPOIS do js/admin.js ($, api, esc, comCarregando).
   ============================================================ */

(function () {
    'use strict';

    const botao = document.getElementById('t5');
    if (!botao) return;

    let dados = null;
    let filtroTrilha = '';
    let ordem = 'ordem';          // 'ordem' | 'pior' | 'melhor' | 'mais'

    /* estrelas com preenchimento proporcional à média (ex.: 3,5 = 3 e meia) */
    function estrelas(media, grande = false) {
        const pct = media == null ? 0 : Math.max(0, Math.min(100, (Number(media) / 5) * 100));

        return `
            <span class="av-estrelas${grande ? ' av-estrelas--g' : ''}" role="img"
                  aria-label="${media == null ? 'Sem avaliações' : 'Média ' + String(media).replace('.', ',') + ' de 5'}">
                <span class="av-estrelas__fundo" aria-hidden="true">★★★★★</span>
                <span class="av-estrelas__cheio" aria-hidden="true" style="width:${pct}%">★★★★★</span>
            </span>`;
    }

    const media = v => (v == null ? '–' : Number(v).toFixed(1).replace('.', ','));

    const nivel = r => {
        if (!r || !r.count) return 'sem';
        if (r.average >= 4.5) return 'otima';
        if (r.average < 3) return 'baixa';
        return 'ok';
    };

    /* barrinhas: quantas notas 5, 4, 3, 2 e 1 */
    function distribuicao(r) {
        const total = r.count || 0;

        return `
            <div class="av-dist" aria-label="Distribuição das notas">
                ${[5, 4, 3, 2, 1].map(n => {
                    const q = r.dist[n - 1] || 0;
                    const pct = total ? Math.round((q / total) * 100) : 0;
                    return `
                        <div class="av-dist__linha">
                            <span>${n}★</span>
                            <div class="av-dist__barra"><div style="width:${pct}%"></div></div>
                            <b>${q}</b>
                        </div>`;
                }).join('')}
            </div>`;
    }

    function dataCurta(iso) {
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    async function avaliacoesView() {
        dados = await api('/admin/evaluations');
        desenhar();
    }

    function ordenarModulos(lista) {
        const copia = [...lista];
        const val = l => (l.rating.count ? l.rating.average : null);

        if (ordem === 'pior') copia.sort((a, b) => (val(a) ?? 99) - (val(b) ?? 99));
        if (ordem === 'melhor') copia.sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1));
        if (ordem === 'mais') copia.sort((a, b) => b.rating.count - a.rating.count);

        return copia;
    }

    function trilhaHtml(t) {
        const r = t.rating;
        const somaModulos = t.lessons.reduce((s, l) => s + l.rating.count, 0);

        return `
            <article class="card av-trilha" style="--av-cor:${esc(t.color || '#8b3fd9')}">
                <header class="av-trilha__topo">
                    <span class="av-trilha__ico">${iconeTrilha(t.icon)}</span>
                    <div class="av-trilha__nome">
                        <h3>${esc(t.title)}</h3>
                        <small>${t.lessons.length} módulo(s) · ${somaModulos} nota(s) nos módulos</small>
                    </div>
                </header>

                <div class="av-trilha__nota av-nivel--${nivel(r)}">
                    <div class="av-trilha__media">
                        <small>Nota da trilha</small>
                        <strong>${media(r.average)}</strong>
                        ${estrelas(r.average, true)}
                        <small>${r.count ? r.count + (r.count === 1 ? ' avaliação' : ' avaliações') : 'Ninguém avaliou ainda'}</small>
                    </div>
                    ${distribuicao(r)}
                </div>

                ${t.lessons.length ? `
                    <div class="av-tabela" role="table" aria-label="Notas dos módulos de ${esc(t.title)}">
                        <div class="av-linha av-linha--cab" role="row">
                            <span role="columnheader">Módulo</span>
                            <span role="columnheader">Média</span>
                            <span role="columnheader">Notas</span>
                            <span role="columnheader" class="av-col-dist">Distribuição</span>
                        </div>
                        ${ordenarModulos(t.lessons).map(l => `
                            <div class="av-linha av-nivel--${nivel(l.rating)}" role="row">
                                <span role="cell" class="av-linha__mod"><b>${l.number}.</b> ${esc(l.title || 'Módulo')}</span>
                                <span role="cell" class="av-linha__media">
                                    ${l.rating.count ? `<b>${media(l.rating.average)}</b>${estrelas(l.rating.average)}` : '<em>sem notas</em>'}
                                </span>
                                <span role="cell">${l.rating.count}</span>
                                <span role="cell" class="av-col-dist">
                                    <span class="av-mini" aria-hidden="true">
                                        ${[5, 4, 3, 2, 1].map(n => {
                                            const q = l.rating.dist[n - 1] || 0;
                                            const pct = l.rating.count ? (q / l.rating.count) * 100 : 0;
                                            return `<i class="av-mini--${n}" style="width:${pct}%" title="${n}★: ${q}"></i>`;
                                        }).join('')}
                                    </span>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="mut">Esta trilha ainda não tem módulos.</p>'}
            </article>
        `;
    }

    function desenhar() {
        const tot = dados.totals;
        const trilhas = filtroTrilha
            ? dados.tracks.filter(t => String(t.id) === filtroTrilha)
            : dados.tracks;

        $('main').innerHTML = `
            <div class="av">

                <!-- [AV-RESUMO] -->
                <section class="av-resumo">
                    <article class="av-num">
                        <small>Avaliações recebidas</small>
                        <strong>${tot.count}</strong>
                    </article>
                    <article class="av-num av-num--media">
                        <small>Média geral</small>
                        <strong>${media(tot.average)}</strong>
                        ${estrelas(tot.average)}
                    </article>
                    <article class="av-num">
                        <small>Notas de trilhas</small>
                        <strong>${tot.tracks}</strong>
                    </article>
                    <article class="av-num">
                        <small>Notas de módulos</small>
                        <strong>${tot.lessons}</strong>
                    </article>
                </section>

                <section class="av-filtros">
                    <label>
                        <span>Trilha</span>
                        <select id="avTrilha">
                            <option value="">Todas as trilhas</option>
                            ${dados.tracks.map(t => `<option value="${Number(t.id)}" ${String(t.id) === filtroTrilha ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}
                        </select>
                    </label>
                    <label>
                        <span>Ordenar módulos</span>
                        <select id="avOrdem">
                            <option value="ordem" ${ordem === 'ordem' ? 'selected' : ''}>Ordem da trilha</option>
                            <option value="pior" ${ordem === 'pior' ? 'selected' : ''}>Pior nota primeiro</option>
                            <option value="melhor" ${ordem === 'melhor' ? 'selected' : ''}>Melhor nota primeiro</option>
                            <option value="mais" ${ordem === 'mais' ? 'selected' : ''}>Mais avaliados</option>
                        </select>
                    </label>
                    <p class="av-legenda mut">
                        <span class="av-tag av-nivel--otima">4,5 ou mais</span>
                        <span class="av-tag av-nivel--ok">entre 3 e 4,4</span>
                        <span class="av-tag av-nivel--baixa">abaixo de 3: vale revisar</span>
                    </p>
                </section>

                <!-- [AV-TRILHAS] -->
                ${trilhas.length ? trilhas.map(trilhaHtml).join('') : '<p class="card mut">Nenhuma trilha cadastrada.</p>'}

                <!-- [AV-RECENTES] -->
                <section class="card av-recentes">
                    <h3>Avaliações recentes</h3>
                    ${dados.recent.length ? `
                        <ul>
                            ${dados.recent.map(r => `
                                <li>
                                    <span class="av-tag ${r.kind === 'trilha' ? 'av-tag--trilha' : 'av-tag--modulo'}">${r.kind === 'trilha' ? 'Trilha' : 'Módulo'}</span>
                                    <span class="av-recentes__txt">
                                        <b>${esc(r.item_title || '')}</b>
                                        <small>${r.kind === 'modulo' && r.track_title ? esc(r.track_title) + ' · ' : ''}${esc(r.user_name || 'Aluno')} · ${esc(dataCurta(r.created_at))}</small>
                                    </span>
                                    <span class="av-recentes__nota">${r.rating}★</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p class="mut">Nenhuma avaliação enviada ainda. Elas aparecem aqui quando os alunos concluírem módulos e trilhas.</p>'}
                </section>
            </div>
        `;

        document.getElementById('avTrilha').onchange = e => {
            filtroTrilha = e.target.value;
            desenhar();
        };

        document.getElementById('avOrdem').onchange = e => {
            ordem = e.target.value;
            desenhar();
        };
    }

    const abrir = () => avaliacoesView().catch(err => {
        alert((err && err.message) || 'Não foi possível carregar as avaliações.');
    });

    botao.onclick = typeof comCarregando === 'function'
        ? comCarregando('Carregando avaliações…', abrir)
        : abrir;

    window.avaliacoesView = avaliacoesView;
})();
