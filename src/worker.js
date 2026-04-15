const SESSION_COOKIE = "flanki_session";
const FACEBOOK_OAUTH_COOKIE = "flanki_facebook_oauth";
const TOKEN_TYPE_VERIFY = "email_verify";
const TOKEN_TYPE_RESET = "password_reset";
const TEAM_A = "A";
const TEAM_B = "B";

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

  if (url.pathname === "/api/bootstrap" && request.method === "GET") return handleBootstrap(request, env, url);
  if (url.pathname === "/api/auth/facebook/start" && request.method === "GET") return handleFacebookStart(request, env, url);
  if (url.pathname === "/api/auth/facebook/callback" && request.method === "GET") return handleFacebookCallback(request, env, url);
  if (url.pathname === "/api/auth/dev-login" && request.method === "POST") return handleDevLogin(request, env, url);
  if (url.pathname === "/api/profile/nick" && request.method === "POST") return handleUpdateNick(request, env, await requireUser(request, env));

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return new Response(null, { status: 204, headers: sessionCookieHeaders(url, "", 0) });
  }

  if (url.pathname === "/api/friends" && request.method === "POST") {
    return handleAddFriend(request, env, await requireUser(request, env));
  }

  if (url.pathname === "/api/sessions" && request.method === "POST") {
    return handleCreateSession(request, env, await requireUser(request, env), url);
  }

  const inviteMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/invite$/);
  if (inviteMatch && request.method === "POST") {
    return handleInviteFriend(request, env, await requireUser(request, env), inviteMatch[1]);
  }

  const addInvitedPlayerMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/invites\/([^/]+)\/add$/);
  if (addInvitedPlayerMatch && request.method === "POST") {
    return handleAddInvitedPlayer(env, await requireUser(request, env), addInvitedPlayerMatch[1], addInvitedPlayerMatch[2], url.origin);
  }

  const autoTeamsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/auto$/);
  if (autoTeamsMatch && request.method === "POST") {
    return handleAutoTeams(env, await requireUser(request, env), autoTeamsMatch[1], url.origin);
  }

  const manualTeamsStartMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/manual$/);
  if (manualTeamsStartMatch && request.method === "POST") {
    return handleStartManualTeams(env, await requireUser(request, env), manualTeamsStartMatch[1], url.origin);
  }

  const manualAssignMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/assign$/);
  if (manualAssignMatch && request.method === "POST") {
    return handleManualAssign(request, env, await requireUser(request, env), manualAssignMatch[1], url.origin);
  }

  const captainsStartMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/captains$/);
  if (captainsStartMatch && request.method === "POST") {
    return handleStartCaptainDraft(request, env, await requireUser(request, env), captainsStartMatch[1], url.origin);
  }

  const draftPickMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/draft-pick$/);
  if (draftPickMatch && request.method === "POST") {
    return handleDraftPick(request, env, await requireUser(request, env), draftPickMatch[1], url.origin);
  }

  const reorderMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/teams\/reorder$/);
  if (reorderMatch && request.method === "POST") {
    return handleReorderTeam(request, env, await requireUser(request, env), reorderMatch[1], url.origin);
  }

  const matchStartMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/match\/start$/);
  if (matchStartMatch && request.method === "POST") {
    return handleMatchStart(env, await requireUser(request, env), matchStartMatch[1], url.origin);
  }

  const matchThrowMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/match\/throw$/);
  if (matchThrowMatch && request.method === "POST") {
    return handleMatchThrow(request, env, await requireUser(request, env), matchThrowMatch[1], url.origin);
  }

  const acceptMatch = url.pathname.match(/^\/api\/invites\/([^/]+)\/accept$/);
  if (acceptMatch && request.method === "POST") {
    return handleInviteResponse(env, await requireUser(request, env), acceptMatch[1], "accepted");
  }

  const declineMatch = url.pathname.match(/^\/api\/invites\/([^/]+)\/decline$/);
  if (declineMatch && request.method === "POST") {
    return handleInviteResponse(env, await requireUser(request, env), declineMatch[1], "declined");
  }

  const joinMatch = url.pathname.match(/^\/api\/join\/([^/]+)$/);
  if (joinMatch && request.method === "POST") {
    return handleJoinByToken(env, await requireUser(request, env), joinMatch[1], url);
  }

  if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Route not found.");
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
      authMessage:
        isFacebookConfigured(env) || isDevLoginEnabled(env)
          ? null
          : "No sign-in method is configured yet. Add Facebook secrets or enable dev login to continue.",
      authConfig: {
        facebookEnabled: isFacebookConfigured(env),
        devLoginEnabled: isDevLoginEnabled(env),
      },
      roadmap: getRoadmap(),
    });
  }

  return json({
    me: publicUser(user),
    friends: await listFriends(env, user.id),
    activeSession: await getLatestSessionForUser(env, user.id, url.origin),
    incomingInvites: await listIncomingInvites(env, user.id),
    authMessage: user.username ? null : "Add your player nick to unlock friend search, invites, and Flanki sessions.",
    authConfig: {
      facebookEnabled: isFacebookConfigured(env),
      devLoginEnabled: isDevLoginEnabled(env),
    },
    roadmap: getRoadmap(),
    leaderboard: await getLeaderboard(env),
  });
}

function getRoadmap() {
  return {
    nextUp: ["Match history and per-session details", "Player streaks and richer records", "Advanced ranking tuning"],
  };
}

async function handleFacebookStart(request, env, url) {
  requireConfig(env, ["SESSION_SECRET"]);
  if (!isFacebookConfigured(env)) {
    return authRedirect(url, "/?auth_error=facebook_not_configured", "", 0);
  }
  const next = sanitizeNextPath(url.searchParams.get("next") || "/");
  const stateToken = await signTemporaryToken(env.SESSION_SECRET, {
    next,
    nonce: randomId(12),
    exp: Date.now() + 10 * 60 * 1000,
  });
  const redirectUri = buildFacebookRedirectUri(env, url);
  const facebookUrl = new URL("https://www.facebook.com/dialog/oauth");
  facebookUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  facebookUrl.searchParams.set("redirect_uri", redirectUri);
  facebookUrl.searchParams.set("state", stateToken);
  facebookUrl.searchParams.set("scope", "public_profile,email");
  facebookUrl.searchParams.set("response_type", "code");

  const headers = oauthStateCookieHeaders(url, stateToken, 10 * 60);
  headers.set("Location", facebookUrl.toString());
  return new Response(null, { status: 302, headers });
}

