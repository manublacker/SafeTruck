/*******************************************************
 * mobile.js
 *
 * Maneja el comportamiento del bottom sheet de búsqueda
 * en móvil. Inyecta la topbar compacta y el overlay
 * del sheet expandible en el DOM.
 *******************************************************/

// Detecto si estoy en móvil
function isMobile() {
    return window.innerWidth <= 768;
  }
  
  // Inyecto la topbar compacta arriba de la página
  function injectMobileTopbar() {
    const topbar = document.createElement("div");
    topbar.className = "mobile-topbar";
    topbar.innerHTML = `
      <span class="mobile-topbar-logo">🚚 SafeTruck</span>
      <button class="mobile-search-trigger" id="mobile-search-trigger">
        <span>🔍</span>
        <span id="mobile-trigger-text">¿A dónde vas?</span>
      </button>
    `;
    document.body.prepend(topbar);
  }
  
  // Inyecto el sheet expandible como overlay
  function injectMobileSheet() {
    const sheet = document.createElement("div");
    sheet.className = "mobile-search-sheet";
    sheet.id = "mobile-search-sheet";
  
    // Muevo el formulario original dentro del sheet
    const searchPanel = document.querySelector(".search-panel");
    const routeForm = searchPanel?.querySelector(".route-form");
  
    sheet.innerHTML = `
      <div class="mobile-search-sheet-content">
        <div class="mobile-sheet-handle"></div>
        <button class="mobile-sheet-close" id="mobile-sheet-close">✕</button>
        <div id="mobile-form-slot"></div>
      </div>
    `;
  
    document.body.appendChild(sheet);
  
    // Muevo el formulario al slot del sheet
    if (routeForm) {
      document.getElementById("mobile-form-slot").appendChild(routeForm);
    }
  
    // Escondo el panel original en móvil (ya no tiene contenido útil)
    if (searchPanel) {
      searchPanel.style.display = "none";
    }
  }
  
  // Abro el sheet
  function openSearchSheet() {
    const sheet = document.getElementById("mobile-search-sheet");
    if (sheet) {
      sheet.classList.add("open");
      // Foco en el input de destino al abrir
      setTimeout(() => {
        document.getElementById("destination-input")?.focus();
      }, 100);
    }
  }
  
  // Cierro el sheet
  function closeSearchSheet() {
    const sheet = document.getElementById("mobile-search-sheet");
    if (sheet) {
      sheet.classList.remove("open");
    }
  }
  
  // Actualizo el texto del trigger con el destino seleccionado
  export function updateMobileTrigger(destinationLabel) {
    const triggerText = document.getElementById("mobile-trigger-text");
    if (triggerText && destinationLabel) {
      triggerText.textContent = destinationLabel;
    }
  }
  
  // Inicializo todo el comportamiento móvil
  export function initMobileUI() {
    if (!isMobile()) return;
  
    injectMobileTopbar();
    injectMobileSheet();
  
    // Abro el sheet al tocar el trigger
    document.getElementById("mobile-search-trigger")?.addEventListener("click", openSearchSheet);
  
    // Cierro el sheet al tocar el botón X
    document.getElementById("mobile-sheet-close")?.addEventListener("click", closeSearchSheet);
  
    // Cierro el sheet al tocar el overlay (fuera del contenido)
    document.getElementById("mobile-search-sheet")?.addEventListener("click", (e) => {
      if (e.target.id === "mobile-search-sheet") {
        closeSearchSheet();
      }
    });
  
    // Cierro el sheet cuando se calcula la ruta
    document.getElementById("route-form")?.addEventListener("submit", () => {
      setTimeout(closeSearchSheet, 300);
    });
  }