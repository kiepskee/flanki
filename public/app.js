const state = {
  me: null,
  friends: [],
  session: null,
  incomingInvites: [],
  authMessage: null,
  roadmap: [],
  leaderboard: [],
  joiningDeepLink: false,
  verifyingEmail: false,
};

const elements = {
  signedOutView: document.querySelector("#signed-out-view"),
  signedInView: document.querySelector("#signed-in-view"),
  dashboard: document.querySelector("#dashboard"),
  signupForm: document.querySelector("#signup-form"),
  loginForm: document.querySelector("#login-form"),
  forgotPasswordForm: document.querySelector("#forgot-password-form"),
  resetPasswordForm: document.querySelector("#reset-password-form"),
  meAvatar: document.querySelector("#me-avatar"),
  meName: document.querySelector("#me-name"),
  meHandle: document.querySelector("#me-handle"),
  verificationBanner: document.querySelector("#verification-banner"),
  verificationMessage: document.querySelector("#verification-message"),
  resendVerificationButton: document.querySelector("#resend-verification-button"),
  logoutButton: document.querySelector("#logout-button"),
  friendForm: document.querySelector("#friend-form"),
  friendUsername: document.querySelector("#friend-username"),
  friendList: document.querySelector("#friend-list"),
  friendEmpty: document.querySelector("#friend-empty"),
  incomingList: document.querySelector("#incoming-list"),
  incomingEmpty: document.querySelector("#incoming-empty"),
  sessionForm: document.querySelector("#session-form"),
  sessionEmpty: document.querySelector("#session-empty"),
  sessionCard: document.querySelector("#session-card"),
  sessionNameOutput: document.querySelector("#session-name-output"),
  sessionHostOutput: document.querySelector("#session-host-output"),
  sessionSizeOutput: document.querySelector("#session-size-output"),
  sessionStatusOutput: document.querySelector("#session-status-output"),
  sessionLink: document.querySelector("#session-link"),
  copyLinkButton: document.querySelector("#copy-link-button"),
  qrImage: document.querySelector("#qr-image"),
  autoTeamsButton: document.querySelector("#auto-teams-button"),
  captainDraftButton: document.querySelector("#captain-draft-button"),
  startMatchButton: document.querySelector("#start-match-button"),
  captainSetup: document.querySelector("#captain-setup"),
  captainASelect: document.querySelector("#captain-a-select"),
  captainBSelect: document.querySelector("#captain-b-select"),
  startDraftButton: document.querySelector("#start-draft-button"),
  draftBanner: document.querySelector("#draft-banner"),
  draftTurnText: document.querySelector("#draft-turn-text"),
  teamAList: document.querySelector("#team-a-list"),
  teamBList: document.querySelector("#team-b-list"),
  teamASummary: document.querySelector("#team-a-summary"),
  teamBSummary: document.querySelector("#team-b-summary"),
  availablePlayerList: document.querySelector("#available-player-list"),
  inviteList: document.querySelector("#invite-list"),
  matchPanel: document.querySelector("#match-panel"),
  matchStatusTitle: document.querySelector("#match-status-title"),
  currentPlayerText: document.querySelector("#current-player-text"),
  throwMissButton: document.querySelector("#throw-miss-button"),
  throwHitButton: document.querySelector("#throw-hit-button"),
  throwFinishButton: document.querySelector("#throw-finish-button"),
  throwHitFinishButton: document.querySelector("#throw-hit-finish-button"),
  playerStatsList: document.querySelector("#player-stats-list"),
  leaderboardList: document.querySelector("#leaderboard-list"),
  roadmapList: document.querySelector("#roadmap-list"),
  friendTemplate: document.querySelector("#friend-item-template"),
  incomingTemplate: document.querySelector("#incoming-item-template"),
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(payload.error || "Request failed.");
  }

  if (response.status === 204) return null;
  return response.json();
}

function query() {
  return new URLSearchParams(window.location.search);
}

function getJoinTarget() {
  return window.location.pathname.startsWith("/join/") ? window.location.pathname : "/";
}

