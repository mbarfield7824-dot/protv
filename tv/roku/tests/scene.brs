sub Main()
    m.passed = 0
    m.failed = 0
    m.top = {
        nodes: {},
        dialog: invalid,
        findNode: function(id as String) as Object
            if not m.nodes.DoesExist(id)
                m.nodes[id] = FocusNode()
                GetGlobalAA().all.Push(m.nodes[id])
            end if
            return m.nodes[id]
        end function,
        signalBeacon: sub(name as String)
            GetGlobalAA().beacons.Push(name)
        end sub
    }
    m.beacons = []
    m.loaded = true
    m.loading = false
    m.catalogLoadedAt = CurrentEpochSeconds()
    m.guestWrittenAt = 0
    m.rowsStale = false
    m.accountFromProfile = false
    m.accountPollTimer = { control: "", duration: 0 }
    m.progressTimer = { control: "" }
    m.playTask = invalid
    m.deviceSession = invalid
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.pendingFavorite = invalid
    m.savingFavorite = invalid
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    m.pollDelaySeconds = 5
    m.exchangeRetryCount = 0
    m.progressLoaded = false
    m.favoritesLoaded = false
    m.selected = invalid
    m.tasks = []
    m.newTask = FakeTask
    for each id in ["heroPlay", "heroInfo", "heroList", "detailList", "profileButton", "railCount", "synopsisFocus", "statusPanel", "detailDescription", "accountAction", "accountSignOut", "accountBack"]
        m.top.nodes[id] = FocusNode()
    end for
    for each id in ["logo", "sidebarBg", "sidebarFade", "sidebarWidth", "sidebarFadeMove", "heroTitle", "railsGroup", "heroLayer", "heroCopy", "bottomFade", "heroExtras", "railsMove", "heroLayerMove", "heroCopyMove", "fadeMove", "extrasFade", "heroEyebrow", "heroMeta", "heroDescription", "heroArtwork", "heroDots"]
        m.top.nodes[id] = FocusNode()
        m.top.nodes[id].opacity = 1.0
    end for
    m.top.nodes.sidebarBg.width = 88.0
    m.profile = m.top.nodes.profileButton
    for each id in ["home", "detail", "seriesScreen", "accountScreen", "sidebar", "topBar"]
        m[id] = FocusNode()
    end for
    m.browseAnim = { control: "" }
    m.sidebarAnim = { control: "" }
    m.backdropTimer = { control: "" }
    m.heroDots = m.top.nodes.heroDots
    m.browsing = false
    m.sidebarExpanded = false
    m.navViews = ["home", "search", "creators", "movies", "series", "blackcinema", "aicinema", "mylist", "continue", "account"]
    m.nav = FocusNode()
    for each view in m.navViews
        m.nav.children.Push(FocusNode())
    end for
    m.heroButtons = FocusNode()
    m.heroButtons.children = [m.top.nodes.heroPlay, m.top.nodes.heroInfo, m.top.nodes.heroList]
    m.detailButtons = FocusNode()
    m.detailButtons.children = [FocusNode(), m.top.nodes.detailList, FocusNode()]
    m.accountButtons = FocusNode()
    m.accountButtons.children = [m.top.nodes.accountAction, m.top.nodes.accountSignOut, m.top.nodes.accountBack]
    m.top.nodes.accountAction.width = 300
    m.top.nodes.accountSignOut.width = 160
    m.top.nodes.accountBack.width = 132
    m.rails = FocusNode()
    m.rails.rowItemFocused = [0, 0]
    m.rows = [{ title: "From PROtv Creators", kind: "titles", items: [{ id: "creator_1" }, { id: "b" }] }, { title: "All Movies", kind: "titles", items: [{ id: "a" }, { id: "b" }] }]
    m.items = [{ id: "a", title: "A", contentType: "MOVIE", category: "Drama" }]
    m.heroItem = m.rows[0].items[0]
    m.spotlight = []
    m.favorites = []
    m.navIndex = 0
    m.heroIndex = 0
    m.detailIndex = 0
    m.mode = "home"
    m.view = "home"
    m.account = invalid
    m.accountTask = invalid
    m.accountQueue = []
    m.video = { visible: false }
    m.status = { text: "" }
    m.statusTimer = { control: "" }
    m.rotateTimer = { control: "" }
    m.all = [m.rails, m.top.nodes.detailDescription]
    for each id in m.top.nodes
        m.all.Push(m.top.nodes[id])
    end for
    for each group in [m.nav, m.heroButtons, m.detailButtons, m.accountButtons]
        m.all.Push(group)
        for each child in group.children
            m.all.Push(child)
        end for
    end for

    focusNav()
    Check(m.nav.children[0].focused, "Home receives initial sidebar focus")
    Press("down")
    Check(m.navIndex = 1 and m.nav.children[1].focused, "down moves through the sidebar")
    m.nav.children[2].visible = false
    Press("down")
    Check(m.navIndex = 3 and m.nav.children[3].focused, "hidden destinations are skipped")
    Press("up")
    Press("up")
    Press("up")
    Check(m.navIndex = 0, "sidebar clamps at Home without wrapping")
    Check(Press("left"), "left on the sidebar is consumed")
    Check(Press("right") and m.top.nodes.heroPlay.focused, "right from the sidebar lands on featured Play")
    Press("right")
    Press("right")
    Check(m.heroIndex = 2 and m.top.nodes.heroList.focused, "featured actions reach + My List")
    Press("right")
    Check(m.top.nodes.heroList.focused, "featured actions clamp at My List")
    Press("left")
    Press("left")
    Check(m.top.nodes.heroPlay.focused, "left walks back to Play")
    Check(Press("left") and m.nav.children[0].focused, "left from Play returns to the sidebar")
    Press("right")
    Check(Press("down") and m.rails.focused, "down from featured actions enters the rails")
    m.rails.rowItemFocused = [0, 2]
    Check(not Press("left"), "left inside a rail is left to RowList")
    m.rails.rowItemFocused = [1, 1]
    Check(not Press("up"), "up inside lower rails is left to RowList scrolling")
    m.rails.rowItemFocused = [1, 0]
    Check(Press("left") and m.nav.children[0].focused, "left from the first card returns to the sidebar")
    m.rails.setFocus(true)
    m.rails.rowItemFocused = [0, 1]
    Check(Press("up") and m.top.nodes.heroPlay.focused, "up from the first rail returns to featured actions")
    m.rails.setFocus(true)
    Check(Press("back") and m.nav.children[0].focused, "Back from browsing goes to the sidebar")
    Check(not Press("back"), "Back on the sidebar exits the app")
    Check(m.rotateTimer.control = "stop", "key presses reset the spotlight rotation")
    Check(m.sidebarExpanded and not m.nav.children[0].compact, "focused sidebar expands with labels")
    Check(m.top.nodes.sidebarWidth.keyValue[1] = 256, "sidebar expands to 256px")
    m.rails.setFocus(true)
    focusRails()
    Check(not m.sidebarExpanded and m.nav.children[0].compact, "sidebar collapses to icons while browsing")
    Check(m.browsing and m.top.nodes.railsMove.keyValue[1][1] = -200, "browsing slides two full rails into view")
    Check(m.top.nodes.extrasFade.keyValue[1] = 0 and m.top.nodes.heroTitle.maxLines = 1, "browsing compacts the hero to its title")
    focusHero()
    Check(not m.browsing and m.top.nodes.railsMove.keyValue[1][1] = 0 and m.top.nodes.heroTitle.maxLines = 2, "featured actions restore the full hero")
    focusNav()
    m.heroItem = invalid
    Check(Press("right") and m.rails.focused, "without a featured title focus falls through to the rails")
    m.heroItem = m.rows[0].items[0]

    m.nav.children[2].visible = true
    layoutNav()
    Check(not m.nav.children[2].visible and not m.nav.children[4].visible, "Creators and Series hide when the catalog has none")
    Check(m.nav.children[3].visible and m.nav.children[3].translation[1] = 92, "visible destinations restack without gaps")
    Check(m.nav.children[7].visible and m.nav.children[9].visible, "My List and Account always show")

    m.view = "movies"
    updateNavState()
    Check(m.nav.children[3].active and not m.nav.children[0].active, "current destination is marked active")
    Check(m.top.nodes.profileButton.text = "Guest", "guest badge before linking")
    m.mode = "account"
    m.account = { viewerId: "v" }
    updateNavState()
    Check(m.nav.children[9].active, "Account marked active on its page")
    Check(Left(m.top.nodes.profileButton.text, 5) = "Good ", "signed-in viewers are greeted")

    m.favorites = ["creator_1"]
    updateListButtons()
    Check(m.top.nodes.heroList.text = "In My List" and m.top.nodes.heroList.icon = "check", "saved titles show In My List")
    m.favorites = []
    updateListButtons()
    Check(m.top.nodes.heroList.text = "My List" and m.top.nodes.heroList.icon = "plus", "unsaved titles offer + My List")
    m.rows[0].cta = true
    m.rows[1].cta = false
    Check(IsInvitePair([0, 2]) and not IsInvitePair([0, 1]) and not IsInvitePair([1, 2]), "creator invite follows the last creator film")
    showCreatorInvite()
    Check(m.heroItem = invalid and m.top.nodes.heroTitle.text = "Your story belongs here", "invite focus shows the creator call to action")
    m.heroItem = m.rows[0].items[0]
    updateRailCount(1)
    Check(m.top.nodes.railCount.text = "2 titles", "focused rail shows its title count")

    m.accountTask = {}
    m.account = { viewerId: "v", idToken: "t", refreshToken: "r", expiresAtSeconds: 9999999999 }
    queueAccountAction("favorites-read")
    queueAccountAction("favorites-read")
    Check(m.accountQueue.Count() = 1, "account work queues once while a request is running")
    m.account = invalid
    m.accountQueue = []

    m.top.nodes.accountSignOut.visible = false
    layoutAccountButtons()
    Check(m.top.nodes.accountBack.translation[0] = 320, "hidden Sign Out leaves no gap")
    ClearFocus()
    m.top.nodes.accountAction.focused = true
    Press("right")
    Check(m.top.nodes.accountBack.focused, "right skips the hidden Sign Out action")
    Press("left")
    Check(Press("left") and m.nav.children[0].focused, "left from the first account action returns to the sidebar")
    Check(Press("right") and m.top.nodes.accountAction.focused, "right from the sidebar enters account actions")

    m.mode = "detail"
    ClearFocus()
    m.detailButtons.children[0].focused = true
    Press("right")
    Press("right")
    Check(m.detailIndex = 2 and m.detailButtons.children[2].focused, "detail actions reach Back")
    Press("left")
    Check(m.detailIndex = 1 and m.top.nodes.detailList.focused, "detail actions include My List")
    Check(Press("up") and m.top.nodes.synopsisFocus.visible, "details up enters scrollable synopsis")
    Check(Press("OK") and not m.top.nodes.synopsisFocus.visible, "synopsis OK returns to actions")
    Check(m.detailButtons.children[1].focused, "the last detail action regains focus")

    m.status.text = "Playback failed"
    statusChanged()
    Check(m.top.nodes.statusPanel.visible, "errors remain visible")
    statusTimerFired()
    Check(m.status.text = "Playback failed", "errors are not auto-dismissed")
    showNotice("Added to My List.")
    statusTimerFired()
    Check(m.status.text = "", "confirmations dismiss themselves")
    statusChanged()
    Check(not m.top.nodes.statusPanel.visible, "healthy UI has no persistent footer")

    ' Guest Continue Watching on this TV; the saved sign-in is forgotten on sign-out.
    m.accountTask = invalid
    m.storage = MemoryStorage()
    m.storage.values.guestProgress = FormatJson({ g1: { positionSeconds: 60, durationSeconds: 1200, progressPercent: 5, updatedAt: 10 } })
    restoreSession()
    Check(m.account = invalid and m.progressLoaded and m.progress.DoesExist("g1"), "guests start with progress saved on this TV")
    m.items = [{ id: "g1", title: "G1", contentType: "MOVIE" }, { id: "g2", title: "G2", contentType: "MOVIE" }]
    Check(PersonalRow("continue") <> invalid and PersonalRow("continue").items[0].id = "g1", "guests get Continue Watching")
    Check(PersonalRow("mylist") = invalid, "My List still needs a linked account")
    m.video = { visible: true, position: 130.6, duration: 1200.0 }
    m.selected = { id: "g2" }
    m.lastSavedPosition = 0
    saveCurrentProgress(false)
    saved = ParseStoredProgress(m.storage.values.guestProgress)
    Check(saved.DoesExist("g2") and saved["g2"].positionSeconds = 130 and m.accountTask = invalid, "guest playback saves on this TV and sends nothing")
    m.video.position = 140.0
    saveCurrentProgress(false)
    Check(ParseStoredProgress(m.storage.values.guestProgress)["g2"].positionSeconds = 130, "guest checkpoints are debounced")
    m.video.position = 141.0
    saveCurrentProgress(true)
    Check(ParseStoredProgress(m.storage.values.guestProgress)["g2"].positionSeconds = 141, "pause and Back flush guest progress")
    m.video = { visible: false }
    m.storage.values.account = "saved"
    m.progress = {}
    forgetAccount()
    Check(not m.storage.values.DoesExist("account") and m.progress.DoesExist("g2") and m.progressLoaded, "forgetting a sign-in removes it and restores guest progress")

    m.launchSignaled = false
    signalLaunchComplete()
    signalLaunchComplete()
    Check(m.beacons.Count() = 1 and m.beacons[0] = "AppLaunchComplete", "AppLaunchComplete is sent exactly once")

    ' Series screen: season tabs above the episode list.
    m.mode = "series"
    m.seasons = SeriesSeasons([{ id: "e2", title: "Two", contentType: "EPISODE", seasonNumber: 2, episodeNumber: 1 }, { id: "e1", title: "One", contentType: "EPISODE", seasonNumber: 1, episodeNumber: 1 }])
    m.seriesSeasons = FocusNode()
    m.seriesSeasons.children = [FocusNode(), FocusNode()]
    m.seriesEpisodes = FocusNode()
    m.all.Append([m.seriesSeasons, m.seriesSeasons.children[0], m.seriesSeasons.children[1], m.seriesEpisodes])
    selectSeason(0, false)
    m.seriesEpisodes.setFocus(true)
    Check(m.seriesSeasons.children[0].style = "primary" and m.seriesEpisodes.content.getChild(0).title = "E1  " + Chr(183) + "  One", "Season 1 opens with its own episodes")
    Check(Press("up") and m.seriesSeasons.children[0].focused, "up from the episode list reaches the season tabs")
    Check(Press("right") and m.seasonIndex = 1 and m.seriesSeasons.children[1].focused and m.seriesSeasons.children[1].style = "primary", "right switches to the next season")
    Check(m.seriesEpisodes.content.getChild(0).title = "E1  " + Chr(183) + "  Two" and m.seriesSeasons.children[0].style = "secondary", "the episode list follows the season")
    Check(Press("right") and m.seasonIndex = 1, "seasons clamp at the last one")
    Check(Press("down") and m.seriesEpisodes.focused, "down returns to the episode list")
    Check(not Press("left") and not Press("down"), "list movement is left to the LabelList")
    m.progress = { e2: { positionSeconds: 600, durationSeconds: 1500, progressPercent: 40, updatedAt: 5 } }
    selectSeason(1, false)
    Check(m.seriesEpisodes.content.getChild(0).title = "E1  " + Chr(183) + "  Two  " + Chr(183) + "  15m left", "episodes in progress show time left")

    ' Device bug 3: the top-right Guest control is reachable and opens Account.
    m.mode = "home"
    m.view = "home"
    m.items = [{ id: "g1", title: "G1", contentType: "MOVIE", artwork: "", backdrop: "" }, { id: "g2", title: "G2", contentType: "MOVIE", artwork: "", backdrop: "" }]
    m.progress = {}
    m.heroItem = m.rows[0].items[0]
    m.heroIndex = 0
    focusHero()
    Check(Press("up") and m.profile.focused, "Up from the featured actions reaches the Guest control")
    Check(Press("down") and m.top.nodes.heroPlay.focused, "Down from the Guest control returns to the featured actions")
    focusProfile()
    Check(Press("left") and m.nav.children[m.navIndex].focused, "Left from the Guest control reaches the sidebar")
    m.heroItem = invalid
    m.rails.setFocus(true)
    m.rails.rowItemFocused = [0, 0]
    Check(Press("up") and m.profile.focused, "without a featured title, Up from the first rail reaches the Guest control")
    m.heroItem = m.rows[0].items[0]
    profileSelected()
    Check(m.mode = "account" and m.top.nodes.accountAction.focused and m.nav.children[9].active, "OK on the Guest control opens Account")
    Check(Press("up") and m.profile.focused, "Up from the account actions reaches the Guest control")
    Check(Press("down") and m.top.nodes.accountAction.focused, "Down returns to the account actions")
    Check(Press("back") and m.mode = "home" and m.profile.focused, "Back from Account returns to the Guest control")

    ' Device bug 2: TV sign-in completes and never stalls.
    m.account = invalid
    m.tasks = []
    openAccount()
    accountActionSelected()
    Check(m.tasks.Count() = 1 and m.tasks[0].kind = "activation-create" and m.tasks[0].method = "POST" and m.tasks[0].control = "run", "Link starts one activation request")
    accountActionSelected()
    Check(m.tasks.Count() = 1 and m.status.text = "Contacting PROtv. One moment...", "pressing again while waiting starts no second request")
    expires = CreateObject("roDateTime")
    expires.FromSeconds(CurrentEpochSeconds() + 600)
    iso = Left(expires.ToISOString(), 19) + ".000Z"
    secret = String(43, "s")
    Finish({ sessionId: String(43, "a"), deviceSecret: secret, userCode: "ABCD-EF23", verificationUrl: "https://watchprotv.com/activate", expiresAt: iso, interval: 5 }, "", 201)
    Check(m.deviceSession <> invalid and m.top.nodes.accountCode.text = "ABCD-EF23" and m.top.nodes.accountUrl.text = "https://watchprotv.com/activate", "the linking code and address appear")
    Check(m.accountPollTimer.control = "start" and m.accountPollTimer.duration = 5.0 and m.top.nodes.accountAction.focused, "approval polling starts and focus stays usable")
    stale = FakeTask()
    accountTaskCompleted(TaskEvent(stale))
    Check(m.deviceSession <> invalid and m.accountTask = invalid, "a late result from another request is ignored")
    m.tasks = []
    pollDeviceSession()
    Check(m.tasks[0].kind = "activation-poll" and m.tasks[0].deviceSecret = secret, "polling sends the device secret header")
    Finish({ status: "pending" })
    pollDeviceSession()
    Finish({ status: "approved" })
    Check(m.tasks[m.tasks.Count() - 1].kind = "activation-exchange", "approval exchanges the session")
    Finish({ customToken: "custom" })
    firebase = m.tasks[m.tasks.Count() - 1]
    Check(firebase.kind = "firebase-custom" and Instr(1, firebase.url, "signInWithCustomToken?key=test-public-web-key") > 0, "Firebase sign-in uses the public web key")
    ' Exactly what Firebase returns: no localId; the UID is in the ID token.
    viewerToken = "h.eyJ1c2VyX2lkIjoidmlld2VyIiwic3ViIjoidmlld2VyIn0.s"
    Finish({ kind: "identitytoolkit#VerifyCustomTokenResponse", idToken: viewerToken, refreshToken: "refresh-token", expiresIn: "3600", isNewUser: false })
    Check(m.account <> invalid and m.account.viewerId = "viewer" and m.top.nodes.accountMessage.text <> "Firebase returned an invalid account session. Link again. Guest browsing and playback remain available.", "a real Firebase custom-token response signs the TV in")
    Check(m.tasks[m.tasks.Count() - 1].kind = "progress-read" and m.tasks[m.tasks.Count() - 1].authorization = viewerToken, "Continue Watching loads after sign-in")
    Finish({})
    Check(m.tasks[m.tasks.Count() - 1].kind = "favorites-read", "My List loads next")
    Finish([])
    Check(HasViewerSession(m.account) and m.accountTask = invalid and m.deviceSession = invalid and m.accountPollTimer.control = "stop", "linking completes with no request left running")
    Check(ParseStoredAccount(m.storage.values.account).viewerId = "viewer" and Instr(1, m.storage.values.account, secret) = 0, "the sign-in is saved without the device secret")
    Check(m.profile.text <> "Guest", "the top-right control greets the signed-in viewer")
    accountSignOutSelected()
    Check(m.account = invalid and not m.storage.values.DoesExist("account") and m.profile.text = "Guest", "Sign Out returns to guest")
    m.tasks = []
    accountActionSelected()
    Finish(invalid, "PROtv request timed out. Please try again.")
    Check(m.accountTask = invalid and m.deviceSession = invalid and m.top.nodes.accountAction.focused and Instr(1, m.top.nodes.accountMessage.text, "retry") > 0, "a timeout leaves the account screen usable")
    accountActionSelected()
    Finish({ sessionId: "bad" }, "", 201)
    Check(m.accountTask = invalid and m.deviceSession = invalid and m.top.nodes.accountMessage.text = "The device sign-in response was invalid.", "a malformed response is reported, not trusted")
    startAccountTask("firebase-custom", "", "POST", "{}", "", "", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=k", "application/json")
    Finish({ idToken: "opaque", refreshToken: "r", expiresIn: "3600" })
    Check(m.account = invalid and Instr(1, m.top.nodes.accountMessage.text, "(FB05 ID token has 1 segments, expected 3)") > 0, "an invalid Firebase session names the failing check on screen")
    Check(Press("back") and m.mode = "home", "Back always leaves the account screen")

    ' Device bug 1: the player keeps focus and the remote controls pause.
    m.mode = "detail"
    m.detailIndex = 0
    m.selected = { id: "g1", title: "G1" }
    m.account = invalid
    m.progress = {}
    m.video = FocusNode()
    m.video.state = "playing"
    m.video.control = "play"
    m.video.position = 300.0
    m.video.duration = 1200.0
    m.all.Push(m.video)
    m.video.setFocus(true)
    Check(Press("OK") and m.video.control = "pause" and m.video.focused, "OK pauses when the player passes it on")
    m.video.state = "paused"
    Check(Press("play") and m.video.control = "resume", "Play/Pause resumes")
    m.video.state = "playing"
    Check(not Press("left") and not Press("right") and not Press("fastforward") and not Press("rewind"), "seek and trick play stay with the native player")
    focusRails()
    focusNav()
    focusHero()
    focusDetails()
    focusAccount()
    focusProfile()
    Check(m.video.focused, "nothing takes focus from the playing video")
    m.rowsStale = false
    refreshRows()
    Check(m.rowsStale, "rail rebuilds wait until playback ends")
    Check(Press("back") and not m.video.visible and m.video.control = "stop" and m.detailButtons.children[0].focused, "Back exits playback to the details")
    Check(ResumePosition(m.progress, "g1") = 300 and ParseStoredProgress(m.storage.values.guestProgress)["g1"].positionSeconds = 300 and m.top.nodes.detailPlay.text = "Resume", "Back preserves the resume position")
    Check(not m.rowsStale, "deferred rows refresh after playback")
    print "PROTV_UI_PASSED="; m.passed
    print "PROTV_UI_FAILED="; m.failed
end sub

' Records each request instead of contacting PROtv.
function FakeTask() as Object
    tasks = GetGlobalAA().tasks
    task = {
        uid: tasks.Count() + 1,
        kind: "", path: "", method: "", body: "", authorization: "", deviceSecret: "", url: "", contentType: "",
        result: invalid, control: "", observer: "",
        observeField: sub(field as String, handler as String)
            m.observer = handler
        end sub,
        unobserveField: sub(field as String)
            m.observer = ""
        end sub,
        isSameNode: function(other as Dynamic) as Boolean
            return other <> invalid and other.uid = m.uid
        end function
    }
    tasks.Push(task)
    return task
end function

function TaskEvent(task as Object) as Object
    return { task: task, getRoSGNode: function() as Object
        return m.task
    end function }
end function

' Completes the newest request with a payload, as HttpTask would.
sub Finish(payload as Dynamic, error = "" as String, statusCode = 200 as Integer)
    task = m.tasks[m.tasks.Count() - 1]
    task.result = { error: error, payload: payload, statusCode: statusCode }
    accountTaskCompleted(TaskEvent(task))
end sub

' Stands in for the roRegistrySection wrapper.
function MemoryStorage() as Object
    return {
        values: {},
        read: function(key as String) as String
            if m.values.DoesExist(key) then return m.values[key]
            return ""
        end function,
        write: sub(key as String, value as String)
            m.values[key] = value
        end sub,
        remove: sub(key as String)
            m.values.Delete(key)
        end sub
    }
end function

function Press(key as String) as Boolean
    return onKeyEvent(key, true)
end function

' Mirrors SceneGraph: exactly one node holds focus.
sub ClearFocus()
    for each node in m.all
        node.focused = false
    end for
end sub

function FocusNode() as Object
    return {
        focused: false,
        visible: true,
        active: false,
        text: "",
        icon: "",
        compact: false,
        maxLines: 2,
        keyValue: [],
        width: 0,
        translation: [0, 0],
        children: [],
        uri: "",
        loadStatus: "",
        style: "",
        createChild: function(kind as String) as Object
            node = FocusNode()
            m.children.Push(node)
            return node
        end function,
        removeChildIndex: sub(index as Integer)
            m.children.Delete(index)
        end sub,
        setFocus: sub(value as Boolean)
            for each node in GetGlobalAA().all
                node.focused = false
            end for
            m.focused = value
        end sub,
        isInFocusChain: function() as Boolean
            if m.focused then return true
            for each child in m.children
                if child.focused then return true
            end for
            return false
        end function,
        getChild: function(index as Integer) as Object
            return m.children[index]
        end function,
        getChildCount: function() as Integer
            return m.children.Count()
        end function
    }
end function

sub Check(condition as Boolean, label as String)
    if condition
        m.passed++
    else
        m.failed++
        print "FAIL: "; label
    end if
end sub
