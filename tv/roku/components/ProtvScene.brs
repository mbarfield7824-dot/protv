sub init()
    m.items = []
    m.rows = []
    m.mode = "home"
    m.query = ""
    m.loaded = false
    m.loading = false
    m.navIndex = 0
    m.detailIndex = 0
    m.pendingLaunch = invalid
    m.playTask = invalid
    m.account = invalid
    m.progress = {}
    m.progressLoaded = false
    m.deviceSession = invalid
    m.accountTask = invalid
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    m.pollDelaySeconds = 5
    m.exchangeRetryCount = 0
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.lastSavedPosition = 0
    for each id in ["nav", "home", "rails", "detail", "detailButtons", "about", "account", "accountButtons", "video", "status", "accountPollTimer", "progressTimer"]
        m[id] = m.top.findNode(id)
    end for
    for each id in ["navHome", "navSearch", "navAccount", "navAbout"]
        m.top.findNode(id).observeField("buttonSelected", "navSelected")
    end for
    m.rails.observeField("rowItemSelected", "titleSelected")
    m.rails.observeField("rowItemFocused", "titleFocused")
    for each id in ["detailPlay", "detailBack"]
        m.top.findNode(id).observeField("buttonSelected", "detailSelected")
    end for
    m.top.findNode("accountAction").observeField("buttonSelected", "accountActionSelected")
    m.top.findNode("accountSignOut").observeField("buttonSelected", "accountSignOutSelected")
    m.top.findNode("accountBack").observeField("buttonSelected", "accountBackSelected")
    m.video.observeField("state", "videoState")
    m.top.findNode("detailArt").observeField("loadStatus", "detailArtStatus")
    m.accountPollTimer.observeField("fire", "activationPollTimerFired")
    m.progressTimer.observeField("fire", "progressTimerFired")
    showAccountState()
    focusNav()
    loadCatalog()
end sub

sub loadCatalog()
    if m.loading then return
    m.loading = true
    m.status.text = "Loading PROtv..."
    m.catalogTask = CreateObject("roSGNode", "HttpTask")
    m.catalogTask.kind = "catalog"
    m.catalogTask.path = "/v1/catalog?view=all"
    m.catalogTask.observeField("result", "catalogLoaded")
    m.catalogTask.control = "run"
end sub

sub catalogLoaded()
    m.loading = false
    result = m.catalogTask.result
    if result.error <> ""
        m.status.text = result.error + " Select Home to retry."
        return
    end if
    m.items = result.items
    m.loaded = true
    showRows()
    if m.pendingLaunch <> invalid then applyLaunch()
end sub

sub showRows()
    m.rows = []
    if m.query = "" and m.account <> invalid and m.progressLoaded
        continueItems = ContinueWatchingItems(m.items, m.progress)
        if continueItems.Count() > 0 then m.rows.Push({ title: "Continue Watching", items: continueItems, landscape: false })
    end if
    baseRows = HomeRows(m.items, m.query)
    for each row in baseRows
        m.rows.Push(row)
    end for
    root = CreateObject("roSGNode", "ContentNode")
    sizes = []
    heights = []
    for each row in m.rows
        node = root.createChild("ContentNode")
        node.title = row.title
        for each item in row.items
            child = node.createChild("ContentNode")
            child.title = item.title
            child.HDPosterUrl = item.artwork
            cardFields = { id: item.id, landscape: row.landscape, continueWatching: false, progressPercent: 0 }
            if row.title = "Continue Watching" and m.progress.DoesExist(item.id)
                cardFields.continueWatching = true
                cardFields.progressPercent = m.progress[item.id].progressPercent
            end if
            child.addFields(cardFields)
        end for
        if row.landscape
            sizes.Push([256,194])
            heights.Push(230)
        else
            sizes.Push([144,266])
            heights.Push(310)
        end if
    end for
    if sizes.Count() > 0
        m.rails.rowItemSize = sizes
        m.rails.rowHeights = heights
    end if
    m.rails.content = root
    if m.rows.Count() = 0
        m.status.text = "No matching titles. Select Search or Home."
        m.top.findNode("heroTitle").text = "Discover PROtv"
        m.top.findNode("heroMeta").text = ""
        m.top.findNode("heroDescription").text = ""
        focusNav()
    else
        updateHero(m.rows[0].items[0])
        m.status.text = "Up/Down: categories   Left/Right: titles   OK: details   Back: navigation"
    end if