function showInfo(payload) {
  if (payload?.devLink) {
    alert(`${payload.message || payload.notice}\n\nDev link:\n${payload.devLink}`);
  } else if (payload?.message || payload?.notice) {
    alert(payload.message || payload.notice);
  }
}

function updateResetVisibility() {
  elements.resetPasswordForm.hidden = !query().get("reset");
}

function toggleAuth() {
  const signedIn = Boolean(state.me);
  elements.signedOutView.hidden = signedIn;
  elements.signedInView.hidden = !signedIn;
  elements.dashboard.hidden = !signedIn;

  if (!signedIn) {
    elements.verificationBanner.hidden = true;
    return;
  }

  elements.meAvatar.src = state.me.avatarUrl;
  elements.meName.textContent = state.me.displayName;
  elements.meHandle.textContent = `@${state.me.username}`;
  elements.verificationBanner.hidden = state.me.emailVerified;
  if (!state.me.emailVerified) {
    elements.verificationMessage.textContent = state.authMessage || "Verify your email to secure your account.";
  }
}

function renderRoadmap() {
  elements.roadmapList.innerHTML = "";
  for (const item of state.roadmap) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = `<div><strong>${item}</strong></div>`;
    elements.roadmapList.appendChild(li);
  }
}

function renderLeaderboard() {
  elements.leaderboardList.innerHTML = "";
  for (const player of state.leaderboard) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = `<div><strong>${player.displayName}</strong><p class="meta">@${player.username} | rating ${player.rating} | wins ${player.wins}/${player.matchesPlayed} | accuracy ${player.accuracy}% | avg hits to finish ${player.avgHitsToFinish ?? "-"}</p></div>`;
    elements.leaderboardList.appendChild(li);
  }
}

