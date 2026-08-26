/* AstraChat site logic — Supabase auth (same accounts as the app) + Stripe checkout */

const SB_URL = 'https://uobbfqyvdsctiqffniqi.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvYmJmcXl2ZHNjdGlxZmZuaXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg5MTEsImV4cCI6MjEwMzI3NDkxMX0.8PXSloPeIXr3P5LU6bbXdvEWfo8a5L9hVGELlT3HoWc';

const sb = window.supabase.createClient(SB_URL, ANON);
let authMode = 'signup';
let pendingTier = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  loadManifest();
  loadCharCount();
  loadRealCharacters();

  const { data } = await sb.auth.getSession();
  applyAuthState(data.session);
  sb.auth.onAuthStateChange((_e, s) => applyAuthState(s));

  if (new URLSearchParams(location.search).get('purchased') === '1') {
    toast('Astra+ is active. Open the app and keep going.');
    history.replaceState(null, '', location.pathname);
  }
});

/* ---------- manifest-driven download + stats ---------- */
async function loadManifest() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/tomamateimihaii/Uipate/main/update-manifest.json');
    if (!r.ok) return;
    const m = await r.json();
    const label = `Download v${m.version_name} APK`;
    for (const id of ['dl-hero', 'dl-main']) {
      const a = $(id);
      if (!a) continue;
      a.textContent = label;
      a.href = m.apk_url;
    }
    $('version-note').textContent =
      `Latest release: v${m.version_name}. Older installs update themselves in-app.`;
    if ($('stat-version')) $('stat-version').textContent = `v${m.version_name}`;
  } catch (_) { /* manifest not published yet */ }
}

async function loadCharCount() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/characters?visibility=in.(public,unlisted)&select=id`, {
      headers: { apikey: ANON },
    });
    if (!r.ok) return;
    $('stat-chars').textContent = String((await r.json()).length);
  } catch (_) {}
}

/* ---------- real characters strip ---------- */
async function loadRealCharacters() {
  const row = $('char-row');
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/characters?select=name,short_description,avatar_url&avatar_url=neq.&visibility=in.(public,unlisted)&order=created_at.desc&limit=24`,
      { headers: { apikey: ANON } },
    );
    if (!r.ok) throw 0;
    let list = await r.json();
    // prefer entries that actually have artwork
    list = list.filter((c) => c.avatar_url).slice(0, 7);
    if (list.length === 0) throw 0;

    row.innerHTML = list.map((c) => `
      <span class="char-chip">
        <img src="${esc(c.avatar_url)}" alt="" loading="lazy" width="30" height="30"
             onerror="this.outerHTML='<span class=&quot;chip-av&quot;>${esc((c.name || '?')[0].toUpperCase())}</span>'">
        ${esc(c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name)}
      </span>`).join('');
  } catch (_) {
    row.innerHTML = '<span class="char-chip">The library is offline for a moment.</span>';
  }
}

/* ---------- auth ---------- */
function setMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  $('auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  $('auth-sub').textContent = signup
    ? 'Same login as the app — one account everywhere.'
    : 'Sign in to buy or manage Astra+.';
  $('auth-name-wrap').hidden = !signup;
  $('auth-user-wrap').hidden = !signup;
  $('auth-go').textContent = signup ? 'Create account' : 'Sign in';
  $('auth-switch').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account';
  hideErr();
}

function openAuth(tier = null) {
  pendingTier = tier || null;
  setMode(pendingTier ? 'signup' : authMode);
  $('auth-modal').hidden = false;
}
function closeAuth() { $('auth-modal').hidden = true; }
function toggleMode() { setMode(authMode === 'signup' ? 'signin' : 'signup'); }
function showErr(msg) { const e = $('auth-error'); e.textContent = msg; e.hidden = false; }
function hideErr() { $('auth-error').hidden = true; }

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('auth-modal').hidden) closeAuth();
  if (!$('legal-modal').hidden) closeLegal();
});
$('auth-modal').addEventListener('click', (e) => { if (e.target === $('auth-modal')) closeAuth(); });
$('legal-modal').addEventListener('click', (e) => { if (e.target === $('legal-modal')) closeLegal(); });