async function handleFacebookCallback(request, env, url) {
  requireConfig(env, ["SESSION_SECRET"]);
  if (!isFacebookConfigured(env)) {
    return authRedirect(url, "/?auth_error=facebook_not_configured", "", 0);
  }
  const oauthStateCookie = parseCookies(request.headers.get("Cookie"))[FACEBOOK_OAUTH_COOKIE];
  const state = String(url.searchParams.get("state") || "");
  const code = String(url.searchParams.get("code") || "");
  const errorReason = String(url.searchParams.get("error_reason") || url.searchParams.get("error") || "");
  const statePayload = oauthStateCookie && oauthStateCookie === state ? await verifyTemporaryToken(env.SESSION_SECRET, state) : null;
  const next = sanitizeNextPath(statePayload?.next || "/");

  if (errorReason || !code || !statePayload) {
    return authRedirect(url, `${next}${next.includes("?") ? "&" : "?"}auth_error=facebook_login_failed`, "", 0);
  }

  const accessToken = await exchangeFacebookCode(env, url, code);
  const facebookProfile = await fetchFacebookProfile(accessToken);
  const user = await findOrCreateFacebookUser(env, facebookProfile);
  const sessionValue = await signSessionCookie(env.SESSION_SECRET, user);
  return authRedirect(url, next, sessionValue, 60 * 60 * 24 * 30);
}

