/* ============================================================
   DRAGNIX — js/emoji-seletor.js  (CAIXINHA PARA ESCOLHER EMOJI)
   ============================================================

   Antes, o ícone da trilha só podia ser digitado (no Windows,
   com o atalho Win + .). Agora, ao lado de qualquer campo marcado
   com data-emoji aparece um botão "Escolher" que abre uma caixinha
   com emojis separados por tema. Um clique preenche o campo.
   O campo continua editável: dá para colar qualquer outro emoji.

   Uso:   <input id="ti" data-emoji>
          dgxEmojiSeletor(input)          (o admin.js já chama sozinho
                                           para os campos das janelas)
   ============================================================ */

(function () {
    'use strict';

    const GRUPOS = [
        {
            nome: 'Finanças',
            emojis: ['💰', '💵', '💸', '💳', '💲', '🏦', '🏧', '📈', '📉', '📊', '💹', '🧾',
                     '🐷', '💼', '🏠', '🛒', '🧮', '⚖️', '🔐', '🛡️', '🎯', '💶', '💷', '💴']
        },
        {
            nome: 'Estudo',
            emojis: ['📚', '📖', '📘', '📗', '📙', '📕', '📝', '✏️', '🖊️', '📒', '📓', '🎓',
                     '🏫', '🧠', '💡', '🔍', '🧩', '📐', '📏', '🗂️', '📌', '📎', '🗒️', '🏛️']
        },
        {
            nome: 'Conquistas',
            emojis: ['🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '👑', '💎', '⭐', '🌟', '✨', '🔥',
                     '⚡', '🚀', '🎉', '💯', '✅', '🏁', '🎁', '🎈', '🌈', '☀️', '🌙', '🎊']
        },
        {
            nome: 'Natureza',
            emojis: ['🐉', '🐲', '🦁', '🐯', '🦊', '🐻', '🐼', '🦉', '🦅', '🐢', '🐝', '🦋',
                     '🌱', '🌳', '🌵', '🍀', '🌻', '🌊', '⛰️', '🌍', '🍎', '☕', '🎮', '🎨']
        },
        {
            nome: 'Símbolos',
            emojis: ['🔑', '🔒', '🗺️', '🧭', '⏰', '⏳', '📅', '🗓️', '📣', '💬', '❓', '❗',
                     '➕', '✔️', '❤️', '💚', '💜', '💙', '🧡', '💛', '🤝', '👍', '🙌', '🌐']
        }
    ];

    // Ícones do site (Lucide, pasta icons/). Ficam salvos como "lucide:nome".
    const ICONES_SITE = [
        ['wallet', 'carteira'], ['piggy-bank', 'cofrinho'], ['banknote', 'dinheiro'], ['coins', 'moedas'],
        ['hand-coins', 'mão com moedas'], ['credit-card', 'cartão'], ['landmark', 'banco'], ['trending-up', 'crescimento'],
        ['chart-line', 'gráfico de linha'], ['chart-pie', 'gráfico de pizza'], ['chart-column', 'gráfico de barras'], ['calculator', 'calculadora'],
        ['receipt', 'recibo'], ['shopping-cart', 'carrinho'], ['house', 'casa'], ['shield', 'escudo'],
        ['target', 'alvo'], ['percent', 'porcentagem'], ['scale', 'balança'], ['briefcase', 'maleta'],
        ['book-open', 'livro'], ['graduation-cap', 'formatura'], ['brain', 'cérebro'], ['lightbulb', 'lâmpada'],
        ['notebook-pen', 'caderno'], ['library', 'biblioteca'], ['school', 'escola'], ['pencil', 'lápis'],
        ['trophy', 'troféu'], ['medal', 'medalha'], ['award', 'prêmio'], ['crown', 'coroa'],
        ['star', 'estrela'], ['rocket', 'foguete'], ['flame', 'chama'], ['zap', 'raio'],
        ['gem', 'joia'], ['map', 'mapa'], ['compass', 'bússola'], ['flag', 'bandeira'],
        ['sprout', 'broto'], ['leaf', 'folha'], ['heart', 'coração'], ['users', 'pessoas'],
        ['clock', 'relógio'], ['calendar', 'calendário'], ['lock', 'cadeado'], ['key', 'chave'],
        ['globe', 'globo'], ['gift', 'presente']
    ];

    const NOME_ICONE = Object.fromEntries(ICONES_SITE);

    // desenha emoji ou "lucide:nome" (igual ao iconeTrilha do api.js)
    const desenhar = valor => {
        const v = String(valor || '').trim();
        const m = v.match(/^lucide:([a-z0-9-]{1,40})$/);
        if (m) {
            const url = `url('icons/${m[1]}.svg')`;
            return `<span class="emj__svg" style="-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat"></span>`;
        }
        return v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    };

    let contador = 0;

    function dgxEmojiSeletor(input) {
        if (!input || input.dataset.emojiPronto) return;
        input.dataset.emojiPronto = '1';
        contador += 1;

        const idPainel = 'emojiPainel' + contador;
        const ancora = input.closest('label') || input;

        const caixa = document.createElement('div');
        caixa.className = 'emj';
        caixa.innerHTML = `
            <div class="emj__linha">
                <span class="emj__previa" aria-hidden="true"></span>
                <button type="button" class="emj__abrir" aria-expanded="false" aria-controls="${idPainel}">
                    😀 Escolher Ícone
                </button>
                <small class="emj__dica">emoji ou ícone do site — também dá para digitar ou colar um emoji no campo</small>
            </div>

            <div class="emj__painel" id="${idPainel}" hidden>
                <div class="emj__abas" role="tablist" aria-label="Temas de emoji">
                    ${GRUPOS.map((g, i) => `
                        <button type="button" role="tab" class="emj__aba${i === 0 ? ' is-on' : ''}"
                                aria-selected="${i === 0}" data-emj-grupo="${i}">${g.nome}</button>
                    `).join('')}
                    <button type="button" role="tab" class="emj__aba emj__aba--site"
                            aria-selected="false" data-emj-grupo="site">Ícones do site</button>
                </div>
                <div class="emj__grade" role="group" aria-label="Emojis"></div>
            </div>
        `;

        ancora.after(caixa);

        const previa = caixa.querySelector('.emj__previa');
        const abrir = caixa.querySelector('.emj__abrir');
        const painel = caixa.querySelector('.emj__painel');
        const grade = caixa.querySelector('.emj__grade');

        const atualizar = () => {
            const valor = input.value.trim();
            previa.innerHTML = desenhar(valor || '📚');
            grade.querySelectorAll('[data-emj]').forEach(b => {
                const on = b.dataset.emj === valor;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-pressed', String(on));
            });
        };

        const mostrarGrupo = n => {
            caixa.querySelectorAll('[data-emj-grupo]').forEach(b => {
                const on = b.dataset.emjGrupo === String(n);
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-selected', String(on));
            });

            grade.innerHTML = n === 'site'
                ? ICONES_SITE.map(([nome, rotulo]) => `
                    <button type="button" class="emj__item emj__item--site" data-emj="lucide:${nome}"
                            aria-label="Usar ícone ${rotulo}" title="${rotulo}" aria-pressed="false">${desenhar('lucide:' + nome)}</button>
                `).join('')
                : GRUPOS[n].emojis.map(e => `
                    <button type="button" class="emj__item" data-emj="${e}" aria-label="Usar ${e}" aria-pressed="false">${e}</button>
                `).join('');

            atualizar();
        };

        const alternar = aberto => {
            painel.hidden = !aberto;
            abrir.setAttribute('aria-expanded', String(aberto));
        };

        abrir.addEventListener('click', () => alternar(painel.hidden));

        caixa.addEventListener('click', e => {
            const aba = e.target.closest('[data-emj-grupo]');
            if (aba) {
                const g = aba.dataset.emjGrupo;
                mostrarGrupo(g === 'site' ? 'site' : Number(g));
                return;
            }

            const item = e.target.closest('[data-emj]');
            if (item) {
                input.value = item.dataset.emj;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                atualizar();
                alternar(false);
                abrir.focus();
            }
        });

        // Esc fecha a caixinha sem fechar a janela inteira
        painel.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                alternar(false);
                abrir.focus();
            }
        });

        input.addEventListener('input', atualizar);

        // começa no tema do emoji atual (ou Finanças)
        const atual = input.value.trim();
        const grupoAtual = GRUPOS.findIndex(g => g.emojis.includes(atual));
        mostrarGrupo(/^lucide:/.test(atual) ? 'site' : grupoAtual >= 0 ? grupoAtual : 0);

        // mostra o nome do ícone do site escolhido (o campo guarda "lucide:nome")
        input.setAttribute('aria-describedby', idPainel + '-nome');
        const nomeIcone = document.createElement('small');
        nomeIcone.className = 'emj__nome';
        nomeIcone.id = idPainel + '-nome';
        caixa.querySelector('.emj__linha').appendChild(nomeIcone);
        const mostrarNome = () => {
            const m = input.value.trim().match(/^lucide:([a-z0-9-]+)$/);
            nomeIcone.textContent = m ? 'Ícone do site: ' + (NOME_ICONE[m[1]] || m[1]) : '';
        };
        input.addEventListener('input', mostrarNome);
        mostrarNome();
    }

    window.dgxEmojiSeletor = dgxEmojiSeletor;
})();
