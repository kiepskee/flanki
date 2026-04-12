const SESSION_COOKIE = "flanki_session";
const TOKEN_TYPE_VERIFY = "email_verify";
const TOKEN_TYPE_RESET = "password_reset";

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return json(
        {
          error: error instanceof HttpError ? error.message : "Unexpected server error.",
        },
        error instanceof HttpError ? error.status : 500,
      );
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    return handleBootstrap(request, env, url);
  }

  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    return handleSignUp(request, env, url);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env, url);
  }

  if (url.pathname === "/api/auth/verify-email" && request.method === "POST") {
    return handleVerifyEmail(request, env);
  }

  if (url.pathname === "/api/auth/resend-verification" && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleResendVerification(env, user, url);
  }

  if (url.pathname === "/api/auth/forgot-password" && request.method === "POST") {
    return handleForgotPassword(request, env, url);
  }

  if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
    return handleResetPassword(request, env);
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return new Response(null, { status: 204, headers: sessionCookieHeaders(url, "", 0) });
  }

  if (url.pathname === "/api/friends" && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleAddFriend(request, env, user);
  }

  if (url.pathname === "/api/sessions" && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleCreateSession(request, env, user, url);
  }

  const inviteMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/invite$/);
  if (inviteMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleInviteFriend(request, env, user, inviteMatch[1]);
  }

  const acceptMatch = url.pathname.match(/^\/api\/invites\/([^/]+)\/accept$/);
  if (acceptMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleInviteResponse(env, user, acceptMatch[1], "accepted");
  }

  const declineMatch = url.pathname.match(/^\/api\/invites\/([^/]+)\/decline$/);
  if (declineMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleInviteResponse(env, user, declineMatch[1], "declined");
  }

  const joinMatch = url.pathname.match(/^\/api\/join\/([^/]+)$/);
  if (joinMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    return handleJoinByToken(env, user, joinMatch[1], url);
  }

  if (url.pathname.startsWith("/api/")) {
    throw new HttpError(404, "Route not found.");
  }

  return serveAppAsset(request, env);
}

async function handleBootstrap(request, env, url) {
  const user = await getOptionalUser(request, env);
  if (!user) {
    return json({
      me: null,
      friends: [],
      activeSession: null,
      incomingInvites: [],
      authMessage: null,
    });
  }

  return json({
    me: publicUser(user),
    friends: await listFriends(env, user.id),
    activeSession: await getLatestSessionForUser(env, user.id, url.origin),
    incomingInvites: await listIncomingInvites(env, user.id),
    authMessage: user.email_verified ? null : "Verify your email to secure your account and recover your password.",
  });
}

