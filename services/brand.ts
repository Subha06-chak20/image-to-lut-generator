/**
 * Lutcraft brand identity.
 *
 * One source of truth for the product name, descriptor, tagline and creator
 * credit, so the wordmark, the page title, exported files, the About dialog and
 * the application footer can never drift apart.
 */
export const BRAND = {
  name: 'Lutcraft',
  /** Split for the two-tone wordmark: "Lut" + "craft". */
  nameLead: 'Lut',
  nameTail: 'craft',
  descriptor: 'Color Grading & LUT Creation Studio',
  tagline: 'Create your look. Craft your colour.',
  version: '1.0.0',
  creator: 'Subhadeep Chakraborty',
  /** The understated credit, shown in About and the footer. */
  creatorCredit: 'Made by Subhadeep Chakraborty',
  creatorUrl: 'https://www.linkedin.com/in/subhadeep-chakraborty-0b8896332/',
  /** Used for the document title and downloaded file names. */
  fileSlug: 'Lutcraft',
} as const;

/** `Lutcraft — Color Grading & LUT Creation Studio` */
export const BRAND_TITLE = `${BRAND.name} — ${BRAND.descriptor}`;
