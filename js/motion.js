/* ============================================================
   Wartle.Soft — interaction + motion layer
   Built on Motion (motion.dev), loaded as the `Motion` global.

   Progressive enhancement contract:
   - The inline <head> script adds `.anim` to <html>, which is the
     only thing that hides `[data-anim]` content. If this file or
     the Motion bundle fails to load, `.anim` is dropped (here or by
     the head script's timeout) and the page renders fully visible.
   - Everything below degrades to plain, working UI without Motion.
   ============================================================ */
(function () {
    'use strict';

    var root = document.documentElement;
    var M = window.Motion;

    // The head script armed a fail-safe in case this file never ran.
    clearTimeout(window.__wartleAnimFallback);

    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var finePointer = window.matchMedia('(pointer: fine)');
    var mobileNav = window.matchMedia('(max-width: 768px)');

    var animated = !!M && !prefersReduced.matches;

    if (!animated) {
        // No Motion, or the visitor asked for less movement: reveal everything.
        root.classList.remove('anim');
    } else {
        root.classList.add('anim-ready');
    }

    var animate = animated ? M.animate : null;
    var inView = animated ? M.inView : null;
    var scroll = animated ? M.scroll : null;
    var stagger = animated ? M.stagger : null;

    /* Matches --ease in the stylesheet so JS and CSS motion agree. */
    var EASE = [0.16, 1, 0.3, 1];
    var SPRING = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 };

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    /* ============================================================
       1. Scroll progress — scroll-linked, hardware accelerated
       ============================================================ */
    function initScrollProgress() {
        var bar = $('#scrollProgress');
        if (!bar) return;
        if (!animated) { bar.style.display = 'none'; return; }

        scroll(animate(bar, { scaleX: [0, 1] }, { ease: 'linear' }));
    }

    /* ============================================================
       2. Header — condense on scroll
       ============================================================ */
    function initHeader() {
        var header = $('#header');
        if (!header) return;

        var apply = function (y) { header.classList.toggle('scrolled', y > 8); };

        if (animated) {
            scroll(function (progress, info) { apply(info.y.current); });
        } else {
            var ticking = false;
            window.addEventListener('scroll', function () {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function () {
                    apply(window.scrollY);
                    ticking = false;
                });
            }, { passive: true });
        }
        apply(window.scrollY);
    }

    /* ============================================================
       3. Navigation — mobile drawer, scroll-spy, sliding indicator
       ============================================================ */
    function initNav() {
        var nav = $('#nav');
        var hamburger = $('#hamburger');
        if (!nav || !hamburger) return;

        var links = $$('a', nav);
        var indicator = $('#navIndicator');
        var spyLinks = $$('a[data-nav-link]', nav);

        /* ---- mobile drawer ---- */
        var isOpen = false;

        function clearNavStyles() {
            nav.style.opacity = '';
            nav.style.transform = '';
            links.forEach(function (a) { a.style.opacity = ''; a.style.transform = ''; });
        }

        function openNav() {
            isOpen = true;
            nav.classList.add('open');
            hamburger.classList.add('active');
            hamburger.setAttribute('aria-expanded', 'true');
            if (!animated) return;
            animate(nav, { opacity: [0, 1], y: [-10, 0] }, { duration: 0.28, ease: EASE });
            animate(links, { opacity: [0, 1], y: [-12, 0] },
                { delay: stagger(0.05, { startDelay: 0.04 }), duration: 0.4, ease: EASE });
        }

        function closeNav() {
            if (!isOpen) return;
            isOpen = false;
            hamburger.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            if (!animated) { nav.classList.remove('open'); return; }
            // Exits run faster than entrances.
            animate(nav, { opacity: 0, y: -8 }, { duration: 0.16, ease: 'easeIn' })
                .then(function () {
                    nav.classList.remove('open');
                    clearNavStyles();
                });
        }

        hamburger.addEventListener('click', function () {
            isOpen ? closeNav() : openNav();
        });

        links.forEach(function (a) {
            a.addEventListener('click', function () {
                if (mobileNav.matches) closeNav();
            });
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) { closeNav(); hamburger.focus(); }
        });

        // Leaving mobile width mid-animation would strand inline styles.
        var onBreakpoint = function (e) {
            if (!e.matches) {
                isOpen = false;
                nav.classList.remove('open');
                hamburger.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                clearNavStyles();
            }
            moveIndicator(document.querySelector('a[data-nav-link][aria-current]'));
        };
        mobileNav.addEventListener('change', onBreakpoint);

        /* ---- sliding indicator (transform-only: x + scaleX on a 1px bar) ---- */
        function moveIndicator(link) {
            if (!indicator) return;
            if (!link || mobileNav.matches) {
                if (animated) animate(indicator, { opacity: 0 }, { duration: 0.18 });
                else indicator.style.opacity = '0';
                return;
            }
            var x = link.offsetLeft;
            var w = link.offsetWidth;
            if (animated) {
                animate(indicator, { x: x, scaleX: w, opacity: 1 },
                    { type: 'spring', stiffness: 380, damping: 34 });
            } else {
                indicator.style.opacity = '1';
                indicator.style.transform = 'translateX(' + x + 'px) scaleX(' + w + ')';
            }
        }

        /* ---- scroll-spy ---- */
        function setActive(id) {
            var current = null;
            spyLinks.forEach(function (a) {
                var match = a.getAttribute('href') === '#' + id;
                if (match) { a.setAttribute('aria-current', 'true'); current = a; }
                else a.removeAttribute('aria-current');
            });
            moveIndicator(current);
        }

        var sections = spyLinks
            .map(function (a) { return document.querySelector(a.getAttribute('href')); })
            .filter(Boolean);

        if (inView) {
            sections.forEach(function (section) {
                inView(section, function () {
                    setActive(section.id);
                    return function () {}; // returning a fn keeps the observer armed
                }, { margin: '-45% 0px -45% 0px', amount: 0 });
            });

            // The hero owns no nav item — scrolling back to it should clear
            // the indicator rather than leave the last section highlighted.
            var hero = document.querySelector('.hero');
            if (hero) {
                inView(hero, function () {
                    setActive(null);
                    return function () {};
                }, { margin: '-45% 0px -45% 0px', amount: 0 });
            }
        }

        window.addEventListener('resize', function () {
            moveIndicator(document.querySelector('a[data-nav-link][aria-current]'));
        }, { passive: true });
    }

    /* ============================================================
       4. Theme toggle
       ============================================================ */
    function initTheme() {
        var toggle = $('#themeToggle');
        if (!toggle) return;
        var key = 'wartle-theme';

        toggle.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem(key, next); } catch (e) {}
            var meta = $('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', next === 'dark' ? '#0a1628' : '#ffffff');

            if (!animated) return;
            // Ends at rotate:0 every time so repeat clicks never snap backwards.
            animate(toggle, { rotate: [-120, 0], scale: [0.82, 1] },
                { duration: 0.5, ease: EASE });
        });
    }

    /* ============================================================
       5. Split headings into masked words
       ============================================================ */
    function splitWords(el) {
        var label = el.textContent.replace(/\s+/g, ' ').trim();
        var frag = document.createDocumentFragment();
        var inners = [];

        function push(content) {
            var outer = document.createElement('span');
            outer.className = 'w';
            var inner = document.createElement('span');
            inner.className = 'w__i';
            if (typeof content === 'string') inner.textContent = content;
            else inner.appendChild(content);
            outer.appendChild(inner);
            frag.appendChild(outer);
            inners.push(inner);
        }

        Array.prototype.slice.call(el.childNodes).forEach(function (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent.split(/(\s+)/).forEach(function (part) {
                    if (!part) return;
                    if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
                    else push(part);
                });
            } else if (node.nodeName === 'BR') {
                frag.appendChild(node.cloneNode());
            } else {
                push(node.cloneNode(true));
            }
        });

        // Screen readers get the intact sentence; the shards are decorative.
        var shell = document.createElement('span');
        shell.setAttribute('aria-hidden', 'true');
        shell.appendChild(frag);
        el.textContent = '';
        el.setAttribute('aria-label', label);
        el.appendChild(shell);

        return inners;
    }

    function animateWords(el, delay) {
        var words = el.__words || (el.__words = splitWords(el));
        el.style.opacity = '1';
        return animate(words, { y: ['110%', '0%'], opacity: [0, 1] }, {
            delay: stagger(0.045, { startDelay: delay || 0 }),
            duration: 0.75,
            ease: EASE
        });
    }

    /* ============================================================
       6. Hero — entrance choreography + scroll-linked depth
       ============================================================ */
    function initHero() {
        var hero = $('.hero');
        if (!hero || !animated) return;

        var heading = $('.hero h1', hero);
        var lines = $$('.hero__line > span', hero);
        var steps = $$('[data-hero]', hero);
        var visual = $('.hero__visual', hero);
        var turtle = $('.hero__turtle-wrap', hero);
        var features = $$('.hero__feature', hero);

        /* Each step carries its own delay in the markup so the copy, the
           headline lines and the visual interleave instead of queueing. */
        steps.forEach(function (el) {
            animate(el, { opacity: [0, 1], y: [18, 0] }, {
                duration: 0.7,
                delay: parseFloat(el.getAttribute('data-hero')) || 0,
                ease: EASE
            });
        });

        if (heading && lines.length) {
            heading.style.opacity = '1';
            animate(lines, { y: ['110%', '0%'] }, {
                delay: stagger(0.1, { startDelay: 0.18 }),
                duration: 0.9,
                ease: EASE
            });
        }

        if (features.length) {
            animate(features, { opacity: [0, 1], y: [14, 0], scale: [0.97, 1] }, {
                delay: stagger(0.06, { startDelay: 0.7 }),
                duration: 0.6,
                ease: EASE
            });
        }

        if (visual) {
            animate(visual, { opacity: [0, 1], scale: [0.9, 1] },
                { duration: 1.2, delay: 0.02, ease: EASE });
        }

        /* Scroll-linked parallax: the turtle drifts slower than the copy.
           Desktop only — on short mobile heroes it just reads as jitter. */
        if (turtle && window.matchMedia('(min-width: 961px)').matches) {
            scroll(animate(turtle, { y: [0, -90] }, { ease: 'linear' }), {
                target: hero,
                offset: ['start start', 'end start']
            });
            var layout = $('.hero__layout', hero);
            if (layout) {
                scroll(animate(layout, { opacity: [1, 1, 0.2] }, { ease: 'linear' }), {
                    target: hero,
                    offset: ['start start', 'end start']
                });
            }
        }
    }

    /* ============================================================
       7. Scroll reveals
       ============================================================ */
    function revealOne(el, delay) {
        var kind = el.getAttribute('data-anim') || 'up';

        if (kind === 'heading') return animateWords(el, delay);

        var from = { opacity: [0, 1], y: [22, 0] };
        var opts = { duration: 0.7, delay: delay || 0, ease: EASE };

        if (kind === 'pop') {
            from = { opacity: [0, 1], y: [18, 0], scale: [0.94, 1] };
            opts = { duration: 0.55, delay: delay || 0, type: SPRING.type, stiffness: 280, damping: 24 };
        } else if (kind === 'fade') {
            from = { opacity: [0, 1] };
        } else if (kind === 'left') {
            from = { opacity: [0, 1], x: [-28, 0] };
        }

        el.style.opacity = '';
        return animate(el, from, opts);
    }

    function observe(el, delay) {
        inView(el, function () { revealOne(el, delay); },
            { amount: 0.12, margin: '0px 0px -6% 0px' });
    }

    function initReveals() {
        if (!animated) return;

        // Grouped: one trigger, children cascade (section headers, callouts).
        $$('[data-anim-group]').forEach(function (group) {
            var items = $$('[data-anim]', group);
            if (!items.length) return;
            inView(group, function () {
                items.forEach(function (item, i) { revealOne(item, i * 0.08); });
            }, { amount: 0.2, margin: '0px 0px -6% 0px' });
        });

        // Grid cards: each triggers itself, but siblings in the same row
        // cascade so a row lands as a wave rather than a block.
        $$('[data-anim-grid]').forEach(function (grid) {
            var cols = window.matchMedia('(max-width: 960px)').matches ? 1 : 2;
            $$('[data-anim]', grid).forEach(function (item, i) {
                observe(item, (i % cols) * 0.09);
            });
        });

        // Everything else: independent.
        $$('[data-anim]').forEach(function (el) {
            if (el.closest('[data-anim-group], [data-anim-grid]')) return;
            observe(el, 0);
        });
    }

    /* ============================================================
       8. Cursor spotlight on cards
       ============================================================ */
    function initSpotlight() {
        if (!finePointer.matches) return;

        $$('[data-spotlight]').forEach(function (card) {
            var rect = null;
            var frame = 0;
            var point = { x: 0, y: 0 };

            card.addEventListener('pointerenter', function () {
                rect = card.getBoundingClientRect();
                card.style.setProperty('--spot-o', '1');
            });

            card.addEventListener('pointermove', function (e) {
                point.x = e.clientX;
                point.y = e.clientY;
                if (frame) return;
                frame = requestAnimationFrame(function () {
                    frame = 0;
                    if (!rect) rect = card.getBoundingClientRect();
                    card.style.setProperty('--spot-x', ((point.x - rect.left) / rect.width * 100).toFixed(2) + '%');
                    card.style.setProperty('--spot-y', ((point.y - rect.top) / rect.height * 100).toFixed(2) + '%');
                });
            });

            card.addEventListener('pointerleave', function () {
                rect = null;
                if (frame) { cancelAnimationFrame(frame); frame = 0; }
                card.style.setProperty('--spot-o', '0');
            });
        });
    }

    /* ============================================================
       9. Magnetic buttons
       ============================================================ */
    function initMagnetic() {
        if (!animated || !finePointer.matches) return;

        $$('[data-magnetic]').forEach(function (el) {
            var rect = null;
            var frame = 0;
            var point = { x: 0, y: 0 };

            function settle() {
                animate(el, { x: 0, y: 0 }, { type: 'spring', stiffness: 220, damping: 20 });
            }

            el.addEventListener('pointerenter', function () {
                rect = el.getBoundingClientRect();
            });

            el.addEventListener('pointermove', function (e) {
                point.x = e.clientX;
                point.y = e.clientY;
                if (frame) return;
                frame = requestAnimationFrame(function () {
                    frame = 0;
                    if (!rect) rect = el.getBoundingClientRect();
                    var dx = point.x - (rect.left + rect.width / 2);
                    var dy = point.y - (rect.top + rect.height / 2);
                    // -2px baseline keeps the lift the CSS :hover used to provide.
                    animate(el, { x: dx * 0.2, y: dy * 0.26 - 2 }, SPRING);
                });
            });

            el.addEventListener('pointerleave', function () {
                rect = null;
                if (frame) { cancelAnimationFrame(frame); frame = 0; }
                settle();
            });

            el.addEventListener('blur', settle);
        });
    }

    /* ============================================================
       Boot
       ============================================================ */
    function boot() {
        initHeader();
        initNav();
        initTheme();
        initSpotlight();

        if (!animated) return;

        initScrollProgress();
        initHero();
        initReveals();
        initMagnetic();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Honour a mid-session change to the reduced-motion setting.
    prefersReduced.addEventListener('change', function (e) {
        if (e.matches) root.classList.remove('anim');
    });
})();