async function handleDevLogin(request, env, url) {
  requireConfig(env, ["SESSION_SECRET"]);
  if (!isDevLoginEnabled(env)) throw new HttpError(403, "Dev login is disabled.");

  const body = await request.json();
  const displayName = normalizeDisplayName(body.displayName);
  const username = normalizeUsername(body.username);
  const next = sanitizeNextPath(body.next);

  let user = await env.DB.prepare(
    "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url, password_hash FROM users WHERE lower(username) = lower(?) LIMIT 1",
  )
    .bind(username)
    .first();

  if (user) {
    const isReusableDevUser = !user.facebook_id && !user.email && !user.password_hash;
    if (!isReusableDevUser) throw new HttpError(409, "That player nick is already taken.");

    await env.DB.prepare("UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?")
      .bind(displayName, avatarForDisplayName(displayName), user.id)
      .run();
  } else {
    const id = `usr_${randomId()}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, facebook_id, email, username, display_name, password_hash, email_verified, avatar_url) VALUES (?, NULL, NULL, ?, ?, NULL, 1, ?)",
      ).bind(id, username, displayName, avatarForDisplayName(displayName)),
      env.DB.prepare("INSERT OR IGNORE INTO player_records (user_id) VALUES (?)").bind(id),
    ]);
    user = { id };
  }

  const freshUser = await env.DB.prepare(
    "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE lower(username) = lower(?) LIMIT 1",
  )
    .bind(username)
    .first();

  return createAuthResponse(
    url,
    env,
    {
      id: freshUser.id,
      username: freshUser.username,
      displayName: freshUser.display_name,
      avatarUrl: freshUser.avatar_url,
      emailVerified: freshUser.email_verified,
    },
    next,
  );
}

async function handleUpdateNick(request, env, user) {
  const username = normalizeUsername((await request.json()).username);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1").bind(username).first();
  if (existing && existing.id !== user.id) throw new HttpError(409, "That player nick is already taken.");

  await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, user.id).run();
  const updated = await env.DB.prepare(
    "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE id = ? LIMIT 1",
  )
    .bind(user.id)
    .first();

  return json({ me: publicUser(updated), message: "Player nick saved." });
}

async function handleAddFriend(request, env, user) {
  assertHasPlayerNick(user);
  const username = normalizeUsername((await request.json()).username);
  const friend = await env.DB.prepare("SELECT id, username, display_name, avatar_url, email_verified FROM users WHERE lower(username) = lower(?)")
    .bind(username)
    .first();

  if (!friend) throw new HttpError(404, "That player has not created an account yet.");
  if (friend.id === user.id) throw new HttpError(400, "You cannot add yourself.");

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO friend_links (user_id, friend_id) VALUES (?, ?)").bind(user.id, friend.id),
    env.DB.prepare("INSERT OR IGNORE INTO friend_links (user_id, friend_id) VALUES (?, ?)").bind(friend.id, user.id),
  ]);

  return json({ ok: true });
}

async function handleCreateSession(request, env, user, url) {
  assertHasPlayerNick(user);
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) throw new HttpError(400, "Choose a Flanki session name.");

  const sessionId = randomId();
  const inviteToken = randomId();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO game_sessions (id, host_user_id, name, invite_token, status, team_mode, draft_turn_slot) VALUES (?, ?, ?, ?, 'open', 'waiting', NULL)",
    ).bind(sessionId, user.id, name, inviteToken),
    env.DB.prepare(
      "INSERT INTO session_members (session_id, user_id, role, team_slot, team_order, is_captain, is_out) VALUES (?, ?, 'host', NULL, NULL, 0, 0)",
    ).bind(sessionId, user.id),
  ]);

  return json({ session: await getSessionById(env, sessionId, url.origin) }, 201);
}

async function handleInviteFriend(request, env, user, sessionId) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot invite players once the match is live.");
  const friendId = String((await request.json()).friendId || "");

  const friendship = await env.DB.prepare("SELECT 1 FROM friend_links WHERE user_id = ? AND friend_id = ?").bind(user.id, friendId).first();
  if (!friendship) throw new HttpError(403, "That player is not on your friend list.");

  const member = await env.DB.prepare("SELECT 1 FROM session_members WHERE session_id = ? AND user_id = ?").bind(session.id, friendId).first();
  if (member) throw new HttpError(400, "That friend is already in the session.");

  await env.DB.prepare(
    "INSERT OR REPLACE INTO session_invites (id, session_id, inviter_user_id, invitee_user_id, status) VALUES (?, ?, ?, ?, 'pending')",
  )
    .bind(randomId(), session.id, user.id, friendId)
    .run();

  return json({ ok: true });
}

async function handleAddInvitedPlayer(env, user, sessionId, inviteId, origin) {
  assertHasPlayerNick(user);
  if (!isDevLoginEnabled(env)) throw new HttpError(403, "This shortcut is only available in local development.");

  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot add invited players once the match is live.");

  const invite = await env.DB.prepare(
    "SELECT id, session_id, invitee_user_id, status FROM session_invites WHERE id = ? AND session_id = ? LIMIT 1",
  )
    .bind(inviteId, session.id)
    .first();

  if (!invite) throw new HttpError(404, "Invite not found.");
  if (invite.status !== "pending") throw new HttpError(400, "That invite has already been handled.");

  const invitee = await env.DB.prepare("SELECT id, username FROM users WHERE id = ? LIMIT 1").bind(invite.invitee_user_id).first();
  if (!invitee) throw new HttpError(404, "Invited player not found.");
  if (!invitee.username) throw new HttpError(400, "Invited player still needs a nick before joining.");

  await env.DB.batch([
    env.DB.prepare("UPDATE session_invites SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invite.id),
    env.DB.prepare(
      "INSERT OR IGNORE INTO session_members (session_id, user_id, role, team_slot, team_order, is_captain, is_out) VALUES (?, ?, 'player', NULL, NULL, 0, 0)",
    ).bind(session.id, invite.invitee_user_id),
  ]);

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleAutoTeams(env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot rebuild teams during a live match.");
  const members = await listSessionMembers(env, session.id);
  if (members.length < 2) throw new HttpError(400, "You need at least two players to build Flanki teams.");

  const shuffled = [...members].sort(() => Math.random() - 0.5);
  const statements = [
    env.DB.prepare("UPDATE game_sessions SET team_mode = 'auto', draft_turn_slot = NULL, match_status = 'setup', current_turn_team = NULL, current_turn_user_id = NULL, throw_number = 0, winner_team = NULL, completed_at = NULL WHERE id = ?").bind(session.id),
  ];

  let teamAOrder = 1;
  let teamBOrder = 1;
  shuffled.forEach((member, index) => {
    const teamSlot = index % 2 === 0 ? TEAM_A : TEAM_B;
    const teamOrder = teamSlot === TEAM_A ? teamAOrder++ : teamBOrder++;
    statements.push(
      env.DB.prepare("UPDATE session_members SET team_slot = ?, team_order = ?, is_captain = 0, is_out = 0, out_throw_number = NULL WHERE session_id = ? AND user_id = ?").bind(
        teamSlot,
        teamOrder,
        session.id,
        member.id,
      ),
    );
  });

  await env.DB.batch(statements);
  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleStartManualTeams(env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot rebuild teams during a live match.");

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE game_sessions SET team_mode = 'manual', draft_turn_slot = NULL, match_status = 'setup', current_turn_team = NULL, current_turn_user_id = NULL, throw_number = 0, winner_team = NULL, completed_at = NULL WHERE id = ?",
    ).bind(session.id),
    env.DB.prepare(
      "UPDATE session_members SET team_slot = NULL, team_order = NULL, is_captain = 0, is_out = 0, out_throw_number = NULL WHERE session_id = ?",
    ).bind(session.id),
  ]);

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleStartCaptainDraft(request, env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot start a captain draft during a live match.");
  const body = await request.json();
  const captainAUserId = String(body.captainAUserId || "");
  const captainBUserId = String(body.captainBUserId || "");
  if (!captainAUserId || !captainBUserId || captainAUserId === captainBUserId) {
    throw new HttpError(400, "Choose two different captains.");
  }

  const members = await listSessionMembers(env, session.id);
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(captainAUserId) || !memberIds.has(captainBUserId)) {
    throw new HttpError(400, "Captains must already be in the session.");
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE game_sessions SET team_mode = 'captains', draft_turn_slot = ?, match_status = 'setup', current_turn_team = NULL, current_turn_user_id = NULL, throw_number = 0, winner_team = NULL, completed_at = NULL WHERE id = ?").bind(TEAM_A, session.id),
    env.DB.prepare("UPDATE session_members SET team_slot = NULL, team_order = NULL, is_captain = 0, is_out = 0, out_throw_number = NULL WHERE session_id = ?").bind(session.id),
    env.DB.prepare("UPDATE session_members SET team_slot = ?, team_order = 1, is_captain = 1 WHERE session_id = ? AND user_id = ?").bind(TEAM_A, session.id, captainAUserId),
    env.DB.prepare("UPDATE session_members SET team_slot = ?, team_order = 1, is_captain = 1 WHERE session_id = ? AND user_id = ?").bind(TEAM_B, session.id, captainBUserId),
  ]);

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleManualAssign(request, env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot change teams during a live match.");

  const body = await request.json();
  const userId = String(body.userId || "");
  const requestedTeamSlot = body.teamSlot == null ? null : String(body.teamSlot || "");
  if (!userId) throw new HttpError(400, "Choose a player to assign.");
  if (requestedTeamSlot !== null && ![TEAM_A, TEAM_B].includes(requestedTeamSlot)) {
    throw new HttpError(400, "Invalid team.");
  }

  const members = await listSessionMembers(env, session.id);
  const targetMember = members.find((member) => member.id === userId);
  if (!targetMember) throw new HttpError(404, "Player not found in this session.");

  const nextOrder =
    requestedTeamSlot === null
      ? null
      : Math.max(0, ...members.filter((member) => member.teamSlot === requestedTeamSlot && member.id !== userId).map((member) => member.teamOrder || 0)) + 1;

  await env.DB.prepare(
    "UPDATE session_members SET team_slot = ?, team_order = ?, is_captain = 0, is_out = 0, out_throw_number = NULL WHERE session_id = ? AND user_id = ?",
  )
    .bind(requestedTeamSlot, nextOrder, session.id, userId)
    .run();

  await normalizeTeamOrder(env, session.id, TEAM_A);
  await normalizeTeamOrder(env, session.id, TEAM_B);
  await env.DB.prepare("UPDATE game_sessions SET team_mode = 'manual', draft_turn_slot = NULL WHERE id = ?").bind(session.id).run();

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleDraftPick(request, env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const pickedUserId = String((await request.json()).userId || "");
  if (!pickedUserId) throw new HttpError(400, "Choose a player to draft.");

  const session = await env.DB.prepare("SELECT id, host_user_id, team_mode, draft_turn_slot FROM game_sessions WHERE id = ?")
    .bind(sessionId)
    .first();
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.team_mode !== "captains") throw new HttpError(400, "Captain draft is not active for this session.");

  const members = await listSessionMembers(env, session.id);
  const pickedMember = members.find((member) => member.id === pickedUserId);
  if (!pickedMember) throw new HttpError(404, "Player not found in this session.");
  if (pickedMember.teamSlot) throw new HttpError(400, "That player is already on a team.");

  const teamState = buildTeamState(members, session.team_mode, session.draft_turn_slot);
  const actingCaptain = teamState.currentCaptain;
  if (!actingCaptain) throw new HttpError(400, "Current captain could not be determined.");
  if (user.id !== session.host_user_id && user.id !== actingCaptain.id) {
    throw new HttpError(403, "Only the host or the current captain can make this pick.");
  }

  const assignedNonCaptains = members.filter((member) => !member.isCaptain && member.teamSlot).length;
  const nextTeamForPick = draftSlotForPickIndex(assignedNonCaptains);
  if (nextTeamForPick !== actingCaptain.teamSlot) throw new HttpError(400, "It is not that team's turn to pick.");

  const remainingAfterPick = members.filter((member) => !member.teamSlot && member.id !== pickedUserId).length;
  const nextTurn = remainingAfterPick === 0 ? null : draftSlotForPickIndex(assignedNonCaptains + 1);
  const nextMode = remainingAfterPick === 0 ? "ready" : "captains";
  const nextOrder =
    Math.max(
      0,
      ...members.filter((member) => member.teamSlot === actingCaptain.teamSlot).map((member) => member.teamOrder || 0),
    ) + 1;

  await env.DB.batch([
    env.DB.prepare("UPDATE session_members SET team_slot = ?, team_order = ?, is_out = 0, out_throw_number = NULL WHERE session_id = ? AND user_id = ?").bind(
      actingCaptain.teamSlot,
      nextOrder,
      session.id,
      pickedUserId,
    ),
    env.DB.prepare("UPDATE game_sessions SET team_mode = ?, draft_turn_slot = ? WHERE id = ?").bind(nextMode, nextTurn, session.id),
  ]);

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleReorderTeam(request, env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "You cannot reorder players during a live match.");
  const body = await request.json();
  const teamSlot = String(body.teamSlot || "");
  const orderedUserIds = Array.isArray(body.orderedUserIds) ? body.orderedUserIds.map(String) : [];
  if (![TEAM_A, TEAM_B].includes(teamSlot)) throw new HttpError(400, "Invalid team.");
  if (!orderedUserIds.length) throw new HttpError(400, "Provide the full team order.");

  const members = await listSessionMembers(env, session.id);
  const teamMembers = members.filter((member) => member.teamSlot === teamSlot);
  const teamIds = teamMembers.map((member) => member.id).sort();
  const incomingIds = [...orderedUserIds].sort();
  if (JSON.stringify(teamIds) !== JSON.stringify(incomingIds)) {
    throw new HttpError(400, "Team order must include every player on that team exactly once.");
  }
  await env.DB.batch(
    orderedUserIds.map((userId, index) =>
      env.DB.prepare("UPDATE session_members SET team_order = ? WHERE session_id = ? AND user_id = ?").bind(index + 1, session.id, userId),
    ),
  );

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleMatchStart(env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const session = await requireOwnedSession(env, sessionId, user.id);
  ensureMatchNotLive(session.match_status, "The match is already live.");
  const members = await listSessionMembers(env, session.id);
  const teamA = members.filter((member) => member.teamSlot === TEAM_A);
  const teamB = members.filter((member) => member.teamSlot === TEAM_B);
  const unassigned = members.filter((member) => !member.teamSlot);

  if (unassigned.length) throw new HttpError(400, "Assign all players to teams before starting the match.");
  if (!teamA.length || !teamB.length) throw new HttpError(400, "Both teams need at least one player.");
  if (teamA.some((member) => !member.teamOrder) || teamB.some((member) => !member.teamOrder)) {
    throw new HttpError(400, "Every team player must have an order.");
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM throw_events WHERE session_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM session_stats WHERE session_id = ?").bind(session.id),
    env.DB.prepare("UPDATE session_members SET is_out = 0, out_throw_number = NULL WHERE session_id = ?").bind(session.id),
    env.DB.prepare(
      "UPDATE game_sessions SET match_status = 'live', current_turn_team = ?, current_turn_user_id = ?, throw_number = 0, winner_team = NULL, completed_at = NULL WHERE id = ?",
    ).bind(TEAM_A, firstActivePlayerId(teamA), session.id),
    ...members.map((member) =>
      env.DB.prepare(
        "INSERT INTO session_stats (id, session_id, user_id, team_slot, throws, hits, misses, turns_taken, finished_beer, hits_when_finished, ranking_points) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, NULL, 0)",
      ).bind(`sst_${randomId()}`, session.id, member.id, member.teamSlot),
    ),
  ]);

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleMatchThrow(request, env, user, sessionId, origin) {
  assertHasPlayerNick(user);
  const body = await request.json();
  const wasHit = Boolean(body.wasHit);
  const finishedBeer = Boolean(body.finishedBeer);
  const session = await env.DB.prepare(
    "SELECT id, host_user_id, match_status, current_turn_team, current_turn_user_id, throw_number FROM game_sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first();

  if (!session) throw new HttpError(404, "Session not found.");
  if (session.match_status !== "live") throw new HttpError(400, "Match is not live.");
  if (user.id !== session.host_user_id && user.id !== session.current_turn_user_id) {
    throw new HttpError(403, "Only the current player or host can log this throw.");
  }

  const members = await listSessionMembers(env, session.id);
  const currentPlayer = members.find((member) => member.id === session.current_turn_user_id);
  if (!currentPlayer) throw new HttpError(400, "Current player is missing from the session.");
  if (currentPlayer.isOut) throw new HttpError(400, "Current player is already off the field.");

  const throwNumber = Number(session.throw_number) + 1;
  const teamHitsRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(hits), 0) AS hits FROM session_stats WHERE session_id = ? AND team_slot = ?",
  )
    .bind(session.id, currentPlayer.teamSlot)
    .first();
  const nextTeamHits = Number(teamHitsRow?.hits || 0) + (wasHit ? 1 : 0);

  const statements = [
    env.DB.prepare(
      "UPDATE session_stats SET throws = throws + 1, hits = hits + ?, misses = misses + ?, turns_taken = turns_taken + 1, finished_beer = finished_beer + ?, hits_when_finished = CASE WHEN ? = 1 AND hits_when_finished IS NULL THEN ? ELSE hits_when_finished END WHERE session_id = ? AND user_id = ?",
    ).bind(wasHit ? 1 : 0, wasHit ? 0 : 1, finishedBeer ? 1 : 0, finishedBeer ? 1 : 0, nextTeamHits, session.id, currentPlayer.id),
    env.DB.prepare(
      "INSERT INTO throw_events (id, session_id, throw_number, user_id, team_slot, was_hit, finished_beer) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(`thr_${randomId()}`, session.id, throwNumber, currentPlayer.id, currentPlayer.teamSlot, wasHit ? 1 : 0, finishedBeer ? 1 : 0),
  ];

  if (finishedBeer) {
    statements.push(
      env.DB.prepare("UPDATE session_members SET is_out = 1, out_throw_number = ? WHERE session_id = ? AND user_id = ?").bind(
        throwNumber,
        session.id,
        currentPlayer.id,
      ),
    );
  }

  await env.DB.batch(statements);
  const updatedMembers = await listSessionMembers(env, session.id);
  const winningTeam = getWinningTeam(updatedMembers);

  if (winningTeam) {
    await finalizeMatch(env, session.id, winningTeam);
    return json({ session: await getSessionById(env, session.id, origin), leaderboard: await getLeaderboard(env) });
  }

  const nextTurnTeam = currentPlayer.teamSlot === TEAM_A ? TEAM_B : TEAM_A;
  const lastThrowerOnNextTeam = await getLastThrowerForTeam(env, session.id, nextTurnTeam);
  const nextPlayer = getNextActivePlayer(updatedMembers, nextTurnTeam, lastThrowerOnNextTeam);
  if (!nextPlayer) throw new HttpError(400, "No active player found for the next turn.");

  await env.DB.prepare("UPDATE game_sessions SET throw_number = ?, current_turn_team = ?, current_turn_user_id = ? WHERE id = ?")
    .bind(throwNumber, nextTurnTeam, nextPlayer.id, session.id)
    .run();

  return json({ session: await getSessionById(env, session.id, origin) });
}

async function handleInviteResponse(env, user, inviteId, nextStatus) {
  const invite = await env.DB.prepare(
    "SELECT si.id, si.session_id, si.invitee_user_id, si.status, gs.match_status FROM session_invites si JOIN game_sessions gs ON gs.id = si.session_id WHERE si.id = ?",
  )
    .bind(inviteId)
    .first();
  if (!invite) throw new HttpError(404, "Invite not found.");
  if (invite.invitee_user_id !== user.id) throw new HttpError(403, "That invite does not belong to you.");
  if (invite.status !== "pending") throw new HttpError(400, "That invite has already been handled.");

  const operations = [
    env.DB.prepare("UPDATE session_invites SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextStatus, inviteId),
  ];
  if (nextStatus === "accepted") {
    assertHasPlayerNick(user);
    ensureMatchNotLive(invite.match_status, "You cannot join a session after the match has started.");
    operations.push(
      env.DB.prepare("INSERT OR IGNORE INTO session_members (session_id, user_id, role, team_slot, team_order, is_captain, is_out) VALUES (?, ?, 'player', NULL, NULL, 0, 0)")
        .bind(invite.session_id, user.id),
    );
  }

  await env.DB.batch(operations);
  return json({ ok: true });
}

async function handleJoinByToken(env, user, token, url) {
  assertHasPlayerNick(user);
  const session = await env.DB.prepare("SELECT id, match_status FROM game_sessions WHERE invite_token = ?").bind(token).first();
  if (!session) throw new HttpError(404, "That session link is no longer valid.");
  ensureMatchNotLive(session.match_status, "You cannot join a session after the match has started.");

  await env.DB.prepare("INSERT OR IGNORE INTO session_members (session_id, user_id, role, team_slot, team_order, is_captain, is_out) VALUES (?, ?, 'player', NULL, NULL, 0, 0)")
    .bind(session.id, user.id)
    .run();

  return json({ session: await getSessionById(env, session.id, url.origin) });
}

async function requireOwnedSession(env, sessionId, hostUserId) {
  const session = await env.DB.prepare("SELECT id, host_user_id, team_mode, match_status FROM game_sessions WHERE id = ?").bind(sessionId).first();
  if (!session) throw new HttpError(404, "Session not found.");
  if (session.host_user_id !== hostUserId) throw new HttpError(403, "Only the session host can do that.");
  return session;
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
  if (!sessionCookie || !env.SESSION_SECRET) return null;
  const session = await verifySessionCookie(env.SESSION_SECRET, sessionCookie);
  if (!session) return null;
  return (
    (await env.DB.prepare("SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE id = ?")
      .bind(session.sub)
      .first()) || null
  );
}

async function requireUser(request, env) {
  const user = await getOptionalUser(request, env);
  if (!user) throw new HttpError(401, "Please sign in first.");
  return user;
}

async function issueToken(env, userId, type, expiresInHours) {
  const rawToken = randomId(24);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(`tok_${randomId()}`, userId, tokenHash, type, expiresAt)
    .run();
  return { rawToken };
}

async function resolveValidToken(env, rawToken, type) {
  const tokenHash = await sha256(rawToken);
  return env.DB.prepare(
    "SELECT id, user_id, expires_at FROM auth_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
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
    `<p>Hi ${escapeHtml(user.displayName)},</p><p>Confirm your email address to finish setting up your Flanki player profile.</p><p><a href="${verifyUrl}">Verify email</a></p>`,
    `Verify your Flanki account: ${verifyUrl}`,
  );
}

async function sendPasswordResetEmail(env, url, user, rawToken) {
  const resetUrl = buildPublicUrl(env, url, `/?reset=${encodeURIComponent(rawToken)}`);
  return sendTransactionalEmail(
    env,
    user.email,
    "Reset your Flanki password",
    `<p>Hi ${escapeHtml(user.displayName)},</p><p>Use this link to choose a new password for your Flanki player profile.</p><p><a href="${resetUrl}">Reset password</a></p>`,
    `Reset your Flanki password: ${resetUrl}`,
  );
}

async function sendTransactionalEmail(env, to, subject, html, text) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return {
      notice: "Email sending is not configured yet. Using a dev link instead.",
      devLink: extractFirstLink(text),
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

  if (!response.ok) throw new HttpError(502, `Email delivery failed: ${await response.text()}`);
  return { notice: "Email sent.", devLink: null };
}

function extractFirstLink(text) {
  const match = String(text || "").match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function buildPublicUrl(env, url, path) {
  return new URL(path, env.APP_ORIGIN || url.origin).toString();
}

async function listFriends(env, userId) {
  const result = await env.DB.prepare(
    "SELECT u.id, u.username, u.display_name, u.avatar_url, u.email_verified FROM friend_links fl JOIN users u ON u.id = fl.friend_id WHERE fl.user_id = ? ORDER BY lower(u.display_name), lower(u.username)",
  )
    .bind(userId)
    .all();
  return (result.results || []).map(publicUser);
}

async function getLatestSessionForUser(env, userId, origin) {
  const record = await env.DB.prepare(
    "SELECT gs.id FROM game_sessions gs JOIN session_members sm ON sm.session_id = gs.id WHERE sm.user_id = ? AND gs.status = 'open' ORDER BY gs.created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first();
  return record ? getSessionById(env, record.id, origin) : null;
}

async function listSessionMembers(env, sessionId) {
  const result = await env.DB.prepare(
    `
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.email_verified, sm.role, sm.team_slot, sm.team_order, sm.is_captain, sm.is_out, sm.out_throw_number
      FROM session_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.session_id = ?
      ORDER BY CASE WHEN sm.team_slot IS NULL THEN 1 ELSE 0 END, sm.team_slot, COALESCE(sm.team_order, 999), lower(u.display_name), lower(u.username)
    `,
  )
    .bind(sessionId)
    .all();

  return (result.results || []).map((member) => ({
    ...publicUser(member),
    role: member.role,
    teamSlot: member.team_slot,
    teamOrder: member.team_order,
    isCaptain: Boolean(member.is_captain),
    isOut: Boolean(member.is_out),
    outThrowNumber: member.out_throw_number,
  }));
}

async function getSessionById(env, sessionId, origin) {
  const session = await env.DB.prepare(
    `
      SELECT
        gs.id,
        gs.name,
        gs.status,
        gs.invite_token,
        gs.team_mode,
        gs.draft_turn_slot,
        gs.match_status,
        gs.current_turn_team,
        gs.current_turn_user_id,
        gs.throw_number,
        gs.winner_team,
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

  if (!session) return null;

  const members = await listSessionMembers(env, sessionId);
  const pendingInvitesResult = await env.DB.prepare(
    "SELECT si.id AS invite_id, u.id, u.username, u.display_name, u.avatar_url, u.email_verified FROM session_invites si JOIN users u ON u.id = si.invitee_user_id WHERE si.session_id = ? AND si.status = 'pending' ORDER BY lower(u.display_name), lower(u.username)",
  )
    .bind(sessionId)
    .all();

  const teamState = buildTeamState(members, session.team_mode, session.draft_turn_slot);
  const match = await getMatchState(env, session, members);

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
    members,
    pendingInvites: (pendingInvitesResult.results || []).map((invite) => ({
      inviteId: invite.invite_id,
      ...publicUser(invite),
    })),
    teams: teamState,
    playerCount: members.length,
    match,
  };
}

