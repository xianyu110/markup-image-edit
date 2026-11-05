export const SITE = {
  name: 'Markup Image Edit',
  title: 'Markup Image Edit — Circle the Area, Describe the Change, Precise AI Edits',
  description:
    'Upload an image, circle or paint over the exact area to change, and type an instruction. Markup-guided AI editing with GPT Image 2.6 changes only that area — fix a word on a logo or recolor a product. Pay per edit.',
  keywords:
    'markup image edit, circle to edit image, ai image editor mask, change text in logo ai, change product color ai, gpt image 2.6 edit, precise ai photo edit, inpainting online',
};

export const EXAMPLES = [
  {
    slug: 'logo-text',
    title: 'Change one word on a logo',
    instruction: 'Change the word "BREW" to "ROAST" in the same bold font and dark brown color.',
    marked: '/examples/logo-marked.webp',
    before: '/examples/logo-before.webp',
    after: '/examples/logo-after.webp',
    note: 'Real result · GPT Image 2.6 Flare · medium quality · ~14 s',
  },
  {
    slug: 'product-color',
    title: 'Recolor a product, keep the scene',
    instruction: 'Recolor the bottle body from red to a matte cobalt blue powder-coat finish.',
    marked: '/examples/bottle-marked.webp',
    before: '/examples/bottle-before.webp',
    after: '/examples/bottle-after.webp',
    note: 'Real result · GPT Image 2.6 Flare · medium quality · ~13 s',
  },
];

export const FAQS: [string, string][] = [
  [
    'How is this different from a normal AI image edit?',
    'You draw red circles, outlines or brush strokes on top of your image. Those marks are sent to the model as a separate transparent "markup" layer (not burned into your photo), so the model knows exactly which region your instruction refers to and leaves the rest alone. The marks are removed from the finished image.',
  ],
  [
    'Which model does it use?',
    'OpenAI GPT Image 2.6 through its image edits endpoint with markup guidance. You can pick Flare (fast) or Sunburst (more detail). Both are priced the same by OpenAI.',
  ],
  [
    'Why not a classic mask?',
    'In our tests a hard mask makes the model fill the whole masked shape — circling a bottle with an oval mask turned the bottle itself into an oval. Markup keeps the original geometry and only changes what you describe inside the marks.',
  ],
  [
    'What does an edit cost?',
    'Every edit costs a fixed 10 credits, whatever the model or quality. Credits come in one-time packs (no subscription) starting at $6.90 for 50 credits. If an edit fails, the credits are refunded automatically.',
  ],
  [
    'What does GPT Image 2.6 cost upstream?',
    'OpenAI lists GPT Image 2.6 at $5 per 1M text input tokens, $8 per 1M image input tokens and $30 per 1M image output tokens. Flare and Sunburst have the same price, and there is no Batch half-price discount.',
  ],
  [
    'Which files can I upload?',
    'PNG, JPEG or WebP. SVG files cannot be used as edit input — export the SVG to PNG first. GIF is not supported. Large images are resized in your browser to at most 2048 px on the long side before upload.',
  ],
  [
    'Can I get an SVG or GIF back?',
    'No. The edits endpoint returns raster images only; you download a PNG.',
  ],
  [
    'Tips for good results',
    'Circle tightly around what should change, name the object in your instruction ("the word BREW", "the bottle body"), and say what must stay the same (font, lighting, background). For text, write the exact new word in quotes.',
  ],
];
