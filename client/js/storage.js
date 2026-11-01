// Accesso sicuro al browser storage: può mancare o lanciare eccezioni (finestre private, blocchi).
function area(name) {
  return {
    get(key) {
      try { return window[name].getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window[name].setItem(key, value); } catch { /* storage non disponibile */ }
    },
    del(key) {
      try { window[name].removeItem(key); } catch { /* storage non disponibile */ }
    },
  };
}

export const local = area('localStorage'); // preferenze dell'utente (es. il nome)
export const session = area('sessionStorage'); // legato alla scheda: un posto per scheda
