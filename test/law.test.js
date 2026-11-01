import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARTICLE_KINDS, KPIS, MAX_LAW_ARTICLES, MIN_FINAL_BUDGET } from '../shared/protocol.js';
import { GameError } from '../server/errors.js';
import {
  ARTICLE_BY_ID, ARTICLES, articleEffect, isRelevant, validateArticles,
} from '../server/game/articles.js';
import { CRISES } from '../server/game/catalog.js';
import {
  addArticle, projectLaw, removeArticle, setAgreement, submitBlocker, submitLaw,
} from '../server/game/law.js';
import { generateGame, publicGame } from '../server/game/state.js';
import { RoomRegistry } from '../server/rooms.js';
import { fakeConn } from './helpers.js';

const crisisById = (id) => CRISES.find((c) => c.id === id);

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof GameError, `errore inatteso: ${err}`);
    return err.code;
  }
  return assert.fail('era atteso un errore');
}

/** Una partita sulla crisi del caro bollette con indicatori noti, per calcoli prevedibili. */
function caroBollette(kpis = { approval: 40, budget: 50, europe: 40 }) {
  const game = generateGame({ seed: 1, crises: [crisisById('caro-bollette')] });
  game.kpis = { ...kpis };
  return game;
}

describe('catalogo degli articoli', () => {
  it('ha tutti i tipi, abbastanza articoli e id unici', () => {
    assert.ok(ARTICLES.length >= 24);
    assert.equal(new Set(ARTICLES.map((a) => a.id)).size, ARTICLES.length);
    for (const { id } of ARTICLE_KINDS) {
      assert.ok(ARTICLES.some((a) => a.kind === id), `nessun articolo di tipo ${id}`);
    }
  });

  it('rifiuta un catalogo malformato, dicendo dove', () => {
    const broken = (change) => {
      const list = structuredClone(ARTICLES);
      change(list[0], list);
      return list;
    };
    // list[0] è una spesa, list[13] una copertura
    const cases = [
      [[], /non vuoto/],
      [broken((a) => { a.kind = 'regalo'; }), /"kind" non valido/],
      [broken((a) => { delete a.effects.europe; }), /effects\.europe/],
      [broken((a) => { a.effects.approval = 25; }), /effects\.approval/],
      [broken((a) => { a.effects.budget = 3; }), /"spesa" deve avere/],
      [broken((a, list) => { list[13].effects.budget = -2; }), /"copertura" deve avere/],
      [broken((a) => { a.text = 'x'.repeat(161); }), /"text"/],
      [broken((a) => { a.tags = []; }), /"tags"/],
      [broken((a) => { a.title = ' '; }), /"title" mancante/],
      [broken((a, list) => { list[1].id = a.id; }), /duplicato/],
      [broken((a) => { a.id = 'Id Strano'; }), /"id"/],
    ];
    for (const [list, pattern] of cases) assert.throws(() => validateArticles(list), pattern);
  });

  it('ogni crisi ha almeno 3 articoli in tema, di almeno 2 tipi diversi', () => {
    for (const crisis of CRISES) {
      const relevant = ARTICLES.filter((a) => isRelevant(a, crisis));
      assert.ok(relevant.length >= 3, `${crisis.id}: solo ${relevant.length} articoli in tema`);
      assert.ok(new Set(relevant.map((a) => a.kind)).size >= 2, `${crisis.id}: un solo tipo in tema`);
    }
  });
});

describe('effetto degli articoli', () => {
  it('in tema vale quanto scritto nel catalogo', () => {
    const effect = articleEffect(ARTICLE_BY_ID.get('bonus-bollette'), crisisById('caro-bollette'));
    assert.deepEqual(effect, { approval: 8, budget: -12, europe: 2 });
  });

  it('fuori tema dimezza solo i guadagni di gradimento', () => {
    const offTopic = articleEffect(ARTICLE_BY_ID.get('pensioni-minime'), crisisById('caro-bollette'));
    assert.deepEqual(offTopic, { approval: 4, budget: -11, europe: 5 });
    // un calo di gradimento non si attenua: resta com'è
    const unpopular = articleEffect(ARTICLE_BY_ID.get('accise-carburanti'), crisisById('lavoro'));
    assert.deepEqual(unpopular, { approval: -8, budget: 10, europe: -4 });
  });
});