function buildTeamState(members, teamMode = "waiting", draftTurnSlot = null) {
  const teamA = members.filter((member) => member.teamSlot === TEAM_A).sort(compareTeamOrder);
  const teamB = members.filter((member) => member.teamSlot === TEAM_B).sort(compareTeamOrder);
  const unassigned = members.filter((member) => !member.teamSlot);
  const captains = members.filter((member) => member.isCaptain);
  const currentCaptain =
    teamMode === "captains" ? captains.find((captain) => captain.teamSlot === draftTurnSlot) || null : null;

  return {
    mode: teamMode,
    draftTurnSlot,
    teamA,
    teamB,
    unassigned,
    captains,
    currentCaptain,
    canFinalizeStats: teamA.length > 0 && teamB.length > 0 && unassigned.length === 0,
  };
}

function compareTeamOrder(left, right) {
  return (left.teamOrder || 999) - (right.teamOrder || 999);
}

function draftSlotForPickIndex(pickIndex) {
  if (pickIndex === 0) return TEAM_A;
  return Math.floor((pickIndex - 1) / 2) % 2 === 0 ? TEAM_B : TEAM_A;
}

function ensureMatchNotLive(matchStatus, message) {
  if (matchStatus === "live") throw new HttpError(400, message);
}

function isFacebookConfigured(env) {
  return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
}

