const RANKS = [
  'Member',
  'Sub Leader',
  'Leader',
  'AUX',
  'ADM',
  'Manager'
];
const TEAM_NAMES = ['Administration & Staff Operations', 'Knowledge', 'Discord'];
const pages = {
  dashboard: 'Dashboard',
  roster: 'Team Roster',
  tasks: 'Task Log',
  monitor: 'Leaderboards',
  discord: 'Discord team',
  discordLeaderboard: 'Discord Leaderboard',
  knowledgeLeaderboard: 'Knowledge Leaderboard',
  timeoutLogs: 'Timeout Logs',
  faq: 'Team Hub',
  staff: 'Staff search',
  history: 'My Logs',
  account: 'My Account',
  pending: 'Pending accounts',
  keys: 'Access Keys',
  permissions: 'Permissions',
  help: 'Help center'
};
let state = {
  user: null,
  profile: null,
  memberships: [],
  activeTeam: null,
  teams: [],
  loading: true
};

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials = n => String(n || 'KNG').split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();
const rankLevel = r => RANKS.indexOf(r);

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style = 'position:fixed;right:20px;bottom:20px;background:#0b1b29;color:#fff;padding:10px 13px;border-radius:7px;font-size:11px;box-shadow:0 10px 25px rgba(0,0,0,.18);z-index:99';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.style.opacity = 0, 2400);
}

function authScreen(message='') {
  app.innerHTML = `<div class="auth-screen"><div class="auth-box">
    <div class="auth-brand"><div class="brandmark">K</div><div><strong>KNG</strong><small style="display:block;color:#7e919e;font-size:8px;letter-spacing:1.5px;margin-top:2px">STAFF PORTAL</small></div></div>
    <h1>Sign in to KNG</h1>
    <p>Your staff portal is private. You need an active KNG account to enter.</p>
    ${message ? `<div class="callout" style="margin-bottom:12px">${esc(message)}</div>` : ''}
    <form onsubmit="event.preventDefault();login()">
      <div class="auth-field"><label>EMAIL</label><input id="loginEmail" type="email" autocomplete="email" placeholder="you@example.com" required></div>
      <div class="auth-field"><label>PASSWORD</label><input id="loginPassword" type="password" autocomplete="current-password" placeholder="Your password" required></div>
      <div id="loginError"></div>
      <div class="auth-actions">
  <button class="action primary" type="submit">Sign in</button>
  <button class="action" type="button" onclick="forgotPassword()">Forgot password?</button>
  <button class="action" type="button" onclick="showRegister()">Create account with access key</button>
</div>
    </form>
    <div class="auth-note">New accounts require a valid one-time access key and administrator review before they can sign in.</div>
  </div></div>`;
}

function showRegister() {
  registerScreen();
}

function registerScreen(error='') {
  app.innerHTML = `<div class="auth-screen"><div class="auth-box">
    <div class="auth-brand"><div class="brandmark">K</div><div><strong>KNG</strong><small style="display:block;color:#7e919e;font-size:8px;letter-spacing:1.5px;margin-top:2px">STAFF PORTAL</small></div></div>
    <h1>Create your account</h1>
    <p>Use the one-time access key you were given. Your initial team and rank are attached to that key.</p>
    ${error ? `<div class="callout" style="margin-bottom:12px">${esc(error)}</div>` : ''}
    <form onsubmit="event.preventDefault();register()">
      <div class="auth-field"><label>ACCESS KEY</label><input id="regKey" placeholder="KNG-XXXXXXXXXXXXXXXXXXXX" autocomplete="off" required></div>
      <div class="auth-field"><label>NAME</label><input id="regName" placeholder="Your name" autocomplete="name" required></div>
      <div class="auth-field"><label>EMAIL</label><input id="regEmail" type="email" placeholder="you@example.com" autocomplete="email" required></div>
      <div class="auth-field"><label>PASSWORD</label><input id="regPassword" type="password" placeholder="Create a password" autocomplete="new-password" minlength="8" required></div>
      <div id="regError"></div>
      <div class="auth-actions"><button class="action primary" type="submit">Create account</button><button class="action" type="button" onclick="authScreen()">Back to sign in</button></div>
    </form>
  </div></div>`;
}

function pendingScreen(status='pending') {
  const rejected = status === 'rejected';
  app.innerHTML = `<div class="auth-screen"><div class="auth-box">
    <div class="auth-brand"><div class="brandmark">K</div><div><strong>KNG</strong><small style="display:block;color:#7e919e;font-size:8px;letter-spacing:1.5px;margin-top:2px">STAFF PORTAL</small></div></div>
    <h1>${rejected ? 'Application not approved' : 'Application pending'}</h1>
    <p>${rejected ? 'Your KNG account application was not approved. Portal access remains disabled.' : 'Your account has been created and is waiting for an administrator to review it.'}</p>
    <div class="callout"><b>${rejected ? 'Access unavailable' : 'Nothing else is required right now.'}</b><br><span style="font-size:11px">${rejected ? 'If this was unexpected, contact a KNG administrator.' : 'Once approved, sign in with the same email and password.'}</span></div>
    <div class="auth-actions"><button class="action primary" onclick="signOut()">Back to sign in</button></div>
  </div></div>`;
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.innerHTML = '';
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { err.innerHTML = `<div class="callout" style="margin-bottom:10px">${esc(error.message)}</div>`; return; }
  await boot();
}
async function forgotPassword() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const err = document.getElementById('loginError');

  err.innerHTML = '';

  if (!email) {
    err.innerHTML = `<div class="callout" style="margin-bottom:10px">Enter your email address first.</div>`;
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (error) {
    err.innerHTML = `<div class="callout" style="margin-bottom:10px">${esc(error.message)}</div>`;
    return;
  }

  err.innerHTML = `
    <div class="callout" style="margin-bottom:10px">
      <b>Reset email sent</b><br>
      <span style="font-size:11px">
        Check your email for a password reset link.
      </span>
    </div>
  `;
}

function resetPasswordScreen() {
  app.innerHTML = `<div class="auth-screen"><div class="auth-box">
    <div class="auth-brand">
      <div class="brandmark">K</div>
      <div>
        <strong>KNG</strong>
        <small style="display:block;color:#7e919e;font-size:8px;letter-spacing:1.5px;margin-top:2px">
          STAFF PORTAL
        </small>
      </div>
    </div>

    <h1>Reset your password</h1>
    <p>Choose a new password for your KNG account.</p>

    <form onsubmit="event.preventDefault();updatePassword()">
      <div class="auth-field">
        <label>NEW PASSWORD</label>
        <input
          id="newPassword"
          type="password"
          autocomplete="new-password"
          placeholder="New password"
          minlength="8"
          required
        >
      </div>

      <div class="auth-field">
        <label>CONFIRM PASSWORD</label>
        <input
          id="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Confirm new password"
          minlength="8"
          required
        >
      </div>

      <div id="resetError"></div>

      <div class="auth-actions">
        <button class="action primary" type="submit">
          Update password
        </button>
      </div>
    </form>
  </div></div>`;
}
async function updatePassword() {
  const password = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const err = document.getElementById('resetError');

  err.innerHTML = '';

  if (password.length < 8) {
    err.innerHTML = `
      <div class="callout" style="margin-bottom:10px">
        Password must be at least 8 characters.
      </div>
    `;
    return;
  }

  if (password !== confirm) {
    err.innerHTML = `
      <div class="callout" style="margin-bottom:10px">
        The passwords do not match.
      </div>
    `;
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password
  });

  if (error) {
    err.innerHTML = `
      <div class="callout" style="margin-bottom:10px">
        ${esc(error.message)}
      </div>
    `;
    return;
  }

  await supabaseClient.auth.signOut();

  authScreen('Your password has been updated. You can now sign in.');
}
async function register() {
  const key = document.getElementById('regKey').value.trim().toUpperCase();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const err = document.getElementById('regError');
  err.innerHTML = '';
  if (!key || !name || !email || password.length < 8) { err.innerHTML = '<div class="callout" style="margin-bottom:10px">Complete every field. Passwords must be at least 8 characters.</div>'; return; }

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) { err.innerHTML = `<div class="callout" style="margin-bottom:10px">${esc(error.message)}</div>`; return; }
  if (!data.user) { err.innerHTML = '<div class="callout" style="margin-bottom:10px">Supabase did not return a user account.</div>'; return; }

  const { error: rpcError } = await supabaseClient.rpc('submit_registration', {
    p_user_id: data.user.id,
    p_display_name: name,
    p_email: email,
    p_key_value: key
  });

  if (rpcError) {
    await supabaseClient.auth.signOut();
    err.innerHTML = `<div class="callout" style="margin-bottom:10px">${esc(rpcError.message)}</div>`;
    return;
  }

  await supabaseClient.auth.signOut();
  app.innerHTML = `<div class="auth-screen"><div class="auth-box">
    <div class="auth-brand"><div class="brandmark">K</div><div><strong>KNG</strong><small style="display:block;color:#7e919e;font-size:8px;letter-spacing:1.5px;margin-top:2px">STAFF PORTAL</small></div></div>
    <h1>Application submitted</h1>
    <p>Your account has been created and sent to an administrator for review.</p>
    <div class="callout"><b>Pending review</b><br><span style="font-size:11px">You will be able to sign in once your application is approved.</span></div>
    <div class="auth-actions"><button class="action primary" onclick="authScreen()">Back to sign in</button></div>
  </div></div>`;
}

async function signOut() {
  await supabaseClient.auth.signOut();
  state = { user:null, profile:null, memberships:[], activeTeam:null, teams:[], loading:false };
  authScreen();
}

async function loadProfile() {
  if (!state.user) return false;
  const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (profileError) throw profileError;
  state.profile = profile;
  if (!profile) return false;
  if (profile.status !== 'active') return false;
  const { data: memberships, error: membershipError } = await supabaseClient
    .from('team_memberships').select('id,user_id,team_id,rank,status,joined_at,teams(id,name,description,active)').eq('user_id', state.user.id).eq('status','active');
  if (membershipError) throw membershipError;
  state.memberships = (memberships || []).map(m => ({...m, team: m.teams?.name || 'Unknown'}));
  state.activeTeam = state.activeTeam && state.memberships.some(m=>m.team===state.activeTeam) ? state.activeTeam : (state.memberships[0]?.team || null);
  return true;
}

function activeMembership() {
  return (
    state.memberships.find(m => m.team === state.activeTeam) ||
    state.memberships[0] ||
    null
  );
}

function activeRank() {
  return activeMembership()?.rank || 'Member';
}

function isAdmin() {
  return state.memberships.some(
    m =>
      m.team === 'Administration & Staff Operations' &&
      m.status === 'active' &&
      m.rank === 'ADM'
  );
}

function isManager() {
  return state.memberships.some(
    m =>
      m.status === 'active' &&
      m.rank === 'Manager'
  );
}

function canManageTeam(team = state.activeTeam) {
  return (
    isManager() ||
    state.memberships.some(
      m =>
        m.team === team &&
        m.status === 'active' &&
        ['AUX', 'ADM'].includes(m.rank)
    )
  );
}

function canMonitor(team = state.activeTeam) {
  return (
    isManager() ||
    state.memberships.some(
      m =>
        m.team === team &&
        m.status === 'active'
    )
  );
}

function canCreateFaq(team = state.activeTeam) {
  return state.memberships.some(
    m =>
      m.team === team &&
      m.status === 'active' &&
      rankLevel(m.rank) >= rankLevel('Leader')
  );
}

function canManageFaq(team = state.activeTeam) {
  return (
    isManager() ||
    state.memberships.some(
      m =>
        m.team === team &&
        m.status === 'active' &&
        rankLevel(m.rank) >= rankLevel('AUX')
    )
  );
}

function togglePartyMode() {
  const toggle = document.getElementById('partyToggle');

  if (!toggle) return;

  const isOn = toggle.classList.toggle('active');

  document.body.classList.toggle('party-mode', isOn);

  localStorage.setItem('partyMode', isOn ? 'on' : 'off');

  const status = toggle.querySelector('small');

  if (status) {
    status.textContent = isOn ? 'ON' : 'OFF';
  }
}

