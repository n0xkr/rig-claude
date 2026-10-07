import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('escapa vírgula, aspas e quebra de linha (RFC 4180)', () => {
    const csv = toCsv([{ a: 'x,y', b: 'diz "oi"', c: 'l1\nl2' }], ['a', 'b', 'c']);
    expect(csv.split('\r\n')[1]).toBe('"x,y","diz ""oi""","l1\nl2"');
  });

  it('neutraliza texto que o Excel interpretaria como fórmula', () => {
    const csv = toCsv(
      [{ a: '=HYPERLINK("http://x")', b: '@cmd', c: '+1+1', d: '-2+3' }],
      ['a', 'b', 'c', 'd'],
    );
    const cells = csv.split('\r\n')[1]!;
    expect(cells).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(cells).toContain(",'@cmd,");
    expect(cells).toContain(",'+1+1,'-2+3");
  });

  it('não altera números (inclusive negativos) nem valores vazios', () => {
    const csv = toCsv([{ a: -12.5, b: '-12,5', c: null, d: 7 }], ['a', 'b', 'c', 'd']);
    expect(csv.split('\r\n')[1]).toBe('-12.5,"-12,5",,7');
  });
});
