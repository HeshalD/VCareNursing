// Meta WhatsApp message templates for the admin inbox: lists the approved ones from the
// WhatsApp Business Account, turns each into a form-friendly definition, and validates what an
// admin fills in before it is sent.
//
// Env: META_WA_WABA_ID (WhatsApp Business Account id, WhatsApp > API Setup in the Meta dashboard)
//      META_WHATSAPP_TOKEN (needs the whatsapp_business_management permission to read templates)

const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const CACHE_MS = 5 * 60 * 1000;

// Never offered to admins: their variables are login secrets, and Meta sends them via the code flow.
const HIDDEN_TEMPLATES = new Set(['vcare_otp', 'vcare_staff_account_created']);

let cache = { at: 0, templates: null };

const countVariables = (text) => {
  const nums = [...String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

// Reduces Meta's component list to what the picker form needs. `supported: false` templates
// (location headers, flows, catalogs...) are still listed so admins see why they can't be sent here.
const toDefinition = (t) => {
  const byType = (type) => (t.components || []).find((c) => c.type === type);
  const header = byType('HEADER');
  const body = byType('BODY');
  const footer = byType('FOOTER');
  const buttons = (byType('BUTTONS')?.buttons || []).map((b) => ({
    type: b.type,
    text: b.text,
    url: b.url,
    urlVariableCount: b.type === 'URL' ? countVariables(b.url) : 0,
  }));

  let unsupported = null;
  if (t.parameter_format === 'NAMED') unsupported = 'Uses named variables, which this inbox cannot fill in yet.';
  else if (header && !['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format)) unsupported = `Header type ${header.format} is not supported here.`;
  else if (buttons.some((b) => !['URL', 'QUICK_REPLY', 'PHONE_NUMBER'].includes(b.type))) unsupported = 'Has a button type that is not supported here.';

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    header: header ? { format: header.format, text: header.text || null, variableCount: header.format === 'TEXT' ? countVariables(header.text) : 0 } : null,
    body: { text: body?.text || '', variableCount: countVariables(body?.text) },
    footer: footer?.text || null,
    buttons,
    supported: !unsupported,
    unsupportedReason: unsupported,
  };
};

const isConfigured = () => !!process.env.META_WA_WABA_ID;

// All approved, non-secret templates. Cached briefly so opening the picker is instant.
const listTemplates = async ({ force = false } = {}) => {
  if (!isConfigured()) return null;
  if (!force && cache.templates && Date.now() - cache.at < CACHE_MS) return cache.templates;

  const headers = { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` };
  let url = `${GRAPH_URL}/${process.env.META_WA_WABA_ID}/message_templates`;
  let params = { fields: 'name,language,status,category,parameter_format,components', status: 'APPROVED', limit: 100 };
  const all = [];
  for (let page = 0; url && page < 10; page++) {
    const res = await axios.get(url, { headers, params });
    all.push(...(res.data?.data || []));
    url = res.data?.paging?.next || null;
    params = undefined; // the `next` url already carries them
  }

  const templates = all
    .filter((t) => t.status === 'APPROVED' && t.category !== 'AUTHENTICATION' && !HIDDEN_TEMPLATES.has(t.name))
    .map(toDefinition)
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), templates };
  return templates;
};

const findTemplate = async (name, language) => {
  const templates = (await listTemplates()) || [];
  return templates.find((t) => t.name === name && (!language || t.language === language)) || null;
};

// Meta rejects body variables that contain newlines/tabs or runs of 4+ spaces (error 132018).
const cleanParam = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();

const render = (text, params) =>
  String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => params[Number(n) - 1] ?? m);

// Checks the admin's input against the template and builds Meta's `components` array.
// input: { bodyParams: string[], headerParams: string[], buttonParams: string[], headerMedia: {url, filename} }
// Returns { components, bodyParams, renderedBody, headerMedia } or throws an Error with a user-facing message.
const buildSend = (def, input = {}) => {
  if (!def.supported) throw new Error(def.unsupportedReason || 'This template cannot be sent from the inbox.');

  const bodyParams = (input.bodyParams || []).map(cleanParam);
  if (bodyParams.length !== def.body.variableCount || bodyParams.some((p) => !p)) {
    throw new Error(`Fill in all ${def.body.variableCount} message field(s).`);
  }

  const components = [];

  if (def.header) {
    if (def.header.format === 'TEXT') {
      if (def.header.variableCount) {
        const headerParams = (input.headerParams || []).map(cleanParam);
        if (headerParams.length !== def.header.variableCount || headerParams.some((p) => !p)) throw new Error('Fill in the header field.');
        components.push({ type: 'header', parameters: headerParams.map((text) => ({ type: 'text', text })) });
      }
    } else {
      if (!input.headerMedia?.url) throw new Error(`This template needs a ${def.header.format.toLowerCase()} attached.`);
      const kind = def.header.format.toLowerCase();
      const media = { link: input.headerMedia.url };
      if (kind === 'document' && input.headerMedia.filename) media.filename = input.headerMedia.filename;
      components.push({ type: 'header', parameters: [{ type: kind, [kind]: media }] });
    }
  }

  if (def.body.variableCount) {
    components.push({ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) });
  }

  const buttonParams = (input.buttonParams || []).map(cleanParam);
  let urlIdx = 0;
  def.buttons.forEach((b, index) => {
    if (b.type === 'URL' && b.urlVariableCount) {
      const text = buttonParams[urlIdx++];
      if (!text) throw new Error(`Fill in the link field for the "${b.text}" button.`);
      components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text }] });
    }
  });

  return {
    components,
    bodyParams,
    renderedBody: render(def.body.text, bodyParams),
    headerMedia: def.header && def.header.format !== 'TEXT' ? input.headerMedia : null,
  };
};

module.exports = { isConfigured, listTemplates, findTemplate, buildSend, render };
