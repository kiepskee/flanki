const state = {
  me: null,
  friends: [],
  session: null,
  incomingInvites: [],
  authMessage: null,
  authConfig: {
    facebookEnabled: false,
    devLoginEnabled: false,
  },
  roadmap: [],
  leaderboard: [],
  joiningDeepLink: false,
};

const elements = {
  signedOutView: document.querySelector("#signed-out-view"),
  signedInView: document.querySelector("#signed-in-view"),
  dashboard: document.querySelector("#dashboard"),
  facebookLoginButton: document.querySelector("#facebook-login-button"),
  devLoginPanel: document.querySelector("#dev-login-panel"),
  devLoginForm: document.querySelector("#dev-login-form"),
  meAvatar: document.querySelector("#me-avatar"),
  meName: document.querySelector("#me-name"),
  meHandle: document.querySelector("#me-handle"),
  logoutButton: document.querySelector("#logout-button"),
  profilePanel: document.querySelector("#profile-panel"),
  nickHelp: document.querySelector("#nick-help"),
  nickForm: document.querySelector("#nick-form"),
  nickUsername: document.querySelector("#nick-username"),
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
  manualTeamsButton: document.querySelector("#manual-teams-button"),
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

function replaceQuery(mutator) {
  const url = new URL(window.location.href);
  mutator(url.searchParams);
  history.replaceState({}, "", url.pathname + url.search);
}

function getJoinTarget() {
  return window.location.pathname.startsWith("/join/") ? window.location.pathname : "/";
}

function hasPlayerNick() {
  return Boolean(state.me?.hasPlayerNick && state.me?.username);
}

function toggleAuth() {
  const signedIn = Boolean(state.me);
  elements.signedOutView.hidden = signedIn;
  elements.signedInView.hidden = !signedIn;
  elements.dashboard.hidden = !signedIn;

  if (!signedIn) {
    elements.facebookLoginButton.disabled = !state.authConfig.facebookEnabled;
    elements.facebookLoginButton.textContent = state.authConfig.facebookEnabled ? "Continue with Facebook" : "Facebook login not configured";
    elements.devLoginPanel.hidden = !state.authConfig.devLoginEnabled;
    return;
  }

  elements.meAvatar.src = state.me.avatarUrl;
  elements.meName.textContent = state.me.displayName;
  elements.meHandle.textContent = state.me.username ? `@${state.me.username}` : "Choose your player nick";
}

function renderProfilePanel() {
  if (!state.me) {
    elements.profilePanel.hidden = true;
    return;
  }

  elements.profilePanel.hidden = false;
  elements.nickUsername.value = state.me.username || "";
  elements.nickHelp.textContent = hasPlayerNick()
    ? `Current nick: @${state.me.username}. You can update it any time.`
    : state.authMessage || "Choose a unique nick so other players can find and invite you.";
  elements.nickForm.querySelector("button").textContent = hasPlayerNick() ? "Update nick" : "Save nick";
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
    li.innerHTML = `<div><strong>${player.displayName}</strong><p class="meta">${player.username ? `@${player.username}` : "nick pending"} | rating ${player.rating} | wins ${player.wins}/${player.matchesPlayed} | accuracy ${player.accuracy}% | avg team hits to finish ${player.avgHitsToFinish ?? "-"}</p></div>`;
    elements.leaderboardList.appendChild(li);
  }
}

