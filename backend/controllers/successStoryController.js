const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { uploadBufferToS3 } = require('../config/s3Config');
const { sanitizeStoryHtml, htmlToText, makeExcerpt, parseYoutubeId, slugify } = require('../utils/storyContent');

const MAX_FEATURED = 6;

const PUBLIC_COLUMNS = `story_id, title, slug, summary, cover_image_url, youtube_video_id,
  person_name, display_date, published_at`;
const PUBLIC_WHERE = `status = 'PUBLISHED' AND is_archived = false`;

const roleOf = (req) => (Array.isArray(req.user.role) ? req.user.role[0] : req.user.role);

const logChange = (req, actionType, story, details = {}) =>
  logActivity({
    actorUserId: req.user.user_id,
    actorName: req.user.full_name || 'Admin',
    actorRole: roleOf(req),
    actionType,
    entityType: 'success_story',
    // activity_log.entity_id is a UUID column and story ids are integers, so the id lives in details.
    entityId: null,
    details: { story_id: story.story_id, title: story.title, ...details },
  }).catch((e) => console.error('Activity log failed (success stories):', e.message));

async function uniqueSlug(title, excludeId = null) {
  const base = slugify(title) || 'story';
  let slug = base;
  for (let n = 2; n < 500; n += 1) {
    const { rows } = await db.query(
      'SELECT 1 FROM success_stories WHERE slug = $1 AND ($2::int IS NULL OR story_id <> $2)',
      [slug, excludeId]
    );
    if (rows.length === 0) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

// A story can only go live with the essentials in place.
function publishProblems(story) {
  const problems = [];
  if (!story.title?.trim()) problems.push('a title');
  if (!story.summary?.trim()) problems.push('a short summary');
  // A YouTube video supplies its own thumbnail, so a cover image is only required without one.
  if (!story.cover_image_url && !story.youtube_video_id) problems.push('a cover image (or a YouTube video)');
  if (!story.youtube_video_id && !htmlToText(story.content_html)) problems.push('an article or a YouTube video');
  return problems;
}

// ── Public ──────────────────────────────────────────────────────────────────

exports.listPublic = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 30);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [rows, count] = await Promise.all([
      db.query(
        `SELECT ${PUBLIC_COLUMNS}, content_html FROM success_stories WHERE ${PUBLIC_WHERE}
         ORDER BY COALESCE(display_date, published_at::date) DESC, story_id DESC
         LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit]
      ),
      db.query(`SELECT COUNT(*)::int AS total FROM success_stories WHERE ${PUBLIC_WHERE}`),
    ]);
    const total = count.rows[0].total;
    // The list sends a short text teaser of each article, not the whole body.
    const data = rows.rows.map(({ content_html: html, ...story }) => ({ ...story, excerpt: makeExcerpt(html) }));
    res.json({ success: true, data, pagination: { page, limit, total, hasMore: page * limit < total } });
  } catch (err) {
    console.error('listPublic stories error:', err);
    res.status(500).json({ success: false, message: 'Failed to load success stories.' });
  }
};

exports.listFeatured = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM success_stories
       WHERE ${PUBLIC_WHERE} AND is_featured = true
       ORDER BY featured_order ASC, story_id DESC LIMIT $1`,
      [MAX_FEATURED]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listFeatured stories error:', err);
    res.status(500).json({ success: false, message: 'Failed to load featured stories.' });
  }
};

exports.getPublicBySlug = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${PUBLIC_COLUMNS}, content_html FROM success_stories WHERE slug = $1 AND ${PUBLIC_WHERE}`,
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Story not found.' });
    const others = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM success_stories
       WHERE ${PUBLIC_WHERE} AND story_id <> $1
       ORDER BY COALESCE(display_date, published_at::date) DESC, story_id DESC LIMIT 3`,
      [rows[0].story_id]
    );
    res.json({ success: true, data: rows[0], related: others.rows });
  } catch (err) {
    console.error('getPublicBySlug story error:', err);
    res.status(500).json({ success: false, message: 'Failed to load story.' });
  }
};

// ── Admin ───────────────────────────────────────────────────────────────────