async function submitAuth() {
  hideErr();
  const email = $('in-email').value.trim();
  const pass = $('in-pass').value;
  const name = $('in-name').value.trim();
  const uname = $('in-user').value.trim().toLowerCase();
  const go = $('auth-go');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr('Enter a valid email.');
  if (pass.length < 6) return showErr('Password must be at least 6 characters.');

  go.disabled = true;
  try {
    let res;
    if (authMode === 'signup') {
      if (name.length < 2) return showErr('Display name needs at least 2 characters.');
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) return showErr('Username: 3-20 chars, a-z / 0-9 / _ only.');
      res = await sb.auth.signUp({
        email,
        password: pass,
        options: { data: { display_name: name, username: uname } },
      });
      if (res.data?.user && res.data?.session) {
        await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${res.data.user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: ANON,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${res.data.session.access_token}`,
          },
          body: JSON.stringify({ username: uname }),
        });
      }
    } else {
      res = await sb.auth.signInWithPassword({ email, password: pass });
    }
    if (res.error) return showErr(friendly(res.error.message));

    closeAuth();
    applyAuthState(res.data.session);
    toast(`Signed in as ${email}`);

    if (pendingTier) {
      const tier = pendingTier;
      pendingTier = null;
      startCheckout(tier);
    }
  } finally {
    go.disabled = false;
  }
}

function friendly(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/already registered/i.test(msg)) return 'That email already has an account — sign in instead.';
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}

function applyAuthState(session) {
  const logged = !!session;
  $('btn-signin').hidden = logged;
  $('btn-account').hidden = !logged;
  if (logged) refreshTierBadge(session.access_token);
  else { $('tier-badge').hidden = true; }
}

async function signOut() {
  await sb.auth.signOut();
  applyAuthState(null);
  toast('Signed out.');
}

/* ---------- purchases ---------- */
async function buyOrLogin(tier) {
  const { data } = await sb.auth.getSession();
  if (!data.session) { openAuth(tier); return; }
  startCheckout(tier);
}

async function startCheckout(tier) {
  const { data } = await sb.auth.getSession();
  if (!data.session) return;

  try {
    const res = await fetch(`${SB_URL}/functions/v1/web-checkout`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ tier, origin: location.origin }),
    });
    const j = await res.json();
    if (j.configured === false) {
      toast('Payments go live soon — Astra+ will unlock instantly once connected.');
      return;
    }
    if (!j.url) { toast(j.error || 'Could not start checkout.'); return; }
    window.location.href = j.url; // → Stripe
  } catch (_) {
    toast('Network problem — try again.');
  }
}

async function refreshTierBadge(token) {
  try {
    const res = await fetch(`${SB_URL}/functions/v1/web-account`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const j = await res.json();
    const badge = $('tier-badge');
    badge.textContent = j.tier === 'pro' ? 'Pro' : j.tier === 'plus' ? 'Plus' : 'Free plan';
    badge.style.background = j.tier === 'free' ? '#2C2C31' : '#fff';
    badge.hidden = false;
  } catch (_) {}
}

/* ---------- legal ---------- */
const LEGAL = {
  terms: {
    title: 'Terms of service',
    html: `
<p><strong>Short version.</strong> AstraChat is entertainment software. Everything characters say is generated fiction. Don't rely on it for medical, legal, or financial anything.</p>
<p><strong>Your account.</strong> You're responsible for the activity under your login and for keeping your password safe. One person per account.</p>
<p><strong>Content you publish.</strong> Bots and comments you post are visible to other users. Keep them legal and civil; we filter and remove what isn't.</p>
<p><strong>Subscriptions.</strong> Paid plans renew monthly through Stripe until cancelled. Cancel anytime from the billing portal — access continues to the end of the paid period.</p>
<p><strong>Availability.</strong> The service is offered as-is while we're in beta. We may remove bots or comments that break these terms.</p>`,
  },
  privacy: {
    title: 'Privacy',
    html: `
<p><strong>What we store.</strong> Your email, display name, username, subscription state — held by our auth provider (Supabase). Messages are relayed through our servers to generate replies.</p>
<p><strong>Retention.</strong> Free accounts' server-side message copies auto-delete after seven days; the copy on your device stays until you clear it. Paid plans keep server copies so sync works between your devices.</p>
<p><strong>Public content.</strong> Bots you publish and comments you post are public by design. Deleting a bot removes it everywhere.</p>
<p><strong>What we don't do.</strong> We don't sell personal data and we don't train public models on your private chats.</p>
<p><strong>Contact.</strong> Questions about any of this — reach out before leaving a one-star review. We answer.</p>`,
  },
};

function openLegal(kind) {
  const doc = LEGAL[kind];
  if (!doc) return;
  $('legal-title').textContent = doc.title;
  $('legal-body').innerHTML = doc.html;
  $('legal-modal').hidden = false;
}
function closeLegal() { $('legal-modal').hidden = true; }