describe('proiezione della legge', () => {
  it('con la legge vuota coincide con la situazione attuale', () => {
    const game = caroBollette();
    const projection = projectLaw(game);
    assert.deepEqual(projection.kpis, game.kpis);
    assert.equal(projection.covered, true);
  });

  it('somma gli effetti degli articoli scelti', () => {
    const game = caroBollette();
    addArticle(game, 'bonus-bollette'); // +8 -12 +2
    addArticle(game, 'extraprofitti-energia'); // +2 +10 +2
    const projection = projectLaw(game);
    assert.deepEqual(projection.kpis, { approval: 50, budget: 48, europe: 44 });
    assert.equal(projection.finalBudget, 48);
    assert.equal(projection.covered, true);
  });

  it('valuta gli obiettivi sui valori dopo la legge', () => {
    const game = caroBollette();
    assert.equal(projectLaw(game).objectives[0].met, false); // gradimento 40 < 50
    addArticle(game, 'bonus-bollette');
    addArticle(game, 'extraprofitti-energia');
    const [approval, budget] = projectLaw(game).objectives;
    assert.deepEqual([approval.current, approval.projected, approval.met], [40, 50, true]);
    assert.deepEqual([budget.current, budget.projected, budget.met], [50, 48, true]);
  });

  it('una legge che manda il budget sotto zero non è coperta, anche se la barra si ferma a 0', () => {
    const game = caroBollette({ approval: 40, budget: 5, europe: 40 });
    addArticle(game, 'bonus-bollette'); // -12
    const projection = projectLaw(game);
    assert.equal(projection.finalBudget, -7);
    assert.equal(projection.kpis.budget, 0);
    assert.equal(projection.covered, false);
    assert.ok(projection.finalBudget < MIN_FINAL_BUDGET);
  });
});