async function handleSignUp(request, env, url) {
  requireConfig(env, ["SESSION_SECRET"]);
  const body = await request.json();
  const email = normalizeEmail(body.email);
  const username = normalizeUsername(body.username);
  const displayName = normalizeDisplayName(body.displayName);
  const password = String(body.password || "");
  const next = sanitizeNextPath(body.next);

  validatePassword(password);

  const existing = await env.DB.prepare(
    "SELECT email, username FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)",
  )
    .bind(email, username)
    .all();

  for (const row of existing.results || []) {
    if (row.email && row.email.toLowerCase() === email) {
      throw new HttpError(409, "That email is already in use.");
    }
    if (row.username && row.username.toLowerCase() === username) {
      throw new HttpError(409, "That player name is already taken.");
    }
  }

  const user = {
    id: `usr_${randomId()}`,
    email,
    username,
    displayName,
    passwordHash: await hashPassword(password),
    emailVerified: 0,
    avatarUrl: avatarForDisplayName(displayName),
  };

  await env.DB.prepare(
    `
      INSERT INTO users (id, email, username, display_name, password_hash, email_verified, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(user.id, user.email, user.username, user.displayName, user.passwordHash, user.emailVerified, user.avatarUrl)
    .run();

  const verification = await issueToken(env, user.id, TOKEN_TYPE_VERIFY, 24);
  const delivery = await sendVerificationEmail(env, url, user, verification.rawToken);
  return createAuthResponse(url, env, user, next, 201, {
    notice: delivery.notice,
    devLink: delivery.devLink,
  });
}

async function handleLogin(request, env, url) {
  requireConfig(env, ["SESSION_SECRET"]);
  const body = await request.json();
  const identifier = String(body.identifier || "").trim().toLowerCase();
  const password = String(body.password || "");
  const next = sanitizeNextPath(body.next);

  if (!identifier || !password) {
    throw new HttpError(400, "Enter your player name or email and password.");
  }

  const user = await env.DB.prepare(
    `
      SELECT id, email, username, display_name, password_hash, email_verified, avatar_url
      FROM users
      WHERE lower(email) = ? OR lower(username) = ?
      LIMIT 1
    `,
  )
    .bind(identifier, identifier)
    .first();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, "Invalid sign-in details.");
  }

  return createAuthResponse(
    url,
    env,
    {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url || avatarForDisplayName(user.display_name),
    },
    next,
  );
}

async function handleVerifyEmail(request, env) {
  const body = await request.json();
  const token = String(body.token || "");
  if (!token) {
    throw new HttpError(400, "Missing verification token.");
  }

  const record = await resolveValidToken(env, token, TOKEN_TYPE_VERIFY);
  if (!record) {
    throw new HttpError(400, "That verification link is invalid or expired.");
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(record.user_id),
    env.DB.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record.id),
    env.DB.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = ? AND used_at IS NULL").bind(
      record.user_id,
      TOKEN_TYPE_VERIFY,
    ),
  ]);

  return json({ ok: true, message: "Email verified. Your account is now confirmed." });
}

async function handleResendVerification(env, user, url) {
  if (user.email_verified) {
    return json({ ok: true, message: "Your email is already verified." });
  }

  await expireUnusedTokens(env, user.id, TOKEN_TYPE_VERIFY);
  const verification = await issueToken(env, user.id, TOKEN_TYPE_VERIFY, 24);
  const delivery = await sendVerificationEmail(env, url, adaptUserRow(user), verification.rawToken);
  return json({
    ok: true,
    message: delivery.notice,
    devLink: delivery.devLink,
  });
}

async function handleForgotPassword(request, env, url) {
  const body = await request.json();
  const email = normalizeEmail(body.email);

  const user = await env.DB.prepare(
    "SELECT id, email, username, display_name, email_verified, avatar_url FROM users WHERE lower(email) = lower(?) LIMIT 1",
  )
    .bind(email)
    .first();

  if (!user) {
    return json({
      ok: true,
      message: "If that email exists, a reset link is on its way.",
    });
  }

  await expireUnusedTokens(env, user.id, TOKEN_TYPE_RESET);
  const resetToken = await issueToken(env, user.id, TOKEN_TYPE_RESET, 2);
  const delivery = await sendPasswordResetEmail(env, url, adaptUserRow(user), resetToken.rawToken);
  return json({
    ok: true,
    message: delivery.notice,
    devLink: delivery.devLink,
  });
}

async function handleResetPassword(request, env) {
  const body = await request.json();
  const token = String(body.token || "");
  const password = String(body.password || "");

  if (!token) {
    throw new HttpError(400, "Missing reset token.");
  }

  validatePassword(password);
  const record = await resolveValidToken(env, token, TOKEN_TYPE_RESET);
  if (!record) {
    throw new HttpError(400, "That reset link is invalid or expired.");
  }

  const passwordHash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, record.user_id),
    env.DB.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = ? AND used_at IS NULL").bind(
      record.user_id,
      TOKEN_TYPE_RESET,
    ),
  ]);

  return json({ ok: true, message: "Password updated. You can sign in with the new password now." });
}

async function handleAddFriend(request, env, user) {
  const body = await request.json();
  const username = normalizeUsername(body.username);

  const friend = await env.DB.prepare(
    "SELECT id, username, display_name, avatar_url FROM users WHERE lower(username) = lower(?)",
  )
    .bind(username)
    .first();

  if (!friend) {
    throw new HttpError(404, "That player has not created an account yet.");
  }

  if (friend.id === user.id) {
    throw new HttpError(400, "You cannot add yourself.");
  }

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO friend_links (user_id, friend_id) VALUES (?, ?)").bind(user.id, friend.id),
    env.DB.prepare("INSERT OR IGNORE INTO friend_links (user_id, friend_id) VALUES (?, ?)").bind(friend.id, user.id),
  ]);

  return json({ ok: true });
}

async function handleCreateSession(request, env, user, url) {
  const body = await request.json();
  const name = String(body.name || "").trim();

  if (!name) {
    throw new HttpError(400, "Choose a session name.");
  }

  const sessionId = randomId();
  const inviteToken = randomId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO game_sessions (id, host_user_id, name, invite_token, status) VALUES (?, ?, ?, ?, 'open')",
    ).bind(sessionId, user.id, name, inviteToken),
    env.DB.prepare("INSERT INTO session_members (session_id, user_id, role) VALUES (?, ?, 'host')").bind(sessionId, user.id),
  ]);

  return json({ session: await getSessionById(env, sessionId, url.origin) }, 201);
}

async function handleInviteFriend(request, env, user, sessionId) {
  const session = await env.DB.prepare("SELECT id, host_user_id FROM game_sessions WHERE id = ?")
    .bind(sessionId)
    .first();

  if (!session) {
    throw new HttpError(404, "Session not found.");
  }

  if (session.host_user_id !== user.id) {
    throw new HttpError(403, "Only the session host can invite friends.");
  }

  const body = await request.json();
  const friendId = String(body.friendId || "");

  const friendship = await env.DB.prepare("SELECT 1 FROM friend_links WHERE user_id = ? AND friend_id = ?")
    .bind(user.id, friendId)
    .first();

  if (!friendship) {
    throw new HttpError(403, "That player is not on your friend list.");
  }

  const member = await env.DB.prepare("SELECT 1 FROM session_members WHERE session_id = ? AND user_id = ?")
    .bind(sessionId, friendId)
    .first();

  if (member) {
    throw new HttpError(400, "That friend is already in the session.");
  }

  await env.DB.prepare(
    "INSERT OR REPLACE INTO session_invites (id, session_id, inviter_user_id, invitee_user_id, status) VALUES (?, ?, ?, ?, 'pending')",
  )
    .bind(randomId(), sessionId, user.id, friendId)
    .run();

  return json({ ok: true });
}

async function handleInviteResponse(env, user, inviteId, nextStatus) {
  const invite = await env.DB.prepare(
    "SELECT id, session_id, invitee_user_id, status FROM session_invites WHERE id = ?",
  )
    .bind(inviteId)
    .first();

  if (!invite) {
    throw new HttpError(404, "Invite not found.");
  }

  if (invite.invitee_user_id !== user.id) {
    throw new HttpError(403, "That invite does not belong to you.");
  }

  if (invite.status !== "pending") {
    throw new HttpError(400, "That invite has already been handled.");
  }

  const operations = [
    env.DB.prepare("UPDATE session_invites SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextStatus, inviteId),
  ];

  if (nextStatus === "accepted") {
    operations.push(
      env.DB.prepare("INSERT OR IGNORE INTO session_members (session_id, user_id, role) VALUES (?, ?, 'player')").bind(
        invite.session_id,
        user.id,
      ),
    );
  }

  await env.DB.batch(operations);
  return json({ ok: true });
}

async function handleJoinByToken(env, user, token, url) {
  const session = await env.DB.prepare("SELECT id FROM game_sessions WHERE invite_token = ?")
    .bind(token)
    .first();

  if (!session) {
    throw new HttpError(404, "That session link is no longer valid.");
  }

  await env.DB.prepare("INSERT OR IGNORE INTO session_members (session_id, user_id, role) VALUES (?, ?, 'player')")
    .bind(session.id, user.id)
    .run();

  return json({ session: await getSessionById(env, session.id, url.origin) });
}

async function serveAppAsset(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname.startsWith("/join/")) {
    return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
  }

  return env.ASSETS.fetch(request);
}

async function createAuthResponse(url, env, user, next = "/", status = 200, extra = {}) {
  const sessionValue = await signSessionCookie(env.SESSION_SECRET, user);
  return json(
    {
      me: publicUser({
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email_verified: user.emailVerified,
        avatar_url: user.avatarUrl,
      }),
      next,
      ...extra,
    },
    status,
    sessionCookieHeaders(url, sessionValue, 60 * 60 * 24 * 30),
  );
}

async function getOptionalUser(request, env) {
  const sessionCookie = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!sessionCookie || !env.SESSION_SECRET) {
    return null;
  }

  const session = await verifySessionCookie(env.SESSION_SECRET, sessionCookie);
  if (!session) {
    return null;
  }

  return (
    (await env.DB.prepare(
      "SELECT id, email, username, display_name, email_verified, avatar_url FROM users WHERE id = ?",
    )
      .bind(session.sub)
      .first()) || null
  );
}

async function requireUser(request, env) {
  const user = await getOptionalUser(request, env);
  if (!user) {
    throw new HttpError(401, "Please sign in first.");
  }
  return user;
}

async function issueToken(env, userId, type, expiresInHours) {
  const rawToken = randomId(24);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(`tok_${randomId()}`, userId, tokenHash, type, expiresAt)
    .run();

  return { rawToken };
}

async function resolveValidToken(env, rawToken, type) {
  const tokenHash = await sha256(rawToken);
  return env.DB.prepare(
    `
      SELECT id, user_id, expires_at
      FROM auth_tokens
      WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
  )
    .bind(tokenHash, type)
    .first();
}