function renderFriends() {
  elements.friendList.innerHTML = "";
  elements.friendEmpty.hidden = state.friends.length > 0;

  for (const friend of state.friends) {
    const item = elements.friendTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".avatar").src = friend.avatarUrl;
    item.querySelector(".name").textContent = friend.displayName;
    item.querySelector(".handle").textContent = `@${friend.username}`;
    const button = item.querySelector(".invite-button");
    const canInvite = state.session && state.session.match.status !== "live";
    button.disabled = !canInvite;
    button.textContent = !state.session ? "Create session first" : state.session.match.status === "live" ? "Match live" : "Invite";
    button.addEventListener("click", async () => {
      try {
        await request(`/api/sessions/${state.session.id}/invite`, {
          method: "POST",
          body: JSON.stringify({ friendId: friend.id }),
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
    elements.friendList.appendChild(item);
  }
}

function populateCaptainSelects(members) {
  const options = members.map((member) => `<option value="${member.id}">${member.displayName}</option>`).join("");
  elements.captainASelect.innerHTML = options;
  elements.captainBSelect.innerHTML = options;
  if (members[1]) elements.captainBSelect.value = members[1].id;
}

function teamPlayers(session, teamSlot) {
  return session.members.filter((member) => member.teamSlot === teamSlot).sort((a, b) => (a.teamOrder || 999) - (b.teamOrder || 999));
}

function moveButton(label, handler) {
  const button = document.createElement("button");
  button.className = "secondary-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function canManageSession(session) {
  return state.me && session.host.id === state.me.id;
}

function canRecordThrow(session) {
  if (!state.me || session.match.status !== "live" || !session.match.currentPlayer) return false;
  return state.me.id === session.host.id || state.me.id === session.match.currentPlayer.id;
}

async function updateTeamOrder(teamSlot, orderedIds) {
  await request(`/api/sessions/${state.session.id}/teams/reorder`, {
    method: "POST",
    body: JSON.stringify({ teamSlot, orderedUserIds: orderedIds }),
  });
  await refreshDashboard();
}

function renderTeamList(listElement, teamSlot, players) {
  listElement.innerHTML = "";
  if (!players.length) {
    listElement.innerHTML = "<li class='list-card'><div><strong>No players yet</strong></div></li>";
    return;
  }

  players.forEach((member, index) => {
    const li = document.createElement("li");
    li.className = "list-card";
    const statusBits = [`#${member.teamOrder || index + 1}`];
    if (member.isCaptain) statusBits.push("captain");
    if (member.isOut) statusBits.push("out");
    li.innerHTML = `<div><strong>${member.displayName}</strong><p class="meta">@${member.username} | ${statusBits.join(" | ")}</p></div>`;

    if (canManageSession(state.session) && state.session.match.status !== "live" && players.length > 1) {
      const controls = document.createElement("div");
      controls.className = "action-row";
      if (index > 0) {
        controls.appendChild(
          moveButton("Up", async () => {
            const reordered = players.map((player) => player.id);
            [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
            await updateTeamOrder(teamSlot, reordered);
          }),
        );
      }
      if (index < players.length - 1) {
        controls.appendChild(
          moveButton("Down", async () => {
            const reordered = players.map((player) => player.id);
            [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
            await updateTeamOrder(teamSlot, reordered);
          }),
        );
      }
      li.appendChild(controls);
    }

    listElement.appendChild(li);
  });
}

function renderAvailablePlayers(session) {
  elements.availablePlayerList.innerHTML = "";
  const players = session.teams.unassigned || [];
  if (!players.length) {
    elements.availablePlayerList.innerHTML = "<li class='list-card'><div><strong>All assigned</strong><p class='meta'>Ready to start the Flanki match.</p></div></li>";
    return;
  }

  for (const member of players) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = `<div><strong>${member.displayName}</strong><p class="meta">@${member.username}</p></div>`;
    if (session.teams.mode === "captains" && canManageSession(session) && session.match.status !== "live") {
      const button = document.createElement("button");
      button.className = "primary-button";
      button.type = "button";
      button.textContent = "Pick";
      button.addEventListener("click", async () => {
        await request(`/api/sessions/${session.id}/teams/draft-pick`, {
          method: "POST",
          body: JSON.stringify({ userId: member.id }),
        });
        await refreshDashboard();
      });
      li.appendChild(button);
    }
    elements.availablePlayerList.appendChild(li);
  }
}

function renderPendingInvites(session) {
  elements.inviteList.innerHTML = "";
  if (!session.pendingInvites.length) {
    elements.inviteList.innerHTML = "<li class='list-card'><div><strong>No pending invites</strong></div></li>";
    return;
  }

  for (const invite of session.pendingInvites) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = `<div><strong>${invite.displayName}</strong><p class="meta">@${invite.username} | pending</p></div>`;
    elements.inviteList.appendChild(li);
  }
}

function renderMatchPanel(session) {
  const match = session.match;
  elements.matchPanel.hidden = !session.teams.teamA.length || !session.teams.teamB.length;
  if (elements.matchPanel.hidden) return;

  const titleMap = {
    setup: "Match setup",
    live: "Match live",
    completed: `Match finished - Team ${match.winnerTeam} wins`,
  };
  elements.matchStatusTitle.textContent = titleMap[match.status] || "Match setup";
  elements.currentPlayerText.textContent = match.status === "completed"
    ? `Team ${match.winnerTeam} finished first. Final stats and ranking points are locked in below.`
    : match.currentPlayer
    ? `Turn ${match.throwNumber + 1}: ${match.currentPlayer.displayName} throws for Team ${match.currentTurnTeam}.`
    : "No active thrower right now.";

  const canThrow = canRecordThrow(session);
  [elements.throwMissButton, elements.throwHitButton, elements.throwFinishButton, elements.throwHitFinishButton].forEach((button) => {
    button.disabled = !canThrow;
  });

  elements.playerStatsList.innerHTML = "";
  for (const player of match.playerStats) {
    const li = document.createElement("li");
    li.className = "list-card";
    const finishText = player.hitsWhenFinished === null ? "-" : player.hitsWhenFinished;
    li.innerHTML = `<div><strong>${player.displayName}</strong><p class="meta">Team ${player.teamSlot} | order ${player.teamOrder} | throws ${player.throws} | hits ${player.hits} | accuracy ${player.accuracy}% | hits to finish ${finishText} | ${player.isOut ? "out" : "active"}</p></div>`;
    elements.playerStatsList.appendChild(li);
  }
}

function renderSession() {
  const session = state.session;
  const hasSession = Boolean(session);
  elements.sessionEmpty.hidden = hasSession;
  elements.sessionCard.hidden = !hasSession;
  if (!hasSession) return;

  const teamAPlayers = teamPlayers(session, "A");
  const teamBPlayers = teamPlayers(session, "B");

  elements.sessionNameOutput.textContent = session.name;
  elements.sessionHostOutput.textContent = `Hosted by ${session.host.displayName}`;
  elements.sessionSizeOutput.textContent = `${session.playerCount} players in lobby`;
  elements.sessionStatusOutput.textContent = session.match.status === "completed" ? "completed" : session.teams.mode === "waiting" ? "lobby" : session.teams.mode;
  elements.sessionLink.value = session.shareUrl;
  elements.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(session.shareUrl)}`;

  elements.teamASummary.textContent = `Throws ${session.match.teamA.throws} | Hits ${session.match.teamA.hits} | Accuracy ${session.match.teamA.accuracy}% | Active ${session.match.teamA.activePlayers}`;
  elements.teamBSummary.textContent = `Throws ${session.match.teamB.throws} | Hits ${session.match.teamB.hits} | Accuracy ${session.match.teamB.accuracy}% | Active ${session.match.teamB.activePlayers}`;

  renderTeamList(elements.teamAList, "A", teamAPlayers);
  renderTeamList(elements.teamBList, "B", teamBPlayers);
  renderAvailablePlayers(session);
  renderPendingInvites(session);
  renderMatchPanel(session);

  elements.captainSetup.hidden = session.teams.mode !== "waiting";
  elements.draftBanner.hidden = session.teams.mode !== "captains";
  if (session.teams.mode === "waiting") {
    populateCaptainSelects(session.members);
  }
  if (session.teams.mode === "captains" && session.teams.currentCaptain) {
    elements.draftTurnText.textContent = `${session.teams.currentCaptain.displayName} picks for Team ${session.teams.currentCaptain.teamSlot}.`;
  }

  const matchLocked = session.match.status === "live";
  elements.autoTeamsButton.disabled = !canManageSession(session) || matchLocked;
  elements.captainDraftButton.disabled = !canManageSession(session) || matchLocked;
  elements.startDraftButton.disabled = !canManageSession(session) || matchLocked;
  elements.startMatchButton.disabled =
    !canManageSession(session) || matchLocked || session.teams.unassigned.length > 0 || !teamAPlayers.length || !teamBPlayers.length;
}

function renderIncomingInvites() {
  elements.incomingList.innerHTML = "";
  elements.incomingEmpty.hidden = state.incomingInvites.length > 0;

  for (const invite of state.incomingInvites) {
    const item = elements.incomingTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".name").textContent = invite.sessionName;
    item.querySelector(".meta").textContent = `From ${invite.inviter.displayName} | ${invite.createdAtLabel}`;
    item.querySelector(".accept-button").addEventListener("click", async () => {
      await request(`/api/invites/${invite.id}/accept`, { method: "POST" });
      await refreshDashboard();
    });
    item.querySelector(".decline-button").addEventListener("click", async () => {
      await request(`/api/invites/${invite.id}/decline`, { method: "POST" });
      await refreshDashboard();
    });
    elements.incomingList.appendChild(item);
  }
}

async function maybeVerifyEmail() {
  const token = query().get("verify");
  if (!token || state.verifyingEmail) return;
  state.verifyingEmail = true;
  try {
    const payload = await request("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("verify");
    history.replaceState({}, "", url.pathname + url.search);
    alert(payload.message);
    await refreshDashboard();
  } finally {
    state.verifyingEmail = false;
  }
}

async function maybeJoinDeepLink() {
  const joinMatch = window.location.pathname.match(/^\/join\/([a-zA-Z0-9_-]+)$/);
  if (!joinMatch || !state.me || state.joiningDeepLink) return;
  state.joiningDeepLink = true;
  try {
    await request(`/api/join/${joinMatch[1]}`, { method: "POST" });
    history.replaceState({}, "", "/");
    await refreshDashboard();
  } finally {
    state.joiningDeepLink = false;
  }
}

async function refreshDashboard() {
  const payload = await request("/api/bootstrap");
  state.me = payload.me;
  state.friends = payload.friends;
  state.session = payload.activeSession;
  state.incomingInvites = payload.incomingInvites;
  state.authMessage = payload.authMessage;
  state.roadmap = payload.roadmap?.nextUp || [];
  state.leaderboard = payload.leaderboard || [];

  updateResetVisibility();
  toggleAuth();
  renderRoadmap();
  renderLeaderboard();
  renderFriends();
  renderSession();
  renderIncomingInvites();
  await maybeVerifyEmail();
  await maybeJoinDeepLink();
}

async function logThrow(wasHit, finishedBeer) {
  await request(`/api/sessions/${state.session.id}/match/throw`, {
    method: "POST",
    body: JSON.stringify({ wasHit, finishedBeer }),
  });
  await refreshDashboard();
}

elements.signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.signupForm);
  const payload = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      displayName: formData.get("displayName"),
      username: formData.get("username"),
      email: formData.get("email"),
      password: formData.get("password"),
      next: getJoinTarget(),
    }),
  });
  elements.signupForm.reset();
  showInfo(payload);
  await refreshDashboard();
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      next: getJoinTarget(),
    }),
  });
  elements.loginForm.reset();
  await refreshDashboard();
});

elements.forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = await request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: new FormData(elements.forgotPasswordForm).get("email") }),
  });
  elements.forgotPasswordForm.reset();
  showInfo(payload);
});

elements.resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = await request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token: query().get("reset"),
      password: new FormData(elements.resetPasswordForm).get("password"),
    }),
  });
  elements.resetPasswordForm.reset();
  const url = new URL(window.location.href);
  url.searchParams.delete("reset");
  history.replaceState({}, "", url.pathname + url.search);
  updateResetVisibility();
  alert(payload.message);
});

elements.resendVerificationButton.addEventListener("click", async () => {
  showInfo(await request("/api/auth/resend-verification", { method: "POST" }));
  await refreshDashboard();
});

elements.logoutButton.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  state.me = null;
  state.session = null;
  toggleAuth();
  renderSession();
});

elements.friendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/friends", {
    method: "POST",
    body: JSON.stringify({ username: elements.friendUsername.value.trim() }),
  });
  elements.friendForm.reset();
  await refreshDashboard();
});

elements.sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name: document.querySelector("#session-name").value.trim() }),
  });
  elements.sessionForm.reset();
  await refreshDashboard();
});

elements.autoTeamsButton.addEventListener("click", async () => {
  await request(`/api/sessions/${state.session.id}/teams/auto`, { method: "POST" });
  await refreshDashboard();
});

elements.captainDraftButton.addEventListener("click", () => {
  elements.captainSetup.hidden = false;
});

elements.startDraftButton.addEventListener("click", async () => {
  await request(`/api/sessions/${state.session.id}/teams/captains`, {
    method: "POST",
    body: JSON.stringify({
      captainAUserId: elements.captainASelect.value,
      captainBUserId: elements.captainBSelect.value,
    }),
  });
  await refreshDashboard();
});

elements.startMatchButton.addEventListener("click", async () => {
  await request(`/api/sessions/${state.session.id}/match/start`, { method: "POST" });
  await refreshDashboard();
});

elements.throwMissButton.addEventListener("click", async () => logThrow(false, false));
elements.throwHitButton.addEventListener("click", async () => logThrow(true, false));
elements.throwFinishButton.addEventListener("click", async () => logThrow(false, true));
elements.throwHitFinishButton.addEventListener("click", async () => logThrow(true, true));

elements.copyLinkButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.sessionLink.value);
  elements.copyLinkButton.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyLinkButton.textContent = "Copy";
  }, 1200);
});

updateResetVisibility();
refreshDashboard().catch((error) => {
  console.error(error);
  toggleAuth();
});