function isDevLoginEnabled(env) {
  return String(env.ALLOW_DEV_LOGIN || "").toLowerCase() === "true" && getAppEnv(env) === "development";
}

function getAppEnv(env) {
  return String(env.APP_ENV || "development").toLowerCase();
}

async function listIncomingInvites(env, userId) {
  const result = await env.DB.prepare(
    "SELECT si.id, si.created_at, gs.name AS session_name, inviter.id AS inviter_id, inviter.username AS inviter_username, inviter.display_name AS inviter_display_name, inviter.avatar_url AS inviter_avatar_url, inviter.email_verified AS inviter_email_verified FROM session_invites si JOIN game_sessions gs ON gs.id = si.session_id JOIN users inviter ON inviter.id = si.inviter_user_id WHERE si.invitee_user_id = ? AND si.status = 'pending' ORDER BY si.created_at DESC",
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

async function getMatchState(env, session, members) {
  const statsResult = await env.DB.prepare(
    "SELECT user_id, team_slot, throws, hits, misses, turns_taken, finished_beer, hits_when_finished, ranking_points FROM session_stats WHERE session_id = ?",
  )
    .bind(session.id)
    .all();
  const statsByUser = new Map((statsResult.results || []).map((row) => [row.user_id, row]));
  const currentPlayer = members.find((member) => member.id === session.current_turn_user_id) || null;
  const teamA = members.filter((member) => member.teamSlot === TEAM_A);
  const teamB = members.filter((member) => member.teamSlot === TEAM_B);

  return {
    status: session.match_status,
    currentTurnTeam: session.current_turn_team,
    currentPlayer,
    throwNumber: session.throw_number,
    winnerTeam: session.winner_team,
    teamA: buildTeamMatchSummary(teamA, statsByUser),
    teamB: buildTeamMatchSummary(teamB, statsByUser),
    playerStats: members
      .filter((member) => member.teamSlot)
      .sort((left, right) => compareTeamOrder(left, right))
      .map((member) => buildPlayerStat(member, statsByUser.get(member.id))),
  };
}

function buildTeamMatchSummary(teamMembers, statsByUser) {
  const totals = teamMembers.reduce(
    (accumulator, member) => {
      const stats = statsByUser.get(member.id);
      accumulator.throws += Number(stats?.throws || 0);
      accumulator.hits += Number(stats?.hits || 0);
      accumulator.activePlayers += member.isOut ? 0 : 1;
      accumulator.finishedPlayers += member.isOut ? 1 : 0;
      return accumulator;
    },
    { throws: 0, hits: 0, activePlayers: 0, finishedPlayers: 0 },
  );

  return {
    ...totals,
    accuracy: totals.throws ? Math.round((totals.hits / totals.throws) * 100) : 0,
  };
}

function buildPlayerStat(member, stats) {
  const throws = Number(stats?.throws || 0);
  const hits = Number(stats?.hits || 0);
  return {
    id: member.id,
    displayName: member.displayName,
    username: member.username,
    teamSlot: member.teamSlot,
    teamOrder: member.teamOrder,
    isOut: member.isOut,
    throws,
    hits,
    accuracy: throws ? Math.round((hits / throws) * 100) : 0,
    finishedBeer: Boolean(stats?.finished_beer),
    hitsWhenFinished: stats?.hits_when_finished ?? null,
    rankingPoints: Number(stats?.ranking_points || 0),
  };
}

async function getLeaderboard(env) {
  const result = await env.DB.prepare(
    `
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        pr.matches_played,
        pr.wins,
        pr.losses,
        pr.total_throws,
        pr.total_hits,
        pr.beers_finished,
        pr.total_hits_when_finished,
        pr.ranking_points,
        pr.rating
      FROM player_records pr
      JOIN users u ON u.id = pr.user_id
      WHERE u.username IS NOT NULL
      ORDER BY pr.rating DESC, pr.ranking_points DESC, pr.total_hits DESC
      LIMIT 20
    `,
  ).all();

  return (result.results || []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || avatarForDisplayName(row.display_name),
    matchesPlayed: Number(row.matches_played || 0),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    totalThrows: Number(row.total_throws || 0),
    totalHits: Number(row.total_hits || 0),
    beersFinished: Number(row.beers_finished || 0),
    avgHitsToFinish:
      Number(row.beers_finished || 0) > 0 ? Math.round((Number(row.total_hits_when_finished || 0) / Number(row.beers_finished)) * 10) / 10 : null,
    accuracy: Number(row.total_throws || 0) > 0 ? Math.round((Number(row.total_hits || 0) / Number(row.total_throws)) * 100) : 0,
    rankingPoints: Number(row.ranking_points || 0),
    rating: Number(row.rating || 1000),
  }));
}

