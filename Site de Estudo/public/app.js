(function () {
  'use strict';

  /* ---------- Tema claro/escuro ---------- */
  var root = document.documentElement;
  var THEME_KEY = 'focus-theme';

  function applyTheme(theme) {
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'light'
        ? '<i class="ph-fill ph-moon"></i>'
        : '<i class="ph-fill ph-sun"></i>';
      btn.setAttribute('title', theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro');
    }
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(savedTheme || 'dark');

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#theme-toggle');
    if (!btn) return;
    var current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (err) {}
  });

  /* ---------- Menu mobile ---------- */
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('#nav-toggle');
    var nav = document.getElementById('main-nav');
    if (toggle && nav) {
      nav.classList.toggle('open');
      return;
    }
    // Fecha o menu ao clicar em um link (mobile)
    if (nav && nav.classList.contains('open') && e.target.closest('#main-nav a')) {
      nav.classList.remove('open');
    }
  });

  /* ---------- Toasts ---------- */
  window.showToast = function (message, icon) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<i class="ph-fill ' + (icon || 'ph-check-circle') + '"></i><span>' + message + '</span>';
    region.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  };

  /* ---------- Marca o link ativo na navegação ---------- */
  var path = window.location.pathname;
  document.querySelectorAll('#main-nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === path || (href !== '/dashboard' && path.indexOf(href) === 0)) {
      a.classList.add('active');
    }
  });
})();
