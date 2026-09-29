const fs = require('fs');
let c = fs.readFileSync('server/src/app.ts', 'utf8');

const oldCTE = `      WITH global_avg AS (
        SELECT COALESCE(AVG(rating), 0) as C FROM sets WHERE source = 'global' AND rating IS NOT NULL
      ),
      adds AS (
        SELECT source_label as global_id, 
               COUNT(DISTINCT user_id) as add_count,
               COUNT(rating) as rating_count,
               AVG(rating) as rating_avg
        FROM sets
        WHERE source = 'global'
        GROUP BY source_label
      ),
      interests AS (`;

const newCTE = `      WITH global_avg AS (
        SELECT COALESCE(AVG(rating), 0) as C FROM sets WHERE source = 'global' AND rating IS NOT NULL
      ),
      adds AS (
        SELECT source_label as global_id, 
               COUNT(DISTINCT user_id) as add_count,
               COUNT(rating) as rating_count,
               AVG(rating) as rating_avg
        FROM sets
        WHERE source = 'global'
        GROUP BY source_label
      ),
      my_copies AS (
        SELECT source_label as global_id, rating as my_rating
        FROM sets
        WHERE user_id = ? AND source = 'global' AND deleted = 0
      ),
      interests AS (`;

c = c.replace(oldCTE, newCTE);

const oldSelect = `        SELECT g.id, g.title, g.topic,
          (SELECT COUNT(*) FROM cards WHERE set_id = g.id AND deleted = 0) as card_count,
          COALESCE(adds.add_count, 0) as adds,
          COALESCE(adds.rating_count, 0) as rating_count,
          COALESCE(adds.rating_avg, 0) as rating_avg,
          (COALESCE(adds.rating_count, 0) * COALESCE(adds.rating_avg, 0) + 5 * (SELECT C FROM global_avg)) / (COALESCE(adds.rating_count, 0) + 5) as bayesian_rating,
          g.published_at,
          i.weight
        FROM sets g
        LEFT JOIN adds ON adds.global_id = g.id
        LEFT JOIN interests i ON i.category = g.category
        WHERE g.published = 1 
          AND g.user_id != ? 
          AND g.deleted = 0
          AND g.id NOT IN (SELECT source_label FROM sets WHERE user_id = ? AND source = 'global' AND deleted = 0)
          AND g.id NOT IN (SELECT set_id FROM set_reports WHERE user_id = ?)`;

const newSelect = `        SELECT g.id, g.title, g.topic,
          (SELECT COUNT(*) FROM cards WHERE set_id = g.id AND deleted = 0) as card_count,
          COALESCE(adds.add_count, 0) as adds,
          COALESCE(adds.rating_count, 0) as rating_count,
          COALESCE(adds.rating_avg, 0) as rating_avg,
          (COALESCE(adds.rating_count, 0) * COALESCE(adds.rating_avg, 0) + 5 * (SELECT C FROM global_avg)) / (COALESCE(adds.rating_count, 0) + 5) as bayesian_rating,
          my.my_rating,
          CASE WHEN my.global_id IS NOT NULL THEN 1 ELSE 0 END as added,
          g.published_at,
          i.weight
        FROM sets g
        LEFT JOIN adds ON adds.global_id = g.id
        LEFT JOIN my_copies my ON my.global_id = g.id
        LEFT JOIN interests i ON i.category = g.category
        WHERE g.published = 1 
          AND g.user_id != ? 
          AND g.deleted = 0
          AND g.id NOT IN (SELECT set_id FROM set_reports WHERE user_id = ?)`;

c = c.replace(oldSelect, newSelect);

fs.writeFileSync('server/src/app.ts', c);
