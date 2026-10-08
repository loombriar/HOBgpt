// Coordinate the native details menus without changing their accessible controls.
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.sewing-nav');
  if (!nav) return;
  const menus = [...nav.querySelectorAll('details.nav-dropdown')];
  const closeAll = (except = null) => {
    for (const menu of menus) if (menu !== except) menu.open = false;
  };

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) closeAll(menu);
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('.nav-dropdown-menu a, .nav-dropdown-menu button')) {
        menu.open = false;
      }
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.sewing-nav details.nav-dropdown')) closeAll();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const openMenu = menus.find(menu => menu.open);
      closeAll();
      if (openMenu) {
        openMenu.querySelector('summary')?.focus();
        event.preventDefault();
      }
    }
  });
});