async function expireUnusedTokens(env, userId, type) {
  await env.DB.prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = ? AND used_at IS NULL")
    .bind(userId, type)
    .run();
}

async function sendVerificationEmail(env, url, user, rawToken) {
  const verifyUrl = buildPublicUrl(env, url, `/?verify=${encodeURIComponent(rawToken)}`);
  return sendTransactionalEmail(
    env,
    user.email,
    "Verify your Flanki account",
    `
      <p>Hi ${escapeHtml(user.displayName)},</p>
      <p>Confirm your email address to finish setting up your player profile.</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p>If you did not create this account, you can ignore this email.</p>
    `,
    `Verify your Flanki account: ${verifyUrl}`,
  );
}

async function sendPasswordResetEmail(env, url, user, rawToken) {
  const resetUrl = buildPublicUrl(env, url, `/?reset=${encodeURIComponent(rawToken)}`);
  return sendTransactionalEmail(
    env,
    user.email,
    "Reset your Flanki password",
    `
      <p>Hi ${escapeHtml(user.displayName)},</p>
      <p>Use the link below to choose a new password for your player profile.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>If you did not ask for this, you can ignore this email.</p>
    `,
    `Reset your Flanki password: ${resetUrl}`,
  );
}

async function sendTransactionalEmail(env, to, subject, html, text) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    const fallbackLink = extractFirstLink(text);
    return {
      notice: "Email sending is not configured yet. Using a dev link instead.",
      devLink: fallbackLink,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new HttpError(502, `Email delivery failed: ${payload}`);
  }

  return {
    notice: "Email sent.",
    devLink: null,
  };
}

