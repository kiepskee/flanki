$ErrorActionPreference = "Stop"

function To-JsonBody($value) {
  return $value | ConvertTo-Json -Depth 8 -Compress
}

$base = "http://127.0.0.1:8787"
$seedTag = "demo"
$sessionName = "Local Demo Lobby"

$users = @(
  @{ displayName = "Alex Demo"; username = "demo_alex" },
  @{ displayName = "Blair Demo"; username = "demo_blair" },
  @{ displayName = "Casey Demo"; username = "demo_casey" },
  @{ displayName = "Drew Demo"; username = "demo_drew" },
  @{ displayName = "Emery Demo"; username = "demo_emery" },
  @{ displayName = "Finley Demo"; username = "demo_finley" }
)

try {
  Invoke-RestMethod -Uri "$base/api/bootstrap" -Method Get | Out-Null
} catch {
  throw "Local app is not reachable at $base. Start it first with 'npm run dev'."
}

$sessionsByUsername = @{}

foreach ($user in $users) {
  $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod `
    -Uri "$base/api/auth/dev-login" `
    -Method Post `
    -WebSession $webSession `
    -ContentType "application/json" `
    -Body (To-JsonBody @{
      displayName = $user.displayName
      username = $user.username
      next = "/"
    }) | Out-Null

  $bootstrap = Invoke-RestMethod -Uri "$base/api/bootstrap" -Method Get -WebSession $webSession
  $sessionsByUsername[$user.username] = [PSCustomObject]@{
    session = $webSession
    me = $bootstrap.me
  }
}

$hostUser = $users[0]
$hostState = $sessionsByUsername[$hostUser.username]
$guests = $users | Select-Object -Skip 1

foreach ($guest in $guests) {
  Invoke-RestMethod `
    -Uri "$base/api/friends" `
    -Method Post `
    -WebSession $hostState.session `
    -ContentType "application/json" `
    -Body (To-JsonBody @{ username = $guest.username }) | Out-Null
}

$hostBootstrap = Invoke-RestMethod -Uri "$base/api/bootstrap" -Method Get -WebSession $hostState.session
$friendMap = @{}
foreach ($friend in $hostBootstrap.friends) {
  $friendMap[$friend.username] = $friend.id
}

$createdSession = Invoke-RestMethod `
  -Uri "$base/api/sessions" `
  -Method Post `
  -WebSession $hostState.session `
  -ContentType "application/json" `
  -Body (To-JsonBody @{ name = $sessionName })

$sessionId = $createdSession.session.id

foreach ($guest in $guests) {
  Invoke-RestMethod `
    -Uri "$base/api/sessions/$sessionId/invite" `
    -Method Post `
    -WebSession $hostState.session `
    -ContentType "application/json" `
    -Body (To-JsonBody @{ friendId = $friendMap[$guest.username] }) | Out-Null
}

foreach ($guest in $guests) {
  $guestState = $sessionsByUsername[$guest.username]
  $incoming = Invoke-RestMethod -Uri "$base/api/bootstrap" -Method Get -WebSession $guestState.session
  $inviteId = ($incoming.incomingInvites | Where-Object { $_.sessionName -eq $sessionName } | Select-Object -First 1).id
  if (-not $inviteId) {
    throw "Could not find invite for $($guest.username)."
  }

  Invoke-RestMethod -Uri "$base/api/invites/$inviteId/accept" -Method Post -WebSession $guestState.session | Out-Null
}

$finalHostState = Invoke-RestMethod -Uri "$base/api/bootstrap" -Method Get -WebSession $hostState.session

[PSCustomObject]@{
  baseUrl = $base
  sessionName = $sessionName
  sessionId = $sessionId
  hostUsername = $hostUser.username
  users = $users | ForEach-Object { $_.username }
  shareUrl = $finalHostState.activeSession.shareUrl
  playerCount = $finalHostState.activeSession.playerCount
  teamMode = $finalHostState.activeSession.teams.mode
} | ConvertTo-Json -Depth 8