end sub

sub updateHero(item as Object)
    m.top.findNode("heroTitle").text = item.title
    m.top.findNode("heroMeta").text = TitleMetadata(item)
    m.top.findNode("heroDescription").text = Text(item.description)
end sub

sub titleFocused()
    pair = m.rails.rowItemFocused
    if validPair(pair) then updateHero(m.rows[pair[0]].items[pair[1]])
end sub

function validPair(pair as Dynamic) as Boolean
    if not IsArray(pair) then return false
    if pair.Count() <> 2 then return false
    if pair[0] < 0 or pair[0] >= m.rows.Count() then return false
    return pair[1] >= 0 and pair[1] < m.rows[pair[0]].items.Count()
end function

sub titleSelected()
    pair = m.rails.rowItemSelected
    if validPair(pair) then showDetail(m.rows[pair[0]].items[pair[1]])
end sub

sub showDetail(item as Object)
    m.selected = item
    changeMode("detail")
    m.top.findNode("detailTitle").text = item.title
    m.top.findNode("detailFallback").text = "PROtv" + Chr(10) + Chr(10) + item.title
    art = m.top.findNode("detailArt")
    art.visible = art.uri = item.artwork and art.loadStatus = "ready"
    art.uri = item.artwork
    m.top.findNode("detailMeta").text = TitleMetadata(item)
    if ResumePosition(m.progress, Text(item.id)) > 0
        m.top.findNode("detailPlay").text = "Resume"
    else
        m.top.findNode("detailPlay").text = "Play"
    end if
    description = Text(item.description)
    if Text(item.credits) <> "" then description = description + Chr(10) + Chr(10) + Text(item.credits)
    m.top.findNode("detailDescription").text = description
    m.status.text = "OK: select   Back: return to the same title"
    m.detailIndex = 0
    focusDetails()
end sub

sub detailArtStatus()
    art = m.top.findNode("detailArt")
    art.visible = art.loadStatus = "ready"
    if art.loadStatus = "failed" then print "PROtv: detail artwork failed; showing branded title panel"
end sub

sub changeMode(mode as String)
    m.mode = mode
    m.home.visible = mode = "home"
    m.detail.visible = mode = "detail"
    m.about.visible = mode = "about"
    m.account.visible = mode = "account"
end sub

sub navSelected()
    selected = m.navIndex
    if selected = 0
        m.query = ""
        changeMode("home")
        if not m.loaded
            loadCatalog()
        else
            showRows()
            if m.rows.Count() > 0 then m.rails.setFocus(true)
        end if
    else if selected = 1
        changeMode("search")
        m.searchDialog = CreateObject("roSGNode", "StandardKeyboardDialog")
        m.searchDialog.title = "Search PROtv - title or genre"
        m.searchDialog.text = m.query
        m.searchDialog.buttons = ["Show results", "Cancel"]
        m.searchDialog.observeField("buttonSelected", "searchSelected")
        m.searchDialog.observeField("wasClosed", "searchClosed")
        m.top.dialog = m.searchDialog
        m.status.text = "Enter a title or genre, then select Show results."
    else if selected = 2
        changeMode("account")
        showAccountState()
        focusAccount()
    else
        changeMode("about")
        m.status.text = "Development preview - not Roku certified."
        focusNav()
    end if
end sub

sub searchSelected()
    if m.searchDialog.buttonSelected = 0
        m.query = Left(Text(m.searchDialog.text).Trim(), 200)
        m.searchDialog.unobserveField("wasClosed")
        m.searchDialog.close = true
        changeMode("home")
        showRows()
        if m.rows.Count() > 0 then m.rails.setFocus(true)
    else
        m.searchDialog.close = true
        returnHome()
    end if
end sub

sub searchClosed()
    if m.mode = "search" then returnHome()
end sub

sub returnHome()
    cancelPlaybackRequest()
    changeMode("home")
    if m.rows.Count() > 0
        m.rails.setFocus(true)
    else
        focusNav()
    end if
end sub

sub detailSelected()
    if m.detailIndex = 0
        startPlayback()
    else
        returnHome()
    end if
end sub