describe('composizione della legge', () => {
  it('aggiunge e toglie articoli, rifiutando quelli sbagliati', () => {
    const game = caroBollette();
    assert.equal(codeOf(() => addArticle(game, 'articolo-inventato')), 'ARTICLE_UNKNOWN');
    assert.equal(codeOf(() => addArticle(game, 42)), 'ARTICLE_UNKNOWN');
    addArticle(game, 'bonus-bollette');
    assert.equal(codeOf(() => addArticle(game, 'bonus-bollette')), 'ALREADY_IN_LAW');
    assert.equal(codeOf(() => removeArticle(game, 'tetto-prezzo-energia')), 'NOT_IN_LAW');
    removeArticle(game, 'bonus-bollette');
    assert.deepEqual(game.law.articleIds, []);
  });

  it(`non accetta più di ${MAX_LAW_ARTICLES} articoli`, () => {
    const game = caroBollette();
    const ids = ARTICLES.slice(0, MAX_LAW_ARTICLES + 1).map((a) => a.id);
    for (const id of ids.slice(0, MAX_LAW_ARTICLES)) addArticle(game, id);
    assert.equal(codeOf(() => addArticle(game, ids.at(-1))), 'LAW_FULL');
  });

  it('ogni modifica al testo azzera i consensi', () => {
    const game = caroBollette();
    addArticle(game, 'bonus-bollette');
    setAgreement(game, 'a', true);
    setAgreement(game, 'b', true);
    assert.deepEqual(game.law.agreed.sort(), ['a', 'b']);
    addArticle(game, 'extraprofitti-energia');
    assert.deepEqual(game.law.agreed, []);
    setAgreement(game, 'a', true);
    removeArticle(game, 'extraprofitti-energia');
    assert.deepEqual(game.law.agreed, []);
  });

  it('il consenso si può dare e ritirare, ma non su una legge vuota', () => {
    const game = caroBollette();
    assert.equal(codeOf(() => setAgreement(game, 'a', true)), 'EMPTY_LAW');
    addArticle(game, 'bonus-bollette');
    setAgreement(game, 'a', true);
    setAgreement(game, 'a', true);
    assert.deepEqual(game.law.agreed, ['a']);
    setAgreement(game, 'a', false);
    assert.deepEqual(game.law.agreed, []);
    assert.equal(codeOf(() => setAgreement(game, 'a', 'sì')), 'BAD_REQUEST');
  });

  it('dice sempre perché la legge non si può ancora presentare', () => {
    const game = caroBollette({ approval: 40, budget: 5, europe: 40 });
    assert.equal(submitBlocker(game, ['a']).code, 'EMPTY_LAW');
    addArticle(game, 'bonus-bollette'); // budget 5 - 12 < 0
    assert.equal(submitBlocker(game, ['a']).code, 'NO_COVERAGE');
    addArticle(game, 'patrimoniale'); // +12
    assert.equal(submitBlocker(game, ['a']).code, 'NEEDS_AGREEMENT');
    setAgreement(game, 'a', true);
    assert.equal(submitBlocker(game, ['a']), null);
  });

  it('conta solo il consenso dei giocatori collegati', () => {
    const game = caroBollette();
    addArticle(game, 'bonus-bollette');
    setAgreement(game, 'a', true);
    assert.equal(submitBlocker(game, ['a', 'b']).code, 'NEEDS_AGREEMENT');
    assert.equal(submitBlocker(game, ['a']), null);
  });

  it('dopo la presentazione il testo non si cambia più', () => {
    const game = caroBollette();
    addArticle(game, 'bonus-bollette');
    setAgreement(game, 'a', true);
    submitLaw(game, ['a']);
    assert.equal(game.stage, 'submitted');
    assert.equal(codeOf(() => addArticle(game, 'tetto-prezzo-energia')), 'WRONG_STAGE');
    assert.equal(codeOf(() => removeArticle(game, 'bonus-bollette')), 'WRONG_STAGE');
    assert.equal(codeOf(() => setAgreement(game, 'a', false)), 'WRONG_STAGE');
    assert.equal(codeOf(() => submitLaw(game, ['a'])), 'WRONG_STAGE');
  });

  it('mostra ai giocatori la proiezione e il motivo del blocco', () => {
    const game = caroBollette();
    addArticle(game, 'bonus-bollette');
    const view = publicGame(game, ['a']);
    assert.deepEqual(view.law.articleIds, ['bonus-bollette']);
    assert.equal(view.law.max, MAX_LAW_ARTICLES);
    assert.deepEqual(view.law.projected, { approval: 48, budget: 38, europe: 42 });
    assert.equal(view.law.blocker.code, 'NEEDS_AGREEMENT');
    assert.equal(view.catalog.length, ARTICLES.length);
    assert.ok(view.catalog.every((a) => KPIS.every(({ id }) => Number.isInteger(a.effect[id]))));
  });
});

describe('giocabilità delle crisi', () => {
  const clamp = (value) => Math.min(100, Math.max(0, Math.round(value)));

  // Valori di partenza nel caso peggiore o migliore per gli obiettivi (la variazione è ±3).
  function startFor(crisis, favourable) {
    const start = { ...crisis.kpiStart };
    for (const { id } of KPIS) {
      const objective = crisis.objectives.find((o) => o.kpi === id);
      if (!objective) continue;
      const hardest = objective.op === 'gte' ? -3 : 3;
      start[id] += favourable ? -hardest : hardest;
    }
    return start;
  }

  // Quanti articoli servono, al minimo, per una legge coperta che raggiunga tutti gli obiettivi.
  function minArticles(crisis, start) {
    const effects = ARTICLES.map((a) => articleEffect(a, crisis));
    const sums = { ...start };
    const meets = () => sums.budget >= MIN_FINAL_BUDGET && crisis.objectives.every((o) => {
      const value = clamp(sums[o.kpi]);
      return o.op === 'gte' ? value >= o.value : value <= o.value;
    });
    let best = Infinity;
    const walk = (from, size) => {
      if (size > 0 && meets()) best = Math.min(best, size);
      if (size === MAX_LAW_ARTICLES || size + 1 >= best) return;
      for (let i = from; i < ARTICLES.length; i++) {
        for (const { id } of KPIS) sums[id] += effects[i][id];
        walk(i + 1, size + 1);
        for (const { id } of KPIS) sums[id] -= effects[i][id];
      }
    };
    const emptyLawWins = meets();
    walk(0, 0);
    return { best, emptyLawWins };
  }

  it('ogni crisi si può vincere, anche partendo nel caso peggiore, ma mai con un solo articolo', () => {
    for (const crisis of CRISES) {
      const hard = minArticles(crisis, startFor(crisis, false));
      assert.ok(hard.best <= MAX_LAW_ARTICLES, `${crisis.id}: impossibile nel caso peggiore`);
      assert.ok(hard.best >= 3, `${crisis.id}: troppo facile (bastano ${hard.best} articoli)`);

      const easy = minArticles(crisis, startFor(crisis, true));
      assert.equal(easy.emptyLawWins, false, `${crisis.id}: gli obiettivi sono già raggiunti all'inizio`);
      assert.ok(easy.best >= 2, `${crisis.id}: nel caso migliore basta un articolo`);
    }
  });
});