function renderFriends() {
  elements.friendList.innerHTML = "";
  elements.friendEmpty.hidden = state.friends.length > 0;
  const friendFormDisabled = !hasPlayerNick();
  elements.friendUsername.disabled = friendFormDisabled;
  elements.friendForm.querySelector("button").disabled = friendFormDisabled;
  elements.friendUsername.placeholder = friendFormDisabled ? "Save your nick first" : "player_nick";

  for (const friend of state.friends) {
    const item = elements.friendTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".avatar").src = friend.avatarUrl;
    item.querySelector(".name").textContent = friend.displayName;
    item.querySelector(".handle").textContent = friend.username ? `@${friend.username}` : "nick pending";
    const button = item.querySelector(".invite-button");
    const canInvite = hasPlayerNick() && state.session && state.session.match.status !== "live";
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
  const options = members.map((member) => `<option value="${member.id}">${member.displayName}${member.username ? ` (@${member.username})` : ""}</option>`).join("");
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

function canUseDevInviteShortcut(session) {
  return Boolean(state.authConfig.devLoginEnabled && canManageSession(session) && session.match.status !== "live");
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

async function assignPlayerTeam(userId, teamSlot) {
  await request(`/api/sessions/${state.session.id}/teams/assign`, {
    method: "POST",
    body: JSON.stringify({ userId, teamSlot }),
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
    li.innerHTML = `<div><strong>${member.displayName}</strong><p class="meta">${member.username ? `@${member.username}` : "nick pending"} | ${statusBits.join(" | ")}</p></div>`;

    if (
      canManageSession(state.session) &&
      state.session.match.status !== "live" &&
      (players.length > 1 || state.session.teams.mode === "manual")
    ) {
      const controls = document.createElement("div");
      controls.className = "action-row";
      if (players.length > 1 && index > 0) {
        controls.appendChild(
          moveButton("Up", async () => {
            const reordered = players.map((player) => player.id);
            [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
            await updateTeamOrder(teamSlot, reordered);
          }),
        );
      }
      if (players.length > 1 && index < players.length - 1) {
        controls.appendChild(
          moveButton("Down", async () => {
            const reordered = players.map((player) => player.id);
            [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
            await updateTeamOrder(teamSlot, reordered);
          }),
        );
      }
      if (state.session.teams.mode === "manual") {
        controls.appendChild(
          moveButton(teamSlot === "A" ? "To Team B" : "To Team A", async () => {
            await assignPlayerTeam(member.id, teamSlot === "A" ? "B" : "A");
          }),
        );
        controls.appendChild(
          moveButton("Unassign", async () => {
            await assignPlayerTeam(member.id, null);
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
    li.innerHTML = `<div><strong>${member.displayName}</strong><p class="meta">${member.username ? `@${member.username}` : "nick pending"}</p></div>`;
    if (session.teams.mode === "captains" && canManageSession(session) && session.match.status !== "live" && hasPlayerNick()) {
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
    if (session.teams.mode === "manual" && canManageSession(session) && session.match.status !== "live" && hasPlayerNick()) {
      const controls = document.createElement("div");
      controls.className = "action-row";
      controls.appendChild(
        moveButton("Team A", async () => {
          await assignPlayerTeam(member.id, "A");
        }),
      );
      controls.appendChild(
        moveButton("Team B", async () => {
          await assignPlayerTeam(member.id, "B");
        }),
      );
      li.appendChild(controls);
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
    li.innerHTML = `<div><strong>${invite.displayName}</strong><p class="meta">${invite.username ? `@${invite.username}` : "nick pending"} | pending</p></div>`;
    if (canUseDevInviteShortcut(session)) {
      const button = document.createElement("button");
      button.className = "secondary-button";
      button.type = "button";
      button.textContent = "Add now";
      button.addEventListener("click", async () => {
        await request(`/api/sessions/${session.id}/invites/${invite.inviteId}/add`, { method: "POST" });
        await refreshDashboard();
      });
      li.appendChild(button);
    }
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
    li.innerHTML = `<div><strong>${player.displayName}</strong><p class="meta">Team ${player.teamSlot} | order ${player.teamOrder} | throws ${player.throws} | hits ${player.hits} | accuracy ${player.accuracy}% | team hits to finish ${finishText} | ${player.isOut ? "out" : "active"}</p></div>`;
    elements.playerStatsList.appendChild(li);
  }
}

function renderSession() {
  const session = state.session;
  const hasSession = Boolean(session);
  const nickReady = hasPlayerNick();
  const sessionNameInput = document.querySelector("#session-name");
  sessionNameInput.disabled = !nickReady;
  elements.sessionForm.querySelector("button").disabled = !nickReady;
  sessionNameInput.placeholder = nickReady ? "Tonight's Flanki session" : "Save your nick first";
  elements.sessionEmpty.hidden = hasSession;
  elements.sessionCard.hidden = !hasSession;
  if (!hasSession) {
    elements.sessionEmpty.textContent = nickReady
      ? "Create a session to invite players and build teams."
      : "Save your player nick first, then create your session.";
    return;
  }

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
  elements.autoTeamsButton.disabled = !nickReady || !canManageSession(session) || matchLocked;
  elements.manualTeamsButton.disabled = !nickReady || !canManageSession(session) || matchLocked;
  elements.captainDraftButton.disabled = !nickReady || !canManageSession(session) || matchLocked;
  elements.startDraftButton.disabled = !nickReady || !canManageSession(session) || matchLocked;
  elements.startMatchButton.disabled =
    !nickReady || !canManageSession(session) || matchLocked || session.teams.unassigned.length > 0 || !teamAPlayers.length || !teamBPlayers.length;
}

function renderIncomingInvites() {
  elements.incomingList.innerHTML = "";
  elements.incomingEmpty.hidden = state.incomingInvites.length > 0;

  for (const invite of state.incomingInvites) {
    const item = elements.incomingTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".name").textContent = invite.sessionName;
    item.querySelector(".meta").textContent = `From ${invite.inviter.displayName} | ${invite.createdAtLabel}`;
    const acceptButton = item.querySelector(".accept-button");
    acceptButton.disabled = !hasPlayerNick();
    acceptButton.textContent = hasPlayerNick() ? "Accept" : "Save nick first";
    acceptButton.addEventListener("click", async () => {
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

function maybeShowAuthError() {
  const authError = query().get("auth_error");
  if (!authError) return;
  const messages = {
    facebook_login_failed: "Facebook sign-in could not be completed. Please try again.",
    facebook_not_configured: "Facebook login is not configured yet. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to .dev.vars and restart Wrangler.",
  };
  alert(messages[authError] || "Sign-in could not be completed.");
  replaceQuery((params) => params.delete("auth_error"));
}

async function maybeJoinDeepLink() {
  const joinMatch = window.location.pathname.match(/^\/join\/([a-zA-Z0-9_-]+)$/);
  if (!joinMatch || !state.me || !hasPlayerNick() || state.joiningDeepLink) return;
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
  state.authConfig = payload.authConfig || { facebookEnabled: false, devLoginEnabled: false };
  state.roadmap = payload.roadmap?.nextUp || [];
  state.leaderboard = payload.leaderboard || [];

  toggleAuth();
  renderProfilePanel();
  renderRoadmap();
  renderLeaderboard();
  renderFriends();
  renderSession();
  renderIncomingInvites();
  await maybeJoinDeepLink();
}

async function logThrow(wasHit, finishedBeer) {
  await request(`/api/sessions/${state.session.id}/match/throw`, {
    method: "POST",
    body: JSON.stringify({ wasHit, finishedBeer }),
  });
  await refreshDashboard();
}

elements.facebookLoginButton.addEventListener("click", () => {
  window.location.href = `/api/auth/facebook/start?next=${encodeURIComponent(getJoinTarget())}`;
});

elements.devLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({
        displayName: new FormData(elements.devLoginForm).get("displayName"),
        username: new FormData(elements.devLoginForm).get("username"),
        next: getJoinTarget(),
      }),
    });
    if (payload?.next && payload.next !== "/" && payload.next.startsWith("/join/")) {
      history.replaceState({}, "", payload.next);
    }
    elements.devLoginForm.reset();
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.nickForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = await request("/api/profile/nick", {
    method: "POST",
    body: JSON.stringify({
      username: new FormData(elements.nickForm).get("username"),
    }),
  });
  alert(payload.message);
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

elements.manualTeamsButton.addEventListener("click", async () => {
  await request(`/api/sessions/${state.session.id}/teams/manual`, { method: "POST" });
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

maybeShowAuthError();
refreshDashboard().catch((error) => {
  console.error(error);
  toggleAuth();
});