function firstActivePlayerId(teamMembers) {
  return [...teamMembers].sort(compareTeamOrder)[0]?.id || null;
}

async function getLastThrowerForTeam(env, sessionId, teamSlot) {
  const row = await env.DB.prepare(
    "SELECT user_id FROM throw_events WHERE session_id = ? AND team_slot = ? ORDER BY throw_number DESC LIMIT 1",
  )
    .bind(sessionId, teamSlot)
    .first();
  return row?.user_id || null;
}

async function normalizeTeamOrder(env, sessionId, teamSlot) {
  const result = await env.DB.prepare(
    "SELECT user_id FROM session_members WHERE session_id = ? AND team_slot = ? ORDER BY COALESCE(team_order, 999), joined_at, user_id",
  )
    .bind(sessionId, teamSlot)
    .all();

  const rows = result.results || [];
  if (!rows.length) return;

  await env.DB.batch(
    rows.map((row, index) =>
      env.DB.prepare("UPDATE session_members SET team_order = ? WHERE session_id = ? AND user_id = ?").bind(index + 1, sessionId, row.user_id),
    ),
  );
}

function getNextActivePlayer(members, teamSlot, lastThrowerId) {
  const active = members.filter((member) => member.teamSlot === teamSlot && !member.isOut).sort(compareTeamOrder);
  if (!active.length) return null;
  if (!lastThrowerId) return active[0];
  const lastIndex = active.findIndex((member) => member.id === lastThrowerId);
  if (lastIndex === -1) return active[0];
  return active[(lastIndex + 1) % active.length];
}

