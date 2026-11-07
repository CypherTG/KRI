/**
 * Checks whether a From address at a domain can survive delivery.
 *
 * Gmail accepting a From header it does not own proves only that the message
 * left Gmail. Whether it reaches an inbox depends on SPF, DKIM and DMARC for the
 * sending domain, and a message that fails DMARC is rejected or junked by most
 * receivers — which would mean verification codes that never arrive.
 */

const DOMAIN = process.argv[2] || 'konstructum.com';

const RECORD_TYPES = ['MX', 'TXT'];

async function query(name, type) {
  // Using Google's DNS-over-HTTPS resolver: no extra dependency, and it returns
  // the same answers a mail server would see.
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url);
  if (!res.ok) return { status: res.status, answers: [] };
  const body = await res.json();
  return { status: body.Status, answers: body.Answer || [] };
}

function values(name, type) {
  return query(name, type).then((r) => r.answers.map((a) => String(a.data).replace(/^"|"$/g, '')));
}

console.log(`\n  domain: ${DOMAIN}\n`);

console.log('  MX — where mail for this domain is delivered:');
const mx = await values(DOMAIN, 'MX');
console.log(mx.length ? mx.map((v) => `    ${v}`).join('\n') : '    (none)');

console.log('\n  SPF — which servers may send as this domain:');
const spf = (await values(DOMAIN, 'TXT')).filter((v) => /^v=spf1/i.test(v));
console.log(spf.length ? spf.map((v) => `    ${v}`).join('\n') : '    (no SPF record)');

console.log('\n  DMARC — what receivers do when SPF and DKIM both fail:');
const dmarc = (await values(`_dmarc.${DOMAIN}`, 'TXT')).filter((v) => /^v=DMARC1/i.test(v));
console.log(dmarc.length ? dmarc.map((v) => `    ${v}`).join('\n') : '    (no DMARC record)');

console.log('\n  DKIM — common selectors, to see what signs mail from this domain:');
for (const selector of ['default', 'google', 'selector1', 'selector2', 'mail']) {
  const found = (await values(`${selector}._domainkey.${DOMAIN}`, 'TXT')).filter((v) => v.includes('p='));
  if (found.length) console.log(`    ${selector}: ${found[0].slice(0, 90)}…`);
}
console.log('    (only selectors listed above exist)');
console.log('');