sub cancelPlaybackRequest()
    if m.playTask <> invalid
        m.playTask.unobserveField("result")
        m.playTask.control = "stop"
        m.playTask = invalid
    end if
end sub

sub startPlayback()
    cancelPlaybackRequest()
    m.status.text = "Authorizing playback..."
    m.playTask = CreateObject("roSGNode", "HttpTask")
    m.playTask.kind = "playback"
    m.playTask.path = "/v1/catalog/titles/" + m.selected.id.EncodeUriComponent() + "/playback"
    m.playTask.observeField("result", "playbackLoaded")
    m.playTask.control = "run"
end sub

sub playbackLoaded()
    if m.playTask = invalid or m.mode <> "detail" then return
    result = m.playTask.result
    if result.error <> ""
        m.status.text = result.error + " Select Play to retry."
        return
    end if
    playback = PlaybackUrl(result.payload, m.selected)
    if playback.error <> ""
        m.status.text = playback.error
        return
    end if
    content = CreateObject("roSGNode", "ContentNode")
    content.url = playback.url
    content.streamFormat = "hls"
    content.title = m.selected.title
    m.video.content = content
    m.lastSavedPosition = 0
    resumeAt = ResumePosition(m.progress, Text(m.selected.id))
    if resumeAt > 0 then m.video.seek = resumeAt
    m.video.visible = true
    m.video.setFocus(true)
    m.video.control = "play"
    m.progressTimer.control = "start"
end sub

sub videoState()
    if m.video.state = "error"
        code = m.video.errorCode
        m.progressTimer.control = "stop"
        closeVideo()
        m.status.text = "Playback failed (Roku " + code.ToStr() + "). Select Play to retry."
    else if m.video.state = "paused"
        saveCurrentProgress(true)
    else if m.video.state = "finished"
        saveCurrentProgress(true)
        m.progressTimer.control = "stop"
        closeVideo()
        m.status.text = "Playback finished."
    end if
end sub

sub closeVideo()
    saveCurrentProgress(true)
    m.progressTimer.control = "stop"
    m.video.control = "stop"
    m.video.visible = false
    m.video.content = invalid
    focusDetails()
end sub

sub onLaunch()
    m.pendingLaunch = m.top.launchRequest
    if m.loaded then applyLaunch()
end sub

sub applyLaunch()
    result = ResolveLaunch(m.pendingLaunch, m.items)
    m.pendingLaunch = invalid
    if result.error = "" and result.item = invalid then return
    if m.searchDialog <> invalid
        m.searchDialog.unobserveField("wasClosed")
        m.searchDialog.close = true
        m.searchDialog = invalid
    end if
    if m.video.visible then closeVideo()
    cancelPlaybackRequest()
    if result.error <> ""
        returnHome()
        m.status.text = result.error
    else if result.item <> invalid
        showDetail(result.item)
        startPlayback()
    end if
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false
    if m.video.visible
        if key = "back"
            closeVideo()
            return true
        end if
        return false
    end if
    if key = "back"
        if m.mode <> "home"
            returnHome()
            return true
        else if not m.nav.isInFocusChain()
            focusNav()
            return true
        end if
        return false
    end if
    if key = "left" or key = "right"
        stepValue = 1
        if key = "left" then stepValue = -1
        if m.nav.isInFocusChain()
            m.navIndex = NavigationIndex(m.navIndex, stepValue, 4)
            focusNav()
            return true
        else if m.detailButtons.isInFocusChain()
            m.detailIndex = NavigationIndex(m.detailIndex, stepValue, 2)
            focusDetails()
            return true
        else if m.accountButtons.isInFocusChain()
            buttons = [m.top.findNode("accountAction"), m.top.findNode("accountSignOut"), m.top.findNode("accountBack")]
            visibleButtons = []
            currentIndex = 0
            for each button in buttons
                if button.visible
                    if button.isInFocusChain() then currentIndex = visibleButtons.Count()
                    visibleButtons.Push(button)
                end if
            end for
            if visibleButtons.Count() > 0
                targetIndex = NavigationIndex(currentIndex, stepValue, visibleButtons.Count())
                visibleButtons[targetIndex].setFocus(true)
                return true
            end if
        end if
    end if
    if m.mode = "home"
        if key = "down" and m.nav.isInFocusChain() and m.rows.Count() > 0
            m.rails.setFocus(true)
            return true
        else if key = "up" and m.rails.isInFocusChain()
            if m.rails.rowItemFocused[0] = 0
                focusNav()
                return true
            end if
        end if
    end if
    return false