function extractFirstLink(text) {
  const match = String(text || "").match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function buildPublicUrl(env, url, path) {
  const origin = env.APP_ORIGIN || url.origin;
  return new URL(path, origin).toString();
}

async function listFriends(env, userId) {
  const result = await env.DB.prepare(
    `
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.email_verified
      FROM friend_links fl
      JOIN users u ON u.id = fl.friend_id
      WHERE fl.user_id = ?
      ORDER BY lower(u.display_name), lower(u.username)
    `,
  )
    .bind(userId)
    .all();

  return (result.results || []).map(publicUser);
}

async function getLatestSessionForUser(env, userId, origin) {
  const record = await env.DB.prepare(
    `
      SELECT gs.id
      FROM game_sessions gs
      JOIN session_members sm ON sm.session_id = gs.id
      WHERE sm.user_id = ? AND gs.status = 'open'
      ORDER BY gs.created_at DESC
      LIMIT 1
    `,
  )
    .bind(userId)
    .first();

  if (!record) {
    return null;
  }

  return getSessionById(env, record.id, origin);
}

async function getSessionById(env, sessionId, origin) {
  const session = await env.DB.prepare(
    `
      SELECT
        gs.id,
        gs.name,
        gs.status,
        gs.invite_token,
        host.id AS host_id,
        host.username AS host_username,
        host.display_name AS host_display_name,
        host.avatar_url AS host_avatar_url,
        host.email_verified AS host_email_verified
      FROM game_sessions gs
      JOIN users host ON host.id = gs.host_user_id
      WHERE gs.id = ?
    `,
  )
    .bind(sessionId)
    .first();

  if (!session) {
    return null;
  }

  const members = await env.DB.prepare(
    `
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.email_verified, sm.role
      FROM session_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.session_id = ?
      ORDER BY sm.role = 'host' DESC, lower(u.display_name), lower(u.username)
    `,
  )
    .bind(sessionId)
    .all();

  const pendingInvites = await env.DB.prepare(
    `
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.email_verified
      FROM session_invites si
      JOIN users u ON u.id = si.invitee_user_id
      WHERE si.session_id = ? AND si.status = 'pending'
      ORDER BY lower(u.display_name), lower(u.username)
    `,
  )
    .bind(sessionId)
    .all();

  return {
    id: session.id,
    name: session.name,
    status: session.status,
    shareUrl: `${origin}/join/${session.invite_token}`,
    host: publicUser({
      id: session.host_id,
      username: session.host_username,
      display_name: session.host_display_name,
      avatar_url: session.host_avatar_url,
      email_verified: session.host_email_verified,
    }),
    members: (members.results || []).map((member) => ({
      ...publicUser(member),
      role: member.role,
    })),
    pendingInvites: (pendingInvites.results || []).map(publicUser),
  };
}

async function listIncomingInvites(env, userId) {
  const result = await env.DB.prepare(
    `
      SELECT
        si.id,
        si.created_at,
        gs.name AS session_name,
        inviter.id AS inviter_id,
        inviter.username AS inviter_username,
        inviter.display_name AS inviter_display_name,
        inviter.avatar_url AS inviter_avatar_url,
        inviter.email_verified AS inviter_email_verified
      FROM session_invites si
      JOIN game_sessions gs ON gs.id = si.session_id
      JOIN users inviter ON inviter.id = si.inviter_user_id
      WHERE si.invitee_user_id = ? AND si.status = 'pending'
      ORDER BY si.created_at DESC
    `,
  )
    .bind(userId)
    .all();

  return (result.results || []).map((invite) => ({
    id: invite.id,
    sessionName: invite.session_name,
    createdAtLabel: new Date(invite.created_at).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    inviter: publicUser({
      id: invite.inviter_id,
      username: invite.inviter_username,
      display_name: invite.inviter_display_name,
      avatar_url: invite.inviter_avatar_url,
      email_verified: invite.inviter_email_verified,
    }),
  }));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    emailVerified: Boolean(user.email_verified),
    avatarUrl: user.avatar_url || avatarForDisplayName(user.display_name),
  };
}

