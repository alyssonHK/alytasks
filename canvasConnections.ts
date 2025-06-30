// Este arquivo gerencia as conexões visuais entre cards usando SVG

export type CardConnection = {
  fromId: string;
  toId: string;
};

export function createSvgLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1.toString());
  line.setAttribute('y1', y1.toString());
  line.setAttribute('x2', x2.toString());
  line.setAttribute('y2', y2.toString());
  line.setAttribute('stroke', '#4f46e5');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  return line;
}

export function getCardCenter(card: HTMLElement): { x: number; y: number } {
  const rect = card.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 + window.scrollX,
    y: rect.top + rect.height / 2 + window.scrollY,
  };
}