end function

sub showAccountState()
    code = m.top.findNode("accountCode")
    url = m.top.findNode("accountUrl")
    expiry = m.top.findNode("accountExpiry")
    action = m.top.findNode("accountAction")
    signOut = m.top.findNode("accountSignOut")
    code.text = ""
    url.text = ""
    expiry.text = ""
    if m.account <> invalid
        m.top.findNode("accountMessage").text = "Signed in. Continue Watching is synchronized to your PROtv account."
        action.text = "Refresh Continue Watching"
        signOut.visible = true
    else
        m.top.findNode("accountMessage").text = "Link your PROtv account on another device to synchronize Continue Watching. Guest browsing and playback remain available."
        action.text = "Link PROtv account"
        signOut.visible = false
    end if
    if m.deviceSession <> invalid
        code.text = "Enter code: " + m.deviceSession.userCode
        url.text = m.deviceSession.verificationUrl
        expiry.text = "This code expires in about " + Int((m.deviceSession.expiresAtSeconds - CurrentEpochSeconds() + 59) / 60).ToStr().Trim() + " minute(s). Approve it using your signed-in PROtv website."
    else if FirebaseApiKey() = "" and m.account = invalid
        m.top.findNode("accountMessage").text = "Account linking needs the existing Firebase public web API key in this Roku build. Guest browsing and playback remain available."
    end if
end sub

sub focusAccount()
    if m.account <> invalid
        m.top.findNode("accountSignOut").setFocus(true)
    else
        m.top.findNode("accountAction").setFocus(true)
    end if
end sub

sub accountActionSelected()
    if m.account <> invalid
        m.authRetryAction = ""
        if m.pendingProgressSave <> invalid
            drainPendingProgress()
        else
            beginAccountAction("progress-read")
        end if
    else if m.deviceSession <> invalid
        pollDeviceSession()
    else
        startDeviceActivation()
    end if
end sub

sub accountSignOutSelected()
    cancelAccountTask()
    m.accountPollTimer.control = "stop"
    m.progressTimer.control = "stop"
    m.deviceSession = invalid
    m.account = invalid
    m.progress = {}
    m.progressLoaded = false
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.afterRefreshAction = ""
    m.accountTask = invalid
    m.authRetryAction = ""
    showAccountState()
    if m.loaded then showRows()
    m.top.findNode("accountMessage").text = "Signed out on this TV. You can continue watching as a guest or link another PROtv account."
    m.status.text = "Signed out. Guest browsing and playback remain available."
    focusAccount()
end sub

sub accountBackSelected()
    returnHome()
end sub

sub startDeviceActivation()
    if FirebaseApiKey() = ""
        showAccountState()
        m.status.text = "Account linking is not configured in this Roku build. Guest playback is still available."
        return
    end if
    m.accountPollTimer.control = "stop"
    m.deviceSession = invalid
    m.pollDelaySeconds = 5
    m.exchangeRetryCount = 0
    m.top.findNode("accountMessage").text = "Starting a secure PROtv TV sign-in..."
    m.status.text = "Contacting PROtv to create a temporary activation code."
    startAccountTask("activation-create", "/auth/device-sessions", "POST", "", "", "", "", "")
end sub

sub activationPollTimerFired()
    if m.deviceSession = invalid then return
    pollDeviceSession()
end sub

sub pollDeviceSession()
    if m.deviceSession = invalid or m.accountTask <> invalid then return
    if CurrentEpochSeconds() >= m.deviceSession.expiresAtSeconds
        activationExpired()
        return
    end if
    startAccountTask("activation-poll", "/auth/device-sessions/" + m.deviceSession.sessionId, "GET", "", "", m.deviceSession.deviceSecret, "", "")
end sub

sub startAccountTask(kind as String, path as String, method as String, body as String, authorization as String, deviceSecret as String, url as String, contentType as String)
    task = CreateObject("roSGNode", "HttpTask")
    task.kind = kind
    task.path = path
    task.method = method
    task.body = body
    task.authorization = authorization
    task.deviceSecret = deviceSecret
    task.url = url
    task.contentType = contentType
    task.observeField("result", "accountTaskCompleted")
    m.accountTask = task
    task.control = "run"