function adaptUserRow(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name || user.displayName,
    emailVerified: user.email_verified ?? user.emailVerified,
    avatarUrl: user.avatar_url || user.avatarUrl || avatarForDisplayName(user.display_name || user.displayName),
  };
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new HttpError(400, "Player name must be 3-20 characters using letters, numbers, or underscores.");
  }
  return username;
}

function normalizeDisplayName(value) {
  const displayName = String(value || "").trim();
  if (displayName.length < 2 || displayName.length > 32) {
    throw new HttpError(400, "Display name must be between 2 and 32 characters.");
  }
  return displayName;
}

function validatePassword(password) {
  if (String(password || "").length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return `pbkdf2$120000$${base64urlFromBytes(salt)}$${base64urlFromBytes(new Uint8Array(hashBuffer))}`;
}

async function verifyPassword(password, storedHash) {
  const [scheme, iterationText, saltText, hashText] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !iterationText || !saltText || !hashText) {
    return false;
  }

  const iterations = Number(iterationText);
  const salt = base64urlToBytes(saltText);
  const expected = base64urlToBytes(hashText);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    expected.byteLength * 8,
  );

  return timingSafeEqual(new Uint8Array(hashBuffer), expected);
}

function avatarForDisplayName(displayName) {
  const initials =
    String(displayName || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#0c7c59"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#fff">${escapeHtml(initials)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const chunk of header.split(";")) {
    const [key, ...value] = chunk.trim().split("=");
    cookies[key] = value.join("=");
  }

  return cookies;
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function sessionCookieHeaders(url, value, maxAge) {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    buildCookie(SESSION_COOKIE, value, {
      maxAge,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    }),
  );
  return headers;
}

async function signSessionCookie(secret, user) {
  const payload = base64urlEncode(
    JSON.stringify({
      sub: user.id,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    }),
  );
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

async function verifySessionCookie(secret, value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature) return null;

  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature))) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64urlDecode(payload));
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64urlFromBytes(new Uint8Array(signature));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64urlFromBytes(new Uint8Array(digest));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }
  return result === 0;
}

function json(body, status = 200, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function randomId(byteLength = 18) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64urlFromBytes(bytes);
}

function base64urlEncode(value) {
  return base64urlFromBytes(new TextEncoder().encode(value));
}

function base64urlDecode(value) {
  const bytes = base64urlToBytes(value);
  return new TextDecoder().decode(bytes);
}

function base64urlToBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64urlFromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sanitizeNextPath(value) {
  if (!value || typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  if (value.startsWith("//")) {
    return "/";
  }

  return value;
}

function requireConfig(env, keys) {
  for (const key of keys) {
    if (!env[key]) {
      throw new HttpError(500, `Missing required secret: ${key}`);
    }
  }
}
