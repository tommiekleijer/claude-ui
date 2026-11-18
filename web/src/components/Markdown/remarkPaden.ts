type MdNode = { type: string; value?: string; children?: MdNode[]; data?: unknown };

/** Absoluut pad (`/home/x/map met spatie/bestand.xlsx`, `~/foo.png`) in gewone tekst, ook met spaties en `:regel`. */
const PATH = /(?<=^|[\s(])(?:~\/|\/(?=[\w.@-]+\/))[^\n`]{0,300}?\.[A-Za-z0-9]{1,6}(?::\d+(?::\d+)?)?(?=$|[\s,;)\]"']|\.(?:\s|$))/g;
const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'definition', 'html']);

const split = (node: MdNode): MdNode[] => {
  const value = node.value ?? '';
  const parts: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(PATH)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ type: 'text', value: value.slice(last, start) });
    }
    // Als inlineCode met een marker; Markdown.tsx maakt daar een klikbaar pad van.
    parts.push({ type: 'inlineCode', value: match[0], data: { hProperties: { 'data-pad': 'ja' } } });
    last = start + match[0].length;
  }
  if (!parts.length) {
    return [node];
  }
  if (last < value.length) {
    parts.push({ type: 'text', value: value.slice(last) });
  }
  return parts;
};

const walk = (node: MdNode) => {
  if (!node.children || SKIP.has(node.type)) {
    return;
  }
  node.children = node.children.flatMap((child) => (child.type === 'text' ? split(child) : [child]));
  node.children.forEach(walk);
};

/** Maakt van bestandspaden in gewone tekst klikbare paden (Ctrl+klik), net als paden in backticks. */
const remarkPaden = () => (tree: MdNode) => walk(tree);

export default remarkPaden;