function loadPartyMode() {
  const toggle = document.getElementById('partyToggle');

  if (!toggle) return;

  const isOn = localStorage.getItem('partyMode') === 'on';

  toggle.classList.toggle('active', isOn);
  document.body.classList.toggle('party-mode', isOn);

  const status = toggle.querySelector('small');

  if (status) {
    status.textContent = isOn ? 'ON' : 'OFF';
  }
}
function shell() {
  const m = activeMembership();
  const team = m?.team || 'Team';

const nav = [
  ['dashboard','⌂','Dashboard',true],

  ['roster','♙','Team Roster',canMonitor()],

  ['tasks','✓','Task Log',true],

  ['monitor','▤','Leaderboards',canMonitor()],

  // Discord-only navigation
  ...(team === 'Discord'
    ? [
        [
          'discord',
          '◷',
          'Discord team',
          isManager() ||
          state.memberships.some(
            x =>
              x.team === 'Discord' &&
              x.status === 'active'
          )
        ],

        [
          'discordLeaderboard',
          '▤',
          'Discord Leaderboard',
          isManager() ||
          state.memberships.some(
            x =>
              x.team === 'Discord' &&
              x.status === 'active' &&
              ['AUX', 'ADM'].includes(x.rank)
          )
        ],

        [
          'timeoutLogs',
          '⏱',
          'Timeout Logs',
          isManager() ||
          state.memberships.some(
            x =>
              x.team === 'Discord' &&
              x.status === 'active'
          )
        ]
      ]
    : []),

  // Knowledge-only navigation
  ...(team === 'Knowledge'
    ? [
        [
          'knowledgeLeaderboard',
          '▤',
          'Knowledge Leaderboard',
          isManager() ||
          state.memberships.some(
            x =>
              x.team === 'Knowledge' &&
              x.status === 'active' &&
              ['AUX', 'ADM'].includes(x.rank)
          )
        ]
      ]
    : []),

  ['faq','▤','Team Hub',true],

  ['history','↺','My Logs',true],

  ['staff','⌕','Staff search',canMonitor()],

  ['account','◎','My Account',true]
];

const admin = [
  ['pending','◌','Pending accounts',isAdmin() || isManager()],
  ['keys','⌘','Access Keys',isAdmin() || isManager()],
  ['permissions','⚙','Permissions',isAdmin() || isManager()]
];

app.innerHTML = `<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="brandmark">K</div>
      <div>
        <strong>KNG</strong>
        <small>STAFF PORTAL</small>
      </div>
    </div>

    <div class="team-switcher" onclick="openTeamSwitcher()">
      <div class="mini">${esc((team[0] || 'K').toUpperCase())}</div>
      <div>
        <b id="sideTeam">${esc(team)}</b>
        <span id="sideRank">${esc(m?.rank || 'Rank')}</span>
      </div>
      <div class="chev">⌄</div>
    </div>

    <div class="label">WORKSPACE</div>

    <nav class="nav" id="nav">
      ${nav.filter(x => x[3]).map(x => `
        <a
          href="#${x[0]}"
          data-page="${x[0]}"
        >
          <i class="ico">${x[1]}</i>
          <span>${x[2]}</span>
        </a>
      `).join('')}
    </nav>

    <div class="label">ADMINISTRATION</div>

    <nav class="nav" id="adminNav">
      ${admin.filter(x => x[3]).map(x => `
        <a href="#${x[0]}" data-page="${x[0]}">
          <i class="ico">${x[1]}</i>
          <span>${x[2]}</span>
        </a>
      `).join('')}
    </nav>

    <div class="bottom">

  <button
  class="party-toggle"
  id="partyToggle"
  type="button"
  onclick="togglePartyMode()"
>
    <span class="party-toggle-left">
      <span class="party-icon">✦</span>

      <span>
        <b>Franklin Mode</b>
        <small>OFF</small>
      </span>
    </span>

    <span class="party-switch">
      <span class="party-knob"></span>
    </span>
  </button>

  <a href="#help">
    <span>Help center</span>
    <span>›</span>
  </a>

  <div class="status">
    <span class="green-dot"></span>
    All systems operational
  </div>

</div>
  </aside>

  <<main class="main">

<div class="party-decorations" aria-hidden="true">

  <!-- LARGE KITTY -->
  <img
    class="party-art kitty-large"
    src="assets/hello-kitty-large.png"
    alt=""
  >

  <!-- SEATED KITTY -->
  <img
    class="party-art kitty-seated"
    src="assets/hello-kitty-seated.png"
    alt=""
  >
<!-- EXTRA SEATED KITTIES -->
<img
  class="party-art kitty-seated kitty-seated-left"
  src="assets/hello-kitty-seated.png"
  alt=""
>

<img
  class="party-art kitty-seated kitty-seated-bottom"
  src="assets/hello-kitty-seated.png"
  alt=""
>
  <!-- DARK KITTY -->
  <img
    class="party-art kitty-dark"
    src="assets/hello-kitty-dark.png"
    alt=""
  >


  <!-- LARGE BOW -->
  <img
    class="party-art party-bow-large"
    src="assets/bow-large.png"
    alt=""
  >

  <!-- SMALL BOW -->
  <img
    class="party-art party-bow-small"
    src="assets/bow-small.png"
    alt=""
  >

  <!-- TOP SPARKLE -->
<img
  class="party-art party-sparkles"
  src="assets/sparkles.png"
  alt=""
>

<!-- BOTTOM SPARKLES -->
<img
  class="party-art party-sparkle-bottom sparkle-1"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-bottom sparkle-2"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-bottom sparkle-3"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-bottom sparkle-4"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-bottom sparkle-5"
  src="assets/sparkles.png"
  alt=""
>
  

  <!-- HEART CLUSTER -->
  <img
    class="party-art party-hearts"
    src="assets/hearts-pair.png"
    alt=""
  >

  <!-- FILLED HEART -->
  <img
    class="party-art party-heart-filled"
    src="assets/heart-filled.png"
    alt=""
  >

  <!-- SOFT HEART -->
  <img
    class="party-art party-heart-soft"
    src="assets/heart-soft.png"
    alt=""
  >

  <!-- OUTLINE HEARTS -->
  <img
    class="party-art party-heart-outline"
    src="assets/heart-outline.png"
    alt=""
  >
  <!-- EXTRA DECORATION -->

<img
  class="party-art extra-sparkle-1"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art extra-sparkle-2"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art extra-sparkle-3"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art extra-sparkle-4"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art extra-heart-1"
  src="assets/heart-outline.png"
  alt=""
>

<img
  class="party-art extra-heart-2"
  src="assets/heart-filled.png"
  alt=""
>

<img
  class="party-art extra-heart-3"
  src="assets/heart-soft.png"
  alt=""
>

<img
  class="party-art extra-bow-1"
  src="assets/bow-small.png"
  alt=""
>

  <!-- EXTRA PARTY SPARKLES -->
<img
  class="party-art party-sparkle-extra sparkle-extra-1"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-extra sparkle-extra-2"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art party-sparkle-extra sparkle-extra-3"
  src="assets/sparkles.png"
  alt=""
>

<!-- EXTRA HEARTS -->
<img
  class="party-art party-heart-extra heart-extra-1"
  src="assets/heart-outline.png"
  alt=""
>

<img
  class="party-art party-heart-extra heart-extra-2"
  src="assets/heart-filled.png"
  alt=""
>

<img
  class="party-art party-heart-extra heart-extra-3"
  src="assets/heart-soft.png"
  alt=""
>

<!-- EXTRA BOW -->
<img
  class="party-art party-bow-extra"
  src="assets/bow-small.png"
  alt=""
>
<!-- LOWER PARTY DECORATION FIELD -->

<img
  class="party-art lower-kitty-left"
  src="assets/hello-kitty-seated.png"
  alt=""
>

<img
  class="party-art lower-kitty-right"
  src="assets/hello-kitty-seated.png"
  alt=""
>

<img
  class="party-art lower-sparkle-left"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art lower-sparkle-center"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art lower-sparkle-right"
  src="assets/sparkles.png"
  alt=""
>

<img
  class="party-art lower-heart-left"
  src="assets/heart-outline.png"
  alt=""
>

<img
  class="party-art lower-heart-center"
  src="assets/heart-filled.png"
  alt=""
>

<img
  class="party-art lower-heart-right"
  src="assets/heart-soft.png"
  alt=""
>

<img
  class="party-art lower-bow-left"
  src="assets/bow-small.png"
  alt=""
>

<img
  class="party-art lower-bow-right"
  src="assets/bow-small.png"
  alt=""
>
</div>

  <header class="topbar">
      <div class="crumb" id="crumb">KNG / Dashboard</div>

      <div class="top-actions">
        <div class="help" onclick="location.hash='help'">?</div>

        <div class="profile" id="profile">
          <div class="avatar">${initials(state.profile.display_name)}</div>
          <span>${esc(state.profile.display_name)}</span>
          <span class="arrow">⌄</span>

          <div class="profile-menu">
            <button onclick="location.hash='account'">My account</button>
            <button onclick="signOut()">Sign out</button>
          </div>
        </div>
      </div>
    </header>

    <div id="content"></div>
  </main>
</div>`;

  document.getElementById('profile').addEventListener('click', e => {
    if (!e.target.closest('.profile-menu button')) {
      document.getElementById('profile').classList.toggle('open');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.profile')) {
      document.getElementById('profile')?.classList.remove('open');
    }
  }, { once: true });
}

function layout(title, sub, body, action='') { return `<div class="content"><div class="page-title"><div><h1>${title}</h1><p>${sub}</p></div>${action}</div>${body}<div class="footer">KNG Staff Portal · Secure workspace</div></div>`; }
function forbidden(title,msg) { return layout(title,'Access restricted.',`<div class="card section"><div class="callout"><b>${esc(msg)}</b></div></div>`); }

