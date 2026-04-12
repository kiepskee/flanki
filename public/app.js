const state = {
  me: null,
  friends: [],
  session: null,
  incomingInvites: [],
  authMessage: null,
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
  sessionForm: document.querySelector("#session-form"),
  sessionEmpty: document.querySelector("#session-empty"),
  sessionCard: document.querySelector("#session-card"),
  sessionNameOutput: document.querySelector("#session-name-output"),
  sessionHostOutput: document.querySelector("#session-host-output"),
  sessionStatusOutput: document.querySelector("#session-status-output"),
  sessionLink: document.querySelector("#session-link"),
  copyLinkButton: document.querySelector("#copy-link-button"),
  qrImage: document.querySelector("#qr-image"),
  memberList: document.querySelector("#member-list"),
  inviteList: document.querySelector("#invite-list"),
  incomingList: document.querySelector("#incoming-list"),
  incomingEmpty: document.querySelector("#incoming-empty"),
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

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function query() {
  return new URLSearchParams(window.location.search);
}

function getJoinTarget() {
  return window.location.pathname.startsWith("/join/") ? window.location.pathname : "/";
}

function showDevLinkIfPresent(payload) {
  if (payload?.devLink) {
    alert(`${payload.message || payload.notice}\n\nDev link:\n${payload.devLink}`);
  } else if (payload?.message || payload?.notice) {
    alert(payload.message || payload.notice);
  }
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
  elements.meAvatar.alt = `${state.me.displayName} avatar`;
  elements.meName.textContent = state.me.displayName;
  elements.meHandle.textContent = `@${state.me.username}`;

  const needsVerification = !state.me.emailVerified;
  elements.verificationBanner.hidden = !needsVerification;
  if (needsVerification) {
    elements.verificationMessage.textContent = state.authMessage || "Verify your email to secure your account.";
  }
}

function updateResetVisibility() {
  elements.resetPasswordForm.hidden = !query().get("reset");
}

function renderFriends() {
  elements.friendList.innerHTML = "";
  elements.friendEmpty.hidden = state.friends.length > 0;

  for (const friend of state.friends) {
    const item = elements.friendTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".avatar").src = friend.avatarUrl;
    item.querySelector(".avatar").alt = `${friend.displayName} avatar`;
    item.querySelector(".name").textContent = friend.displayName;
    item.querySelector(".handle").textContent = `@${friend.username}`;

    const button = item.querySelector(".invite-button");
    button.disabled = !state.session;
    button.textContent = state.session ? "Invite" : "Create session first";
    button.addEventListener("click", async () => {
      if (!state.session) return;

      button.disabled = true;
      try {
        await request(`/api/sessions/${state.session.id}/invite`, {
          method: "POST",
          body: JSON.stringify({ friendId: friend.id }),
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
      }
    });

    elements.friendList.appendChild(item);
  }
}

function renderSession() {
  const hasSession = Boolean(state.session);
  elements.sessionEmpty.hidden = hasSession;
  elements.sessionCard.hidden = !hasSession;

  if (!hasSession) {
    return;
  }

  elements.sessionNameOutput.textContent = state.session.name;
  elements.sessionHostOutput.textContent = `Hosted by ${state.session.host.displayName}`;
  elements.sessionStatusOutput.textContent = state.session.status;
  elements.sessionLink.value = state.session.shareUrl;
  elements.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(state.session.shareUrl)}`;

  elements.memberList.innerHTML = "";
  for (const member of state.session.members) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = `<div><strong>${member.displayName}</strong><p class="meta">@${member.username} | ${member.role}</p></div>`;
    elements.memberList.appendChild(li);
  }

  elements.inviteList.innerHTML = "";
  if (state.session.pendingInvites.length === 0) {
    const li = document.createElement("li");
    li.className = "list-card";
    li.innerHTML = "<div><strong>No pending invites</strong><p class='meta'>Friends you invite will appear here.</p></div>";
    elements.inviteList.appendChild(li);
  } else {
    for (const invite of state.session.pendingInvites) {
      const li = document.createElement("li");
      li.className = "list-card";
      li.innerHTML = `<div><strong>${invite.displayName}</strong><p class="meta">@${invite.username} | pending</p></div>`;
      elements.inviteList.appendChild(li);
    }
  }
}

function renderIncomingInvites() {
  elements.incomingList.innerHTML = "";
  elements.incomingEmpty.hidden = state.incomingInvites.length > 0;

  for (const invite of state.incomingInvites) {
    const item = elements.incomingTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".name").textContent = invite.sessionName;
    item.querySelector(".meta").textContent = `From ${invite.inviter.displayName} | ${invite.createdAtLabel}`;
    item.querySelector(".accept-button").addEventListener("click", async () => {
      try {
        await request(`/api/invites/${invite.id}/accept`, { method: "POST" });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
    item.querySelector(".decline-button").addEventListener("click", async () => {
      try {
        await request(`/api/invites/${invite.id}/decline`, { method: "POST" });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });

    elements.incomingList.appendChild(item);
  }
}

async function maybeVerifyEmail() {
  const token = query().get("verify");
  if (!token || state.verifyingEmail) {
    return;
  }

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
  } catch (error) {
    alert(error.message);
  } finally {
    state.verifyingEmail = false;
  }
}

async function maybeJoinDeepLink() {
  const joinMatch = window.location.pathname.match(/^\/join\/([a-zA-Z0-9_-]+)$/);
  if (!joinMatch || !state.me || state.joiningDeepLink) {
    return;
  }

  state.joiningDeepLink = true;
  try {
    await request(`/api/join/${joinMatch[1]}`, { method: "POST" });
    history.replaceState({}, "", "/");
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
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

  updateResetVisibility();
  toggleAuth();
  renderFriends();
  renderSession();
  renderIncomingInvites();
  await maybeVerifyEmail();
  await maybeJoinDeepLink();
}

elements.signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.signupForm);

  try {
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
    showDevLinkIfPresent(payload);
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);

  try {
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
  } catch (error) {
    alert(error.message);
  }
});

elements.forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.forgotPasswordForm);

  try {
    const payload = await request("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
      }),
    });
    elements.forgotPasswordForm.reset();
    showDevLinkIfPresent(payload);
  } catch (error) {
    alert(error.message);
  }
});

elements.resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.resetPasswordForm);
  const token = query().get("reset");

  try {
    const payload = await request("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token,
        password: formData.get("password"),
      }),
    });
    elements.resetPasswordForm.reset();
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    history.replaceState({}, "", url.pathname + url.search);
    updateResetVisibility();
    alert(payload.message);
  } catch (error) {
    alert(error.message);
  }
});

elements.resendVerificationButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/auth/resend-verification", { method: "POST" });
    showDevLinkIfPresent(payload);
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  state.me = null;
  state.friends = [];
  state.session = null;
  state.incomingInvites = [];
  state.authMessage = null;
  toggleAuth();
  renderFriends();
  renderSession();
  renderIncomingInvites();
});

elements.friendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/friends", {
      method: "POST",
      body: JSON.stringify({ username: elements.friendUsername.value.trim() }),
    });
    elements.friendForm.reset();
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#session-name");
  try {
    await request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name: input.value.trim() }),
    });
    elements.sessionForm.reset();
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.copyLinkButton.addEventListener("click", async () => {
  if (!elements.sessionLink.value) return;

  await navigator.clipboard.writeText(elements.sessionLink.value);
  elements.copyLinkButton.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyLinkButton.textContent = "Copy";
  }, 1200);
});

updateResetVisibility();
refreshDashboard().catch(() => {
  toggleAuth();
});
