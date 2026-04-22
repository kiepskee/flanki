$ErrorActionPreference = "Stop"

function To-JsonBody($value) {
  return $value | ConvertTo-Json -Depth 10 -Compress
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Method,
    $WebSession,
    [object]$Body
  )

  $params = @{
    Uri         = $Uri
    Method      = $Method
    ErrorAction = "Stop"
  }

  if ($WebSession) {
    $params.WebSession = $WebSession
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = To-JsonBody $Body
  }

  return Invoke-RestMethod @params
}

function Login-DemoUser {
  param(
    [hashtable]$User,
    [string]$BaseUrl
  )

  $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-JsonRequest `
    -Uri "$BaseUrl/api/auth/dev-login" `
    -Method "Post" `
    -WebSession $webSession `
    -Body @{
      displayName = $User.displayName
      username = $User.username
      next = "/"
    } | Out-Null

  $bootstrap = Invoke-JsonRequest -Uri "$BaseUrl/api/bootstrap" -Method "Get" -WebSession $webSession
  return [PSCustomObject]@{
    session = $webSession
    me = $bootstrap.me
  }
}

function Add-HostFriends {
  param(
    $HostSession,
    [array]$Users,
    [string]$HostUsername,
    [string]$BaseUrl
  )

  foreach ($user in $Users) {
    if ($user.username -eq $HostUsername) {
      continue
    }

    Invoke-JsonRequest `
      -Uri "$BaseUrl/api/friends" `
      -Method "Post" `
      -WebSession $HostSession `
      -Body @{ username = $user.username } | Out-Null
  }
}

function Get-SessionSnapshot {
  param(
    $WebSession,
    [string]$BaseUrl
  )

  $bootstrap = Invoke-JsonRequest -Uri "$BaseUrl/api/bootstrap" -Method "Get" -WebSession $WebSession
  return $bootstrap.activeSession
}

function New-DemoSession {
  param(
    [string]$BaseUrl,
    $HostSession,
    [hashtable]$UserStates,
    [array]$Users,
    [string]$HostUsername,
    [string]$SessionName
  )

  $createdSession = Invoke-JsonRequest `
    -Uri "$BaseUrl/api/sessions" `
    -Method "Post" `
    -WebSession $HostSession `
    -Body @{ name = $SessionName }

  $sessionId = $createdSession.session.id
  $hostBootstrap = Invoke-JsonRequest -Uri "$BaseUrl/api/bootstrap" -Method "Get" -WebSession $HostSession

  $friendMap = @{}
  foreach ($friend in $hostBootstrap.friends) {
    $friendMap[$friend.username] = $friend.id
  }

  foreach ($user in $Users) {
    if ($user.username -eq $HostUsername) {
      continue
    }

    Invoke-JsonRequest `
      -Uri "$BaseUrl/api/sessions/$sessionId/invite" `
      -Method "Post" `
      -WebSession $HostSession `
      -Body @{ friendId = $friendMap[$user.username] } | Out-Null
  }

  foreach ($user in $Users) {
    if ($user.username -eq $HostUsername) {
      continue
    }

    $guestState = $UserStates[$user.username]
    $guestBootstrap = Invoke-JsonRequest -Uri "$BaseUrl/api/bootstrap" -Method "Get" -WebSession $guestState.session
    $inviteId = ($guestBootstrap.incomingInvites | Where-Object { $_.sessionName -eq $SessionName } | Select-Object -First 1).id

    if (-not $inviteId) {
      throw "Could not find invite for $($user.username) in session '$SessionName'."
    }

    Invoke-JsonRequest -Uri "$BaseUrl/api/invites/$inviteId/accept" -Method "Post" -WebSession $guestState.session | Out-Null
  }

  return $sessionId
}

function Set-ManualTeams {
  param(
    [string]$BaseUrl,
    $HostSession,
    [string]$SessionId,
    [hashtable]$Teams
  )

  Invoke-JsonRequest -Uri "$BaseUrl/api/sessions/$SessionId/teams/manual" -Method "Post" -WebSession $HostSession | Out-Null
  $session = Get-SessionSnapshot -WebSession $HostSession -BaseUrl $BaseUrl

  $memberIdByUsername = @{}
  foreach ($member in $session.members) {
    $memberIdByUsername[$member.username] = $member.id
  }

  foreach ($teamSlot in @("A", "B")) {
    foreach ($username in $Teams[$teamSlot]) {
      Invoke-JsonRequest `
        -Uri "$BaseUrl/api/sessions/$SessionId/teams/assign" `
        -Method "Post" `
        -WebSession $HostSession `
        -Body @{
          userId = $memberIdByUsername[$username]
          teamSlot = $teamSlot
        } | Out-Null
    }
  }
}

function Start-DemoMatch {
  param(
    [string]$BaseUrl,
    $HostSession,
    [string]$SessionId
  )

  Invoke-JsonRequest -Uri "$BaseUrl/api/sessions/$SessionId/match/start" -Method "Post" -WebSession $HostSession | Out-Null
  return Get-SessionSnapshot -WebSession $HostSession -BaseUrl $BaseUrl
}