describe('la legge nella stanza', () => {
  function startedRoom() {
    const registry = new RoomRegistry({
      newGame: () => generateGame({ seed: 3, crises: [crisisById('caro-bollette')] }),
    });
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    for (const [conn, role] of [[a, 'presidente_consiglio'], [b, 'ministro_economia']]) {
      registry.setRole(conn, role);
      registry.setParty(conn, 'alleanza_civica');
      registry.setReady(conn, true);
    }
    registry.start(a);
    return { registry, a, b };
  }

  it('tutti i giocatori possono modificare il testo e lo vedono aggiornarsi', () => {
    const { registry, a, b } = startedRoom();
    registry.lawAdd(b, 'tavolo-sindacati');
    registry.lawAdd(a, 'bonus-bollette');
    assert.deepEqual(a.last('room').game.law.articleIds, ['tavolo-sindacati', 'bonus-bollette']);
    assert.deepEqual(b.last('room').game.law, a.last('room').game.law);
    registry.lawRemove(a, 'tavolo-sindacati');
    assert.deepEqual(b.last('room').game.law.articleIds, ['bonus-bollette']);
    registry.closeAll();
  });

  it('solo l\'host presenta la legge, e solo con il consenso di tutti i collegati', () => {
    const { registry, a, b } = startedRoom();
    registry.lawAdd(a, 'tavolo-sindacati');
    registry.lawAgree(a, true);
    assert.equal(codeOf(() => registry.lawSubmit(b)), 'NOT_HOST');
    assert.equal(codeOf(() => registry.lawSubmit(a)), 'NEEDS_AGREEMENT');
    registry.lawAgree(b, true);
    assert.equal(a.last('room').game.law.blocker, null);
    registry.lawSubmit(a);
    assert.equal(b.last('room').game.stage, 'submitted');
    registry.closeAll();
  });

  it('chi è disconnesso non blocca la presentazione', () => {
    const { registry, a, b } = startedRoom();
    registry.lawAdd(a, 'tavolo-sindacati');
    registry.lawAgree(a, true);
    registry.detach(b);
    registry.lawSubmit(a);
    assert.equal(a.last('room').game.stage, 'submitted');
    registry.closeAll();
  });

  it('chi esce dalla partita perde anche il suo consenso', () => {
    const { registry, a, b } = startedRoom();
    registry.lawAdd(a, 'tavolo-sindacati');
    registry.lawAgree(a, true);
    registry.lawAgree(b, true);
    registry.leave(b);
    assert.deepEqual(a.last('room').game.law.agreed, [a.player.id]);
    registry.closeAll();
  });

  it('i messaggi sulla legge non valgono in sala d\'attesa', () => {
    const registry = new RoomRegistry();
    const a = fakeConn();
    registry.create(a, 'Luca');
    assert.equal(codeOf(() => registry.lawAdd(a, 'bonus-bollette')), 'WRONG_PHASE');
    registry.closeAll();
  });
});