async function loadTeamRoster(teamName) {
  const { data, error } = await supabaseClient.rpc(
    'get_team_roster',
    {
      p_team_name: teamName
    }
  );

  if (error) {
    console.error('Failed to load team roster:', error);
    throw error;
  }

  return data || [];
}
async function roster() {
  const team = state.activeTeam;

  if (!team) {
    return forbidden(
      'Team roster',
      'No active team is selected.'
    );
  }

  if (!canMonitor(team)) {
    return forbidden(
      'Team roster',
      'You do not have access to this team roster.'
    );
  }

 let members = [];

try {
  members = await loadTeamRoster(team);

  // Get the latest activity for every staff member
  const { data: logs, error: logError } = await supabaseClient
    .from('task_logs')
    .select('user_id, completed_at')
    .eq('team_name', team)
    .order('completed_at', { ascending: false });

  if (logError && logError.code !== '42P01') {
    throw logError;
  }

  const latestActivity = new Map();

  (logs || []).forEach(log => {
    if (!latestActivity.has(log.user_id)) {
      latestActivity.set(log.user_id, log.completed_at);
    }
  });

  const TWO_DAYS = 48 * 60 * 60 * 1000;
  const now = Date.now();

  members = members.map(member => {
    const lastActivity = latestActivity.get(member.user_id);

    const isActive =
      lastActivity &&
      (now - new Date(lastActivity).getTime()) <= TWO_DAYS;

    return {
      ...member,
      status: isActive ? 'Active' : 'Inactive'
    };
  });

} catch (error) {
  console.error('Failed to load roster:', error);

    return layout(
      'Team roster',
      `${team} staff roster.`,
      `
        <div class="card">
          <div class="section">
            <h3>Unable to load roster</h3>
            <p>
              The roster could not be loaded right now.
            </p>
          </div>
        </div>
      `
    );
  }

  const groups = {
    Management: members.filter(m =>
      ['Manager', 'ADM', 'AUX'].includes(m.rank)
    ),

    Leadership: members.filter(m =>
      ['Leader', 'Sub Leader'].includes(m.rank)
    ),

    Members: members.filter(m =>
      m.rank === 'Member'
    )
  };

  const renderGroup = (title, people) => `
    <div class="card" style="margin-top:14px">
      <div class="section">
        <h3>${title}</h3>
        <p>${people.length} staff member${people.length === 1 ? '' : 's'}</p>
      </div>

      <div class="table-wrap">
        <table class="roster-table">
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Rank</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${
              people.length
                ? people.map(member => `
                    <tr>
                      <td>
                        <b>${esc(member.display_name)}</b>
                      </td>

                      <td>
                        ${esc(member.rank)}
                      </td>

                      <td>
                        ${
                          member.joined_at
                            ? new Date(member.joined_at).toLocaleDateString('en-GB')
                            : '—'
                        }
                      </td>

                      <td>
                        <span class="status-badge ${member.status === 'Inactive' ? 'inactive' : ''}">
  ${esc(member.status)}
</span>
                      </td>
                    </tr>
                  `).join('')
                : `
                    <tr>
                      <td colspan="4">
                        <span style="color:#8b949d">
                          No staff in this group.
                        </span>
                      </td>
                    </tr>
                  `
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  return layout(
    `${team} roster`,
    `View the current ${team} staff roster.`,
    `
      ${renderGroup('Management', groups.Management)}
      ${renderGroup('Leadership', groups.Leadership)}
      ${renderGroup('Members', groups.Members)}
    `
  );
}

async function fetchLogs(team, mine=false) {
  let q = supabaseClient
    .from('task_logs')
    .select('*')
    .eq('team_name', team)
    .order('completed_at', { ascending: false });

  if (mine) {
    q = q.eq('user_id', state.user.id);
  }

  const { data, error } = await q;

  if (error && error.code !== '42P01') {
    throw error;
  }

  const logs = data || [];

  if (!logs.length) {
    return [];
  }

  const userIds = [
    ...new Set(logs.map(log => log.user_id))
  ];

  const { data: profiles, error: profileError } =
    await supabaseClient
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);

  if (profileError) {
    console.warn('Could not load staff names:', profileError);
  }

  const profileMap = new Map(
    (profiles || []).map(profile => [
      profile.id,
      profile.display_name
    ])
  );

  return logs.map(log => ({
    ...log,
    display_name:
      profileMap.get(log.user_id) ||
      log.user_id
  }));
}

function buildActivityLeaderboard(logs, activityType = null) {

  const filtered = activityType
    ? logs.filter(log => log.activity_type === activityType)
    : logs;

  const counts = {};

  filtered.forEach(log => {

    const userId = log.user_id;

    if (!counts[userId]) {
      counts[userId] = {
        user_id: userId,
        display_name: log.display_name || userId,
        count: 0
      };
    }

    counts[userId].count++;
  });

  return Object.values(counts)
    .sort((a, b) => b.count - a.count);
}
async function dashboard() {
  const team=activeMembership()?.team||'Team';
  const {data: tasks=[],error} = await supabaseClient.from('tasks').select('*').eq('team_name',team).eq('active',true);
  if(error && error.code!=='42P01') throw error;
  const logs=await fetchLogs(team,true).catch(()=>[]); const all=await fetchLogs(team).catch(()=>[]);
  const today=logs.filter(x=>new Date(x.completed_at).toDateString()===new Date().toDateString()).length;
  return layout('Dashboard','Your KNG team workspace.',`<div class="hero"><div><div class="eyebrow" style="color:#f1b9bf">${esc(team)} TEAM</div><h2>Welcome, ${esc(state.profile.display_name)}</h2><p>You are assigned to ${esc(team)} as ${esc(activeRank())}. Record your work here so team activity can actually be monitored.</p></div><div class="hero-icon">✓</div></div><div class="stats"><div class="card stat"><small>My tasks today</small><strong>${today}</strong><span>Completed by you</span></div><div class="card stat"><small>Team tasks</small><strong>${tasks.length}</strong><span>Active task types</span></div><div class="card stat"><small>Team activity</small><strong>${all.length}</strong><span>Logged completions</span></div><div class="card stat"><small>Team access</small><strong style="font-size:16px">${esc(activeRank())}</strong><span>Your current rank</span></div></div><div class="grid2"><div class="card section"><h3>My workspace</h3><p>Your active team and permissions are based on this membership.</p><div class="team-row"><div><b>${esc(team)}</b><small>${esc(activeRank())} · ${state.memberships.length} team membership${state.memberships.length===1?'':'s'}</small></div><span class="tag">Active</span></div></div><div class="card section"><h3>Quick links</h3><p>Jump to the areas you will use most.</p><div class="form-line"><button class="action" onclick="location.hash='tasks'">My tasks</button><button class="action" onclick="location.hash='faq'">Team FAQ</button>${state.memberships.some(x=>x.team==='Discord')?'<button class="action" onclick="location.hash=\'discord\'">Discord team</button>':''}</div></div></div>`);
}

async function tasksPage() {
  const team = activeMembership()?.team;

  if (!team) {
    return forbidden(
      'Record activity',
      'You are not assigned to a team.'
    );
  }

  const activityTypes = team === 'Discord'
    ? [
        'Admin Requests',
        'Verbal Warnings',
        'Kicks',
        'Punishments',
        'Bans',
        'General Chat / Announcements & Giveaways',
        'Waiting for Support'
      ]
      : [
      'Interview',
      'Mentoring',
      'Application',
      'Transfer ticket',
      'Training Messaged',
      'Training Complete'
    ];
  const logs = await fetchLogs(team, true).catch(() => []);

  return layout(
    'Record activity',
    'Record the work you have completed for your active team.',
    `
    <div class="card form-card">

      <h3>Record completed work</h3>

      <p>
        Log the work you have completed and attach the relevant
        ticket, application or record link.
      </p>

      <div class="form-line" style="align-items:end">

        <div>
          <label>Activity type</label>

          <select
  class="select"
  id="activityType"
  onchange="toggleActivityEvidence()"
>
  <option value="">Select activity...</option>

            ${activityTypes.map(type => `
              <option value="${esc(type)}">${esc(type)}</option>
            `).join('')}
          </select>
        </div>

        <div style="flex:1">

  <div id="activityLinkWrap">
    <label>Reference link</label>

    <input
      class="input"
      id="activityLink"
      type="url"
      placeholder="https://..."
    >
  </div>

  <div id="activityImageWrap" style="display:none">
  <label>Screenshot</label>

  <div
    id="activityImagePasteArea"
    tabindex="0"
    style="
      border:1px dashed #334155;
      border-radius:8px;
      padding:14px;
      background:#0d1724;
      cursor:pointer;
      margin-bottom:8px;
    "
  >
    <div id="activityImagePasteText" style="color:#94a3b8;font-size:12px;">
      📋 Click here and press Ctrl+V to paste a screenshot
    </div>

    <div style="margin-top:8px;">
      <input
        class="input"
        id="activityImage"
        type="file"
        accept="image/png,image/jpeg,image/webp"
      >
    </div>

    <img
      id="activityImagePreview"
      style="
        display:none;
        max-width:100%;
        max-height:250px;
        margin-top:10px;
        border-radius:6px;
      "
    >
  </div>

  <small class="muted">
    Paste an image with Ctrl+V, or choose a file normally.
  </small>
</div>

</div>

        <button
          class="action primary"
          onclick="recordActivity()"
        >
          Record activity
        </button>

      </div>

    </div>

    <div class="card table-card" style="margin-top:14px">

      <div class="section">
        <h3>My recent activity</h3>

        <p>
          Activity you've recorded for
          <b>${esc(team)}</b>.
        </p>
      </div>

      <div class="table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>Activity</th>
              <th>Reference</th>
              <th>Recorded</th>
            </tr>
          </thead>

          <tbody>

            ${
              logs.length

                ? logs.slice(0, 50).map(log => `
                    <tr>

                      <td>
                        <strong>
                          ${esc(
                            log.activity_type ||
                            log.task_title ||
                            'Activity'
                          )}
                        </strong>
                      </td>

                      <td>
                        ${
                          
  log.reference_type === 'image' && log.reference_path
    ? `
      <button
        class="action"
        type="button"
        onclick="openTaskEvidence('${esc(log.reference_path)}')"
      >
        Open screenshot
      </button>
    `
    : log.reference_url
      ? `
        <a
          href="${esc(log.reference_url)}"
          target="_blank"
          rel="noopener noreferrer"
          class="action"
        >
          Open link
        </a>
      `
      : '<span class="muted">No reference</span>'
}
                        }
                      </td>

                      <td>
                        ${new Date(
                          log.completed_at
                        ).toLocaleString('en-GB')}
                      </td>

                    </tr>
                  `).join('')

                : `
                  <tr>
                    <td colspan="3">
                      <div class="empty">
                        No activity has been recorded yet.
                      </div>
                    </td>
                  </tr>
                `
            }

          </tbody>

        </table>

      </div>

    </div>
    `
  );
}

function toggleActivityEvidence() {
  const activityType =
    document.getElementById('activityType')?.value;

  const isWaitingForSupport =
    activeMembership()?.team === 'Discord' &&
    activityType === 'Waiting for Support';

  const linkWrap =
    document.getElementById('activityLinkWrap');

  const imageWrap =
    document.getElementById('activityImageWrap');

  const link =
    document.getElementById('activityLink');

  const image =
    document.getElementById('activityImage');

  if (isWaitingForSupport) {
  linkWrap.style.display = 'none';
  imageWrap.style.display = 'block';
  link.value = '';
} else {
  linkWrap.style.display = 'block';
  imageWrap.style.display = 'none';
  link.value = '';
  image.value = '';

  const preview = document.getElementById('activityImagePreview');
  const pasteText = document.getElementById('activityImagePasteText');
  const pasteArea = document.getElementById('activityImagePasteArea');

  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }

  if (pasteText) {
    pasteText.textContent = '📋 Click here and press Ctrl+V to paste a screenshot';
    pasteText.style.color = '#94a3b8';
  }

  if (pasteArea) {
    pasteArea.style.borderColor = '#334155';
  }
}
  }

function handleActivityImagePaste(event) {
  const activityType = document.getElementById('activityType')?.value;

  const isWaitingForSupport =
    activeMembership()?.team === 'Discord' &&
    activityType === 'Waiting for Support';

  if (!isWaitingForSupport) return;

  const pasteArea = document.getElementById('activityImagePasteArea');
  const imageInput = document.getElementById('activityImage');

  if (!pasteArea || !imageInput) return;

  const items = event.clipboardData?.items;

  if (!items) return;

  for (const item of items) {
    if (!item.type.startsWith('image/')) continue;

    const file = item.getAsFile();

    if (!file) continue;

    event.preventDefault();

    // Put the pasted image into the existing file input
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    imageInput.files = dataTransfer.files;

    // Update the UI
    const pasteText = document.getElementById('activityImagePasteText');
    const preview = document.getElementById('activityImagePreview');

    if (pasteText) {
      pasteText.textContent = `✅ ${file.name || 'Pasted screenshot'}`;
      pasteText.style.color = '#86efac';
    }

    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    }

    pasteArea.style.borderColor = '#22c55e';

    toast('Screenshot pasted successfully.');

    return;
  }
}

  document.addEventListener('paste', handleActivityImagePaste);

document.addEventListener('click', event => {
  const pasteArea = event.target.closest('#activityImagePasteArea');

  if (!pasteArea) return;

  pasteArea.focus();
});
  
async function recordActivity() {
  const team = activeMembership()?.team;

  if (!team) {
    toast('You are not assigned to a team.');
    return;
  }

  const activityType =
    document.getElementById('activityType')?.value;

  const isWaitingForSupport =
    team === 'Discord' &&
    activityType === 'Waiting for Support';

  const referenceUrl =
    document.getElementById('activityLink')?.value.trim();

  const image =
    document.getElementById('activityImage')?.files?.[0];

  if (!activityType) {
    toast('Select an activity type.');
    return;
  }

  if (isWaitingForSupport) {
    if (!image) {
      toast('Upload a screenshot of the support request.');
      return;
    }

    if (!image.type.startsWith('image/')) {
      toast('Please upload an image.');
      return;
    }

    if (image.size > 10 * 1024 * 1024) {
      toast('Images must be 10MB or smaller.');
      return;
    }
  } else {
    if (!referenceUrl) {
      toast('Enter the relevant link.');
      return;
    }

    try {
      new URL(referenceUrl);
    } catch {
      toast('Enter a valid link.');
      return;
    }
  }

  try {
    let referencePath = null;

    if (isWaitingForSupport) {
      const extension =
        image.name.split('.').pop()?.toLowerCase() || 'png';

      const fileName =
        `${crypto.randomUUID()}.${extension}`;

      const filePath =
        `${state.user.id}/${fileName}`;

      const { error: uploadError } =
        await supabaseClient
          .storage
          .from('task-evidence')
          .upload(filePath, image, {
            contentType: image.type,
            upsert: false
          });

      if (uploadError) {
        toast(uploadError.message);
        return;
      }

      referencePath = filePath;
    }

    const { error } =
      await supabaseClient
        .from('task_logs')
        .insert({
          task_id: null,
          user_id: state.user.id,
          team_name: team,
          task_title: activityType,
          activity_type: activityType,
          reference_url:
            isWaitingForSupport
              ? null
              : referenceUrl,
          reference_type:
            isWaitingForSupport
              ? 'image'
              : 'link',
          reference_path:
            referencePath,
          completed_at:
            new Date().toISOString()
        });

    if (error) {
      toast(error.message);
      return;
    }

    toast('Activity recorded successfully.');
    render();

  } catch (error) {
    console.error(error);
    toast('Something went wrong while recording the activity.');
  }
}

async function openTaskEvidence(path) {
  if (!path) {
    toast('Screenshot could not be found.');
    return;
  }

  const { data, error } =
    await supabaseClient
      .storage
      .from('task-evidence')
      .createSignedUrl(path, 300);

  if (error || !data?.signedUrl) {
    toast(error?.message || 'Could not open screenshot.');
    return;
  }

  window.open(
    data.signedUrl,
    '_blank',
    'noopener,noreferrer'
  );
}
async function completeTask(id,done) {
  if (!activeMembership()) return;
  const taskResult=await supabaseClient.from('tasks').select('id,title,team_name').eq('id',id).single();
  if(taskResult.error){toast(taskResult.error.message);return;}
  if(done){
    const {error}=await supabaseClient.from('task_logs').delete().eq('task_id',id).eq('user_id',state.user.id).gte('completed_at',new Date(new Date().setHours(0,0,0,0)).toISOString());
    if(error){toast(error.message);return;} toast('Task marked incomplete');
  } else {
    const {error}=await supabaseClient.from('task_logs').insert({task_id:id,user_id:state.user.id,team_name:taskResult.data.team_name,task_title:taskResult.data.title,completed_at:new Date().toISOString()});
    if(error){toast(error.message);return;} toast('Task recorded');
  }
  render();
}

async function monitor() {

  const team = activeMembership()?.team;

  if (!canMonitor(team)) {
    return forbidden(
      'Task monitor',
      'You need Sub Leader or higher access for this team.'
    );
  }

  const logs = await fetchLogs(team).catch(() => []);

const discordActivityTypes = [
  'Admin Requests',
  'Verbal Warnings',
  'Kicks',
  'Punishments',
  'Bans',
  'General Chat / Announcements & Giveaways',
  'Waiting for Support'
];

const knowledgeActivityTypes = [
  'Interview',
  'Mentoring',
  'Application',
  'Transfer ticket',
  'Training Messaged',
  'Training Complete'
];

const activityTypes =
  team === 'Discord'
    ? discordActivityTypes
    : knowledgeActivityTypes;
  const totalLeaderboard =
    buildActivityLeaderboard(logs);

  function leaderboardRows(rows) {

    if (!rows.length) {
      return `
        <div class="empty">
          No activity recorded yet.
        </div>
      `;
    }

    return rows.map((person, index) => {

      const medal =
        index === 0 ? '🥇' :
        index === 1 ? '🥈' :
        index === 2 ? '🥉' :
        `${index + 1}`;

      return `
        <div class="leaderboard-row">

          <div class="leaderboard-position">
            ${medal}
          </div>

          <div class="leaderboard-name">
            <strong>${esc(person.display_name)}</strong>
          </div>

          <div class="leaderboard-count">
            ${person.count}
          </div>

        </div>
      `;

    }).join('');
  }

  const typeCards = activityTypes.map(type => {

    const leaderboard =
      buildActivityLeaderboard(logs, type);

    return `
      <div class="card leaderboard-card">

        <div class="section">

          <h3>${esc(type)}</h3>

          <p>
            ${leaderboard.reduce(
              (total, person) => total + person.count,
              0
            )}
            recorded
          </p>

        </div>

        <div class="leaderboard">

          ${leaderboardRows(leaderboard)}

        </div>

      </div>
    `;

  }).join('');

  return layout(
    'Task monitor',
    `Monitor activity across ${esc(team)}.`,
    `

    <div class="stats">

      <div class="card stat">
        <small>Today</small>
        <strong>
          ${
            logs.filter(log =>
              new Date(log.completed_at).toDateString() ===
              new Date().toDateString()
            ).length
          }
        </strong>
        <span>Activities recorded</span>
      </div>

      <div class="card stat">
        <small>Total activity</small>
        <strong>${logs.length}</strong>
        <span>All recorded activity</span>
      </div>

      <div class="card stat">
        <small>Staff active</small>
        <strong>
          ${new Set(logs.map(log => log.user_id)).size}
        </strong>
        <span>Staff recording activity</span>
      </div>

      <div class="card stat">
        <small>Team</small>
        <strong style="font-size:16px">
          ${esc(team)}
        </strong>
        <span>Current workspace</span>
      </div>

    </div>


    <div class="card leaderboard-card">

      <div class="section">

        <h3>Overall activity leaderboard</h3>

        <p>
          Ranked by total recorded activity for
          <b>${esc(team)}</b>.
        </p>

      </div>

      <div class="leaderboard">

        ${leaderboardRows(totalLeaderboard)}

      </div>

    </div>


    <div class="leaderboard-grid">

      ${typeCards}

    </div>


    <div class="card table-card">

      <div class="section">

        <h3>Recent activity</h3>

        <p>
          Latest activity recorded by the
          ${esc(team)} team.
        </p>

      </div>

      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>
              <th>Staff member</th>
              <th>Activity</th>
              <th>Reference</th>
              <th>Time</th>
              <th>Date</th>
            </tr>

          </thead>

          <tbody>

            ${
              logs.length

                ? logs.map(log => `

                    <tr>

                      <td>
                        <strong>
                          ${esc(
                            log.display_name ||
                            log.user_id
                          )}
                        </strong>
                      </td>

                      <td>
                        ${esc(
                          log.activity_type ||
                          log.task_title ||
                          'Activity'
                        )}
                      </td>

                      <td>

                        ${
  log.reference_type === 'image' && log.reference_path
    ? `
      <button
        class="action"
        type="button"
        onclick="openTaskEvidence('${esc(log.reference_path)}')"
      >
        Open screenshot
      </button>
    `
    : log.reference_url
      ? `
        <a
          href="${esc(log.reference_url)}"
          target="_blank"
          rel="noopener noreferrer"
          class="action"
        >
          Open
        </a>
      `
      : `
        <span class="muted">
          No reference
        </span>
      `
}
                        }

                      </td>

                      <td>
                        ${new Date(
                          log.completed_at
                        ).toLocaleTimeString(
                          'en-GB',
                          {
                            hour: '2-digit',
                            minute: '2-digit'
                          }
                        )}
                      </td>

                      <td>
                        ${new Date(
                          log.completed_at
                        ).toLocaleDateString('en-GB')}
                      </td>

                    </tr>

                  `).join('')

                : `

                  <tr>

                    <td colspan="5">

                      <div class="empty">
                        No activity has been recorded yet.
                      </div>

                    </td>

                  </tr>

                `
            }

          </tbody>

        </table>

      </div>

    </div>

    `
  );
}

async function faq() {
  const team = activeMembership()?.team;
  const create = canCreateFaq(team);
  const manage = canManageFaq(team);

  const { data: items = [], error } = await supabaseClient
    .from('faqs')
    .select('*')
    .eq('team_name', team)
    .eq('active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error && error.code !== '42P01') throw error;

const postTypes = [
  'Guide',
  'Announcement',
  'Giveaways',
  'Staff Templates',
  'Important'
];

return layout(
  `${esc(team)} Team Hub`,
  `Guides, announcements, giveaways and resources for ${esc(team)} staff.`,
  `
    ${
      create
        ? `

          <div
            class="card teamhub-editor"
            id="faqComposer"
            style="display:none;"
          >
            <div class="section">
              <h3>Create new post</h3>
              <p>
                Publish guides, announcements, giveaways, staff templates
                and important information for your team.
              </p>
            </div>

            <div class="form-line teamhub-create-row">
              <div>
                <label>POST TYPE</label>
                <select class="select" id="faqType">
                  ${postTypes
                    .map(
                      type =>
                        `<option value="${esc(type)}">${esc(type)}</option>`
                    )
                    .join('')}
                </select>
              </div>

              <div style="flex:1">
                <label>TITLE</label>
                <input
                  class="input"
                  id="faqTitle"
                  placeholder="Post title"
                >
              </div>
            </div>

            <div class="teamhub-editor-wrap">
              <label>CONTENT</label>

              <div class="rich-toolbar">
                <button type="button" onclick="formatFaq('bold')" title="Bold">
                  <b>B</b>
                </button>

                <button type="button" onclick="formatFaq('italic')" title="Italic">
                  <i>I</i>
                </button>

                <button type="button" onclick="formatFaq('underline')" title="Underline">
                  <u>U</u>
                </button>

                <button type="button" onclick="formatFaq('strikeThrough')" title="Strikethrough">
                  <s>S</s>
                </button>

                <span class="rich-divider"></span>

                <button type="button" onclick="formatFaq('formatBlock','H2')" title="Heading">
                  H2
                </button>

                <button type="button" onclick="formatFaq('formatBlock','H3')" title="Subheading">
                  H3
                </button>

                <span class="rich-divider"></span>

                <button type="button" onclick="formatFaq('insertUnorderedList')" title="Bullet list">
                  •
                </button>

                <button type="button" onclick="formatFaq('insertOrderedList')" title="Numbered list">
                  1.
                </button>

                <button type="button" onclick="formatFaq('formatBlock','BLOCKQUOTE')" title="Quote">
                  ❝
                </button>

                <span class="rich-divider"></span>

                <button type="button" onclick="insertFaqLink()" title="Insert link">
                  🔗
                </button>

                <button type="button" onclick="formatFaq('insertHorizontalRule')" title="Divider">
                  ─
                </button>
              </div>

              <div
                id="faqEditor"
                class="rich-editor"
                contenteditable="true"
                spellcheck="true"
                data-placeholder="Write your post here..."
              ></div>
            </div>

            <div class="teamhub-editor-footer">
              <label class="check-label">
                <input type="checkbox" id="faqPinned">
                <span>Pin this post</span>
              </label>

              <div class="teamhub-editor-actions">
                <button
                  class="action"
                  type="button"
                  onclick="toggleFaqComposer(false)"
                >
                  Cancel
                </button>

                <button
                  class="action primary"
                  type="button"
                  onclick="addFaq()"
                >
                  Publish post
                </button>
              </div>
            </div>
          </div>
        `
        : ''
    }

  <div class="teamhub-toolbar">

    ${
      create
        ? `
          <div class="teamhub-new-post">
            <button
              class="action primary"
              type="button"
              onclick="toggleFaqComposer()"
            >
              + New Post
            </button>
          </div>
        `
        : ''
    }

    <div class="search-row">
      <input
        class="input"
        id="faqSearch"
        placeholder="Search ${esc(team)} Team Hub"
        oninput="filterFaq()"
      >
    </div>

    <div class="teamhub-filters">

      ${postTypes
        .map(
          type => `
            <button
              class="teamhub-filter"
              data-type="${esc(type)}"
              onclick="filterFaqType('${esc(type)}', this)"
            >
              ${esc(type)}
            </button>
          `
        )
        .join('')}

    </div>

  </div>

  <div id="faqList">
    ${faqItems(items, team, manage)}
  </div>
  `
);
}

function faqItems(items, team, manage) {
  if (!items.length) {
    return `
      <div class="card empty">
        No Team Hub posts have been added for this team yet.
      </div>
    `;
  }

  return items
    .map(x => {
      const content = x.body_html || `<p>${esc(x.body || '')}</p>`;
      const preview = stripFaqHtml(content).slice(0, 180);

      return `
        <article
          class="teamhub-post"
          data-post-type="${esc(x.post_type || 'Guide')}"
          data-post-id="${esc(x.id)}"
        >

          <button
            type="button"
            class="teamhub-post-head"
            onclick="toggleFaqPost('${esc(x.id)}')"
          >
            <div class="teamhub-post-main">

              <div class="teamhub-post-title-row">

                ${
                  x.pinned
                    ? `<span class="teamhub-pin">📌</span>`
                    : ''
                }

                <span class="teamhub-type">
                  ${esc(x.post_type || 'Guide')}
                </span>

                <h3>${esc(x.title)}</h3>

              </div>

              <div class="teamhub-preview">
                ${esc(preview)}${preview.length >= 180 ? '...' : ''}
              </div>

              <div class="teamhub-meta">
                ${
                  x.created_at
                    ? new Date(x.created_at).toLocaleDateString('en-GB')
                    : ''
                }

                ${
                  x.updated_at &&
                  x.updated_at !== x.created_at
                    ? ` · Updated ${new Date(x.updated_at).toLocaleDateString('en-GB')}`
                    : ''
                }
              </div>

            </div>

            <span
              class="teamhub-chevron"
              id="faqChevron-${esc(x.id)}"
            >
              ▾
            </span>
          </button>

          <div
            class="teamhub-post-body"
            id="faqBody-${esc(x.id)}"
          >

            <div class="teamhub-content">
              ${safeFaqHtml(content)}
            </div>

            ${
              manage
                ? `
                  <div class="teamhub-post-actions">

                    <button
                      class="action"
                      type="button"
                      onclick="event.stopPropagation();editFaq('${esc(x.id)}')"
                    >
                      Edit
                    </button>

                    <button
                      class="action"
                      type="button"
                      onclick="event.stopPropagation();toggleFaqPin('${esc(x.id)}', ${x.pinned ? 'false' : 'true'})"
                    >
                      ${x.pinned ? 'Unpin' : 'Pin'}
                    </button>

                    <button
                      class="action danger"
                      type="button"
                      onclick="event.stopPropagation();deleteFaq('${esc(x.id)}')"
                    >
                      Remove
                    </button>

                  </div>
                `
                : ''
            }

          </div>

        </article>
      `;
    })
    .join('');
}


function stripFaqHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  return (temp.innerText || temp.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}


function safeFaqHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const allowedTags = [
  'P',
  'BR',
  'DIV',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'HR',
  'A'
];

  const walk = node => {
    [...node.children].forEach(child => {

      if (!allowedTags.includes(child.tagName)) {
        child.replaceWith(...child.childNodes);
        return;
      }

      [...child.attributes].forEach(attr => {
        if (child.tagName === 'A' && attr.name === 'href') {
          const value = attr.value.trim();

          if (!/^https?:\/\//i.test(value)) {
            child.removeAttribute(attr.name);
          }
        } else {
          child.removeAttribute(attr.name);
        }
      });

      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }

      walk(child);
    });
  };

  walk(temp);

  return temp.innerHTML;
}


function formatFaq(command, value = null) {
  document.getElementById('faqEditor')?.focus();

  try {
    document.execCommand(command, false, value);
  } catch (e) {
    console.error('Formatting failed:', e);
  }
}


function insertFaqLink() {
  const url = prompt('Enter the full URL:');

  if (!url) return;

  if (!/^https?:\/\//i.test(url.trim())) {
    return toast('Please enter a valid http:// or https:// link.');
  }

  document.getElementById('faqEditor')?.focus();

  document.execCommand(
    'createLink',
    false,
    url.trim()
  );
}


function toggleFaqPost(id) {
  const body = document.getElementById(`faqBody-${id}`);
  const chevron = document.getElementById(`faqChevron-${id}`);

  if (!body) return;

  const isOpen = body.classList.toggle('open');

  if (chevron) {
    chevron.classList.toggle('open', isOpen);
  }
}


async function filterFaq() {
  const q = (
    document.getElementById('faqSearch')?.value || ''
  )
    .trim()
    .toLowerCase();

  const team = activeMembership()?.team;

  const { data = [] } = await supabaseClient
    .from('faqs')
    .select('*')
    .eq('team_name', team)
    .eq('active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  const filtered = data.filter(x => {
    const text = stripFaqHtml(
      x.body_html || x.body || ''
    ).toLowerCase();

    return (
      x.title.toLowerCase().includes(q) ||
      text.includes(q)
    );
  });

  document.getElementById('faqList').innerHTML =
    faqItems(
      filtered,
      team,
      canManageFaq(team)
    );
}


async function filterFaqType(type, button) {
  document
    .querySelectorAll('.teamhub-filter')
    .forEach(btn => btn.classList.remove('active'));

  button?.classList.add('active');

  const q = (
    document.getElementById('faqSearch')?.value || ''
  )
    .trim()
    .toLowerCase();

  const team = activeMembership()?.team;

  const { data = [] } = await supabaseClient
    .from('faqs')
    .select('*')
    .eq('team_name', team)
    .eq('active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  const filtered = data.filter(x => {
    const text = stripFaqHtml(
      x.body_html || x.body || ''
    ).toLowerCase();

    const matchesSearch =
      !q ||
      x.title.toLowerCase().includes(q) ||
      text.includes(q);

    const matchesType =
      type === 'all' ||
      (x.post_type || 'Guide') === type;

    return matchesSearch && matchesType;
  });

  document.getElementById('faqList').innerHTML =
    faqItems(
      filtered,
      team,
      canManageFaq(team)
    );
}
function toggleFaqComposer(force = null) {
  const composer = document.getElementById('faqComposer');

  if (!composer) return;

  const shouldShow =
    force !== null
      ? force
      : composer.style.display === 'none';

  composer.style.display = shouldShow ? 'block' : 'none';
}

async function addFaq() {
  const title = (
    document.getElementById('faqTitle')?.value || ''
  ).trim();

  const editor = document.getElementById('faqEditor');

  const content = editor?.innerHTML?.trim() || '';

  const type =
    document.getElementById('faqType')?.value || 'Guide';

  const pinned =
    document.getElementById('faqPinned')?.checked || false;

  if (!title) {
    return toast('Add a title first.');
  }

  if (!stripFaqHtml(content)) {
    return toast('Add some content to the post.');
  }

  const cleanContent = safeFaqHtml(content);

  const { error } = await supabaseClient
    .from('faqs')
    .insert({
      team_name: activeMembership()?.team,
      title,
      body: stripFaqHtml(cleanContent),
      body_html: cleanContent,
      post_type: type,
      pinned,
      active: true,
      created_by: state.user.id,
      updated_at: new Date().toISOString()
    });

  if (error) {
    return toast(error.message);
  }

  render();
}


async function editFaq(id) {
  const { data, error } = await supabaseClient
    .from('faqs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return toast(error?.message || 'Post could not be loaded.');
  }

  const existingContent =
    data.body_html ||
    `<p>${esc(data.body || '')}</p>`;

  const modal = document.createElement('div');

  modal.className = 'modal-backdrop open';

  modal.innerHTML = `
    <div class="modal teamhub-edit-modal">

      <div class="modal-head">
        <div>
          <h2>Edit post</h2>
          <p>${esc(data.title)}</p>
        </div>

        <button
          class="close"
          onclick="this.closest('.modal-backdrop').remove()"
        >
          ×
        </button>
      </div>

      <div class="teamhub-edit-body">

        <div class="form-line">
          <div>
            <label>POST TYPE</label>
            <select class="select" id="editFaqType">
             ${[
  'Guide',
  'Announcement',
  'Giveaways',
  'Staff Templates',
  'Important'
]
  .map(
    type =>
      `<option value="${esc(type)}" ${
        data.post_type === type ? 'selected' : ''
      }>${esc(type)}</option>`
  )
  .join('')}
            </select>
          </div>

          <div style="flex:1">
            <label>TITLE</label>
            <input
              class="input"
              id="editFaqTitle"
              value="${esc(data.title)}"
            >
          </div>
        </div>

        <label>CONTENT</label>

        <div class="rich-toolbar">
          <button type="button" onclick="editFaqFormat('bold')"><b>B</b></button>
          <button type="button" onclick="editFaqFormat('italic')"><i>I</i></button>
          <button type="button" onclick="editFaqFormat('underline')"><u>U</u></button>
          <button type="button" onclick="editFaqFormat('strikeThrough')"><s>S</s></button>

          <span class="rich-divider"></span>

          <button type="button" onclick="editFaqFormat('formatBlock','H2')">H2</button>
          <button type="button" onclick="editFaqFormat('formatBlock','H3')">H3</button>

          <span class="rich-divider"></span>

          <button type="button" onclick="editFaqFormat('insertUnorderedList')">•</button>
          <button type="button" onclick="editFaqFormat('insertOrderedList')">1.</button>
          <button type="button" onclick="editFaqFormat('formatBlock','BLOCKQUOTE')">❝</button>

          <span class="rich-divider"></span>

          <button type="button" onclick="editFaqLink()">🔗</button>
          <button type="button" onclick="editFaqFormat('insertHorizontalRule')">─</button>
        </div>

        <div
          id="editFaqEditor"
          class="rich-editor"
          contenteditable="true"
          spellcheck="true"
        >${safeFaqHtml(existingContent)}</div>

        <div class="teamhub-editor-footer">

          <label class="check-label">
            <input
              type="checkbox"
              id="editFaqPinned"
              ${data.pinned ? 'checked' : ''}
            >
            <span>Pin this post</span>
          </label>

          <button
            class="action primary"
            onclick="saveFaqEdit('${esc(id)}')"
          >
            Save changes
          </button>

        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);
}


