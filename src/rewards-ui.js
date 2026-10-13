import { REWARDS_POLICY, projection, solText } from './rewards.js';

// Separate from WebGL boot: financial information remains reachable without 3D.
export function initRewards() {
  const $ = id => document.getElementById(id);
  const backdrop = $('rewards-backdrop');
  if (!backdrop) return;
  let previousFocus;
  const close = () => { backdrop.hidden = true; previousFocus?.focus(); };
  const open = () => {
    previousFocus = document.activeElement;
    document.querySelectorAll('.dialog-backdrop').forEach(el => { el.hidden = true; });
    backdrop.hidden = false;
    $('rewards-close').focus();
  };
  for (const id of ['rewards-button', 'rewards-more-button']) $(id)?.addEventListener('click', open);
  $('rewards-close').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  // The city has its own modal handler. Keep keyboard handling local to this sheet.
  document.addEventListener('keydown', e => {
    if (backdrop.hidden) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    if (e.key === 'Tab') {
      e.stopImmediatePropagation();
      const nodes = [...backdrop.querySelectorAll('button,input,a[href]')].filter(el => !el.disabled && !el.hidden);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  }, true);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', dateStyle: 'medium' }).format(new Date(REWARDS_POLICY.startsAt));
  $('rewards-cutoff').textContent = date;
  $('rewards-cutoff').dateTime = REWARDS_POLICY.startsAt;
  $('rewards-mint').textContent = REWARDS_POLICY.mint;
  function update() {
    const result = projection({ volume: $('rewards-volume').value, creatorPercent: $('rewards-rate').value,
      averageBalance: $('rewards-average').value, eligibleAverageBalance: $('rewards-eligible').value });
    for (const [id, key] of [['total','total'],['holders','holders'],['burn','buyback'],['project','project'],['personal','personal']]) {
      $('rewards-' + id).textContent = solText(result?.[key]);
    }
    $('rewards-error').textContent = result ? (result.personal === null ? 'Enter both average balances to estimate your share. Your balance cannot exceed the eligible total.' : '')
      : 'Enter a trading volume and a creator fee between 0% and 100%. Use decimals, without commas.';
  }
  $('rewards-form').addEventListener('submit', e => e.preventDefault());
  $('rewards-form').addEventListener('input', update);
  $('rewards-example').addEventListener('click', () => {
    $('rewards-volume').value = '1000'; $('rewards-rate').value = '0.3';
    $('rewards-average').value = '100000'; $('rewards-eligible').value = '10000000';
    $('rewards-example-note').hidden = false; update();
  });
  $('rewards-form').addEventListener('input', () => { $('rewards-example-note').hidden = true; });
  update();
  if (new URLSearchParams(location.search).get('dashboard') === 'rewards') open();
}
