(() => {
  if (window.__tabRouterV71) return;
  window.__tabRouterV71 = true;
  const $ = id => document.getElementById(id);

  function activate(button) {
    const page = button?.dataset?.page;
    if (!page || !$(page)) return;
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    $(page).classList.add('active');
    window.dispatchEvent(new CustomEvent('treasury:pagechange', {detail:{page}}));
  }

  function bind() {
    document.querySelectorAll('.tab[data-page]').forEach(button => {
      button.onclick = () => activate(button);
      button.dataset.v71Router = '1';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else setTimeout(bind, 0);
  window.addEventListener('pageshow', bind);
})();
