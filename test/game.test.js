import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KPI_MAX, KPI_MIN, KPIS } from '../shared/protocol.js';
import { CRISES, validateCrises } from '../server/game/catalog.js';
import { evaluateObjectives } from '../server/game/kpi.js';
import { buildTicker, kpiHeadlines } from '../server/game/news.js';
import { createRng } from '../server/game/rng.js';
import { generateGame, publicGame } from '../server/game/state.js';
import { RoomRegistry } from '../server/rooms.js';
import { fakeConn } from './helpers.js';

describe('catalogo delle crisi', () => {
  it('contiene crisi valide e tutte diverse', () => {
    assert.ok(CRISES.length >= 6);
    assert.equal(new Set(CRISES.map((c) => c.id)).size, CRISES.length);
  });

  const broken = (change) => {
    const list = structuredClone(CRISES);
    change(list[0], list);
    return list;
  };

  it('rifiuta un catalogo malformato, dicendo dove', () => {
    const cases = [
      [[], /non vuoto/],
      [broken((c) => { c.kpiStart.budget = 120; }), /kpiStart\.budget/],
      [broken((c) => { delete c.kpiStart.europe; }), /kpiStart\.europe/],
      [broken((c) => { c.objectives[0].kpi = 'pil'; }), /sconosciuto: pil/],
      [broken((c) => { c.objectives[0].op = 'eq'; }), /"op" non valido/],
      [broken((c) => { c.objectives = []; }), /objectives/],
      [broken((c) => { c.headlines = ['uno', 'due']; }), /almeno 3/],
      [broken((c) => { c.headlines[0] = 'x'.repeat(141); }), /oltre 140/],
      [broken((c, list) => { list[1].id = c.id; }), /duplicato/],
      [broken((c) => { c.id = 'Id Non Valido'; }), /"id"/],
      [broken((c) => { c.title = ' '; }), /"title" mancante/],
    ];
    for (const [list, pattern] of cases) assert.throws(() => validateCrises(list), pattern);
  });
});

describe('generatore casuale con seme', () => {
  const draw = (rng, n = 20) => Array.from({ length: n }, () => rng.next());

  it('ripete la stessa sequenza con lo stesso seme', () => {
    assert.deepEqual(draw(createRng(123)), draw(createRng(123)));
  });

  it('dà sequenze diverse con semi diversi', () => {
    assert.notDeepEqual(draw(createRng(1)), draw(createRng(2)));
  });

  it('next resta in [0, 1) e int raggiunge entrambi gli estremi', () => {
    const rng = createRng(5);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      assert.ok(x >= 0 && x < 1);
      const n = rng.int(-3, 3);
      assert.ok(n >= -3 && n <= 3);
      seen.add(n);
    }
    assert.equal(seen.size, 7);
  });
});

describe('generazione della partita', () => {
  it('è ripetibile con lo stesso seme', () => {
    assert.deepEqual(generateGame({ seed: 42 }), generateGame({ seed: 42 }));
  });

  it('con semi diversi escono tutte le crisi del catalogo', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 300; seed++) seen.add(generateGame({ seed }).crisis.id);
    assert.equal(seen.size, CRISES.length);
  });

  it('parte vicino ai valori della crisi, sempre dentro la scala', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { crisis, kpis } = generateGame({ seed });
      for (const { id } of KPIS) {
        assert.ok(Math.abs(kpis[id] - crisis.kpiStart[id]) <= 3, `${crisis.id}/${id}`);
        assert.ok(kpis[id] >= KPI_MIN && kpis[id] <= KPI_MAX);
      }
    }
  });

  it('non esce dalla scala nemmeno con valori di partenza ai bordi', () => {
    const edge = [{ ...CRISES[0], kpiStart: { approval: 0, budget: 100, europe: 100 } }];
    for (let seed = 1; seed <= 100; seed++) {
      for (const value of Object.values(generateGame({ seed, crises: edge }).kpis)) {
        assert.ok(value >= KPI_MIN && value <= KPI_MAX);
      }
    }
  });

  it('mostra ai giocatori solo ciò che serve, mai il seme', () => {
    const game = generateGame({ seed: 9 });
    const view = publicGame(game);
    assert.deepEqual(Object.keys(view).sort(), ['crisis', 'kpis', 'objectives', 'round', 'ticker']);
    assert.deepEqual(Object.keys(view.crisis).sort(), ['briefing', 'id', 'kicker', 'title']);
    assert.ok(!JSON.stringify(view).includes('seed'));
    for (const headline of game.crisis.headlines) assert.ok(view.ticker.includes(headline));
    assert.ok(view.objectives.every((o) => typeof o.met === 'boolean' && Number.isInteger(o.current)));
  });
});

describe('obiettivi', () => {
  it('conta come raggiunta una soglia esattamente uguale', () => {
    const kpis = { approval: 50, budget: 40, europe: 50 };
    const result = evaluateObjectives(kpis, [
      { kpi: 'approval', op: 'gte', value: 50 },
      { kpi: 'budget', op: 'gte', value: 41 },
      { kpi: 'europe', op: 'lte', value: 50 },
      { kpi: 'europe', op: 'lte', value: 49 },
    ]);
    assert.deepEqual(result.map((o) => o.met), [true, false, true, false]);
    assert.equal(result[0].current, 50);
  });
});

describe('notiziario', () => {
  it('parte dai titoli della crisi', () => {
    const game = generateGame({ seed: 3 });
    const { headlines } = game.crisis;
    assert.deepEqual(buildTicker(game).slice(0, headlines.length), headlines);
  });

  it('i titoli legati agli indicatori sono sempre frasi non vuote', () => {
    for (const approval of [0, 25, 50, 75, 100]) {
      for (const budget of [0, 25, 50, 75, 100]) {
        for (const europe of [0, 25, 50, 75, 100]) {
          const lines = kpiHeadlines({ approval, budget, europe });
          assert.ok(Array.isArray(lines));
          assert.ok(lines.every((line) => typeof line === 'string' && line.trim() !== ''));
        }
      }
    }
  });
});

describe("avvio della partita nella stanza", () => {
  function startedRoom() {
    const registry = new RoomRegistry({ newGame: () => generateGame({ seed: 7 }) });
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    for (const [conn, role] of [[a, 'presidente_consiglio'], [b, 'ministro_economia']]) {
      registry.setRole(conn, role);
      registry.setParty(conn, 'alleanza_civica');
      registry.setReady(conn, true);
    }
    return { registry, a, b };
  }

  it("non c'è nessuna partita finché si è in sala d'attesa", () => {
    const registry = new RoomRegistry();
    const a = fakeConn();
    registry.create(a, 'Luca');
    assert.equal(a.last('room').game, null);
    registry.closeAll();
  });

  it("all'avvio tutti ricevono la stessa partita, senza il seme", () => {
    const { registry, a, b } = startedRoom();
    registry.start(a);
    const expected = generateGame({ seed: 7 }).crisis.id;
    assert.equal(a.last('room').game.crisis.id, expected);
    assert.deepEqual(b.last('room').game, a.last('room').game);
    assert.ok(!JSON.stringify(b.last('room')).includes('"seed"'));
    registry.closeAll();
  });

  it('chi si ricollega rivede la partita in corso', () => {
    const { registry, a, b } = startedRoom();
    registry.start(a);
    const { token } = b.last('session');
    registry.detach(b);
    const again = fakeConn();
    registry.resume(again, token);
    assert.deepEqual(again.last('room').game, a.last('room').game);
    registry.closeAll();
  });
});
