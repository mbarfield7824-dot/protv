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
    Check(Instr(1, firebase.body, Chr(34) + "returnSecureToken" + Chr(34) + ":true") > 0 and Instr(1, firebase.body, Chr(34) + "token" + Chr(34) + ":") > 0, "the Firebase request asks for a refresh token with exact field names")
    ' Exactly what Firebase returns: no localId; the UID is in the ID token.
    viewerToken = "h.eyJ1c2VyX2lkIjoidmlld2VyIiwic3ViIjoidmlld2VyIn0.s"
    Finish({ kind: "identitytoolkit#VerifyCustomTokenResponse", idToken: viewerToken, refreshToken: "refresh-token", expiresIn: "3600", isNewUser: false })
    Check(m.account <> invalid and m.account.viewerId = "viewer" and Instr(1, m.top.nodes.accountMessage.text, "could not finish signing in") = 0, "a real Firebase custom-token response signs the TV in")
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
    Check(m.account = invalid and Instr(1, m.top.nodes.accountMessage.text, "could not finish signing in this TV (FB05)") > 0, "an invalid Firebase session names the failing check on screen")
    Check(Press("back") and m.mode = "home", "Back always leaves the account screen")

    ' Device bug (v0.5.4): OK did nothing during playback. The native Video UI
    ' consumed it, so the scene now owns the remote while a title plays.
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
    m.video.seek = -1
    m.playerKeys = FocusNode()
    m.playerOverlay = FocusNode()
    m.playerOverlay.visible = false
    m.playerHideTimer = { control: "" }
    m.seekTimer = { control: "" }
    m.scrubbing = false
    m.playbackActive = true
    m.previewBase = PreviewBase({ id: "g1", streamType: "on-demand", muxPlaybackId: "Ab123" })
    m.all.Append([m.video, m.playerKeys])
    m.playerKeys.setFocus(true)
    toggle = m.top.findNode("playerToggle")
    Check(Press("OK") and m.video.control = "pause" and m.playerOverlay.visible and m.playerKeys.focused, "OK pauses and shows the controls")
    m.video.state = "paused"
    videoState()
    Check(toggle.text = "Resume" and toggle.icon = "play" and toggle.style = "primary" and m.playerHideTimer.control = "stop", "paused controls highlight Resume and stay up")
    Check(m.top.nodes.playerTitle.text = "G1" and m.top.nodes.playerTime.text = "5:00 / 20:00" and m.top.nodes.playerFill.width = 264, "controls show the title, position and duration")
    Check(Press("OK") and m.video.control = "resume", "OK again resumes")
    m.video.state = "playing"
    videoState()
    Check(toggle.text = "Pause" and toggle.icon = "pause" and m.playerHideTimer.control = "start", "resumed controls fade after a short delay")
    playerHideTimerFired()
    Check(not m.playerOverlay.visible, "the overlay hides while playing")
    Check(Press("play") and m.video.control = "pause" and m.playerOverlay.visible, "Play/Pause pauses")
    m.video.state = "paused"
    Check(Press("play") and m.video.control = "resume", "Play/Pause resumes")
    m.video.state = "playing"
    Check(Press("right") and Press("right") and Press("right") and m.scrubbing and m.scrubTarget = 330 and m.seekTimer.control = "start", "Right steps the seek target forward 10 s at a time")
    Check(m.top.nodes.playerTime.text = "5:30 / 20:00" and m.top.nodes.playerPreview.visible and Instr(1, m.top.nodes.playerPreviewArt.uri, "image.mux.com/Ab123/thumbnail.jpg?time=330") > 0, "seeking shows the target time and a thumbnail")
    commitSeek()
    Check(not m.scrubbing and m.video.seek = 330 and not m.top.nodes.playerPreview.visible, "the seek lands after the presses stop")
    Check(Press("left") and m.scrubTarget = 290 and Press("OK") and m.video.seek = 290 and m.video.control <> "pause", "Left seeks back; OK confirms the seek without pausing")
    Check(Press("rewind") and m.scrubTarget = 270 and Press("fastforward") and m.scrubTarget = 300, "Rewind and Fast Forward step 30 s")
    commitSeek()
    m.video.position = 4.0
    Check(Press("left") and m.scrubTarget = 0, "seeking never goes before the start")
    commitSeek()
    m.video.position = 1195.0
    Check(Press("right") and m.scrubTarget = 1195, "seeking stops short of the end")
    commitSeek()
    m.video.position = 300.0
    Check(Press("replay") and m.video.seek = 290, "Instant Replay jumps back 10 s")
    Check(not Press("options"), "the Options key is left to Roku")
    focusRails()
    focusNav()
    focusHero()
    focusDetails()
    focusAccount()
    focusProfile()
    Check(m.playerKeys.focused, "nothing takes focus from playback")
    m.rowsStale = false
    refreshRows()
    Check(m.rowsStale, "rail rebuilds wait until playback ends")
    Check(Press("back") and not m.video.visible and m.video.control = "stop" and not m.playerOverlay.visible and m.detailButtons.children[0].focused, "Back exits playback to the details")
    Check(ResumePosition(m.progress, "g1") = 300 and ParseStoredProgress(m.storage.values.guestProgress)["g1"].positionSeconds = 300 and m.top.nodes.detailPlay.text = "Resume", "Back preserves the resume position")
    Check(not m.rowsStale, "deferred rows refresh after playback")
    Check(PreviewBase({ muxPlaybackId: "Ab123", playbackToken: "t" }) = "" and PreviewBase({ muxPlaybackId: "bad id" }) = "", "no preview for signed or invalid streams")

    ' v0.5.5 device bug: the progress bar stayed on screen after leaving playback.
    ' Stopping the player changed its state while the Video was still visible,
    ' and the state handler redrew the overlay. Every exit path, then every
    ' late callback, must leave no playback UI behind.
    for each exitPath in ["back", "back-paused", "back-seeking", "back-overlay-hidden", "finished", "error"]
        m.progress = {}
        m.video.seek = -1
        StartFakePlayback({ id: "g1", title: "G1" })
        if exitPath = "back-paused"
            Press("OK")
            m.video.state = "paused"
            videoState()
        else if exitPath = "back-seeking"
            Press("right")
        else if exitPath = "back-overlay-hidden"
            playerHideTimerFired()
        end if
        if exitPath = "finished" or exitPath = "error"
            m.video.state = exitPath
            m.video.errorCode = -5
            videoState()
        else
            Press("back")
        end if
        m.video.visible = true
        m.video.state = "stopped"
        videoState()
        playerPositionChanged()
        playerHideTimerFired()
        commitSeek()
        renderPlayerOverlay()
        m.video.visible = false
        clean = not m.playerOverlay.visible and not m.top.nodes.playerPreview.visible and m.top.nodes.playerFill.width = 0 and m.top.nodes.playerTime.text = ""
        Check(clean and not m.playbackActive and not m.scrubbing and m.seekTimer.control = "stop" and m.playerHideTimer.control = "stop" and m.progressTimer.control = "stop" and m.video.content = invalid, "no playback UI remains after exit: " + exitPath)
        Check(m.video.seek = -1 and ResumePosition(m.progress, "g1") = 300, "exit keeps the saved position and drops the pending seek: " + exitPath)
    end for
    StartFakePlayback({ id: "short", title: "Short" })
    m.video.duration = 8.0
    m.video.position = 3.0
    m.video.seek = -1
    Check(Press("right") and not m.scrubbing and m.video.seek = -1 and m.playerOverlay.visible, "a clip of 10 s or less shows controls but never seeks to the start")
    m.video.duration = invalid
    Check(Press("left") and not m.scrubbing and m.top.nodes.playerTime.text = "0:03", "missing duration shows the position only")
    Press("back")
    StartFakePlayback({ id: "g1", title: "G1" })
    m.video.state = "error"
    m.video.errorCode = -3
    videoState()
    Check(Instr(1, m.status.text, "stopped playing") > 0 and Instr(1, m.status.text, "select Play to try again") > 0 and not m.playerOverlay.visible, "a playback failure explains what to do and clears the controls")
    StartFakePlayback({ id: "e9", title: "Episode Nine" })
    Check(m.playerOverlay.visible and m.top.nodes.playerTitle.text = "Episode Nine" and m.playbackActive, "the next title gets fresh controls")
    Press("back")

    ' Signed-in Continue Watching with the real backend shape (millisecond updatedAt).
    m.items = [{ id: "g1", title: "G1", contentType: "MOVIE", artwork: "", backdrop: "" }, { id: "g2", title: "G2", contentType: "MOVIE", artwork: "", backdrop: "" }, { id: "e9", title: "Episode Nine", contentType: "EPISODE", artwork: "", backdrop: "" }]
    m.storage.values.guestProgress = FormatJson({ "g1": LocalProgressEntry(300, 1200, 10) })
    m.account = { viewerId: "viewer", idToken: "id", refreshToken: "r", expiresAtSeconds: CurrentEpochSeconds() + 3600 }
    m.progress = {}
    m.progressLoaded = false
    m.accountTask = invalid
    m.accountQueue = []
    m.tasks = []
    beginAccountAction("progress-read")
    Finish(ParseJson("{""g2"": {""positionSeconds"": 600, ""durationSeconds"": 1200, ""progressPercent"": 50, ""updatedAt"": 1761234567890}, ""e9"": {""positionSeconds"": 120, ""durationSeconds"": 1500, ""progressPercent"": 8, ""updatedAt"": 1761234999999}}"))
    row = PersonalRow("continue")
    Check(m.progressLoaded and row <> invalid and row.items.Count() = 2 and row.items[0].id = "e9", "signed-in Continue Watching shows movies and episodes from the account")
    Check(ResumePosition(m.progress, "g1") = 0, "account progress replaces guest progress")
    Finish([])
    StartFakePlayback({ id: "g2", title: "G2" })
    m.video.position = 700.0
    m.lastSavedPosition = 600
    m.tasks = []
    saveCurrentProgress(true)
    write = m.tasks[0]
    Check(write.kind = "progress-write" and write.method = "PUT" and Instr(1, write.body, Chr(34) + "positionSeconds" + Chr(34) + ":700") > 0 and write.authorization = "id", "progress saves to the account with exact field names")
    Finish(ParseJson("{""videoId"": ""g2"", ""positionSeconds"": 700, ""durationSeconds"": 1200, ""progressPercent"": 58, ""updatedAt"": 1761235000000}"))
    Check(m.progress["g2"].positionSeconds = 700 and m.pendingProgressSave = invalid and m.savingProgress = invalid and m.lastSavedPosition = 700, "a confirmed save is accepted, not resent")
    m.video.position = 760.0
    saveCurrentProgress(true)
    Finish(invalid, "PROtv request timed out. Please try again.", 0)
    Check(m.pendingProgressSave <> invalid and m.pendingProgressSave.positionSeconds = 760 and m.progress["g2"].positionSeconds = 700, "a failed save is kept for retry and does not corrupt progress")
    progressTimerFired()
    Finish(invalid, "PROtv request failed (HTTP 401). Please try again.", 401)
    Check(m.tasks[m.tasks.Count() - 1].kind = "firebase-refresh", "an expired session refreshes before retrying the save")
    Finish({ user_id: "viewer", access_token: "id-2", refresh_token: "r-2", expires_in: "3600" })
    retry = m.tasks[m.tasks.Count() - 1]
    Check(retry.kind = "progress-write" and retry.authorization = "id-2" and ParseStoredAccount(m.storage.values.account).refreshToken = "r-2", "the save is retried with the refreshed session, which is saved")
    Finish(ParseJson("{""videoId"": ""g2"", ""positionSeconds"": 760, ""durationSeconds"": 1200, ""progressPercent"": 63, ""updatedAt"": 1761235100000}"))
    Check(m.progress["g2"].positionSeconds = 760 and m.pendingProgressSave = invalid, "the retried save lands")
    Press("back")

    ' My List with the existing favorites routes.
    m.favorites = []
    m.favoritesLoaded = true
    m.tasks = []
    toggleMyList({ id: "g1", title: "G1" })
    Check(IsFavorite(m.favorites, "g1") and m.tasks[0].kind = "favorite-write" and m.tasks[0].path = "/users/me/favorites/g1" and Instr(1, m.tasks[0].body, Chr(34) + "favorite" + Chr(34) + ":true") > 0, "adding to My List writes the account")
    Finish({ videoId: "g1", favorite: true })
    toggleMyList({ id: "g1", title: "G1" })
    Finish(invalid, "PROtv request failed (HTTP 500). Please try again.", 500)
    Check(IsFavorite(m.favorites, "g1") and m.favorites.Count() = 1, "a failed removal is undone so the screen matches the account")
    toggleMyList({ id: "g2", title: "G2" })
    Finish(invalid, "PROtv request failed (HTTP 401). Please try again.", 401)
    Finish({ user_id: "viewer", access_token: "id-3", refresh_token: "r-3", expires_in: "3600" })
    Check(m.tasks[m.tasks.Count() - 1].kind = "favorite-write" and m.tasks[m.tasks.Count() - 1].authorization = "id-3", "an expired session refreshes and the My List change is retried")
    Finish({ videoId: "g2", favorite: true })
    Check(FavoriteItems(m.items, m.favorites).Count() = 2 and FavoriteIds(["g1", "g1", "g2"]).Count() = 2, "My List has no duplicates")
    accountSignOutSelected()
    Check(m.account = invalid and m.favorites.Count() = 0 and not m.favoritesLoaded and m.progress["g1"].positionSeconds = 300 and not m.progress.DoesExist("g2"), "signing out drops the account's list and progress and restores guest progress")
    print "PROTV_UI_PASSED="; m.passed
    print "PROTV_UI_FAILED="; m.failed
end sub

' Starts a title the way playbackLoaded does, without a real stream.
sub StartFakePlayback(item as Object)
    m.mode = "detail"
    m.selected = item
    m.video.visible = true
    m.video.state = "playing"
    m.video.position = 300.0
    m.video.duration = 1200.0
    m.video.content = { url: "fake" }
    m.lastSavedPosition = 0
    m.playbackActive = true
    m.progressTimer.control = "start"
    m.playerKeys.setFocus(true)
    renderPlayerOverlay()
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