end sub

sub accountTaskCompleted()
    task = m.accountTask
    if task = invalid then return
    m.accountTask = invalid
    result = task.result
    kind = task.kind
    if result.error <> ""
        handleAccountTaskError(kind, result)
        if kind <> "progress-write" then drainPendingProgress()
        return
    end if
    if kind = "activation-create"
        details = DeviceSessionDetails(result.payload, CurrentEpochSeconds())
        if not details.valid
            m.top.findNode("accountMessage").text = details.error
            m.status.text = details.error
        else
            m.deviceSession = details.session
            m.pollDelaySeconds = m.deviceSession.intervalSeconds
            m.top.findNode("accountMessage").text = "On your phone or computer, visit this address and sign in to your PROtv account. Enter the code shown here."
            showAccountState()
            m.accountPollTimer.duration = m.deviceSession.intervalSeconds
            m.accountPollTimer.control = "start"
            m.status.text = "Waiting for approval. This TV checks at the interval provided by PROtv."
        end if
    else if kind = "activation-poll"
        status = DeviceActivationState(Text(result.payload.status), CurrentEpochSeconds(), m.deviceSession.expiresAtSeconds)
        if status = "pending"
            m.pollDelaySeconds = m.deviceSession.intervalSeconds
        else if status = "approved"
            m.accountPollTimer.control = "stop"
            m.top.findNode("accountMessage").text = "Approved. Completing secure sign-in..."
            startAccountTask("activation-exchange", "/auth/device-sessions/" + m.deviceSession.sessionId + "/exchange", "POST", "", "", m.deviceSession.deviceSecret, "", "")
        else if status = "expired" or status = "consumed"
            activationExpired()
        else
            m.accountPollTimer.control = "stop"
            m.deviceSession = invalid
            showAccountState()
            m.top.findNode("accountMessage").text = "PROtv returned an unsupported activation status. Start a new sign-in."
        end if
    else if kind = "activation-exchange"
        customToken = Text(result.payload.customToken)
        if customToken = ""
            activationFailed("PROtv did not return a usable sign-in token. Start again.")
        else
            customBody = FormatJson({ token: customToken, returnSecureToken: true })
            identityUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + FirebaseApiKey()
            startAccountTask("firebase-custom", "", "POST", customBody, "", "", identityUrl, "application/json")
        end if
    else if kind = "firebase-custom"
        if not ValidFirebaseSession(result.payload)
            authSessionFailed("Firebase returned an invalid account session. Link again.")
        else
            previousViewerId = ""
            if m.account <> invalid then previousViewerId = Text(m.account.viewerId)
            m.progress = ProgressForViewer(previousViewerId, Text(result.payload.localId), m.progress)
            m.account = { viewerId: result.payload.localId }
            m.deviceSession = invalid
            m.accountPollTimer.control = "stop"
            m.account.idToken = result.payload.idToken
            m.account.refreshToken = result.payload.refreshToken
            m.account.expiresAtSeconds = CurrentEpochSeconds() + Val(Text(result.payload.expiresIn))
            m.progressLoaded = false
            showAccountState()
            beginAccountAction("progress-read")
        end if
    else if kind = "firebase-refresh"
        if m.account = invalid or not ValidFirebaseRefresh(result.payload, Text(m.account.viewerId))
            authSessionFailed("Firebase could not refresh the same account session. Sign in again.")
        else
            m.account.idToken = result.payload.access_token
            m.account.refreshToken = result.payload.refresh_token
            m.account.expiresAtSeconds = CurrentEpochSeconds() + Val(Text(result.payload.expires_in))
            action = m.afterRefreshAction
            m.afterRefreshAction = ""
            executeAccountAction(action)
        end if
    else if kind = "progress-read"
        if IsMap(result.payload)
            m.progress = result.payload
            m.progress.SetModeCaseSensitive()
            m.progressLoaded = true
            m.authRetryAction = ""
            showAccountState()
            if m.loaded then showRows()
            m.status.text = "Continue Watching synchronized."
        else
            m.top.findNode("accountMessage").text = "PROtv returned an invalid Continue Watching response. Retry to load it again."
            m.status.text = "The Continue Watching response was invalid."
        end if
    else if kind = "progress-write"
        entry = result.payload
        if IsMap(entry) and ValidProgressEntry(entry) and m.savingProgress <> invalid and m.account <> invalid
            m.progress[m.savingProgress.videoId] = entry
            m.lastSavedPosition = m.savingProgress.positionSeconds
            m.savingProgress = invalid
            m.authRetryAction = ""
            if m.loaded then showRows()
            m.status.text = "Watch progress saved."
        else
            if m.pendingProgressSave = invalid then m.pendingProgressSave = m.savingProgress
            m.savingProgress = invalid
            m.status.text = "PROtv returned an invalid progress confirmation."
        end if
    end if
    drainPendingProgress()