function getWinningTeam(members) {
  const teamA = members.filter((member) => member.teamSlot === TEAM_A);
  const teamB = members.filter((member) => member.teamSlot === TEAM_B);
  if (teamA.length && teamA.every((member) => member.isOut)) return TEAM_A;
  if (teamB.length && teamB.every((member) => member.isOut)) return TEAM_B;
  return null;
}

async function finalizeMatch(env, sessionId, winnerTeam) {
  const statsResult = await env.DB.prepare(
    "SELECT user_id, team_slot, throws, hits, misses, turns_taken, finished_beer, hits_when_finished FROM session_stats WHERE session_id = ?",
  )
    .bind(sessionId)
    .all();

  const updates = [
    env.DB.prepare(
      "UPDATE game_sessions SET match_status = 'completed', winner_team = ?, current_turn_team = NULL, current_turn_user_id = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(winnerTeam, sessionId),
  ];

  for (const row of statsResult.results || []) {
    const throws = Number(row.throws || 0);
    const hits = Number(row.hits || 0);
    const finishedBeer = Number(row.finished_beer || 0);
    const accuracyBonus = throws ? Math.round((hits / throws) * 100) : 0;
    const winBonus = row.team_slot === winnerTeam ? 35 : -5;
    const finishBonus = finishedBeer ? 20 : 0;
    const rankingPoints = hits * 12 + accuracyBonus + finishBonus + winBonus;

    updates.push(
      env.DB.prepare("UPDATE session_stats SET ranking_points = ? WHERE session_id = ? AND user_id = ?").bind(
        rankingPoints,
        sessionId,
        row.user_id,
      ),
      env.DB.prepare(
        `
          UPDATE player_records
          SET
            matches_played = matches_played + 1,
            wins = wins + ?,
            losses = losses + ?,
            total_throws = total_throws + ?,
            total_hits = total_hits + ?,
            beers_finished = beers_finished + ?,
            total_hits_when_finished = total_hits_when_finished + ?,
            ranking_points = ranking_points + ?,
            rating = rating + ?
          WHERE user_id = ?
        `,
      ).bind(
        row.team_slot === winnerTeam ? 1 : 0,
        row.team_slot === winnerTeam ? 0 : 1,
        throws,
        hits,
        finishedBeer,
        Number(row.hits_when_finished || 0),
        rankingPoints,
        rankingPoints,
        row.user_id,
      ),
    );
  }

  await env.DB.batch(updates);
}

async function findOrCreateFacebookUser(env, facebookProfile) {
  const facebookId = String(facebookProfile.id || "").trim();
  const displayName = normalizeDisplayName(facebookProfile.name);
  const avatarUrl = facebookProfile.picture?.data?.url || avatarForDisplayName(displayName);
  const email = normalizeOptionalEmail(facebookProfile.email);

  let user = await env.DB.prepare(
    "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE facebook_id = ? LIMIT 1",
  )
    .bind(facebookId)
    .first();

  if (!user && email) {
    user = await env.DB.prepare(
      "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE lower(email) = lower(?) LIMIT 1",
    )
      .bind(email)
      .first();
  }

  if (user) {
    await env.DB.prepare(
      "UPDATE users SET facebook_id = ?, email = COALESCE(?, email), display_name = ?, avatar_url = ?, email_verified = 1 WHERE id = ?",
    )
      .bind(facebookId, email, displayName, avatarUrl, user.id)
      .run();
  } else {
    const id = `usr_${randomId()}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, facebook_id, email, username, display_name, password_hash, email_verified, avatar_url) VALUES (?, ?, ?, NULL, ?, NULL, 1, ?)",
      ).bind(id, facebookId, email, displayName, avatarUrl),
      env.DB.prepare("INSERT OR IGNORE INTO player_records (user_id) VALUES (?)").bind(id),
    ]);
    user = { id };
  }

  const freshUser = await env.DB.prepare(
    "SELECT id, facebook_id, email, username, display_name, email_verified, avatar_url FROM users WHERE id = ? LIMIT 1",
  )
    .bind(user.id)
    .first();

  return {
    id: freshUser.id,
    facebookId: freshUser.facebook_id,
    email: freshUser.email,
    username: freshUser.username,
    displayName: freshUser.display_name,
    emailVerified: freshUser.email_verified,
    avatarUrl: freshUser.avatar_url || avatarForDisplayName(freshUser.display_name),
  };
}

async function exchangeFacebookCode(env, url, code) {
  const response = await fetch("https://graph.facebook.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: buildFacebookRedirectUri(env, url),
      code,
    }).toString(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new HttpError(502, "Facebook sign-in could not be completed.");
  }

  return payload.access_token;
}

async function fetchFacebookProfile(accessToken) {
  const profileUrl = new URL("https://graph.facebook.com/me");
  profileUrl.searchParams.set("fields", "id,name,email,picture.width(200).height(200)");
  profileUrl.searchParams.set("access_token", accessToken);
  const response = await fetch(profileUrl);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id || !payload?.name) throw new HttpError(502, "Facebook profile data is unavailable.");
  return payload;
}

function buildFacebookRedirectUri(env, url) {
  return new URL("/api/auth/facebook/callback", env.APP_ORIGIN || url.origin).toString();
}

async function signTemporaryToken(secret, payload) {
  const encoded = base64urlEncode(JSON.stringify(payload));
  return `${encoded}.${await hmacSha256(secret, encoded)}`;
}

async function verifyTemporaryToken(secret, value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature) return null;
  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature))) return null;
  try {
    const parsed = JSON.parse(base64urlDecode(payload));
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function authRedirect(url, location, sessionValue, sessionMaxAge) {
  const headers = sessionCookieHeaders(url, sessionValue, sessionMaxAge);
  headers.append(
    "Set-Cookie",
    buildCookie(FACEBOOK_OAUTH_COOKIE, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    }),
  );
  headers.set("Location", location);
  return new Response(null, { status: 302, headers });
}

function assertHasPlayerNick(user) {
  if (!user?.username) throw new HttpError(400, "Add your player nick first.");
}

function rowToSessionUser(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    emailVerified: row.email_verified,
    avatarUrl: row.avatar_url || avatarForDisplayName(row.display_name),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username || null,
    displayName: user.display_name || user.displayName,
    hasPlayerNick: Boolean(user.username),
    avatarUrl: user.avatar_url || user.avatarUrl || avatarForDisplayName(user.display_name || user.displayName),
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  return email;
}

function normalizeOptionalEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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
  if (displayName.length < 2 || displayName.length > 32) throw new HttpError(400, "Display name must be between 2 and 32 characters.");
  return displayName;
}

function validatePassword(password) {
  if (String(password || "").length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2$120000$${base64urlFromBytes(salt)}$${base64urlFromBytes(new Uint8Array(hashBuffer))}`;
}

async function verifyPassword(password, storedHash) {
  const [scheme, iterationText, saltText, hashText] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !iterationText || !saltText || !hashText) return false;
  const expected = base64urlToBytes(hashText);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64urlToBytes(saltText), iterations: Number(iterationText), hash: "SHA-256" },
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
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

function oauthStateCookieHeaders(url, value, maxAge) {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    buildCookie(FACEBOOK_OAUTH_COOKIE, value, {
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
  const payload = base64urlEncode(JSON.stringify({ sub: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return `${payload}.${await hmacSha256(secret, payload)}`;
}

async function verifySessionCookie(secret, value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature) return null;
  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature))) return null;
  try {
    const parsed = JSON.parse(base64urlDecode(payload));
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64urlFromBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function sha256(value) {
  return base64urlFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

function json(body, status = 200, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function randomId(byteLength = 18) {
  return base64urlFromBytes(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function base64urlEncode(value) {
  return base64urlFromBytes(new TextEncoder().encode(value));
}

function base64urlDecode(value) {
  return new TextDecoder().decode(base64urlToBytes(value));
}

function base64urlToBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64urlFromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sanitizeNextPath(value) {
  if (!value || typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function requireConfig(env, keys) {
  for (const key of keys) {
    if (!env[key]) throw new HttpError(500, `Missing required secret: ${key}`);
  }
}