function editFaqFormat(command, value = null) {
  document.getElementById('editFaqEditor')?.focus();

  try {
    document.execCommand(command, false, value);
  } catch (e) {
    console.error('Formatting failed:', e);
  }
}


function editFaqLink() {
  const url = prompt('Enter the full URL:');

  if (!url) return;

  if (!/^https?:\/\//i.test(url.trim())) {
    return toast('Please enter a valid http:// or https:// link.');
  }

  document.getElementById('editFaqEditor')?.focus();

  document.execCommand(
    'createLink',
    false,
    url.trim()
  );
}


async function saveFaqEdit(id) {
  const title = (
    document.getElementById('editFaqTitle')?.value || ''
  ).trim();

  const editor = document.getElementById('editFaqEditor');

  const content = editor?.innerHTML?.trim() || '';

  const type =
    document.getElementById('editFaqType')?.value || 'Guide';

  const pinned =
    document.getElementById('editFaqPinned')?.checked || false;

  if (!title) {
    return toast('Add a title first.');
  }

  if (!stripFaqHtml(content)) {
    return toast('Add some content to the post.');
  }

  const cleanContent = safeFaqHtml(content);

  const { error } = await supabaseClient
    .from('faqs')
    .update({
      title,
      body: stripFaqHtml(cleanContent),
      body_html: cleanContent,
      post_type: type,
      pinned,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    return toast(error.message);
  }

  document
    .querySelector('.teamhub-edit-modal')
    ?.closest('.modal-backdrop')
    ?.remove();

  render();
}


async function toggleFaqPin(id, pinned) {
  const { error } = await supabaseClient
    .from('faqs')
    .update({
      pinned,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    return toast(error.message);
  }

  render();
}


async function deleteFaq(id) {
  if (!confirm('Remove this Team Hub post?')) {
    return;
  }

  const { error } = await supabaseClient
    .from('faqs')
    .delete()
    .eq('id', id);

  if (error) {
    return toast(error.message);
  }

  render();
}

async function staff() {
  if (!canMonitor()) {
    return forbidden(
      'Staff search',
      'You need Leader or higher access for this team.'
    );
  }

  return layout(
    'Staff search',
    'Find staff members and manage their KNG access.',
    `
      <div class="card form-card">
        <div class="search-row">
          <input
            class="input"
            id="staffInput"
            placeholder="Search name or email"
            onkeydown="if(event.key==='Enter') searchStaff()"
          >
          <button class="action primary" onclick="searchStaff()">
            Search
          </button>
        </div>

        <div id="staffResults">
          <div class="empty">
            Search for a staff member to view their teams and permissions.
          </div>
        </div>
      </div>
    `
  );
}

async function searchStaff() {
  const q = (
    document.getElementById('staffInput')?.value || ''
  ).trim().toLowerCase();

  const el = document.getElementById('staffResults');

  if (!q) {
    el.innerHTML = `
      <div class="empty">
        Enter a name or email to search.
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="empty">
      Searching staff...
    </div>
  `;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select(`
      id,
      display_name,
      email,
      status,
      created_at,
      team_memberships (
        id,
        team_id,
        rank,
        status,
        joined_at,
        teams (
          id,
          name,
          active
        )
      )
    `)
    .or(
      `display_name.ilike.%${q}%,email.ilike.%${q}%`
    )
    .limit(30);

  if (error) {
    el.innerHTML = `
      <div class="callout">
        ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!data?.length) {
    el.innerHTML = `
      <div class="empty">
        No staff matched that search.
      </div>
    `;
    return;
  }

  el.innerHTML = data.map(u => {
    const memberships = (u.team_memberships || [])
      .filter(m => m.status === 'active');

    return `
      <div class="card" style="margin-top:10px">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:14px;
        ">
          <div>
            <strong style="font-size:14px">
              ${esc(u.display_name)}
            </strong>

            <div style="
              font-size:10px;
              color:#7e919e;
              margin-top:4px;
            ">
              ${esc(u.email)}
            </div>
          </div>

          <span class="pill ${
            u.status === 'active'
              ? 'green'
              : u.status === 'suspended'
                ? 'red'
                : 'amber'
          }">
            ${esc(u.status)}
          </span>
        </div>

        <div style="
          margin-top:14px;
          border-top:1px solid var(--line);
          padding-top:12px;
        ">
          <div style="
            font-size:9px;
            text-transform:uppercase;
            letter-spacing:1px;
            color:#7e919e;
            margin-bottom:8px;
          ">
            Team memberships
          </div>

          ${
            memberships.length
              ? memberships.map(m => `
                <div style="
                  display:flex;
                  justify-content:space-between;
                  align-items:center;
                  padding:12px 0;
                  border-bottom:1px solid var(--line);
                ">
                  <span>${esc(m.teams?.name || 'Unknown team')}</span>
                  <span class="tag">
                    ${esc(m.rank)}
                  </span>
                </div>
              `).join('')
              : `
                <div class="empty">
                  No active team memberships.
                </div>
              `
          }
        </div>

        ${
          canManageStaffUser(u)
            ? `
             <div style="
  margin-top:10px;
  display:flex;
  justify-content:flex-end;
">
                <button
                  class="action primary"
                  onclick="openStaffManager('${u.id}')"
                >
                  Manage staff
                </button>
              </div>
            `
            : ''
        }
      </div>
    `;
  }).join('');
}

function canManageStaffUser(user) {
  if (isManager()) return true;

  if (
    user.id === state.user?.id
  ) {
    return false;
  }

  return state.memberships.some(
    m =>
      m.status === 'active' &&
      ['AUX', 'ADM'].includes(m.rank)
  );
}

async function openStaffManager(userId) {
  if (!isManager() && !canManageTeam()) {
    return toast('You do not have permission to manage staff.');
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id,display_name,email,status')
    .eq('id', userId)
    .single();

  if (profileError) {
    return toast(profileError.message);
  }

  const { data: memberships, error: membershipError } =
    await supabaseClient
      .from('team_memberships')
      .select(`
        id,
        team_id,
        rank,
        status,
        joined_at,
        teams (
          id,
          name,
          active
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active');

  if (membershipError) {
    return toast(membershipError.message);
  }

  const { data: teams, error: teamError } = await supabaseClient
    .from('teams')
    .select('id,name,active')
    .eq('active', true)
    .order('name');

  if (teamError) {
    return toast(teamError.message);
  }

  const modal = document.createElement('div');

  modal.className = 'modal-backdrop open';

  modal.innerHTML = `
    <div class="modal" style="max-width:650px">

      <div class="modal-head">
        <div>
          <h2>Manage staff</h2>
          <p>
            ${esc(profile.display_name)}
            · ${esc(profile.email)}
          </p>
        </div>

        <button
          class="close"
          onclick="this.closest('.modal-backdrop').remove()"
        >
          ×
        </button>
      </div>

      <div style="margin-top:18px">
<div class="card section">
  <div style="
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    margin-bottom:14px;
  ">
    <div>
      <h3 style="margin:0">Account status</h3>
      <p style="
        margin:4px 0 0;
        color:#7e919e;
        font-size:11px;
      ">
        Control this staff member's website access.
      </p>
    </div>

    <span style="
      display:inline-flex;
      align-items:center;
      padding:5px 10px;
      border-radius:999px;
      background:${
        profile.status === 'active'
          ? '#173528'
          : '#3a2024'
      };
      color:${
        profile.status === 'active'
          ? '#63c596'
          : '#f08080'
      };
      font-size:10px;
      font-weight:700;
      text-transform:capitalize;
    ">
      ${esc(profile.status)}
    </span>
  </div>

  ${
    isManager() || isAdmin()
      ? `
        <div style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
        ">

          ${
            profile.status === 'active'
              ? `
                <button
                  class="action danger"
                  style="width:100%;"
                  onclick="changeStaffStatus('${profile.id}','suspended')"
                >
                  Suspend Account
                </button>
              `
              : `
                <button
                  class="action primary"
                  style="width:100%;"
                  onclick="changeStaffStatus('${profile.id}','active')"
                >
                  Reactivate Account
                </button>
              `
          }

          <button
            class="action danger"
            style="
              width:100%;
              border-color:#7f3038;
              background:#24161a;
            "
            onclick="terminateStaffAccount('${profile.id}')"
          >
            Terminate Account
          </button>

        </div>
      `
      : ''
  }
</div>
      
        </div>

        <div class="card section" style="margin-top:12px">
          <h3>Team memberships</h3>

          <div id="staffMembershipList">

            ${
              memberships?.length
                ? memberships.map(m => `
                  <div style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:12px;
                    padding:10px 0;
                    border-bottom:1px solid var(--line);
                  ">

                    <div>
                      <strong>
                        ${esc(m.teams?.name || 'Unknown team')}
                      </strong>

                      <div style="
                        font-size:9px;
                        color:#7e919e;
                        margin-top:3px;
                      ">
                        Current rank:
                        ${esc(m.rank)}
                      </div>
                    </div>

                    <div style="
                      display:flex;
                      align-items:center;
                      gap:7px;
                    ">

                      <select
                        class="input"
                        id="rank-${m.team_id}"
                        style="min-width:130px"
                      >
                        ${RANKS.map(rank => `
                          <option
                            value="${esc(rank)}"
                            ${rank === m.rank ? 'selected' : ''}
                          >
                            ${esc(rank)}
                          </option>
                        `).join('')}
                      </select>

                      <button
                        class="action"
                        onclick="updateStaffMembership(
                          '${profile.id}',
                          '${m.team_id}',
                          'update'
                        )"
                      >
                        Save
                      </button>

                      <button
                        class="action danger"
                        onclick="updateStaffMembership(
                          '${profile.id}',
                          '${m.team_id}',
                          'remove'
                        )"
                      >
                        Remove
                      </button>

                    </div>
                  </div>
                `).join('')
                : `
                  <div class="empty">
                    This staff member has no active team memberships.
                  </div>
                `
            }

          </div>
        </div>

        <div class="card section" style="margin-top:12px">
          <h3>Add to team</h3>

          <div style="
            display:flex;
            gap:8px;
            align-items:center;
          ">

            <select
              class="input"
              id="newStaffTeam"
              style="flex:1"
            >
              ${
                teams
                  .filter(
                    t =>
                      !memberships?.some(
                        m => m.team_id === t.id
                      )
                  )
                  .map(t => `
                    <option value="${t.id}">
                      ${esc(t.name)}
                    </option>
                  `)
                  .join('')
              }
            </select>

            <select
              class="input"
              id="newStaffRank"
              style="width:140px"
            >
              ${RANKS.map(rank => `
                <option value="${esc(rank)}">
                  ${esc(rank)}
                </option>
              `).join('')}
            </select>

            <button
              class="action primary"
              onclick="addStaffMembership('${profile.id}')"
            >
              Add
            </button>

          </div>
        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);
}
async function updateStaffMembership(
  userId,
  teamId,
  action
) {
  const rank =
    document.getElementById(`rank-${teamId}`)?.value ||
    'Member';

  const { error } = await supabaseClient.rpc(
    'manage_staff_membership',
    {
      p_user_id: userId,
      p_team_id: teamId,
      p_rank: rank,
      p_action: action
    }
  );

  if (error) {
    return toast(error.message);
  }

  toast(
    action === 'remove'
      ? 'Staff member removed from team.'
      : 'Rank updated.'
  );

  document.querySelector('.modal-backdrop')?.remove();

  await searchStaff();
}
async function addStaffMembership(userId) {
  const teamId =
    document.getElementById('newStaffTeam')?.value;

  const rank =
    document.getElementById('newStaffRank')?.value ||
    'Member';

  if (!teamId) {
    return toast('Select a team first.');
  }

  const { error } = await supabaseClient.rpc(
    'manage_staff_membership',
    {
      p_user_id: userId,
      p_team_id: teamId,
      p_rank: rank,
      p_action: 'add'
    }
  );

  if (error) {
    return toast(error.message);
  }

  toast('Staff member added to the team.');

  document.querySelector('.modal-backdrop')?.remove();

  await searchStaff();
}
async function changeStaffStatus(userId, status) {
  if (!isManager() && !isAdmin()) {
    return toast(
      'Only Manager or ADM can change account status.'
    );
  }

  if (userId === state.user?.id) {
    return toast(
      'You cannot change your own account status.'
    );
  }

  const action =
    status === 'suspended'
      ? 'suspend this account'
      : 'reactivate this account';

  if (!confirm(`Are you sure you want to ${action}?`)) {
    return;
  }

  const { error } = await supabaseClient.rpc(
    'manage_staff_account',
    {
      p_user_id: userId,
      p_status: status
    }
  );

  if (error) {
    return toast(error.message);
  }

  toast(
    status === 'suspended'
      ? 'Account suspended.'
      : 'Account reactivated.'
  );

  document.querySelector('.modal-backdrop')?.remove();

  await searchStaff();
}

async function terminateStaffAccount(userId) {
  if (!isManager() && !isAdmin()) {
    return toast(
      'Only Manager or ADM can terminate staff accounts.'
    );
  }

  if (userId === state.user?.id) {
    return toast(
      'You cannot terminate your own account.'
    );
  }

  const firstConfirm = confirm(
    'WARNING: This will permanently terminate this staff member\'s KNG website account.\n\n' +
    'They will no longer be able to sign in, and their team memberships will be removed.\n\n' +
    'Their historical task logs will be retained.\n\n' +
    'This cannot be undone.\n\n' +
    'Continue?'
  );

  if (!firstConfirm) {
    return;
  }

  const secondConfirm = confirm(
    'FINAL CONFIRMATION\n\n' +
    'Terminate this account permanently?'
  );

  if (!secondConfirm) {
    return;
  }

  const { error } = await supabaseClient.rpc(
    'terminate_staff_account',
    {
      p_user_id: userId
    }
  );

  if (error) {
    console.error('Failed to terminate staff account:', error);

    return toast(
      error.message || 'Failed to terminate account.'
    );
  }

  toast('Staff account permanently terminated.');

  document.querySelector('.modal-backdrop')?.remove();

  await searchStaff();
}

async function history(){const team=activeMembership()?.team;const logs=await fetchLogs(team,true).catch(()=>[]);return layout('My history','Your recorded task completions.',`<div class="card section"><h3>Task history</h3><p>Every task you complete is retained here.</p>${logs.length?logs.slice(0,50).map(l=>`<div class="result"><div><strong>${esc(l.task_title||'Task')}</strong><small>${esc(l.team_name||team)}</small></div><span class="pill green">${new Date(l.completed_at).toLocaleString('en-GB')}</span></div>`).join(''):'<div class="empty">No task history yet.</div>'}</div>`)}

function account(){return layout('My account','Your account and team memberships.',`<div class="card form-card"><h3>Account details</h3><p>Your email is managed by Supabase Auth.</p><div class="form-line"><label>Name</label><input class="input" id="acctName" value="${esc(state.profile.display_name)}"><label>Email</label><input class="input" value="${esc(state.profile.email)}" disabled style="min-width:240px"><button class="action primary" onclick="saveAccount()">Save changes</button></div></div><div class="card form-card"><h3>Team memberships</h3><p>Your permissions are evaluated separately for each team.</p>${state.memberships.map(m=>`<div class="team-row" style="margin-bottom:8px"><div><b>${esc(m.team)}</b><small>${esc(m.rank)} · ${esc(m.status)}</small></div><span class="tag">${state.activeTeam===m.team?'Active':'Assigned'}</span></div>`).join('')}</div>`)}
async function saveAccount(){const name=document.getElementById('acctName').value.trim();if(!name)return toast('Name cannot be empty');const {error}=await supabaseClient.from('profiles').update({display_name:name}).eq('id',state.user.id);if(error)return toast(error.message);state.profile.display_name=name;toast('Account saved');render();}

async function pending(){if(!isAdmin())return forbidden('Pending accounts','Only Administration & Staff Operations ADM can review account applications.');const {data:reviews=[],error}=await supabaseClient.from('account_reviews').select('*').eq('status','pending').order('created_at',{ascending:true});if(error)return layout('Pending accounts','Review new account applications.',`<div class="callout">${esc(error.message)}</div>`);let rows=[];for(const r of reviews){const {data:p}=await supabaseClient.from('profiles').select('id,display_name,email,status,created_at').eq('id',r.user_id).maybeSingle();const {data:k}=await supabaseClient.from('access_keys').select('team_id,rank').eq('id',r.access_key_id).maybeSingle();let teamName='Assigned team';if(k?.team_id){const {data:t}=await supabaseClient.from('teams').select('name').eq('id',k.team_id).maybeSingle();teamName=t?.name||teamName;}if(p)rows.push({...r,p,rank:k?.rank||'Member',teamName});}return layout('Pending accounts','Review new account applications before they can access the portal.',`<div class="callout" style="margin-bottom:14px"><b>New accounts do not activate automatically.</b> Every access-key registration lands here for review.</div><div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>Applicant</th><th>Email</th><th>Team</th><th>Rank</th><th>Submitted</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><strong>${esc(r.p.display_name)}</strong></td><td>${esc(r.p.email)}</td><td>${esc(r.teamName)}</td><td>${esc(r.rank)}</td><td>${new Date(r.created_at).toLocaleString('en-GB')}</td><td><button class="action primary" onclick="reviewAccount('${r.user_id}','approve')">Approve</button> <button class="action" onclick="reviewAccount('${r.user_id}','reject')">Reject</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No accounts are waiting for review.</div></td></tr>'}</tbody></table></div></div>`)}
async function reviewAccount(userId,action){let reason='';if(action==='reject'){reason=prompt('Reason for rejection:')||'Application rejected';}const fn=action==='approve'?'approve_account':'reject_account';const args=action==='approve'?{application_user_id:userId,reviewer_id:state.user.id}:{application_user_id:userId,reviewer_id:state.user.id,reason};const {error}=await supabaseClient.rpc(fn,args);if(error)return toast(error.message);toast(action==='approve'?'Account approved':'Account rejected');render();}

async function keys(){if(!isAdmin())return forbidden('Access Keys','Only Administration & Staff Operations ADM can create and manage account access keys.');const {data:ks=[],error}=await supabaseClient.from('access_keys').select('*').order('created_at',{ascending:false});if(error)return layout('Access Keys','Manage account invitations.',`<div class="callout">${esc(error.message)}</div>`);const {data:teams=[]}=await supabaseClient.from('teams').select('id,name').eq('active',true);return layout('Access Keys','Generate temporary or permanent invitations, then revoke them whenever you need.',`<div class="card form-card"><h3>Generate an access key</h3><p>Each key can be used once. Temporary keys expire automatically. Permanent keys stay valid until used or revoked.</p><div class="form-line"><label>Team</label><select class="select" id="keyTeam">${teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><label>Rank</label><select class="select" id="keyRank">${RANKS.map(r=>`<option>${esc(r)}</option>`).join('')}</select><label>Access</label><select class="select" id="keyType" onchange="toggleKeyExpiry()"><option value="permanent">Permanent</option><option value="temporary">Temporary</option></select><span id="keyExpiryWrap" style="display:none"><select class="select" id="keyDuration"><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option></select></span><button class="action primary" onclick="generateKey()">Generate key</button></div></div><div class="stats"><div class="card stat"><small>All keys</small><strong>${ks.length}</strong></div><div class="card stat"><small>Available</small><strong>${ks.filter(k=>!k.used_at&&!k.revoked_at).length}</strong></div><div class="card stat"><small>Used</small><strong>${ks.filter(k=>k.used_at).length}</strong></div><div class="card stat"><small>Revoked</small><strong>${ks.filter(k=>k.revoked_at).length}</strong></div></div><div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>Access key</th><th>Rank</th><th>Type</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>${ks.length?ks.map(k=>{const expired=!k.used_at&&!k.revoked_at&&k.expires_at&&new Date(k.expires_at)<new Date();const status=k.revoked_at?'revoked':k.used_at?'used':expired?'expired':'available';return `<tr><td><strong style="font-family:ui-monospace,monospace">${esc(k.key_value)}</strong></td><td>${esc(k.rank)}</td><td>${esc(k.access_type)}</td><td>${k.expires_at?new Date(k.expires_at).toLocaleString('en-GB'):'Never'}</td><td><span class="pill ${status==='available'?'green':status==='revoked'||status==='expired'?'red':'amber'}">${status}</span></td><td>${status==='available'?`<button class="action" onclick="revokeKey('${k.id}')">Revoke</button>`:''}</td></tr>`}).join(''):'<tr><td colspan="6"><div class="empty">No access keys have been created.</div></td></tr>'}</tbody></table></div></div>`)}
function toggleKeyExpiry(){const type=document.getElementById('keyType')?.value;const el=document.getElementById('keyExpiryWrap');if(el)el.style.display=type==='temporary'?'inline-block':'none';}
async function generateKey(){const type=document.getElementById('keyType').value;const hours=Number(document.getElementById('keyDuration')?.value||0);const expires=type==='temporary'?new Date(Date.now()+hours*3600000).toISOString():null;const {data,error}=await supabaseClient.rpc('generate_access_key',{p_access_type:type,p_team_id:document.getElementById('keyTeam').value,p_rank:document.getElementById('keyRank').value,p_expires_at:expires,p_created_by:state.user.id});if(error)return toast(error.message);render();setTimeout(()=>showKey(data.key_value,data.rank,data.access_type,data.expires_at),50);}
async function revokeKey(id){const {error}=await supabaseClient.rpc('revoke_access_key',{p_key_id:id});if(error)return toast(error.message);toast('Access key revoked');render();}
function showKey(key,rank,type,expiresAt){const d=document.createElement('div');d.className='modal-backdrop open';d.innerHTML=`<div class="modal"><div class="modal-head"><div><h2>Access key created</h2><p>This key can be used once, then the account goes to administrator review.</p></div><button class="close" onclick="this.closest('.modal-backdrop').remove()">×</button></div><div class="generated-key"><span>${esc(key)}</span><button class="action" onclick="navigator.clipboard?.writeText('${esc(key)}');toast('Key copied')">Copy</button></div><div style="font-size:10px;color:#7e8993;margin-top:12px">Assignment: <b>${esc(rank)}</b> · ${esc(type)}${expiresAt?` · Expires ${new Date(expiresAt).toLocaleString('en-GB')}`:' · No expiry'}</div></div>`;document.body.appendChild(d);}

function permissions(){if(!isAdmin())return forbidden('Permissions','Only Administration & Staff Operations ADM can manage the permission model.');const matrix={view:0,tasks:0,monitor:2,faq:1,staff:2,keys:4,permissions:4};return layout('Permissions','Control what each rank can do inside each team.',`<div class="callout" style="margin-bottom:14px">Permissions are <b>team-specific</b>. A person can be a Member in one team and a Leader in another, with different access in each workspace.</div><div class="card section"><h3>Default permission matrix</h3><p>These are the current rank defaults enforced by the portal.</p><div class="perm-grid"><div class="head">Permission</div>${RANKS.map(r=>`<div class="head">${esc(r)}</div>`).join('')}${[['View team','view'],['Log own tasks','tasks'],['Monitor team tasks','monitor'],['Manage team FAQ','faq'],['Search staff','staff'],['Create access keys','keys'],['Manage permissions','permissions']].map(([label,p])=>`<div>${label}</div>${RANKS.map(r=>`<div class="${rankLevel(r)>=matrix[p]?'check':'no'}">${rankLevel(r)>=matrix[p]?'✓':'·'}</div>`).join('')}`).join('')}</div></div>`);}
function help(){return layout('Help center','Guidance for using the KNG staff portal.',`<div class="grid2"><div class="card section"><h3>Accounts</h3><p>New staff accounts are created with one-time access keys. The key determines the initial team and rank.</p></div><div class="card section"><h3>Tasks</h3><p>Staff record completed work through My tasks. Leaders and above can monitor activity for their team.</p></div><div class="card section"><h3>Discord team</h3><p>Discord team members can book hourly slots. Bookings will be retained in the portal history.</p></div><div class="card section"><h3>Permissions</h3><p>Permissions are evaluated per team membership, so the same person can have different access in different teams.</p></div></div>`)}

async function loadDiscordSlots() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  const today = `${year}-${month}-${day}`;

  const { error: initError } = await supabaseClient.rpc(
    'initialize_discord_slots',
    {
      p_shift_date: today
    }
  );

  if (initError) {
    console.error('Failed to initialise Discord slots:', initError);
    throw initError;
  }

  const { data, error } = await supabaseClient
    .from('discord_shift_slots')
    .select(`
      id,
      shift_date,
      hour_start,
      hour_end,
      claimed_by,
      claimed_at
    `)
    .eq('shift_date', today)
    .order('hour_start', { ascending: true });

  if (error) {
    console.error('Failed to load Discord slots:', error);
    throw error;
  }

  return data || [];
}

function renderDiscordSlots(slots) {
  const currentUserId = state.user?.id;

  const claimedByMe = slots.filter(
    slot => slot.claimed_by === currentUserId
  ).length;

  return `
    <div class="discord-hours-header">
      <div>
        <h3>Discord coverage</h3>
        <p>Claim up to 4 hours for today.</p>
      </div>

      <div class="discord-hours-count">
        <b>${claimedByMe} / 4</b>
        <span>hours claimed</span>
      </div>
    </div>

    <div class="discord-slot-grid">
      ${slots.map(slot => {
        const mine = slot.claimed_by === currentUserId;
        const claimed = !!slot.claimed_by;

        const start = slot.hour_start.slice(0, 5);
        const end = slot.hour_end.slice(0, 5);

        return `
          <div class="discord-slot ${mine ? 'mine' : ''} ${claimed && !mine ? 'claimed' : ''}">
            <div class="discord-slot-time">
              ${start}
              <span>–</span>
              ${end}
            </div>

            <div class="discord-slot-status">
              ${
                mine
                  ? `
                    <span class="slot-badge mine-badge">
                      Your slot
                    </span>
                  `
                  : claimed
                    ? `
                      <span class="slot-badge claimed-badge">
                        Claimed
                      </span>
                    `
                    : `
                      <span class="slot-badge available-badge">
                        Available
                      </span>
                    `
              }
            </div>

            ${
              mine
                ? `
                  <button
                    class="action"
                    onclick="releaseDiscordSlot('${slot.id}')"
                  >
                    Release
                  </button>
                `
                : !claimed
                  ? `
                    <button
                      class="action"
                      onclick="claimDiscordSlot('${slot.id}')"
                      ${claimedByMe >= 4 ? 'disabled' : ''}
                    >
                      Claim
                    </button>
                  `
                  : `
                    <button
                      class="action"
                      disabled
                    >
                      Unavailable
                    </button>
                  `
            }
          </div>
        `;
      }).join('')}
    </div>
  `;
}
window.claimDiscordSlot = async function(slotId) {
  try {
    const { error } = await supabaseClient.rpc(
      'claim_discord_slot',
      {
        p_slot_id: slotId
      }
    );

    if (error) {
      console.error('Failed to claim Discord slot:', error);
      alert(error.message || 'Unable to claim this slot.');
      return;
    }

    await render();

  } catch (error) {
    console.error('Discord slot claim failed:', error);
    alert(error.message || 'Unable to claim this slot.');
  }
};

window.releaseDiscordSlot = async function(slotId) {
  try {
    const { error } = await supabaseClient.rpc(
      'release_discord_slot',
      {
        p_slot_id: slotId
      }
    );

    if (error) {
      console.error('Failed to release Discord slot:', error);
      alert(error.message || 'Unable to release this slot.');
      return;
    }

    await render();

  } catch (error) {
    console.error('Discord slot release failed:', error);
    alert(error.message || 'Unable to release this slot.');
  }
};
async function loadDiscordCoverage() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  const today = `${year}-${month}-${day}`;

  const { data, error } = await supabaseClient.rpc(
    'get_discord_coverage',
    {
      p_shift_date: today
    }
  );

  if (error) {
    console.error('Failed to load Discord coverage:', error);
    throw error;
  }

  return data || [];
}
function renderDiscordCoverage(rows) {
  const staff = [...new Map(
    rows.map(row => [
      row.staff_id,
      {
        id: row.staff_id,
        name: row.staff_name
      }
    ])
  ).values()];

  const coveredHours = new Set(
    rows
      .filter(row => row.claimed_by)
      .map(row => row.hour_start.slice(0, 2))
  ).size;

  const totalHours = 24;
  const coveragePercent = totalHours
    ? Math.round((coveredHours / totalHours) * 100)
    : 0;

  return `
    <div class="card" style="margin-top:14px">
      <div class="section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:20px">
          <div>
            <h3>Today's coverage</h3>
            <p>
              See which Discord staff member has claimed each hour.
            </p>
          </div>

          <div class="discord-hours-count">
            <b>${coveredHours} / 24</b>
            <span>${coveragePercent}% covered</span>
          </div>
        </div>
      </div>

      <div class="discord-coverage-wrap">
        <table class="discord-coverage-table">
          <thead>
            <tr>
              <th>Staff</th>

              ${Array.from({ length: 24 }, (_, hour) => `
                <th>${String(hour).padStart(2, '0')}</th>
              `).join('')}
            </tr>
          </thead>

          <tbody>
            ${staff.map(member => `
              <tr>
                <td class="coverage-staff">
                  ${esc(member.name)}
                </td>

                ${Array.from({ length: 24 }, (_, hour) => {
                  const row = rows.find(
                    item =>
                      item.staff_id === member.id &&
                      Number(item.hour_start.slice(0, 2)) === hour
                  );

                  if (!row) {
                    return `<td class="coverage-empty">·</td>`;
                  }

                  if (row.claimed_by === member.id) {
                    return `
                      <td class="coverage-mine">
                        <span title="${esc(member.name)}">
                          ✓
                        </span>
                      </td>
                    `;
                  }

                  if (row.claimed_by) {
                    return `
                      <td class="coverage-other">
                        <span title="${esc(row.claimed_by_name || 'Claimed')}">
                          ●
                        </span>
                      </td>
                    `;
                  }

                  return `
                    <td class="coverage-empty">
                      ·
                    </td>
                  `;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
async function buildDiscordWeeklyLeaderboard() {
  const now = new Date();

  // Find the most recent Wednesday at 00:00
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const day = start.getDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;

  start.setDate(start.getDate() - daysSinceWednesday);

  // Wednesday 00:00 -> next Wednesday 00:00
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const { data: logs, error } = await supabaseClient
    .from('task_logs')
    .select('user_id, activity_type, completed_at')
    .eq('team_name', 'Discord')
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString());

  if (error) {
    throw error;
  }

  const { data: members, error: memberError } =
    await supabaseClient
      .from('team_memberships')
      .select(`
  user_id,
  rank,
  status,
  profiles (
    id,
    display_name
  ),
  teams!inner (
    id,
    name
  )
`)
.eq('status', 'active')
.eq('teams.name', 'Discord');

  if (memberError) {
    throw memberError;
  }

  const leaderboard = {};

// Add active Discord members, excluding Managers.
// Managers should not appear on Discord leaderboards.
(members || []).forEach(member => {

  if (member.rank === 'Manager') {
    return;
  }

  leaderboard[member.user_id] = {
    user_id: member.user_id,
    display_name:
      member.profiles?.display_name ||
      member.user_id,
    rank: member.rank,
    total: 0,
    activities: {}
  };
});

  // Count their completed Discord tasks.
  (logs || []).forEach(log => {
    if (!leaderboard[log.user_id]) {
      return;
    }

    leaderboard[log.user_id].total++;

    const type = log.activity_type || 'Other';

    leaderboard[log.user_id].activities[type] =
      (leaderboard[log.user_id].activities[type] || 0) + 1;
  });

  return {
    start,
    end,
    rows: Object.values(leaderboard)
      .map(person => {
        const activities = Object.entries(person.activities)
          .sort((a, b) => b[1] - a[1]);

        return {
          ...person,
          most_done: activities[0]?.[0] || 'No activity',
          most_done_count: activities[0]?.[1] || 0,
          activities
        };
      })
      .sort((a, b) => b.total - a.total)
  }
}
async function buildKnowledgeWeeklyLeaderboard() {
  const now = new Date();

  // Find the most recent Wednesday at 00:00
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const day = start.getDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;

  start.setDate(start.getDate() - daysSinceWednesday);

  // Wednesday 00:00 -> next Wednesday 00:00
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const { data: logs, error } = await supabaseClient
    .from('task_logs')
    .select('user_id, activity_type, completed_at')
    .eq('team_name', 'Knowledge')
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString());

  if (error) {
    throw error;
  }

  const { data: members, error: memberError } =
    await supabaseClient
      .from('team_memberships')
      .select(`
        user_id,
        rank,
        status,
        profiles (
          id,
          display_name
        ),
        teams!inner (
          id,
          name
        )
      `)
      .eq('status', 'active')
      .eq('teams.name', 'Knowledge');

  if (memberError) {
    throw memberError;
  }

  const leaderboard = {};

  // Add active Knowledge members, excluding Managers.
  (members || []).forEach(member => {

    if (member.rank === 'Manager') {
      return;
    }

    leaderboard[member.user_id] = {
      user_id: member.user_id,
      display_name:
        member.profiles?.display_name ||
        member.user_id,
      rank: member.rank,
      total: 0,
      activities: {}
    };
  });

  // Count their completed Knowledge tasks.
  (logs || []).forEach(log => {

    if (!leaderboard[log.user_id]) {
      return;
    }

    leaderboard[log.user_id].total++;

    const type = log.activity_type || 'Other';

    leaderboard[log.user_id].activities[type] =
      (leaderboard[log.user_id].activities[type] || 0) + 1;
  });

  return {
    start,
    end,
    rows: Object.values(leaderboard)
      .map(person => {

        const activities = Object.entries(person.activities)
          .sort((a, b) => b[1] - a[1]);

        return {
          ...person,
          most_done: activities[0]?.[0] || 'No activity',
          most_done_count: activities[0]?.[1] || 0,
          activities
        };
      })
      .sort((a, b) => b.total - a.total)
  };
}


async function knowledgeLeaderboard() {

  const access =
    isManager() ||
    state.memberships.some(
      x =>
        x.team === 'Knowledge' &&
        x.status === 'active' &&
        ['AUX', 'ADM'].includes(x.rank)
    );

  if (!access) {
    return `
      <section class="card">
        <h2>Access denied</h2>
        <p>
          You do not have permission to view the Knowledge leaderboard.
        </p>
      </section>
    `;
  }

  const data = await buildKnowledgeWeeklyLeaderboard();

  const formatDate = date =>
    date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

  const rows = data.rows.map((person, index) => {

    const initials = person.display_name
      .split(' ')
      .map(x => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const breakdown = person.activities.length
      ? person.activities
          .map(([type, count]) => `
            <span style="
              display:inline-flex;
              align-items:center;
              gap:6px;
              padding:5px 9px;
              margin:2px 4px 2px 0;
              border-radius:8px;
              background:rgba(255,255,255,.06);
              border:1px solid rgba(255,255,255,.08);
              font-size:12px;
              white-space:nowrap;
            ">
              <span>${esc(type)}</span>
              <strong>${count}</strong>
            </span>
          `)
          .join('')
      : `<span class="muted">No activity</span>`;

    return `
      <div style="
        display:grid;
        grid-template-columns:70px minmax(220px,1.3fr) 100px 190px minmax(300px,2fr);
        align-items:center;
        gap:18px;
        padding:16px 18px;
        margin-bottom:8px;
        border-radius:12px;
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.06);
        transition:.15s ease;
      ">

        <div>
          <div style="
            width:38px;
            height:38px;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:10px;
            background:rgba(255,255,255,.07);
            font-weight:800;
            font-size:13px;
          ">
            #${index + 1}
          </div>
        </div>

        <div style="
          display:flex;
          align-items:center;
          gap:12px;
          min-width:0;
        ">

          <div style="
            width:42px;
            height:42px;
            flex:0 0 42px;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:50%;
            background:rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.1);
            font-weight:800;
            font-size:13px;
          ">
            ${initials}
          </div>

          <div style="min-width:0">

            <div style="
              font-weight:800;
              font-size:14px;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
              ${esc(person.display_name)}
            </div>

            <div class="muted" style="margin-top:3px;font-size:11px">
              ${esc(person.rank)}
            </div>

          </div>
        </div>

        <div>
          <div style="
            font-size:25px;
            font-weight:900;
            line-height:1;
          ">
            ${person.total}
          </div>

          <div class="muted" style="
            font-size:10px;
            margin-top:5px;
            text-transform:uppercase;
            letter-spacing:.08em;
          ">
            tasks
          </div>
        </div>

        <div>
          ${
            person.most_done_count
              ? `
                <div style="
                  font-weight:800;
                  font-size:13px;
                ">
                  ${esc(person.most_done)}
                </div>

                <div class="muted" style="
                  font-size:11px;
                  margin-top:4px;
                ">
                  ${person.most_done_count} completed
                </div>
              `
              : `
                <div style="
                  font-weight:700;
                  font-size:13px;
                ">
                  No activity
                </div>
              `
          }
        </div>

        <div style="
          display:flex;
          flex-wrap:wrap;
          align-items:center;
        ">
          ${breakdown}
        </div>

      </div>
    `;
  }).join('');

 return `
  <section class="card">

    <div style="
      padding:24px 22px 20px;
      border-bottom:1px solid rgba(255,255,255,.07);
    ">
      <h2 style="
        margin:0;
        font-size:22px;
        line-height:1.2;
      ">
        Knowledge Weekly Leaderboard
      </h2>

      <p class="muted" style="
        margin:8px 0 0;
        font-size:12px;
      ">
        ${formatDate(data.start)} → ${formatDate(data.end)}
      </p>
    </div>

    <div style="
      padding:18px 0 0;
    ">

      <div style="
        display:grid;
        grid-template-columns:70px minmax(220px,1.3fr) 100px 190px minmax(300px,2fr);
        gap:18px;
        padding:0 18px 10px;
        color:var(--muted);
        font-size:10px;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.08em;
      ">
        <div>Rank</div>
        <div>Staff member</div>
        <div>Total</div>
        <div>Most completed</div>
        <div>Activity breakdown</div>
      </div>

      ${
        rows ||
        `
          <div style="
            padding:30px 18px;
            text-align:center;
            color:var(--muted);
          ">
            No Knowledge staff found.
          </div>
        `
      }

    </div>

  </section>
`;
}
async function discordLeaderboard() {
  const access =
    isManager() ||
    state.memberships.some(
      x =>
        x.team === 'Discord' &&
        x.status === 'active' &&
        ['AUX', 'ADM'].includes(x.rank)
    );

  if (!access) {
    return `
      <section class="card">
        <h2>Access denied</h2>
        <p>You do not have permission to view the Discord leaderboard.</p>
      </section>
    `;
  }

  const data = await buildDiscordWeeklyLeaderboard();

  const formatDate = date =>
    date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

 const rows = data.rows.map((person, index) => {
  const initials = person.display_name
    .split(' ')
    .map(x => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const rankClass =
    index === 0 ? 'top-one' :
    index === 1 ? 'top-two' :
    index === 2 ? 'top-three' : '';

  const breakdown = person.activities.length
    ? person.activities
        .map(([type, count]) => `
          <span style="
            display:inline-flex;
            align-items:center;
            gap:6px;
            padding:5px 9px;
            margin:2px 4px 2px 0;
            border-radius:8px;
            background:rgba(255,255,255,.06);
            border:1px solid rgba(255,255,255,.08);
            font-size:12px;
            white-space:nowrap;
          ">
            <span>${type}</span>
            <strong>${count}</strong>
          </span>
        `)
        .join('')
    : `<span class="muted">No activity</span>`;

  return `
    <div style="
      display:grid;
      grid-template-columns:70px minmax(220px,1.3fr) 100px 190px minmax(300px,2fr);
      align-items:center;
      gap:18px;
      padding:16px 18px;
      margin-bottom:8px;
      border-radius:12px;
      background:rgba(255,255,255,.025);
      border:1px solid rgba(255,255,255,.06);
      transition:.15s ease;
    ">

      <div>
        <div style="
          width:38px;
          height:38px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:10px;
          background:rgba(255,255,255,.07);
          font-weight:800;
          font-size:13px;
        ">
          #${index + 1}
        </div>
      </div>

      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        min-width:0;
      ">

        <div style="
          width:42px;
          height:42px;
          flex:0 0 42px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:rgba(255,255,255,.08);
          border:1px solid rgba(255,255,255,.1);
          font-weight:800;
          font-size:13px;
        ">
          ${initials}
        </div>

        <div style="min-width:0">
          <div style="
            font-weight:800;
            font-size:14px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">
            ${person.display_name}
          </div>

          <div class="muted" style="margin-top:3px;font-size:11px">
            ${person.rank}
          </div>
        </div>

      </div>

      <div>
        <div style="
          font-size:25px;
          font-weight:900;
          line-height:1;
        ">
          ${person.total}
        </div>

        <div class="muted" style="
          font-size:10px;
          margin-top:5px;
          text-transform:uppercase;
          letter-spacing:.08em;
        ">
          tasks
        </div>
      </div>

      <div>
        ${
          person.most_done_count
            ? `
              <div style="
                font-weight:800;
                font-size:13px;
              ">
                ${person.most_done}
              </div>

              <div class="muted" style="
                font-size:11px;
                margin-top:4px;
              ">
                ${person.most_done_count} completed
              </div>
            `
            : `
              <div style="
                font-weight:700;
                font-size:13px;
              ">
                No activity
              </div>
            `
        }
      </div>

      <div style="
        display:flex;
        flex-wrap:wrap;
        align-items:center;
      ">
        ${breakdown}
      </div>

    </div>
  `;
}).join('');

  return `
  <section class="card">

    <div style="
      padding:24px 22px 20px;
      border-bottom:1px solid rgba(255,255,255,.07);
    ">
      <h2 style="
        margin:0;
        font-size:22px;
        line-height:1.2;
      ">
        Discord Weekly Leaderboard
      </h2>

      <p class="muted" style="
        margin:8px 0 0;
        font-size:12px;
      ">
        ${formatDate(data.start)} → ${formatDate(data.end)}
      </p>
    </div>

    <div style="
      padding:18px 0 0;
    ">

      <div style="
        display:grid;
        grid-template-columns:70px minmax(220px,1.3fr) 100px 190px minmax(300px,2fr);
        gap:18px;
        padding:0 18px 10px;
        color:var(--muted);
        font-size:10px;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.08em;
      ">
        <div>Rank</div>
        <div>Staff member</div>
        <div>Total</div>
        <div>Most completed</div>
        <div>Activity breakdown</div>
      </div>

      ${
        rows ||
        `
          <div style="
            padding:30px 18px;
            text-align:center;
            color:var(--muted);
          ">
            No Discord staff found.
          </div>
        `
      }

    </div>

  </section>
`;
}
async function discord() {
  const hasDiscordAccess =
    isManager() ||
    state.memberships.some(
      m =>
        m.team === 'Discord' &&
        m.status === 'active'
    );

  if (!hasDiscordAccess) {
    return forbidden(
      'Discord team',
      'You are not assigned to the Discord team.'
    );
  }

  state.activeTeam = 'Discord';

  let slots = [];
  let coverage = [];

  try {
    slots = await loadDiscordSlots();
  } catch (error) {
    console.error('Discord slot loading failed:', error);
  }

  const canViewCoverage = canManageTeam('Discord');

  if (canViewCoverage) {
    try {
      coverage = await loadDiscordCoverage();
    } catch (error) {
      console.error('Discord coverage loading failed:', error);
    }
  }

  return layout(
    'Discord team',
    'Manage your Discord team hours and coverage.',
    `
      <div class="card">
        <div class="section">
          <h3>Discord team hours</h3>
          <p>
            Discord staff are required to complete
            <b>4 hours per day</b>.
          </p>
        </div>

        ${renderDiscordSlots(slots)}
      </div>

      ${
        canViewCoverage
          ? renderDiscordCoverage(coverage)
          : ''
      }

      <div class="card" style="margin-top:14px">
        <div class="section">
          <h3>Discord activity</h3>
          <p>
            Record Discord work from
            <b>My Tasks</b>.
          </p>
        </div>
      </div>
    `
  );
}
function openTeamSwitcher(){const d=document.createElement('div');d.className='modal-backdrop open';d.innerHTML=`<div class="modal"><div class="modal-head"><div><h2>Switch team</h2><p>Your permissions change with the active team.</p></div><button class="close" onclick="this.closest('.modal-backdrop').remove()">×</button></div><div style="margin-top:18px">${state.memberships.map(m=>`<button class="action" style="width:100%;text-align:left;margin-bottom:6px" onclick="switchTeam('${m.team.replace(/'/g,"\\'")}')"><b>${esc(m.team)}</b><br><span style="font-size:9px;color:#8b949d">${esc(m.rank)}</span></button>`).join('')}</div></div>`;document.body.appendChild(d);}
function switchTeam(team) {
  if (!state.memberships.some(m => m.team === team)) return;

  state.activeTeam = team;

  document.querySelector('.modal-backdrop')?.remove();

  render();
}

async function logTimeout() {
  const discordId = document
    .getElementById('timeoutDiscordId')
    ?.value
    .trim();

  const fileInput = document.getElementById('timeoutImage');
  const file = fileInput?.files?.[0];

  if (!discordId) {
    alert('Please enter the Discord ID.');
    return;
  }

  if (!file) {
    alert('Please upload screenshot evidence.');
    return;
  }

  try {
    // Get the actual authenticated Supabase user.
    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser();

    if (authError) {
      throw authError;
    }

    if (!user) {
      throw new Error('You are not currently authenticated.');
    }

    const button = document.querySelector(
      'button[onclick="logTimeout()"]'
    );

    if (button) {
      button.disabled = true;
      button.textContent = 'Uploading...';
    }

    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const filePath =
  `${user.id}/timeouts/${Date.now()}-${safeName}`;

    // Upload screenshot evidence.
    const { error: uploadError } =
      await supabaseClient
        .storage
        .from('task-evidence')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

    if (uploadError) {
      throw uploadError;
    }

    // Create timeout log using the authenticated user's ID.
    const { error: insertError } =
      await supabaseClient
        .from('timeout_logs')
        .insert({
          discord_id: discordId,
          issued_by: user.id,
          evidence_path: filePath
        });

    if (insertError) {
      // Remove uploaded evidence if the database insert fails.
      await supabaseClient
        .storage
        .from('task-evidence')
        .remove([filePath]);

      throw insertError;
    }

    alert('Timeout logged successfully.');

    document.getElementById('timeoutDiscordId').value = '';
    document.getElementById('timeoutImage').value = '';

    if (button) {
      button.disabled = false;
      button.textContent = 'Log timeout';
    }

    await searchTimeoutLogs();

  } catch (error) {
    console.error('Failed to log timeout:', error);

    alert(
      'Could not log the timeout.\n\n' +
      (error.message || error)
    );

    const button = document.querySelector(
      'button[onclick="logTimeout()"]'
    );

    if (button) {
      button.disabled = false;
      button.textContent = 'Log timeout';
    }
  }
}

async function searchTimeoutLogs() {
  const discordId = document
    .getElementById('timeoutSearchId')
    ?.value
    .trim();

  const results = document.getElementById('timeoutResults');

  if (!results) {
    return;
  }

  if (!discordId) {
    results.innerHTML = `
      <div class="empty">
        Please enter a Discord ID.
      </div>
    `;
    return;
  }

  results.innerHTML = `
    <div class="empty">
      Loading timeout history...
    </div>
  `;

  try {
    const { data, error } =
      await supabaseClient
        .from('timeout_logs')
        .select(`
          id,
          discord_id,
          issued_by,
          evidence_path,
          created_at
        `)
        .eq('discord_id', discordId)
        .order('created_at', {
          ascending: false
        });

    if (error) {
      throw error;
    }

    if (!data || !data.length) {
      results.innerHTML = `
        <div class="empty">
          No timeout history found for
          <b>${esc(discordId)}</b>.
        </div>
      `;
      return;
    }

    const rows = [];

    for (const timeout of data) {
      let evidenceUrl = null;

      if (timeout.evidence_path) {
        const { data: signedData } =
          await supabaseClient
            .storage
            .from('task-evidence')
            .createSignedUrl(
              timeout.evidence_path,
              3600
            );

        evidenceUrl = signedData?.signedUrl || null;
      }

      rows.push({
        ...timeout,
        evidenceUrl
      });
    }

    results.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:12px;
      ">
        <div>
          <b>${rows.length}</b>
          timeout${rows.length === 1 ? '' : 's'} found
        </div>

        <span class="muted">
          Discord ID: ${esc(discordId)}
        </span>
      </div>

      <div class="table-wrap">
        <table class="roster-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Issued by</th>
              <th>Evidence</th>
            </tr>
          </thead>

          <tbody>
            ${rows.map(timeout => `
              <tr>

                <td>
                  ${new Date(
                    timeout.created_at
                  ).toLocaleString('en-GB')}
                </td>

                <td>
                  ${esc(timeout.issued_by)}
                </td>

                <td>
                  ${
                    timeout.evidenceUrl
                      ? `
                        <a
                          class="action"
                          href="${timeout.evidenceUrl}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View evidence
                        </a>
                      `
                      : `
                        <span class="muted">
                          No evidence
                        </span>
                      `
                  }
                </td>

              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

  } catch (error) {
    console.error(
      'Failed to search timeout logs:',
      error
    );

    results.innerHTML = `
      <div class="callout">
        <b>Could not load timeout history.</b>
        <br>
        ${esc(error.message || error)}
      </div>
    `;
  }
}


function clearTimeoutSearch() {
  const input =
    document.getElementById('timeoutSearchId');

  const results =
    document.getElementById('timeoutResults');

  if (input) {
    input.value = '';
  }

  if (results) {
    results.innerHTML = `
      <div class="empty">
        Search for a Discord ID to view timeout history.
      </div>
    `;
  }
}
async function timeoutLogs() {
  const hasDiscordAccess =
    isManager() ||
    state.memberships.some(
      m =>
        m.team === 'Discord' &&
        m.status === 'active'
    );

  if (!hasDiscordAccess) {
    return forbidden(
      'Timeout Logs',
      'You are not assigned to the Discord team.'
    );
  }

  state.activeTeam = 'Discord';

  return layout(
    'Timeout Logs',
    'Record and review Discord chat timeouts.',
    `
      <div class="card form-card">
        <h3>Log timeout</h3>
        <p>Record a Discord timeout with screenshot evidence.</p>

        <div class="form-line" style="align-items:end">

          <div style="flex:1">
            <label>Discord ID</label>
            <input
              class="input"
              id="timeoutDiscordId"
              type="text"
              inputmode="numeric"
              placeholder="123456789012345678"
            >
          </div>

          <div style="flex:1">
            <label>Screenshot evidence</label>
            <input
              class="input"
              id="timeoutImage"
              type="file"
              accept="image/png,image/jpeg,image/webp"
            >
            <small class="muted">
              Upload a screenshot showing the timeout.
            </small>
          </div>

          <button
            class="action primary"
            type="button"
            onclick="logTimeout()"
          >
            Log timeout
          </button>

        </div>
      </div>

      <div class="card form-card" style="margin-top:14px">

        <h3>Timeout history</h3>

        <p>
          Search a Discord ID to see how many times they have been timed out.
        </p>

        <div class="form-line" style="align-items:end">

          <div style="flex:1">
            <label>Discord ID</label>

            <input
              class="input"
              id="timeoutSearchId"
              type="text"
              inputmode="numeric"
              placeholder="123456789012345678"
              onkeydown="if(event.key==='Enter') searchTimeoutLogs()"
            >
          </div>

          <button
            class="action primary"
            type="button"
            onclick="searchTimeoutLogs()"
          >
            Search
          </button>

          <button
            class="action"
            type="button"
            onclick="clearTimeoutSearch()"
          >
            Clear
          </button>

        </div>

        <div id="timeoutResults" style="margin-top:14px">
          <div class="empty">
            Search for a Discord ID to view timeout history.
          </div>
        </div>

      </div>
    `
  );
}
async function render(){
  if(!state.user){authScreen();return;}
  try { const active=await loadProfile(); if(!active){pendingScreen(state.profile?.status||'pending');return;} 
       

if(!location.hash) {
  location.hash='dashboard';
}

const p=location.hash.slice(1);

if(!pages[p]) {
  location.hash='dashboard';
  return;
}

if (p === 'discord' || p === 'discordLeaderboard') {
  const hasDiscordAccess =
    isManager() ||
    state.memberships.some(
      m =>
        m.team === 'Discord' &&
        m.status === 'active'
    );

  if (!hasDiscordAccess) {
    location.hash = 'dashboard';
    return;
  }

  state.activeTeam = 'Discord';
}

shell();

loadPartyMode();

document.querySelectorAll('.nav a').forEach(a =>
  a.classList.toggle('active', a.dataset.page === p)
);
    document.getElementById('crumb').innerHTML=`KNG &nbsp;/&nbsp; <b>${pages[p]}</b>`;
    const map = {
  dashboard,
  roster,
  tasks: tasksPage,
  monitor,
  discord,
  discordLeaderboard,
  knowledgeLeaderboard,
  timeoutLogs,
  faq,
  staff,
  history,
  account,
  pending,
  keys,
  permissions,
  help
};
    document.getElementById('content').innerHTML=await map[p]();
    window.scrollTo(0,0);
  } catch(e){ console.error(e); if(document.getElementById('content')) document.getElementById('content').innerHTML=layout('Something went wrong','The portal could not load this page.',`<div class="callout"><b>${esc(e.message||e)}</b><br><span style="font-size:10px">Check the browser console for details.</span></div>`); else authScreen('The portal could not load.'); }
}

async function boot(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  state.user=session?.user||null;
  if(!state.user){authScreen();return;}
  await render();
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  state.user = session?.user || null;

  if (event === 'PASSWORD_RECOVERY') {
    resetPasswordScreen();
    return;
  }

  if (!session) {
    authScreen();
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('load',boot);