end sub

sub handleAccountTaskError(kind as String, result as Object)
    message = Text(result.error)
    statusCode = 0
    if IsNumber(result.statusCode) then statusCode = result.statusCode
    if kind = "activation-create"
        m.top.findNode("accountMessage").text = message + " You can retry or continue as a guest."
        m.status.text = message
    else if kind = "activation-poll"
        failureState = "expired"
        if m.deviceSession <> invalid
            failureState = ActivationPollFailure(statusCode, CurrentEpochSeconds(), m.deviceSession.expiresAtSeconds)
        end if
        if failureState = "expired"
            activationExpired()
        else
            m.pollDelaySeconds = NextPollDelay(m.pollDelaySeconds, m.deviceSession.intervalSeconds)
            m.accountPollTimer.duration = m.pollDelaySeconds
            m.accountPollTimer.control = "start"
            retryLabel = "Network issue while checking approval."
            if failureState = "rate-limited" then retryLabel = "PROtv is rate-limiting approval checks."
            m.top.findNode("accountMessage").text = retryLabel + " Retrying in " + m.pollDelaySeconds.ToStr().Trim() + " seconds. Your code remains private to this TV."
            m.status.text = message + " Retrying until the activation code expires."
        end if
    else if kind = "activation-exchange"
        if m.deviceSession <> invalid and CurrentEpochSeconds() < m.deviceSession.expiresAtSeconds and m.exchangeRetryCount < 3
            m.exchangeRetryCount++
            m.accountPollTimer.duration = m.deviceSession.intervalSeconds
            m.accountPollTimer.control = "start"
            m.top.findNode("accountMessage").text = "PROtv approved the TV, but sign-in completion was interrupted. Retrying " + m.exchangeRetryCount.ToStr().Trim() + " of 3."
            m.status.text = message + " Retrying sign-in before this code expires."
        else
            activationFailed(message + " Start a new sign-in.")
        end if
    else if kind = "firebase-custom"
        activationFailed("Firebase could not finish TV sign-in. Check the Roku Firebase client configuration and try again.")
    else if kind = "firebase-refresh"
        authSessionFailed("Your PROtv session could not be refreshed. Sign in again. " + message)
    else if kind = "progress-read"
        if statusCode = 401
            if m.authRetryAction <> kind
                m.authRetryAction = kind
                requestFirebaseRefresh(kind)
            else
                authSessionFailed("PROtv rejected the refreshed account session. Sign in again.")
            end if
        else
            m.top.findNode("accountMessage").text = "Continue Watching could not be loaded. Check the network or session, then retry."
            m.status.text = message + " Select Refresh Continue Watching to retry."
        end if
    else if kind = "progress-write"
        if statusCode = 401
            if m.authRetryAction <> kind
                m.authRetryAction = kind
                if m.savingProgress <> invalid and m.pendingProgressSave = invalid then m.pendingProgressSave = m.savingProgress
                m.savingProgress = invalid
                requestFirebaseRefresh(kind)
            else
                authSessionFailed("PROtv rejected the refreshed account session. Sign in again.")
            end if
        else
            if m.savingProgress <> invalid and m.pendingProgressSave = invalid then m.pendingProgressSave = m.savingProgress
            m.savingProgress = invalid
            m.status.text = "Watch progress could not be saved. Check the network or session; playback remains available."
        end if
    end if
end sub

sub activationExpired()
    m.accountPollTimer.control = "stop"
    m.deviceSession = invalid
    showAccountState()
    m.top.findNode("accountMessage").text = "The TV activation code expired. Select Link PROtv account to get a new code, or continue as a guest."
    m.status.text = "TV activation expired. No account was linked."
