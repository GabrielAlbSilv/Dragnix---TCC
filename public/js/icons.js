(function () {
    'use strict';

    // Pasta de ícones, relativa a este script (public/js -> public/icons)
    const script = document.currentScript;
    const BASE = script && script.src
        ? new URL('../icons/', script.src).href
        : '/icons/';

    const cache = new Map(); // nome -> Promise<string>

    function loadSvg(name) {
        if (!cache.has(name)) {
            const request = fetch(BASE + name + '.svg')
                .then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then(text => {
                    const match = text.match(/<svg[\s\S]*<\/svg>/i);
                    if (!match) throw new Error('SVG inválido');
                    return match[0];
                })
                .catch(error => {
                    console.warn('Ícone Lucide não encontrado: "' + name + '" (' + error.message + ')');
                    cache.delete(name);
                    return '';
                });
            cache.set(name, request);
        }
        return cache.get(name);
    }

     function hydrate(element) {
        const name = element.getAttribute('data-lucide');
        if (!name) return;

        // Garante tamanho/alinhamento mesmo em <i data-lucide="..."> escrito à mão
        element.classList.add('lucide-icon');

        if (element.dataset.lucideLoaded === name) return;

        element.dataset.lucideLoaded = name;

        loadSvg(name).then(svg => {
            if (!svg || element.getAttribute('data-lucide') !== name) {
                if (!svg) delete element.dataset.lucideLoaded;
                return;
            }
            element.innerHTML = svg;
            const el = element.firstElementChild;
            if (el) {
                el.setAttribute('aria-hidden', 'true');
                el.setAttribute('focusable', 'false');
                el.removeAttribute('width');
                el.removeAttribute('height');
            }
        });
    }

    function scan(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.hasAttribute('data-lucide')) hydrate(root);
        root.querySelectorAll('[data-lucide]').forEach(hydrate);
    }

    // Gera o HTML de um ícone (para usar dentro de templates)
    function icon(name, extraClass) {
        return '<i class="lucide-icon' + (extraClass ? ' ' + extraClass : '') +
               '" data-lucide="' + name + '" aria-hidden="true"></i>';
    }

    window.icon = icon;
    window.renderIcons = scan;

    function start() {
        scan(document.body);

        new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.type === 'attributes') { hydrate(m.target); return; }
                m.addedNodes.forEach(scan);
            });
        }).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-lucide']
        });
    }

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();