exports.listAdmin = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT story_id, title, slug, summary, cover_image_url, youtube_video_id, person_name,
              display_date, status, is_archived, is_featured, featured_order, published_at,
              created_at, updated_at
       FROM success_stories ORDER BY updated_at DESC`
    );
    res.json({ success: true, data: rows, maxFeatured: MAX_FEATURED });
  } catch (err) {
    console.error('listAdmin stories error:', err);
    res.status(500).json({ success: false, message: 'Failed to load stories.' });
  }
};

exports.getAdminById = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM success_stories WHERE story_id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Story not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getAdminById story error:', err);
    res.status(500).json({ success: false, message: 'Failed to load story.' });
  }
};

// Validates the editable fields shared by create and update. Returns { error } or { values }.
function readFields(body) {
  const title = (body.title || '').trim();
  if (!title) return { error: 'Title is required.' };
  if (title.length > 200) return { error: 'Title must be 200 characters or fewer.' };

  let youtubeId = null;
  if (body.youtube_url && String(body.youtube_url).trim()) {
    youtubeId = parseYoutubeId(body.youtube_url);
    if (!youtubeId) return { error: 'That does not look like a valid YouTube link.' };
  }

  const displayDate = body.display_date ? String(body.display_date).slice(0, 10) : null;
  if (displayDate && Number.isNaN(Date.parse(displayDate))) return { error: 'Display date is not valid.' };

  return {
    values: {
      title,
      summary: (body.summary || '').trim().slice(0, 600) || null,
      cover_image_url: body.cover_image_url || null,
      youtube_video_id: youtubeId,
      content_html: sanitizeStoryHtml(body.content_html) || null,
      person_name: (body.person_name || '').trim().slice(0, 150) || null,
      display_date: displayDate,
    },
  };
}

exports.create = async (req, res) => {
  try {
    const { error, values } = readFields(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const slug = await uniqueSlug(values.title);
    const { rows } = await db.query(
      `INSERT INTO success_stories
         (title, slug, summary, cover_image_url, youtube_video_id, content_html, person_name,
          display_date, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [values.title, slug, values.summary, values.cover_image_url, values.youtube_video_id,
        values.content_html, values.person_name, values.display_date, req.user.user_id]
    );
    await logChange(req, 'SUCCESS_STORY_CREATED', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('create story error:', err);
    res.status(500).json({ success: false, message: 'Failed to create story.' });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await db.query('SELECT * FROM success_stories WHERE story_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Story not found.' });
    const current = existing.rows[0];

    const { error, values } = readFields(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    // A live story must stay publishable; editing can't strip out its essentials.
    if (current.status === 'PUBLISHED') {
      const missing = publishProblems(values);
      if (missing.length) {
        return res.status(400).json({
          success: false,
          message: `A published story needs ${missing.join(', ')}. Unpublish it first to remove these.`,
        });
      }
    }

    // The slug is only regenerated while the story has never been published, so shared links stay valid.
    const slug = current.published_at ? current.slug : await uniqueSlug(values.title, current.story_id);
    const { rows } = await db.query(
      `UPDATE success_stories SET title=$1, slug=$2, summary=$3, cover_image_url=$4, youtube_video_id=$5,
         content_html=$6, person_name=$7, display_date=$8, updated_by=$9, updated_at=CURRENT_TIMESTAMP
       WHERE story_id=$10 RETURNING *`,
      [values.title, slug, values.summary, values.cover_image_url, values.youtube_video_id,
        values.content_html, values.person_name, values.display_date, req.user.user_id, current.story_id]
    );
    await logChange(req, 'SUCCESS_STORY_UPDATED', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('update story error:', err);
    res.status(500).json({ success: false, message: 'Failed to update story.' });
  }
};

exports.setPublished = async (req, res) => {
  try {
    const publish = req.body.published === true;
    const existing = await db.query('SELECT * FROM success_stories WHERE story_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Story not found.' });
    const story = existing.rows[0];

    if (publish) {
      if (story.is_archived) {
        return res.status(400).json({ success: false, message: 'Restore this story from the archive before publishing.' });
      }
      const missing = publishProblems(story);
      if (missing.length) {
        return res.status(400).json({ success: false, message: `Before publishing, add ${missing.join(', ')}.` });
      }
    }

    // Unpublishing also drops it from the landing page.
    const { rows } = await db.query(
      `UPDATE success_stories SET status=$1,
         published_at = CASE WHEN $2 THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
         is_featured = CASE WHEN $2 THEN is_featured ELSE false END,
         updated_by=$3, updated_at=CURRENT_TIMESTAMP
       WHERE story_id=$4 RETURNING *`,
      [publish ? 'PUBLISHED' : 'DRAFT', publish, req.user.user_id, story.story_id]
    );
    await logChange(req, publish ? 'SUCCESS_STORY_PUBLISHED' : 'SUCCESS_STORY_UNPUBLISHED', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('setPublished story error:', err);
    res.status(500).json({ success: false, message: 'Failed to change publish status.' });
  }
};