end sub

sub activationFailed(message as String)
    m.accountPollTimer.control = "stop"
    m.deviceSession = invalid
    showAccountState()
    m.top.findNode("accountMessage").text = message
    m.status.text = message
end sub

sub authSessionFailed(message as String)
    cancelAccountTask()
    m.accountPollTimer.control = "stop"
    m.account = invalid
    m.progress = {}
    m.progressLoaded = false
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    showAccountState()
    m.top.findNode("accountMessage").text = message + " Guest browsing and playback remain available."
    if m.loaded then showRows()
    m.status.text = message
end sub

sub beginAccountAction(action as String)
    if not HasViewerSession(m.account) then return
    if NeedsFirebaseRefresh(m.account, CurrentEpochSeconds())
        if Text(m.account.refreshToken) = ""
            authSessionFailed("Your PROtv session expired. Sign in again.")
            return
        end if
        requestFirebaseRefresh(action)
        return
    end if
    executeAccountAction(action)
end sub

sub requestFirebaseRefresh(action as String)
    if m.account = invalid or m.accountTask <> invalid then return
    if Text(m.account.refreshToken) = ""
        authSessionFailed("Your PROtv session expired. Sign in again.")
        return
    end if
    m.afterRefreshAction = action
    refreshUrl = "https://securetoken.googleapis.com/v1/token?key=" + FirebaseApiKey()
    refreshBody = "grant_type=refresh_token&refresh_token=" + m.account.refreshToken.EncodeUriComponent()
    startAccountTask("firebase-refresh", "", "POST", refreshBody, "", "", refreshUrl, "application/x-www-form-urlencoded")
end sub

sub executeAccountAction(action as String)
    if not HasViewerSession(m.account) then return
    if action = "progress-read"
        m.top.findNode("accountMessage").text = "Loading your Continue Watching..."
        startAccountTask("progress-read", "/users/me/progress", "GET", "", m.account.idToken, "", "", "")
    else if action = "progress-write" and m.pendingProgressSave <> invalid
        m.savingProgress = m.pendingProgressSave
        m.pendingProgressSave = invalid
        requestBody = FormatJson({
            positionSeconds: m.savingProgress.positionSeconds,
            durationSeconds: m.savingProgress.durationSeconds,
        })
        path = "/users/me/progress/" + m.savingProgress.videoId.EncodeUriComponent()
        startAccountTask("progress-write", path, "PUT", requestBody, m.account.idToken, "", "", "application/json")
    end if
end sub

sub progressTimerFired()
    if not m.video.visible then return
    if m.pendingProgressSave <> invalid
        drainPendingProgress()
        return
    end if
    saveCurrentProgress(false)
end sub

sub saveCurrentProgress(force as Boolean)
    if not m.video.visible or not HasViewerSession(m.account) or m.selected = invalid then return
    position = m.video.position
    duration = m.video.duration
    if not IsNumber(position) or not IsNumber(duration) or duration <= 0 then return
    positionSeconds = Int(position)
    videoId = Text(m.selected.id)
    if m.savingProgress <> invalid and m.savingProgress.videoId = videoId and m.savingProgress.positionSeconds = positionSeconds then return
    if m.pendingProgressSave <> invalid and m.pendingProgressSave.videoId = videoId and m.pendingProgressSave.positionSeconds = positionSeconds then return
    if not ProgressSaveDue(positionSeconds, m.lastSavedPosition, force) then return
    m.pendingProgressSave = {
        videoId: videoId,
        positionSeconds: positionSeconds,
        durationSeconds: duration,
    }
    drainPendingProgress()
end sub

sub drainPendingProgress()
    if m.accountTask <> invalid or not HasViewerSession(m.account) or m.pendingProgressSave = invalid then return
    beginAccountAction("progress-write")
end sub

sub cancelAccountTask()
    if m.accountTask = invalid then return
    m.accountTask.unobserveField("result")
    m.accountTask.control = "stop"
    m.accountTask = invalid
end sub

sub focusNav()
    m.nav.getChild(m.navIndex).setFocus(true)
end sub

sub focusDetails()
    m.detailButtons.getChild(m.detailIndex).setFocus(true)
end sub
