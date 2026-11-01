# 🏛️ Lex & Order: La Repubblica dei Co-op (Working Title)

## 📌 Panoramica del Progetto
**Lex & Order** è un videogioco multiplayer cooperativo/competitivo locale e online in cui un gruppo di amici veste i panni di una classe politica sotto pressione. L'obiettivo è redigere, negoziare, emendare e far approvare leggi nazionali per risolvere crisi reali generate proceduralmente all'inizio di ogni partita, passando attraverso il vaglio del Parlamento (AI/NPC) e il voto finale dei giocatori.

---

## 🎮 Core Gameplay & Flusso di Gioco

1. **Lobby & Networking (Co-op Multiplayer):**
   * Un giocatore fa da *Host* e crea la stanza.
   * Il sistema genera un **Codice Invito a 6 caratteri** (es. `CHIGI-88`).
   * Gli altri amici inseriscono il codice nel menu principale per unirsi alla sessione.
   * Selezione dei ruoli politici (Presidente del Consiglio, Ministro dell'Economia, Leader dell'Opposizione, Capogruppo, ecc.).

2. **Fase 1: Il Decreto d'Emergenza (Inizio Partita):**
   * All'avvio, il sistema genera un *Problema Reale* (es. crisi energetica, inflazione record, riforma del lavoro, emergenza infrastrutturale).
   * Vengono assegnati vincoli di budget, indici di gradimento pubblico e pressioni dei media.

3. **Fase 2: Stesura e Negoziazione (3D Environment - Palazzo Chigi / Transatlantico):**
   * Inquadratura in stile 3D isometrico o semi-realistico dei corridoi del potere.
   * I giocatori discutono e compongono i commi della legge combinando vari "articoli di spesa", "coperture finanziarie" e "misure di favore".

4. **Fase 3: L'Aula e la Votazione (Montecitorio 3D):**
   * Spostamento nell'emiciclo parlamentare.
   * Prima approvazione tecnica delle commissioni e dei segretari di partito (gestiti da logiche di gioco/NPC).
   * **Votazione Finale:** I giocatori premono il pulsante elettronico (Verde = Sì, Rosso = No, Bianco = Astenuto).
   * Se la legge passa, si vedono gli effetti sull'indice del Paese nei turni successivi; se fallisce, cade il governo o scatta la crisi politica.

---

## 🛠️ Stack Tecnologico & Sviluppo (con Claude)
* **Frontend / UI:** HTML5, Tailwind CSS, JavaScript (per un'interfaccia pulita, reattiva e in stile plancia di comando istituzionale).
* **Motore 3D / Grafica:** Three.js o integrazione di asset low-poly stilizzati per gli ambienti (Palazzo Chigi e Aula).
* **Netcode:** WebRTC / Socket.io per la gestione della lobby e dei codici d'invito in tempo reale.
* **Logica e Bilanciamento:** Moduli scritti in Python/JS guidati da prompt avanzati per la generazione dei problemi reali.