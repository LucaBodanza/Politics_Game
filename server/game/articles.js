import { readFileSync } from 'node:fs';
import { ARTICLE_KINDS, KPIS } from '../../shared/protocol.js';

const KIND_IDS = ARTICLE_KINDS.map((k) => k.id);
const EFFECT_LIMIT = 20;
const TEXT_MAX = 160;

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Controlla il catalogo degli articoli e, se qualcosa non va, dice dove. */
export function validateArticles(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('articles.json: deve essere un elenco non vuoto di articoli');
  }
  const seen = new Set();
  list.forEach((article, index) => {
    const where = `articles.json, articolo #${index + 1}${article?.id ? ` (${article.id})` : ''}`;
    const fail = (problem) => {
      throw new Error(`${where}: ${problem}`);
    };

    if (!isText(article?.id) || !/^[a-z0-9-]+$/.test(article.id)) fail('"id" mancante o non valido (solo a-z, 0-9, trattino)');
    if (seen.has(article.id)) fail('"id" duplicato');
    seen.add(article.id);
    if (!KIND_IDS.includes(article.kind)) fail(`"kind" non valido: ${article.kind}`);
    if (!isText(article.title)) fail('"title" mancante');
    if (!isText(article.text) || article.text.length > TEXT_MAX) fail(`"text" mancante o oltre ${TEXT_MAX} caratteri`);
    if (!Array.isArray(article.tags) || article.tags.length === 0 || !article.tags.every(isText)) fail('"tags" deve essere un elenco non vuoto di testi');

    for (const { id } of KPIS) {
      const value = article.effects?.[id];
      if (!Number.isInteger(value) || Math.abs(value) > EFFECT_LIMIT) {
        fail(`"effects.${id}" deve essere un intero tra -${EFFECT_LIMIT} e ${EFFECT_LIMIT}`);
      }
    }
    // Coerenza con il tipo: una spesa pesa sul budget, una copertura lo alimenta.
    if (article.kind === 'spesa' && article.effects.budget >= 0) fail('una "spesa" deve avere "effects.budget" negativo');
    if (article.kind === 'copertura' && article.effects.budget <= 0) fail('una "copertura" deve avere "effects.budget" positivo');
  });
  return list;
}

export const ARTICLES = validateArticles(
  JSON.parse(readFileSync(new URL('../data/articles.json', import.meta.url), 'utf8')),
);
export const ARTICLE_BY_ID = new Map(ARTICLES.map((article) => [article.id, article]));

/** Un articolo è "in tema" se condivide almeno un argomento con la crisi. */
export const isRelevant = (article, crisis) => article.tags.some((tag) => crisis.tags.includes(tag));

/**
 * Effetto reale di un articolo in una data crisi. Regola di partenza: fuori tema, i guadagni
 * di gradimento si dimezzano (l'opinione pubblica non premia ciò che non risolve il problema).
 * Budget e pressione europea non cambiano.
 */
export function articleEffect(article, crisis) {
  const { approval, budget, europe } = article.effects;
  const offTopic = !isRelevant(article, crisis);
  return { approval: offTopic && approval > 0 ? Math.round(approval / 2) : approval, budget, europe };
}

/** L'articolo come lo vedono i giocatori, già calcolato per la crisi in corso. */
export function publicArticle(article, crisis) {
  return {
    id: article.id,
    kind: article.kind,
    title: article.title,
    text: article.text,
    effect: articleEffect(article, crisis),
    relevant: isRelevant(article, crisis),
  };
}