exports.setArchived = async (req, res) => {
  try {
    const archived = req.body.archived === true;
    // Archiving hides the story and removes it from the landing page; restoring brings it back as a draft.
    const { rows } = await db.query(
      `UPDATE success_stories SET is_archived=$1,
         is_featured = CASE WHEN $1 THEN false ELSE is_featured END,
         status = CASE WHEN $1 THEN status ELSE 'DRAFT' END,
         updated_by=$2, updated_at=CURRENT_TIMESTAMP
       WHERE story_id=$3 RETURNING *`,
      [archived, req.user.user_id, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Story not found.' });
    await logChange(req, archived ? 'SUCCESS_STORY_ARCHIVED' : 'SUCCESS_STORY_RESTORED', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('setArchived story error:', err);
    res.status(500).json({ success: false, message: 'Failed to change archive status.' });
  }
};

// One-click feature / unfeature of a single story. New ones are appended to the end of the order.
exports.toggleFeatured = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const featured = req.body.featured === true;
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM success_stories WHERE story_id = $1 FOR UPDATE', [req.params.id]);
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Story not found.' });
    }
    const story = found.rows[0];

    if (featured) {
      if (story.status !== 'PUBLISHED' || story.is_archived) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Add this story to the Success Stories page before featuring it on the landing page.' });
      }
      if (!story.is_featured) {
        const stats = await client.query('SELECT COUNT(*)::int AS n, COALESCE(MAX(featured_order), 0) AS max_order FROM success_stories WHERE is_featured = true');
        if (stats.rows[0].n >= MAX_FEATURED) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `The landing page can show ${MAX_FEATURED} stories. Remove one first.` });
        }
        await client.query('UPDATE success_stories SET is_featured = true, featured_order = $1 WHERE story_id = $2', [stats.rows[0].max_order + 1, story.story_id]);
      }
    } else {
      await client.query('UPDATE success_stories SET is_featured = false, featured_order = 0 WHERE story_id = $1', [story.story_id]);
    }
    await client.query('COMMIT');
    await logChange(req, 'SUCCESS_STORY_FEATURED_UPDATED', story, { featured });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('toggleFeatured story error:', err);
    res.status(500).json({ success: false, message: 'Failed to update the landing page.' });
  } finally {
    client.release();
  }
};

// Replaces the whole landing-page selection: ordered_ids is the featured set, in display order.
exports.setFeatured = async (req, res) => {
  const ids = Array.isArray(req.body.ordered_ids) ? req.body.ordered_ids.map(Number) : null;
  if (!ids || ids.some((n) => !Number.isInteger(n))) {
    return res.status(400).json({ success: false, message: 'ordered_ids must be a list of story ids.' });
  }
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ success: false, message: 'Duplicate stories in the list.' });
  }
  if (ids.length > MAX_FEATURED) {
    return res.status(400).json({ success: false, message: `At most ${MAX_FEATURED} stories can be featured.` });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (ids.length) {
      const ok = await client.query(
        `SELECT story_id FROM success_stories
         WHERE story_id = ANY($1::int[]) AND status='PUBLISHED' AND is_archived=false`,
        [ids]
      );
      if (ok.rows.length !== ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Only published, non-archived stories can be featured.' });
      }
    }
    await client.query('UPDATE success_stories SET is_featured=false, featured_order=0 WHERE is_featured=true OR featured_order<>0');
    for (let i = 0; i < ids.length; i += 1) {
      await client.query('UPDATE success_stories SET is_featured=true, featured_order=$1 WHERE story_id=$2', [i + 1, ids[i]]);
    }
    await client.query('COMMIT');
    await logChange(req, 'SUCCESS_STORY_FEATURED_UPDATED', { story_id: 0, title: 'Landing page selection' }, { ordered_ids: ids });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('setFeatured stories error:', err);
    res.status(500).json({ success: false, message: 'Failed to update the landing page selection.' });
  } finally {
    client.release();
  }
};

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Attach an image.' });
    const ext = IMAGE_TYPES[req.file.mimetype];
    if (!ext) return res.status(400).json({ success: false, message: 'Only JPG, PNG or WebP images are allowed.' });
    const key = `vcare_success_stories/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadBufferToS3(req.file.buffer, key, req.file.mimetype);
    res.json({ success: true, url });
  } catch (err) {
    console.error('uploadImage story error:', err);
    res.status(500).json({ success: false, message: 'Failed to upload image.' });
  }
};