function Play-ThrowSequence {
  param(
    [string]$BaseUrl,
    $HostSession,
    [string]$SessionId,
    [array]$Throws,
    [string]$MatchName
  )

  $session = Get-SessionSnapshot -WebSession $HostSession -BaseUrl $BaseUrl

  foreach ($throw in $Throws) {
    $currentUsername = $session.match.currentPlayer.username
    if ($throw.expectedUser -and $currentUsername -ne $throw.expectedUser) {
      throw "Unexpected current player during '$MatchName'. Expected '$($throw.expectedUser)', got '$currentUsername'."
    }

    $response = Invoke-JsonRequest `
      -Uri "$BaseUrl/api/sessions/$SessionId/match/throw" `
      -Method "Post" `
      -WebSession $HostSession `
      -Body @{
        wasHit = [bool]$throw.wasHit
        finishedBeer = [bool]$throw.finishedBeer
      }

    $session = $response.session
    if ($session.match.status -eq "completed") {
      break
    }
  }

  if ($session.match.status -ne "completed") {
    throw "Match '$MatchName' did not finish."
  }

  return $session
}

$base = "http://127.0.0.1:8787"
$users = @(
  @{ displayName = "Alex Demo"; username = "demo_alex" },
  @{ displayName = "Blair Demo"; username = "demo_blair" },
  @{ displayName = "Casey Demo"; username = "demo_casey" },
  @{ displayName = "Drew Demo"; username = "demo_drew" },
  @{ displayName = "Emery Demo"; username = "demo_emery" },
  @{ displayName = "Finley Demo"; username = "demo_finley" }
)

$matches = @(
  @{
    name = "Local Demo Opener"
    host = "demo_alex"
    teams = @{
      A = @("demo_alex", "demo_casey", "demo_emery")
      B = @("demo_blair", "demo_drew", "demo_finley")
    }
    throws = @(
      @{ expectedUser = "demo_alex"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_blair"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_emery"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_finley"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_alex"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_blair"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_emery"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_finley"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $true }
    )
  },
  @{
    name = "Local Demo Rematch"
    host = "demo_alex"
    teams = @{
      A = @("demo_blair", "demo_drew", "demo_finley")
      B = @("demo_alex", "demo_casey", "demo_emery")
    }
    throws = @(
      @{ expectedUser = "demo_blair"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_alex"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_finley"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_emery"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_blair"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_alex"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $false; finishedBeer = $true },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_alex"; wasHit = $false; finishedBeer = $true },
      @{ expectedUser = "demo_emery"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_emery"; wasHit = $true; finishedBeer = $true }
    )
  },
  @{
    name = "Local Demo Decider"
    host = "demo_alex"
    teams = @{
      A = @("demo_alex", "demo_drew", "demo_finley")
      B = @("demo_blair", "demo_casey", "demo_emery")
    }
    throws = @(
      @{ expectedUser = "demo_alex"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_blair"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_casey"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_finley"; wasHit = $true; finishedBeer = $false },
      @{ expectedUser = "demo_blair"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_alex"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_emery"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_drew"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_blair"; wasHit = $true; finishedBeer = $true },
      @{ expectedUser = "demo_finley"; wasHit = $false; finishedBeer = $false },
      @{ expectedUser = "demo_emery"; wasHit = $true; finishedBeer = $true }
    )
  }
)

Invoke-JsonRequest -Uri "$base/api/bootstrap" -Method "Get" | Out-Null

$userStates = @{}
foreach ($user in $users) {
  $userStates[$user.username] = Login-DemoUser -User $user -BaseUrl $base
}

$primaryHost = $userStates["demo_alex"]
Add-HostFriends -HostSession $primaryHost.session -Users $users -HostUsername "demo_alex" -BaseUrl $base

$completedMatches = @()

foreach ($match in $matches) {
  $hostState = $userStates[$match.host]
  $sessionId = New-DemoSession `
    -BaseUrl $base `
    -HostSession $hostState.session `
    -UserStates $userStates `
    -Users $users `
    -HostUsername $match.host `
    -SessionName $match.name

  Set-ManualTeams -BaseUrl $base -HostSession $hostState.session -SessionId $sessionId -Teams $match.teams
  Start-DemoMatch -BaseUrl $base -HostSession $hostState.session -SessionId $sessionId | Out-Null
  $finalSession = Play-ThrowSequence -BaseUrl $base -HostSession $hostState.session -SessionId $sessionId -Throws $match.throws -MatchName $match.name

  $completedMatches += [PSCustomObject]@{
    sessionId = $sessionId
    sessionName = $match.name
    winnerTeam = $finalSession.match.winnerTeam
    throwCount = $finalSession.match.throwNumber
  }
}

$finalBootstrap = Invoke-JsonRequest -Uri "$base/api/bootstrap" -Method "Get" -WebSession $primaryHost.session

[PSCustomObject]@{
  baseUrl = $base
  users = $users | ForEach-Object { $_.username }
  completedMatches = $completedMatches
  leaderboardTop = $finalBootstrap.leaderboard | Select-Object -First 6 | ForEach-Object {
    [PSCustomObject]@{
      username = $_.username
      rating = $_.rating
      matchesPlayed = $_.matchesPlayed
      wins = $_.wins
      accuracy = $_.accuracy
    }
  }
  activeSession = [PSCustomObject]@{
    id = $finalBootstrap.activeSession.id
    name = $finalBootstrap.activeSession.name
    status = $finalBootstrap.activeSession.match.status
    winnerTeam = $finalBootstrap.activeSession.match.winnerTeam
    shareUrl = $finalBootstrap.activeSession.shareUrl
  }
} | ConvertTo-Json -Depth 10
