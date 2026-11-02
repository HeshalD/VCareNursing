// Shared logo for the client documents (quotation / invoices / receipt).
//
// The hosted VCareLogo.png is a 500x499 canvas whose visible mark only occupies
// x 99-399, y 177-324 (about 60% x 30%), so dropping it in with a plain width leaves a
// large transparent margin and a small-looking logo. This crops the canvas down to the mark
// and scales it so the mark is LOGO_WIDTH px wide.
//
// statementTemplate.html is static HTML, so it carries a copy of the same numbers.
const LOGO_URL = 'https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png';

const LOGO_WIDTH = 180;                       // visible width of the mark on the page (px)
const SCALE = LOGO_WIDTH / 300;               // 300 = visible mark width in the source image
const logoCss = `
        .logo-crop { width: ${LOGO_WIDTH}px; height: ${Math.round(147 * SCALE)}px; overflow: hidden; position: relative; flex-shrink: 0; }
        .logo-crop img { position: absolute; width: ${(500 * SCALE).toFixed(1)}px; height: auto; left: -${(99 * SCALE).toFixed(1)}px; top: -${(177 * SCALE).toFixed(1)}px; }`;

const logoHtml = (alt = 'VCare Nursing') =>
  `<div class="logo-crop"><img src="${LOGO_URL}" alt="${alt}" /></div>`;

module.exports = { LOGO_URL, logoCss, logoHtml };
