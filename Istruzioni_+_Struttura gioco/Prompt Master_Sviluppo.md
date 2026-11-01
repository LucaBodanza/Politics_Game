Voglio sviluppare un videogioco web multiplayer co-op di simulazione politica italiana intitolato "Lex & Order". 

Ecco le specifiche chiave:
1. **Networking e Lobby:** Un giocatore crea la stanza (Host) e genera un codice invito a 6 cifre (es. CHIGI-XX) che gli amici possono inserire per entrare.
2. **Setup Iniziale:** All'avvio della partita viene generato un "Problema Reale d'Emergenza" (es. crisi economica, caro bollette, emergenza trasporti) con determinati KPI da rispettare.
3. **Fase di Gioco:** I giocatori collaborano/competono per redigere gli articoli di legge, negoziare i commi e infine votare nell'emiciclo simulato.
4. **Stack:** Utilizziamo HTML, Tailwind CSS, JavaScript (con logica mock per il multiplayer locale/simulato tramite codici stanza o WebSockets leggeri) e componenti visivi puliti in stile dashboard istituzionale moderna.

Inizia col scrivermi l'architettura dei file del progetto, la struttura base del codice HTML/JS per la schermata principale, la generazione della lobby con codice invito e la schermata di creazione della legge. Procediamo un modulo alla volta!