sub init()
    m.items = []
    m.rows = []
    m.spotlight = []
    m.spotlightIndex = 0
    m.mode = "home"
    m.view = "home"
    m.query = ""
    m.mood = ""
    m.loaded = false
    m.loading = false
    m.navIndex = 0
    m.heroIndex = 0
    m.detailIndex = 0
    m.detailOrigin = "rails"
    m.heroItem = invalid
    m.heroSource = "spotlight"
    m.backdropFront = invalid
    m.backdropUri = ""
    m.pendingBackdrop = ""
    m.pendingLaunch = invalid
    m.playTask = invalid
    m.account = invalid
    m.progress = {}
    m.progressLoaded = false
    m.favorites = []
    m.favoritesLoaded = false
    m.pendingFavorite = invalid
    m.savingFavorite = invalid
    m.accountQueue = []
    m.authFlow = invalid
    m.authDialog = invalid
    m.authStore = invalid
    m.authNotice = ""
    m.pendingEmail = ""
    m.busy = {}
    m.accountTask = invalid
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.lastSavedPosition = 0
    m.browsing = false
    m.sidebarExpanded = false
    m.refreshing = false
    m.catalogLoadedAt = 0
    m.launchSignaled = false
    m.seriesItem = invalid
    m.seasons = []
    m.seasonIndex = 0
    m.seriesEpisodeIndex = 0
    m.rowsStale = false
    m.accountFromProfile = false
    m.scrubbing = false
    m.scrubTarget = 0
    m.previewBase = ""
    m.playbackActive = false
    m.guestWrittenAt = 0
    m.storage = RegistryStorage()
    ' Tests substitute fake tasks; the app always uses HttpTask.
    m.newTask = HttpTaskNode
    m.newStore = ChannelStoreNode
    m.newDialog = KeyboardDialogNode
    ' Sidebar order; parallel to the children of the nav group.
    m.navViews = ["home", "search", "creators", "movies", "series", "blackcinema", "aicinema", "mylist", "continue", "account"]
    for each id in ["nav", "sidebar", "topBar", "home", "rails", "heroButtons", "heroDots", "detail", "detailButtons", "accountButtons", "video", "status", "seriesScreen", "seriesSeasons", "seriesEpisodes", "authDialogTimer", "progressTimer", "statusTimer", "rotateTimer", "backdropTimer", "backdropFade", "browseAnim", "sidebarAnim", "playerOverlay", "playerHideTimer", "seekTimer", "loadingSpinner"]
        m[id] = m.top.findNode(id)
    end for
    ' Not m.account: that holds the viewer session (invalid for guests).
    m.accountScreen = m.top.findNode("account")
    m.profile = m.top.findNode("profileButton")
    m.loadingSpinner.poster.uri = "pkg:/assets/spinner.png"
    m.loadingSpinner.poster.width = 64
    m.loadingSpinner.poster.height = 64
    m.profile.observeField("buttonSelected", "profileSelected")
    for index = 0 to m.nav.getChildCount() - 1
        m.nav.getChild(index).observeField("buttonSelected", "navSelected")
    end for
    m.top.findNode("heroPlay").observeField("buttonSelected", "heroPlaySelected")
    m.top.findNode("heroInfo").observeField("buttonSelected", "heroInfoSelected")
    m.top.findNode("heroList").observeField("buttonSelected", "heroListSelected")
    m.rails.observeField("rowItemSelected", "titleSelected")
    m.rails.observeField("rowItemFocused", "titleFocused")
    for each id in ["detailPlay", "detailList", "detailBack"]
        m.top.findNode(id).observeField("buttonSelected", "detailSelected")
    end for
    m.top.findNode("accountAction").observeField("buttonSelected", "accountActionSelected")
    m.top.findNode("accountCreate").observeField("buttonSelected", "accountCreateSelected")
    m.top.findNode("accountReset").observeField("buttonSelected", "accountResetSelected")
    m.top.findNode("accountSignOut").observeField("buttonSelected", "accountSignOutSelected")
    m.top.findNode("accountBack").observeField("buttonSelected", "accountBackSelected")
    m.video.observeField("state", "videoState")
    m.status.observeField("text", "statusChanged")
    m.statusTimer.observeField("fire", "statusTimerFired")
    m.rotateTimer.observeField("fire", "rotateTimerFired")
    m.backdropTimer.observeField("fire", "backdropTimerFired")
    m.playerHideTimer.observeField("fire", "playerHideTimerFired")
    m.seekTimer.observeField("fire", "commitSeek")
    m.video.notificationInterval = 0.5
    m.video.observeField("position", "playerPositionChanged")
    for each id in ["backdropA", "backdropB"]
        m.top.findNode(id).observeField("loadStatus", "backdropLoaded")
    end for
    m.backdropFront = m.top.findNode("backdropA")
    m.top.findNode("heroArt").observeField("loadStatus", "heroArtStatus")
    m.top.findNode("detailArt").observeField("loadStatus", "detailArtStatus")
    m.top.findNode("seriesArt").observeField("loadStatus", "seriesArtStatus")
    m.seriesEpisodes.observeField("itemSelected", "episodeSelected")
    m.progressTimer.observeField("fire", "progressTimerFired")
    m.authDialogTimer.observeField("fire", "authDialogTimerFired")
    ' Installed version, for support requests and test reports.
    m.top.findNode("accountBuild").text = "PROtv for Roku " + CreateObject("roAppInfo").GetVersion()
    restoreSession()
    showAccountState()
    layoutNav()
    focusNav()
    loadCatalog()
end sub

function NumberOr(value as Dynamic, fallback as Dynamic) as Dynamic
    if IsNumber(value) then return value
    return fallback
end function

' Certification 3.4: one spinner shows while any visible wait is in progress
' (catalog, playback authorization, buffering, sign-in).
sub setBusy(reason as String, busy as Boolean)
    if busy
        m.busy[reason] = true
    else if m.busy.DoesExist(reason)
        m.busy.Delete(reason)
    end if
    show = m.busy.Count() > 0
    if m.loadingSpinner.visible = show then return
    m.loadingSpinner.visible = show
    if show
        m.loadingSpinner.control = "start"
    else
        m.loadingSpinner.control = "stop"
    end if
end sub

' Sign-in stays busy while its next step (the Firebase session) is running.
sub syncAuthBusy()
    kind = ""
    if m.accountTask <> invalid then kind = Text(m.accountTask.kind)
    setBusy("auth", Left(kind, 3) = "tv-" or kind = "firebase-custom")
end sub

function HttpTaskNode() as Object
    return CreateObject("roSGNode", "HttpTask")
end function

function ChannelStoreNode() as Object
    return CreateObject("roSGNode", "ChannelStore")
end function

function KeyboardDialogNode() as Object
    return CreateObject("roSGNode", "StandardKeyboardDialog")
end function

' This app's registry section; tests substitute an in-memory object.
function RegistryStorage() as Object
    return {
        section: CreateObject("roRegistrySection", "PROtv"),
        read: function(key as String) as String
            if m.section.Exists(key) then return m.section.Read(key)
            return ""
        end function,
        write: sub(key as String, value as String)
            m.section.Write(key, value)
            m.section.Flush()
        end sub,
        remove: sub(key as String)
            m.section.Delete(key)
            m.section.Flush()
        end sub
    }
end function

' Guests resume from progress kept on this TV. A saved sign-in is restored
' and refreshed through Firebase before any account request.
sub restoreSession()
    m.progress = ParseStoredProgress(m.storage.read("guestProgress"))
    m.progressLoaded = true
    if FirebaseApiKey() = "" then return
    stored = ParseStoredAccount(m.storage.read("account"))
    if stored = invalid
        m.storage.remove("account")
        return
    end if
    m.account = stored
    m.progress = {}
    m.progressLoaded = false
    beginAccountAction("progress-read")
end sub

sub storeAccount()
    if HasViewerSession(m.account) then m.storage.write("account", StoredAccountJson(m.account))
end sub

' After sign-out or a rejected session: forget the account, return to guest progress.
sub forgetAccount()
    m.storage.remove("account")
    m.progress = ParseStoredProgress(m.storage.read("guestProgress"))
    m.progressLoaded = true
end sub

' Roku measures launch time to this beacon (certification 3.2): the home
' screen, an error screen, or deep-linked playback starting.
sub signalLaunchComplete()
    if m.launchSignaled then return
    m.launchSignaled = true
    m.top.signalBeacon("AppLaunchComplete")
end sub

' Returning Home after 15 minutes quietly reloads the catalog.
sub refreshCatalogIfStale()
    if not m.loaded or m.loading then return
    if not CatalogStale(m.catalogLoadedAt, CurrentEpochSeconds()) then return
    m.refreshing = true
    loadCatalog()
end sub

sub loadCatalog()
    if m.loading then return
    m.loading = true
    if not m.refreshing
        m.status.text = "Loading PROtv..."
        setBusy("catalog", true)
    end if
    m.catalogTask = m.newTask()
    m.catalogTask.kind = "catalog"
    m.catalogTask.path = "/v1/catalog?view=all"
    m.catalogTask.observeField("result", "catalogLoaded")
    m.catalogTask.control = "run"
end sub

sub catalogLoaded()
    m.loading = false
    setBusy("catalog", false)
    result = m.catalogTask.result
    refreshing = m.refreshing
    m.refreshing = false
    if result.error <> ""
        if refreshing
            ' Keep browsing the catalog already on screen; the next return Home retries.
            print "PROtv: catalog refresh failed; current catalog kept"
            return
        end if
        showHeroMessage("PROtv is unavailable", result.error + " Select Home to retry.")
        m.status.text = result.error + " Select Home to retry."
        signalLaunchComplete()
        return
    end if
    m.items = result.items
    m.catalogLoadedAt = CurrentEpochSeconds()
    firstLoad = not m.loaded
    m.loaded = true
    layoutNav()
    if refreshing
        refreshRows()
    else
        showRows()
    end if
    if m.pendingLaunch <> invalid
        applyLaunch()
    else if firstLoad and m.mode = "home" and m.navIndex = 0 and m.nav.isInFocusChain() and m.heroItem <> invalid
        ' Land on the featured title, not on the menu.
        focusHero()
    end if
    ' A deep link signals once its playback starts or fails.
    if m.playTask = invalid and not m.video.visible then signalLaunchComplete()
end sub

' Hides destinations that have nothing to show and restacks the rest.
sub layoutNav()
    y = 0
    for index = 0 to m.nav.getChildCount() - 1
        button = m.nav.getChild(index)
        button.visible = NavAvailable(m.navViews[index])
        if button.visible
            button.translation = [0, y]
            y = y + 46
        end if
    end for
    if not m.nav.getChild(m.navIndex).visible then m.navIndex = 0
end sub

function NavAvailable(view as String) as Boolean
    if view = "creators" or view = "series" or view = "blackcinema" or view = "aicinema"
        return ViewRows(m.items, view).Count() > 0
    end if
    return true
end function

function NextNavIndex(current as Integer, stepValue as Integer) as Integer
    index = current + stepValue
    while index >= 0 and index < m.nav.getChildCount()
        if m.nav.getChild(index).visible then return index
        index = index + stepValue
    end while
    return current
end function

' Continue Watching uses account progress when signed in, otherwise this TV's.
function PersonalRow(kind as String) as Dynamic
    if kind = "continue" and m.progressLoaded
        items = ContinueWatchingItems(m.items, m.progress)
        if items.Count() > 0 then return { title: "Continue Watching", items: items, landscape: true, kind: "titles", progress: true }
    else if kind = "mylist" and m.account <> invalid and m.favoritesLoaded
        items = FavoriteItems(m.items, m.favorites)
        if items.Count() > 0 then return { title: "My List", items: items, landscape: false, kind: "titles" }
    end if
    return invalid
end function

function BuildRows() as Object
    rows = []
    if m.view = "search"
        for each row in HomeRows(m.items, m.query)
            rows.Push(row)
        end for
    else if m.view = "home"
        base = HomeRows(m.items, "")
        creatorCount = CreatorRows(m.items).Count()
        for index = 0 to creatorCount - 1
            rows.Push(base[index])
        end for
        for each kind in ["continue", "mylist"]
            row = PersonalRow(kind)
            if row <> invalid then rows.Push(row)
        end for
        moodList = AvailableMoods(m.items)
        if moodList.Count() > 0
            rows.Push({ title: "PROtv Discover  " + Chr(183) + "  Pick a mood", items: moodList, landscape: false, kind: "moods" })
            for each mood in moodList
                if mood.id = m.mood then rows.Push({ title: "Feeling " + mood.title, items: MoodItems(m.items, mood.id), landscape: false, kind: "titles" })
            end for
        end if
        for index = creatorCount to base.Count() - 1
            rows.Push(base[index])
        end for
    else if m.view = "mylist" or m.view = "continue"
        row = PersonalRow(m.view)
        if row <> invalid then rows.Push(row)
    else
        for each row in ViewRows(m.items, m.view)
            rows.Push(row)
        end for
    end if
    for each row in rows
        if row.kind = invalid then row.kind = "titles"
        ' 2:3 portrait cards unless every title has real wide artwork.
        if row.landscape = true and row.kind = "titles" then row.landscape = AllWideArtwork(row.items)
        row.cta = row.title = "From PROtv Creators" and (m.view = "home" or m.view = "creators")
    end for
    return rows
end function

sub showRows()
    m.rows = BuildRows()
    root = CreateObject("roSGNode", "ContentNode")
    sizes = []
    heights = []
    for each row in m.rows
        node = root.createChild("ContentNode")
        node.title = row.title
        for each item in row.items
            child = node.createChild("ContentNode")
            child.title = item.title
            if row.kind = "moods"
                child.addFields({ kind: "mood", id: item.id, icon: item.icon, active: item.id = m.mood, landscape: false })
            else if row.kind = "series"
                child.HDPosterUrl = item.artwork
                child.addFields({ kind: "series", id: item.id, landscape: false, creator: false, subtitle: SeriesMeta(SeriesSeasons(item.episodes), item.episodes.Count()), continueWatching: false, progressPercent: 0, timeLeft: "" })
            else
                child.HDPosterUrl = item.artwork
                if row.landscape then child.HDPosterUrl = item.backdrop
                cardFields = { kind: "title", id: item.id, landscape: row.landscape, creator: IsCreatorTitle(item), subtitle: CardSubtitle(item), continueWatching: false, progressPercent: 0, timeLeft: "" }
                if row.DoesExist("progress") and m.progress.DoesExist(item.id)
                    cardFields.continueWatching = true
                    cardFields.progressPercent = m.progress[item.id].progressPercent
                    cardFields.timeLeft = TimeLeft(m.progress[item.id])
                end if
                child.addFields(cardFields)
            end if
        end for
        if row.cta
            invite = node.createChild("ContentNode")
            invite.title = "Join PROtv"
            invite.addFields({ kind: "cta", id: "", landscape: false })
        end if
        if row.kind = "moods"
            sizes.Push([176,99])
            heights.Push(133)
        else if row.landscape
            sizes.Push([176,151])
            heights.Push(185)
        else
            sizes.Push([120,232])
            heights.Push(266)
        end if
    end for
    if sizes.Count() > 0
        m.rails.rowItemSize = sizes
        m.rails.rowHeights = heights
    end if
    m.rails.content = root
    updateNavState()
    m.spotlight = SpotlightFor(m.rows)
    m.spotlightIndex = 0
    if m.rows.Count() = 0
        showEmptyView()
    else
        m.status.text = ""
        if m.spotlight.Count() > 0
            updateHero(m.spotlight[0], "spotlight")
        else if m.rows[0].kind = "series"
            showSeriesHero(m.rows[0].items[0])
        end if
        updateRailCount(0)
    end if
    restartRotation()
end sub

' Rebuilds rows after account data changes without losing the viewer's place.
sub refreshRows()
    if not m.loaded then return
    if m.video.visible
        m.rowsStale = true
        return
    end if
    m.rowsStale = false
    pair = m.rails.rowItemFocused
    rowTitle = ""
    itemId = ""
    if validPair(pair)
        rowTitle = m.rows[pair[0]].title
        itemId = Text(m.rows[pair[0]].items[pair[1]].id)
    end if
    railsFocused = m.rails.isInFocusChain()
    heroItem = m.heroItem
    heroSource = m.heroSource
    showRows()
    if heroItem <> invalid and m.rows.Count() > 0 then updateHero(heroItem, heroSource)
    for rowIndex = 0 to m.rows.Count() - 1
        if m.rows[rowIndex].title = rowTitle
            for itemIndex = 0 to m.rows[rowIndex].items.Count() - 1
                if Text(m.rows[rowIndex].items[itemIndex].id) = itemId
                    m.rails.jumpToRowItem = [rowIndex, itemIndex]
                    updateRailCount(rowIndex)
                end if
            end for
        end if
    end for
    if railsFocused and m.rows.Count() = 0 and m.mode = "home" then focusNav()
end sub

function SpotlightFor(rows as Object) as Object
    if m.view = "home" then return SpotlightItems(m.items)
    result = []
    for each row in rows
        if row.kind = "titles"
            for each item in row.items
                if result.Count() < 5 then result.Push(item)
            end for
            return result
        end if
    end for
    return result
end function

sub showEmptyView()
    if m.view = "search"
        m.status.text = "No matching titles. Select Search or Home."
        showHeroMessage("Nothing found", "Try another title or genre, or select Home to browse everything on PROtv.")
    else if m.view = "mylist" and m.account = invalid
        showHeroMessage("Link your account", "Select Account in the menu to link this TV. My List and Continue Watching follow you across the PROtv website, Fire TV and Roku.")
    else if m.view = "mylist"
        showHeroMessage("My List is empty", "Select + My List on any title to save it here.")
    else if m.view = "continue"
        showHeroMessage("Nothing in progress", "Start any title and it will appear here so you can pick up where you left off.")
    else
        showHeroMessage("Coming soon", "New titles are on the way.")
    end if
    m.top.findNode("railCount").text = ""
    if m.mode = "home" and not m.nav.isInFocusChain() then focusNav()
end sub

sub updateRailCount(rowIndex as Integer)
    label = m.top.findNode("railCount")
    label.text = ""
    if rowIndex < 0 or rowIndex >= m.rows.Count() then return
    row = m.rows[rowIndex]
    if row.kind = "titles" and row.items.Count() > 1 then label.text = row.items.Count().ToStr().Trim() + " titles"
    if row.kind = "series" and row.items.Count() > 1 then label.text = row.items.Count().ToStr().Trim() + " series"
end sub

sub showHeroMessage(title as String, description as String)
    m.heroItem = invalid
    m.top.findNode("heroEyebrow").text = "PROtv"
    m.top.findNode("heroTitle").text = title
    m.top.findNode("heroMeta").text = ""
    m.top.findNode("heroDescription").text = description
    m.top.findNode("heroArtwork").visible = false
    for each id in ["heroPlay", "heroInfo", "heroList"]
        m.top.findNode(id).visible = false
    end for
    renderDots()
    requestBackdrop("", false)
end sub

function EyebrowText(item as Object, source as String) as String
    if source = "spotlight"
        if IsCreatorTitle(item) then return "PROtv CREATOR SPOTLIGHT"
        if m.view = "home" then return "FEATURED ON PROtv"
        return UCase(ViewTitle(m.view)).Replace("PROTV", "PROtv")
    end if
    pair = m.rails.rowItemFocused
    if not validPair(pair) then return ""
    row = m.rows[pair[0]]
    label = UCase(row.title).Replace("PROTV", "PROtv")
    if row.items.Count() > 1 then label = label + "   " + (pair[1] + 1).ToStr().Trim() + " OF " + row.items.Count().ToStr().Trim()
    if IsCreatorTitle(item) and row.title <> "From PROtv Creators" then label = "PROtv CREATOR   " + Chr(183) + "   " + label
    return label
end function

function ViewTitle(view as String) as String
    for index = 0 to m.navViews.Count() - 1
        if m.navViews[index] = view then return m.nav.getChild(index).text
    end for
    return "PROtv"
end function

sub updateHero(item as Object, source as String)
    m.heroItem = item
    m.heroSource = source
    m.top.findNode("heroEyebrow").text = EyebrowText(item, source)
    m.top.findNode("heroTitle").text = item.title
    m.top.findNode("heroMeta").text = TitleMetadata(item)
    m.top.findNode("heroDescription").text = Synopsis(item)
    m.top.findNode("heroArtwork").visible = true
    for each id in ["heroPlay", "heroInfo", "heroList"]
        m.top.findNode(id).visible = true
    end for
    updateListButtons()
    art = m.top.findNode("heroArt")
    art.visible = art.uri = item.artwork and art.loadStatus = "ready"
    art.uri = item.artwork
    renderDots()
    if Text(item.backdrop) <> ""
        requestBackdrop(item.backdrop, true)
    else
        requestBackdrop(Text(item.artwork), false)
    end if
end sub

' Spotlight position dots; shown only while the spotlight drives the hero.
sub renderDots()
    dots = m.heroDots
    while dots.getChildCount() > 0
        dots.removeChildIndex(0)
    end while
    if m.heroItem = invalid or m.heroSource <> "spotlight" or m.spotlight.Count() < 2 then return
    x = 0
    for index = 0 to m.spotlight.Count() - 1
        dot = dots.createChild("Rectangle")
        dot.height = 6
        dot.translation = [x, 0]
        if index = m.spotlightIndex
            dot.width = 22
            dot.color = "0x60A5FAFF"
        else
            dot.width = 6
            dot.color = "0xFFFFFF55"
        end if
        x = x + dot.width + 8
    end for
end sub

sub restartRotation()
    m.rotateTimer.control = "stop"
    if m.spotlight.Count() > 1 then m.rotateTimer.control = "start"
end sub

sub rotateTimerFired()
    if m.mode <> "home" or m.video.visible or m.top.dialog <> invalid then return
    if m.rails.isInFocusChain() or m.spotlight.Count() < 2 then return
    m.spotlightIndex = (m.spotlightIndex + 1) MOD m.spotlight.Count()
    updateHero(m.spotlight[m.spotlightIndex], "spotlight")
end sub

' Backdrop changes are debounced so fast remote scrolling stays smooth.
' sharp = real wide art at full resolution; otherwise a low-resolution wash.
sub requestBackdrop(uri as String, sharp as Boolean)
    m.pendingBackdrop = uri
    m.pendingSharp = sharp
    m.backdropTimer.control = "stop"
    m.backdropTimer.control = "start"
end sub

sub backdropTimerFired()
    uri = m.pendingBackdrop
    if uri = m.backdropUri then return
    m.backdropUri = uri
    back = BackdropBack()
    width = 48
    height = 16
    if m.pendingSharp = true
        width = 1064
        height = 340
    end if
    if uri = ""
        crossfadeBackdrop(invalid)
    else if back.uri = uri and back.loadWidth = width and back.loadStatus = "ready"
        crossfadeBackdrop(back)
    else
        back.loadWidth = width
        back.loadHeight = height
        back.uri = uri
    end if
end sub

sub backdropLoaded()
    back = BackdropBack()
    if back.loadStatus = "ready" and back.uri = m.backdropUri and m.backdropUri <> "" then crossfadeBackdrop(back)
end sub

function BackdropBack() as Object
    if m.backdropFront.id = "backdropA" then return m.top.findNode("backdropB")
    return m.top.findNode("backdropA")
end function

sub crossfadeBackdrop(incoming as Dynamic)
    m.backdropFade.control = "stop"
    fadeIn = m.top.findNode("fadeIn")
    fadeOut = m.top.findNode("fadeOut")
    fadeOut.fieldToInterp = m.backdropFront.id + ".opacity"
    fadeOut.keyValue = [m.backdropFront.opacity, 0.0]
    if incoming = invalid
        fadeIn.fieldToInterp = BackdropBack().id + ".opacity"
        fadeIn.keyValue = [BackdropBack().opacity, 0.0]
    else
        fadeIn.fieldToInterp = incoming.id + ".opacity"
        fadeIn.keyValue = [incoming.opacity, 0.85]
        m.backdropFront = incoming
    end if
    m.backdropFade.control = "start"
end sub

sub heroArtStatus()
    art = m.top.findNode("heroArt")
    art.visible = art.loadStatus = "ready"
    if art.loadStatus = "failed" and m.heroItem <> invalid
        print "PROtv artwork: featured failed id="; m.heroItem.id; " (URL omitted)"
    end if
end sub

sub statusChanged()
    m.top.findNode("statusPanel").visible = m.status.text <> ""
end sub

' Confirmations fade away on their own; errors stay until the next action.
sub showNotice(message as String)
    m.status.text = message
    m.statusTimer.control = "stop"
    m.statusTimer.control = "start"
    m.noticeText = message
end sub

sub statusTimerFired()
    if m.status.text = Text(m.noticeText) then m.status.text = ""
end sub

' Highlights the current destination, independent of remote focus.
sub updateNavState()
    activeView = m.view
    if m.mode = "account" then activeView = "account"
    if m.mode = "search" then activeView = "search"
    for index = 0 to m.nav.getChildCount() - 1
        m.nav.getChild(index).active = m.navViews[index] = activeView
    end for
    if m.account <> invalid
        m.profile.text = Greeting(CurrentLocalHour())
    else
        m.profile.text = "Guest"
    end if
end sub

function CurrentLocalHour() as Integer
    now = CreateObject("roDateTime")
    now.ToLocalTime()
    return now.GetHours()
end function

sub updateListButtons()
    saved = m.heroItem <> invalid and IsFavorite(m.favorites, Text(m.heroItem.id))
    setListButton(m.top.findNode("heroList"), saved)
    if m.selected <> invalid then setListButton(m.top.findNode("detailList"), IsFavorite(m.favorites, Text(m.selected.id)))
end sub

sub setListButton(button as Object, saved as Boolean)
    if saved
        button.text = "In My List"
        button.icon = "check"
    else
        button.text = "My List"
        button.icon = "plus"
    end if
end sub

sub focusRails()
    if m.video.visible then return
    setSidebarExpanded(false)
    setBrowseMode(true)
    m.rails.setFocus(true)
end sub

sub focusHero()
    if m.video.visible then return
    if m.heroItem = invalid
        if m.rows.Count() > 0 then focusRails()
        return
    end if
    setSidebarExpanded(false)
    setBrowseMode(false)
    m.heroButtons.getChild(m.heroIndex).setFocus(true)
end sub

' Browse: rails slide up under a compact title so two full rails fit.
sub setBrowseMode(browsing as Boolean)
    if m.browsing = browsing then return
    m.browsing = browsing
    m.top.findNode("heroTitle").maxLines = 1
    if not browsing then m.top.findNode("heroTitle").maxLines = 2
    targets = {
        railsMove: [[0, 0], [0, -200]],
        heroLayerMove: [[0, 0], [0, -210]],
        heroCopyMove: [[112, 200], [112, 140]],
        fadeMove: [[0, 620], [0, 688]],
    }
    nodes = { railsMove: "railsGroup", heroLayerMove: "heroLayer", heroCopyMove: "heroCopy", fadeMove: "bottomFade" }
    m.browseAnim.control = "stop"
    for each id in targets
        target = targets[id][0]
        if browsing then target = targets[id][1]
        m.top.findNode(id).keyValue = [m.top.findNode(nodes[id]).translation, target]
    end for
    extras = 1.0
    if browsing then extras = 0.0
    m.top.findNode("extrasFade").keyValue = [m.top.findNode("heroExtras").opacity, extras]
    m.browseAnim.control = "start"
end sub

' The sidebar is an icon rail until it has focus, then expands over content.
sub setSidebarExpanded(expanded as Boolean)
    if m.sidebarExpanded = expanded then return
    m.sidebarExpanded = expanded
    for index = 0 to m.nav.getChildCount() - 1
        m.nav.getChild(index).compact = not expanded
    end for
    logo = m.top.findNode("logo")
    width = 88.0
    fadeWidth = 24
    if expanded
        width = 256.0
        fadeWidth = 160
        logo.translation = [28, 26]
        logo.width = 136
        logo.height = 40
    else
        logo.translation = [14, 30]
        logo.width = 64
        logo.height = 19
    end if
    m.top.findNode("sidebarFade").width = fadeWidth
    m.sidebarAnim.control = "stop"
    m.top.findNode("sidebarWidth").keyValue = [m.top.findNode("sidebarBg").width, width]
    m.top.findNode("sidebarFadeMove").keyValue = [m.top.findNode("sidebarFade").translation, [width, 0]]
    m.sidebarAnim.control = "start"
end sub

sub heroPlaySelected()
    if m.heroItem = invalid then return
    showDetail(m.heroItem, "hero")
    startPlayback()
end sub

sub heroInfoSelected()
    if m.heroItem <> invalid then showDetail(m.heroItem, "hero")
end sub

sub heroListSelected()
    if m.heroItem <> invalid then toggleMyList(m.heroItem)
end sub

sub toggleMyList(item as Object)
    if m.account = invalid
        showNotice("Link your PROtv account in Account to save titles to My List.")
        return
    end if
    id = Text(item.id)
    favorite = not IsFavorite(m.favorites, id)
    m.favorites = ToggleFavorite(m.favorites, id, favorite)
    m.pendingFavorite = { videoId: id, favorite: favorite }
    updateListButtons()
    if favorite
        showNotice("Added to My List.")
    else
        showNotice("Removed from My List.")
    end if
    queueAccountAction("favorite-write")
    refreshRows()
end sub

sub titleFocused()
    pair = m.rails.rowItemFocused
    if IsInvitePair(pair)
        showCreatorInvite()
        return
    end if
    if not validPair(pair) then return
    updateRailCount(pair[0])
    if m.rows[pair[0]].kind = "titles" then updateHero(m.rows[pair[0]].items[pair[1]], "rail")
    if m.rows[pair[0]].kind = "series" then showSeriesHero(m.rows[pair[0]].items[pair[1]])
end sub

' The hero describes a focused series; selecting the tile opens it.
sub showSeriesHero(series as Object)
    m.heroItem = invalid
    m.heroSource = "series"
    m.top.findNode("heroEyebrow").text = "PROtv SERIES"
    m.top.findNode("heroTitle").text = series.title
    m.top.findNode("heroMeta").text = SeriesMeta(SeriesSeasons(series.episodes), series.episodes.Count())
    m.top.findNode("heroDescription").text = "Select to see seasons and episodes."
    m.top.findNode("heroArtwork").visible = true
    for each id in ["heroPlay", "heroInfo", "heroList"]
        m.top.findNode(id).visible = false
    end for
    art = m.top.findNode("heroArt")
    art.visible = art.uri = series.artwork and art.loadStatus = "ready"
    art.uri = series.artwork
    renderDots()
    if series.backdrop <> ""
        requestBackdrop(series.backdrop, true)
    else
        requestBackdrop(series.artwork, false)
    end if
end sub

sub showSeries(series as Object)
    m.seriesItem = series
    m.seasons = SeriesSeasons(series.episodes)
    m.seriesEpisodeIndex = 0
    changeMode("series")
    m.top.findNode("seriesTitle").text = series.title
    m.top.findNode("seriesMeta").text = SeriesMeta(m.seasons, series.episodes.Count())
    m.top.findNode("seriesFallback").text = "PROtv" + Chr(10) + Chr(10) + series.title
    m.top.findNode("seriesBackdrop").uri = series.artwork
    art = m.top.findNode("seriesArt")
    art.visible = art.uri = series.artwork and art.loadStatus = "ready"
    art.uri = series.artwork
    showSeriesFallback(not art.visible)
    pills = m.seriesSeasons
    while pills.getChildCount() > 0
        pills.removeChildIndex(0)
    end while
    x = 0
    for each season in m.seasons
        pill = pills.createChild("PillButton")
        pill.text = season.title
        pill.height = 44
        pill.width = Len(season.title) * 11 + 48
        pill.translation = [x, 0]
        x = x + pill.width + 16
    end for
    selectSeason(0, false)
    m.seriesEpisodes.setFocus(true)
end sub

' Back from an episode's details lands on the same episode.
sub returnToSeries()
    changeMode("series")
    ' Rebuild labels so time left reflects what was just watched.
    selectSeason(m.seasonIndex, false)
    m.seriesEpisodes.jumpToItem = m.seriesEpisodeIndex
    m.seriesEpisodes.setFocus(true)
end sub

sub selectSeason(index as Integer, focusPill as Boolean)
    m.seasonIndex = index
    for pillIndex = 0 to m.seriesSeasons.getChildCount() - 1
        pill = m.seriesSeasons.getChild(pillIndex)
        pill.style = "secondary"
        if pillIndex = index then pill.style = "primary"
    end for
    content = CreateObject("roSGNode", "ContentNode")
    for each episode in m.seasons[index].episodes
        row = content.createChild("ContentNode")
        row.title = EpisodeLabel(episode)
        remaining = ""
        if ResumePosition(m.progress, Text(episode.id)) > 0 then remaining = TimeLeft(m.progress[episode.id])
        if remaining <> "" then row.title = row.title + "  " + Chr(183) + "  " + remaining
    end for
    m.seriesEpisodes.content = content
    if focusPill then m.seriesSeasons.getChild(index).setFocus(true)
end sub

sub episodeSelected()
    index = m.seriesEpisodes.itemSelected
    episodes = m.seasons[m.seasonIndex].episodes
    if index < 0 or index >= episodes.Count() then return
    m.seriesEpisodeIndex = index
    showDetail(episodes[index], "series")
end sub

sub seriesArtStatus()
    art = m.top.findNode("seriesArt")
    art.visible = art.loadStatus = "ready"
    showSeriesFallback(not art.visible)
end sub

sub showSeriesFallback(show as Boolean)
    m.top.findNode("seriesFallbackArt").visible = show
    m.top.findNode("seriesFallback").visible = show
end sub

function validPair(pair as Dynamic) as Boolean
    if not IsArray(pair) then return false
    if pair.Count() <> 2 then return false
    if pair[0] < 0 or pair[0] >= m.rows.Count() then return false
    return pair[1] >= 0 and pair[1] < m.rows[pair[0]].items.Count()
end function

' The creator invite sits just past the last creator film.
function IsInvitePair(pair as Dynamic) as Boolean
    if not IsArray(pair) or pair.Count() <> 2 then return false
    if pair[0] < 0 or pair[0] >= m.rows.Count() then return false
    return m.rows[pair[0]].cta and pair[1] = m.rows[pair[0]].items.Count()
end function

sub showCreatorInvite()
    m.heroItem = invalid
    m.heroSource = "invite"
    m.top.findNode("heroEyebrow").text = "PROtv CREATORS"
    m.top.findNode("heroTitle").text = "Your story belongs here"
    m.top.findNode("heroMeta").text = "Submit your film or series at watchprotv.com/creators"
    m.top.findNode("heroDescription").text = "Premiere your work on PROtv across the web, Fire TV and Roku."
    m.top.findNode("heroArtwork").visible = false
    for each id in ["heroPlay", "heroInfo", "heroList"]
        m.top.findNode(id).visible = false
    end for
    renderDots()
    requestBackdrop("", false)
end sub

sub titleSelected()
    pair = m.rails.rowItemSelected
    if IsInvitePair(pair)
        showNotice("On your phone or computer, visit watchprotv.com/creators to submit your film.")
        return
    end if
    if not validPair(pair) then return
    row = m.rows[pair[0]]
    if row.kind = "moods"
        selectMood(row.items[pair[1]].id)
    else if row.kind = "series"
        showSeries(row.items[pair[1]])
    else
        showDetail(row.items[pair[1]], "rails")
    end if
end sub

' PROtv Discover: picking a mood inserts its row right below the tiles;
' picking the same mood again clears it.
sub selectMood(moodId as String)
    if m.mood = moodId
        m.mood = ""
    else
        m.mood = moodId
    end if
    showRows()
    for rowIndex = 0 to m.rows.Count() - 1
        if m.rows[rowIndex].kind = "moods"
            target = [rowIndex, 0]
            if m.mood <> "" and rowIndex + 1 < m.rows.Count() then target = [rowIndex + 1, 0]
            m.rails.jumpToRowItem = target
            updateRailCount(target[0])
            if m.mood <> "" then updateHero(m.rows[target[0]].items[0], "rail")
        end if
    end for
    focusRails()
end sub

sub showDetail(item as Object, origin = "rails" as String)
    m.selected = item
    m.detailOrigin = origin
    changeMode("detail")
    if IsCreatorTitle(item)
        m.top.findNode("detailEyebrow").text = "PROtv CREATOR ORIGINAL"
    else
        m.top.findNode("detailEyebrow").text = "NOW STREAMING ON PROtv"
    end if
    m.top.findNode("detailTitle").text = item.title
    m.top.findNode("detailFallback").text = "PROtv" + Chr(10) + Chr(10) + item.title
    backdrop = m.top.findNode("detailBackdrop")
    if Text(item.backdrop) <> ""
        backdrop.loadWidth = 1280
        backdrop.loadHeight = 560
        backdrop.uri = item.backdrop
    else
        backdrop.loadWidth = 56
        backdrop.loadHeight = 24
        backdrop.uri = item.artwork
    end if
    art = m.top.findNode("detailArt")
    art.visible = art.uri = item.artwork and art.loadStatus = "ready"
    art.uri = item.artwork
    showDetailFallback(not art.visible)
    m.top.findNode("detailMeta").text = TitleMetadata(item)
    updatePlayLabel()
    updateListButtons()
    description = Synopsis(item)
    if description = "" then description = "Synopsis coming soon."
    if Text(item.credits) <> "" then description = description + Chr(10) + Chr(10) + Text(item.credits)
    if RightsLine(item) <> "" then description = description + Chr(10) + Chr(10) + RightsLine(item)
    m.top.findNode("detailDescription").text = description
    m.status.text = ""
    m.detailIndex = 0
    focusDetails()
end sub

sub detailArtStatus()
    art = m.top.findNode("detailArt")
    art.visible = art.loadStatus = "ready"
    showDetailFallback(not art.visible)
    if art.loadStatus = "failed" and m.selected <> invalid
        print "PROtv artwork: detail failed id="; m.selected.id; " (branded fallback; URL omitted)"
    end if
end sub

sub showDetailFallback(show as Boolean)
    m.top.findNode("detailFallbackArt").visible = show
    m.top.findNode("detailFallback").visible = show
end sub

sub changeMode(mode as String)
    m.mode = mode
    m.home.visible = mode = "home" or mode = "search"
    m.detail.visible = mode = "detail"
    m.seriesScreen.visible = mode = "series"
    m.accountScreen.visible = mode = "account"
    m.sidebar.visible = mode <> "detail" and mode <> "series"
    m.topBar.visible = mode <> "detail" and mode <> "series"
    m.status.text = ""
    updateNavState()
end sub

sub navSelected()
    view = m.navViews[m.navIndex]
    if view = "search"
        changeMode("search")
        m.searchDialog = CreateObject("roSGNode", "StandardKeyboardDialog")
        m.searchDialog.title = "Search PROtv - title or genre"
        m.searchDialog.text = m.query
        m.searchDialog.buttons = ["Show results", "Cancel"]
        m.searchDialog.observeField("buttonSelected", "searchSelected")
        m.searchDialog.observeField("wasClosed", "searchClosed")
        m.top.dialog = m.searchDialog
        m.status.text = "Enter a title or genre, then select Show results."
    else if view = "account"
        m.accountFromProfile = false
        openAccount()
    else
        m.view = view
        m.mood = ""
        changeMode("home")
        if not m.loaded
            loadCatalog()
        else
            showRows()
            if m.heroItem <> invalid then focusHero()
            refreshCatalogIfStale()
        end if
    end if
end sub

sub openAccount()
    for index = 0 to m.navViews.Count() - 1
        if m.navViews[index] = "account" then m.navIndex = index
    end for
    changeMode("account")
    showAccountState()
    focusAccount()
end sub

' Top-right Guest / greeting control; Back returns to it.
sub profileSelected()
    if m.mode = "account"
        focusAccount()
        return
    end if
    m.accountFromProfile = true
    openAccount()
end sub

sub focusProfile()
    if m.video.visible then return
    setSidebarExpanded(false)
    if m.mode = "home" then setBrowseMode(false)
    m.profile.setFocus(true)
end sub

sub searchSelected()
    if m.searchDialog.buttonSelected = 0
        m.query = Left(Text(m.searchDialog.text).Trim(), 200)
        m.searchDialog.unobserveField("wasClosed")
        m.searchDialog.close = true
        m.searchDialog = invalid
        m.view = "search"
        if m.query = "" then m.view = "home"
        changeMode("home")
        showRows()
        if m.rows.Count() > 0 then focusRails()
    else
        m.searchDialog.close = true
        returnHome()
    end if
end sub

sub searchClosed()
    m.searchDialog = invalid
    if m.mode = "search" then returnHome()
end sub

sub returnHome()
    cancelPlaybackRequest()
    signalLaunchComplete()
    previous = m.mode
    origin = m.detailOrigin
    if previous = "detail" and origin = "series" and m.seriesItem <> invalid
        returnToSeries()
        return
    end if
    changeMode("home")
    if previous = "account" and m.accountFromProfile
        m.accountFromProfile = false
        focusProfile()
    else if previous = "detail" and origin = "hero" and m.heroItem <> invalid
        focusHero()
    else if (previous = "detail" or previous = "series") and m.rows.Count() > 0
        focusRails()
    else
        focusNav()
    end if
    refreshCatalogIfStale()
end sub

sub detailSelected()
    if m.detailIndex = 0
        startPlayback()
    else if m.detailIndex = 1
        if m.selected <> invalid then toggleMyList(m.selected)
    else
        returnHome()
    end if
end sub

sub cancelPlaybackRequest()
    setBusy("playback", false)
    if m.playTask <> invalid
        m.playTask.unobserveField("result")
        m.playTask.control = "stop"
        m.playTask = invalid
    end if
end sub

sub startPlayback()
    cancelPlaybackRequest()
    m.status.text = "Authorizing playback..."
    setBusy("playback", true)
    m.playTask = m.newTask()
    m.playTask.kind = "playback"
    m.playTask.path = "/v1/catalog/titles/" + m.selected.id.EncodeUriComponent() + "/playback"
    m.playTask.observeField("result", "playbackLoaded")
    m.playTask.control = "run"
end sub

sub playbackLoaded()
    setBusy("playback", false)
    if m.playTask = invalid or m.mode <> "detail" then return
    result = m.playTask.result
    if result.error <> ""
        m.status.text = result.error + " Select Play to retry."
        signalLaunchComplete()
        return
    end if
    playback = PlaybackUrl(result.payload, m.selected)
    if playback.error <> ""
        m.status.text = playback.error
        signalLaunchComplete()
        return
    end if
    content = CreateObject("roSGNode", "ContentNode")
    content.url = playback.url
    content.streamFormat = "hls"
    content.title = m.selected.title
    ' PlayStart is the supported start offset; a seek before play is ignored.
    resumeAt = ResumePosition(m.progress, Text(m.selected.id))
    if resumeAt > 0 then content.PlayStart = resumeAt
    m.video.content = content
    m.lastSavedPosition = resumeAt
    m.status.text = ""
    m.previewBase = PreviewBase(result.payload)
    m.scrubbing = false
    m.playbackActive = true
    m.video.visible = true
    m.video.setFocus(true)
    m.video.control = "play"
    renderPlayerOverlay()
    m.progressTimer.control = "start"
end sub

sub videoState()
    ' Stopping the player changes its state; after exit that must not redraw controls.
    if not m.playbackActive then return
    setBusy("buffer", m.video.state = "buffering")
    renderPlayerOverlay()
    if m.video.state = "playing"
        signalLaunchComplete()
        schedulePlayerHide()
    else if m.video.state = "error"
        code = m.video.errorCode
        m.progressTimer.control = "stop"
        closeVideo()
        m.status.text = "This title stopped playing. Check your connection, then select Play to try again (Roku " + code.ToStr() + ")."
        signalLaunchComplete()
    else if m.video.state = "paused"
        saveCurrentProgress(true)
    else if m.video.state = "finished"
        saveCurrentProgress(true)
        m.progressTimer.control = "stop"
        closeVideo()
        showNotice("Playback finished.")
    end if
end sub

' Remote during playback. The native Video UI is off: it consumes OK without
' pausing, so these keys are handled here and shown on the PROtv overlay.
function playerKey(key as String) as Boolean
    if key = "back"
        closeVideo()
        return true
    else if key = "OK" or key = "play"
        if m.scrubbing
            commitSeek()
        else
            togglePause()
        end if
        return true
    else if key = "left" or key = "right" or key = "rewind" or key = "fastforward"
        stepValue = 10
        if key = "rewind" or key = "fastforward" then stepValue = 30
        if key = "left" or key = "rewind" then stepValue = -stepValue
        scrubBy(stepValue)
        return true
    else if key = "replay"
        scrubBy(-10)
        commitSeek()
        return true
    else if key = "up" or key = "down"
        renderPlayerOverlay()
        schedulePlayerHide()
        return true
    end if
    return false
end function

sub togglePause()
    state = m.video.state
    if state = "paused"
        m.video.control = "resume"
    else if state = "playing" or state = "buffering"
        m.video.control = "pause"
        m.playerHideTimer.control = "stop"
    end if
    m.video.setFocus(true)
    renderPlayerOverlay()
end sub

' Left/Right move a seek target in 10 s steps (Rewind/Fast Forward 30 s);
' the seek happens after a short pause in key presses or on OK.
sub scrubBy(stepValue as Integer)
    duration = NumberOr(m.video.duration, 0)
    ' Unknown length or a clip of 10 s or less: show the controls, do not seek.
    if duration <= 10
        renderPlayerOverlay()
        schedulePlayerHide()
        return
    end if
    if not m.scrubbing
        m.scrubbing = true
        m.scrubTarget = Int(NumberOr(m.video.position, 0))
    end if
    m.scrubTarget = ClampSeek(m.scrubTarget + stepValue, duration)
    m.playerHideTimer.control = "stop"
    m.seekTimer.control = "stop"
    m.seekTimer.control = "start"
    renderPlayerOverlay()
end sub

sub commitSeek()
    if not m.playbackActive or not m.scrubbing then return
    m.scrubbing = false
    m.seekTimer.control = "stop"
    m.video.seek = m.scrubTarget
    renderPlayerOverlay()
    schedulePlayerHide()
end sub

' Controls stay up while paused, loading or seeking; otherwise they fade.
sub schedulePlayerHide()
    m.playerHideTimer.control = "stop"
    if m.video.state = "playing" and not m.scrubbing then m.playerHideTimer.control = "start"
end sub

sub playerHideTimerFired()
    if not m.playbackActive then return
    if m.video.state = "playing" and not m.scrubbing then m.playerOverlay.visible = false
end sub

sub playerPositionChanged()
    if m.playbackActive and m.playerOverlay.visible and not m.scrubbing then renderPlayerOverlay()
end sub

sub renderPlayerOverlay()
    if not m.playbackActive then return
    m.playerOverlay.visible = true
    state = m.video.state
    toggle = m.top.findNode("playerToggle")
    if state = "paused"
        toggle.text = "Resume"
        toggle.icon = "play"
        toggle.style = "primary"
    else if (state = "buffering" or state = "none" or state = "") and not m.scrubbing
        toggle.text = "Loading"
        toggle.icon = ""
        toggle.style = "secondary"
    else
        toggle.text = "Pause"
        toggle.icon = "pause"
        toggle.style = "secondary"
    end if
    position = Int(NumberOr(m.video.position, 0))
    if m.scrubbing then position = m.scrubTarget
    duration = NumberOr(m.video.duration, 0)
    if m.selected <> invalid then m.top.findNode("playerTitle").text = Text(m.selected.title)
    m.top.findNode("playerTime").text = PlayerTimeText(position, duration)
    fill = m.top.findNode("playerFill")
    fill.width = 0
    if duration > 0 then fill.width = Int(1056 * position / duration)
    preview = m.top.findNode("playerPreview")
    preview.visible = m.scrubbing and m.previewBase <> ""
    if preview.visible
        m.top.findNode("playerPreviewArt").uri = m.previewBase + "?time=" + position.ToStr().Trim() + "&width=256"
        previewX = 112 + fill.width - 128
        if previewX < 112 then previewX = 112
        if previewX > 1168 - 256 then previewX = 1168 - 256
        preview.translation = [previewX, 380]
    end if
end sub

sub closeVideo()
    ' Progress is saved first (it needs the live position); the UI goes after.
    saveCurrentProgress(true)
    endPlayback()
    updatePlayLabel()
    ' Rows deferred during playback, and guest progress, update here.
    if m.rowsStale or m.account = invalid then refreshRows()
    focusDetails()
end sub

' The one teardown for every exit (Back, end, error, deep link). Clears
' playback-only UI and state; saved progress is untouched.
sub endPlayback()
    m.playbackActive = false
    setBusy("buffer", false)
    m.scrubbing = false
    m.seekTimer.control = "stop"
    m.playerHideTimer.control = "stop"
    m.progressTimer.control = "stop"
    m.video.control = "stop"
    m.video.visible = false
    m.video.content = invalid
    m.playerOverlay.visible = false
    m.top.findNode("playerPreview").visible = false
    m.top.findNode("playerFill").width = 0
    m.top.findNode("playerTime").text = ""
end sub

sub updatePlayLabel()
    if m.selected <> invalid and ResumePosition(m.progress, Text(m.selected.id)) > 0
        m.top.findNode("detailPlay").text = "Resume"
    else
        m.top.findNode("detailPlay").text = "Play"
    end if
end sub

sub onLaunch()
    m.pendingLaunch = m.top.launchRequest
    if m.loaded then applyLaunch()
end sub

sub applyLaunch()
    result = ResolveLaunch(m.pendingLaunch, m.items)
    m.pendingLaunch = invalid
    if result.error = "" and result.item = invalid then return
    ' A deep link ends any sign-in in progress so no keyboard keeps focus over playback.
    if m.authFlow <> invalid or m.authDialog <> invalid then endAuthFlow()
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
        showDetail(result.item, "rails")
        startPlayback()
    end if
end sub

' Focus zones: sidebar | featured actions above the rails | account actions.
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false
    if m.authDialog <> invalid
        m.authDialog.setFocus(true)
        return true
    end if
    restartRotation()
    if m.video.visible
        return playerKey(key)
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
    if m.mode = "search" then return false
    if m.profile.isInFocusChain()
        if key = "down"
            if m.mode = "account"
                focusAccount()
            else if m.heroItem <> invalid
                focusHero()
            else if m.rows.Count() > 0
                focusRails()
            end if
            return true
        else if key = "left"
            focusNav()
            return true
        end if
        return key = "up" or key = "right"
    end if
    if m.mode = "series"
        ' Seasons row above the episode list; Left/Right changes season.
        if m.seriesSeasons.isInFocusChain()
            if key = "left" or key = "right"
                stepValue = 1
                if key = "left" then stepValue = -1
                selectSeason(NavigationIndex(m.seasonIndex, stepValue, m.seasons.Count()), true)
                return true
            else if key = "down" or key = "OK"
                m.seriesEpisodes.setFocus(true)
                return true
            end if
        else if key = "up" and m.seriesEpisodes.isInFocusChain() and m.seriesSeasons.getChildCount() > 0
            m.seriesSeasons.getChild(m.seasonIndex).setFocus(true)
            return true
        end if
        return false
    end if
    if m.nav.isInFocusChain()
        if key = "up" or key = "down"
            stepValue = 1
            if key = "up" then stepValue = -1
            m.navIndex = NextNavIndex(m.navIndex, stepValue)
            focusNav()
            return true
        else if key = "right"
            if m.mode = "home" and m.heroItem <> invalid
                focusHero()
            else if m.mode = "home" and m.rows.Count() > 0
                focusRails()
            else if m.mode = "account"
                focusAccount()
            end if
            return true
        else if key = "left"
            return true
        end if
        return false
    end if
    if m.heroButtons.isInFocusChain()
        if key = "left" and m.heroIndex = 0
            focusNav()
            return true
        else if key = "left" or key = "right"
            stepValue = 1
            if key = "left" then stepValue = -1
            m.heroIndex = NavigationIndex(m.heroIndex, stepValue, m.heroButtons.getChildCount())
            focusHero()
            return true
        else if key = "down" and m.rows.Count() > 0
            focusRails()
            return true
        else if key = "up"
            focusProfile()
            return true
        end if
        return false
    end if
    if m.mode = "home" and m.rails.isInFocusChain()
        pair = m.rails.rowItemFocused
        if key = "up" and (validPair(pair) or IsInvitePair(pair)) and pair[0] = 0
            if m.heroItem = invalid and m.spotlight.Count() > 0 then updateHero(m.spotlight[m.spotlightIndex], "spotlight")
            if m.heroItem = invalid
                focusProfile()
            else
                focusHero()
            end if
            return true
        else if key = "left" and validPair(pair) and pair[1] = 0
            focusNav()
            return true
        end if
        return false
    end if
    if m.mode = "detail"
        if (key = "left" or key = "right") and m.detailButtons.isInFocusChain()
            stepValue = 1
            if key = "left" then stepValue = -1
            m.detailIndex = NavigationIndex(m.detailIndex, stepValue, m.detailButtons.getChildCount())
            focusDetails()
            return true
        else if key = "up" and m.detailButtons.isInFocusChain()
            m.top.findNode("synopsisFocus").visible = true
            m.top.findNode("detailDescription").setFocus(true)
            return true
        else if key = "OK" and m.top.findNode("detailDescription").isInFocusChain()
            focusDetails()
            return true
        end if
    else if m.mode = "account" and m.accountButtons.isInFocusChain() and key = "up"
        focusProfile()
        return true
    else if m.mode = "account" and m.accountButtons.isInFocusChain() and (key = "left" or key = "right")
        visibleButtons = []
        currentIndex = 0
        for each button in accountButtonList()
            if button.visible
                if button.isInFocusChain() then currentIndex = visibleButtons.Count()
                visibleButtons.Push(button)
            end if
        end for
        if key = "left" and currentIndex = 0
            focusNav()
            return true
        end if
        stepValue = 1
        if key = "left" then stepValue = -1
        visibleButtons[NavigationIndex(currentIndex, stepValue, visibleButtons.Count())].setFocus(true)
        return true
    end if
    return false
end function

function accountButtonList() as Object
    return [m.top.findNode("accountAction"), m.top.findNode("accountCreate"), m.top.findNode("accountReset"), m.top.findNode("accountSignOut"), m.top.findNode("accountBack")]
end function

' Lays visible account actions out left to right with a 20px gap.
sub layoutAccountButtons()
    x = 0
    for each button in accountButtonList()
        if button.visible
            button.translation = [x, 0]
            x = x + button.width + 20
        end if
    end for
end sub

' Account work runs one request at a time; later actions wait their turn.
sub queueAccountAction(action as String)
    if not HasViewerSession(m.account) then return
    if m.accountTask = invalid
        beginAccountAction(action)
        return
    end if
    for each queued in m.accountQueue
        if queued = action then return
    end for
    m.accountQueue.Push(action)
end sub

sub drainAccountQueue()
    if m.accountTask <> invalid or m.accountQueue.Count() = 0 then return
    beginAccountAction(m.accountQueue.Shift())
end sub

sub showAccountState()
    action = m.top.findNode("accountAction")
    signedIn = m.account <> invalid
    if signedIn
        m.top.findNode("accountMessage").text = "Signed in. Continue Watching and My List are synchronized with your PROtv account."
        action.text = "Refresh my titles"
        m.top.findNode("accountHint").text = "To delete your PROtv account or its data, email support@watchprotv.com."
    else
        m.top.findNode("accountMessage").text = "Sign in or create a free PROtv account to keep My List and Continue Watching in sync across this TV and watchprotv.com. You can also keep watching as a guest."
        action.text = "Sign in"
        m.top.findNode("accountHint").text = "Use your PROtv email and password. Signed up with Google? Choose Forgot password to set a password for this email."
        if FirebaseApiKey() = "" then m.top.findNode("accountMessage").text = "Sign-in is not configured in this Roku build. Guest browsing and playback remain available."
    end if
    m.top.findNode("accountSignOut").visible = signedIn
    m.top.findNode("accountCreate").visible = not signedIn
    m.top.findNode("accountReset").visible = not signedIn
    layoutAccountButtons()
    updateNavState()
end sub

sub focusAccount()
    if m.video.visible then return
    setSidebarExpanded(false)
    if m.account <> invalid
        m.top.findNode("accountSignOut").setFocus(true)
    else
        m.top.findNode("accountAction").setFocus(true)
    end if
end sub

sub accountActionSelected()
    ' One account request at a time; a repeated press waits for the answer.
    if m.accountTask <> invalid
        showNotice("Contacting PROtv. One moment...")
        return
    end if
    if m.account <> invalid
        m.authRetryAction = ""
        if m.pendingProgressSave <> invalid
            drainPendingProgress()
        else
            beginAccountAction("progress-read")
        end if
    else
        startAuthFlow("signin")
    end if
end sub

sub accountCreateSelected()
    startAuthFlow("signup")
end sub

sub accountResetSelected()
    startAuthFlow("reset")
end sub

sub accountSignOutSelected()
    cancelAccountTask()
    m.progressTimer.control = "stop"
    m.account = invalid
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    forgetAccount()
    clearFavorites()
    m.afterRefreshAction = ""
    m.accountTask = invalid
    m.authRetryAction = ""
    showAccountState()
    refreshRows()
    m.top.findNode("accountMessage").text = "Signed out on this TV. You can continue watching as a guest or sign in to another PROtv account."
    showNotice("Signed out. Guest browsing and playback remain available.")
    focusAccount()
end sub

sub accountBackSelected()
    returnHome()
end sub

' On-device sign-in, sign-up and password recovery (Roku certification 2.2).
' The email comes from Roku's request-for-information screen when the viewer
' shares it, otherwise from the email keyboard. The password is typed on the
' password keyboard and exists only in that one HTTPS request body: it is
' never saved, logged or kept in scene state.
sub startAuthFlow(mode as String)
    if m.accountTask <> invalid or m.authFlow <> invalid
        showNotice("Contacting PROtv. One moment...")
        return
    end if
    if FirebaseApiKey() = "" and mode <> "reset"
        showAccountState()
        return
    end if
    m.authFlow = { mode: mode, email: "" }
    m.authStore = m.newStore()
    if m.authStore = invalid
        showEmailDialog("", "")
        return
    end if
    info = CreateObject("roSGNode", "ContentNode")
    context = "signin"
    if mode = "signup" then context = "signup"
    info.addFields({ context: context })
    m.authStore.requestedUserData = "email"
    m.authStore.requestedUserDataInfo = info
    m.authStore.observeField("userData", "authUserData")
    m.authStore.command = "getUserData"
end sub

' Roku sets userData to the shared fields, or to invalid if the viewer declines.
' The email keyboard opens a moment later: on a TV, Roku returns focus to the
' Sign in button when its request screen finishes closing, which would leave
' a keyboard opened from this callback visible but without remote focus.
sub authUserData()
    store = m.authStore
    m.authStore = invalid
    if store = invalid or m.authFlow = invalid then return
    store.unobserveField("userData")
    m.pendingEmail = ""
    data = store.userData
    if data <> invalid then m.pendingEmail = Text(data.email)
    m.authDialogTimer.control = "stop"
    m.authDialogTimer.control = "start"
end sub

sub authDialogTimerFired()
    if m.authFlow = invalid or m.authDialog <> invalid then return
    showEmailDialog(m.pendingEmail, "")
end sub

sub showEmailDialog(email as String, problem as String)
    message = "Enter the email address for your PROtv account. Press Down to reach Continue."
    if problem <> "" then message = problem
    presentAuthDialog("email", message, email, ["Continue", "Cancel"], "authEmailButton")
end sub

sub authEmailButton()
    dialog = m.authDialog
    if dialog = invalid or m.authFlow = invalid then return
    if dialog.buttonSelected <> 0
        endAuthFlow()
        return
    end if
    email = Text(dialog.text).Trim()
    if not ValidEmail(email)
        showEmailDialog(Text(dialog.text), "Enter a full email address, for example name@example.com.")
        return
    end if
    m.authFlow.email = email
    closeAuthDialog()
    if m.authFlow.mode = "reset"
        submitAuth("")
    else
        showPasswordDialog("")
    end if
end sub

sub showPasswordDialog(problem as String)
    if m.authFlow.mode = "signup"
        message = "Choose a password of at least 6 characters for " + m.authFlow.email + "."
        buttons = ["Create account", "Cancel"]
    else
        message = "Enter the password for " + m.authFlow.email + "."
        buttons = ["Sign in", "Cancel"]
    end if
    if problem <> "" then message = problem
    presentAuthDialog("password", message + " Press Down to reach " + buttons[0] + ".", "", buttons, "authPasswordButton")
end sub

sub authPasswordButton()
    dialog = m.authDialog
    if dialog = invalid or m.authFlow = invalid then return
    if dialog.buttonSelected <> 0
        endAuthFlow()
        return
    end if
    password = Text(dialog.text)
    if password = "" then return
    if m.authFlow.mode = "signup" and Len(password) < 6
        showPasswordDialog("Choose a password of at least 6 characters.")
        return
    end if
    closeAuthDialog()
    submitAuth(password)
end sub

' Exact-case JSON keys (quoted): Roku lowercases unquoted literal keys.
sub submitAuth(password as String)
    flow = m.authFlow
    setBusy("auth", true)
    if flow.mode = "reset"
        m.status.text = "Sending a password reset email..."
        startAccountTask("tv-password-reset", "/auth/tv/password-reset", "POST", FormatJson({ "email": flow.email }), "", "", "", "application/json")
    else if flow.mode = "signup"
        m.status.text = "Creating your PROtv account..."
        startAccountTask("tv-sign-up", "/auth/tv/sign-up", "POST", FormatJson({ "email": flow.email, "password": password }), "", "", "", "application/json")
    else
        m.status.text = "Signing in..."
        startAccountTask("tv-sign-in", "/auth/tv/sign-in", "POST", FormatJson({ "email": flow.email, "password": password }), "", "", "", "application/json")
    end if
end sub

' Builds the keyboard completely, as the search keyboard does, then shows it
' and gives it focus explicitly.
sub presentAuthDialog(keyboard as String, message as String, value as String, buttons as Object, handler as String)
    closeAuthDialog()
    dialog = m.newDialog()
    titles = { signin: "Sign in to PROtv", signup: "Create a free PROtv account", reset: "Reset your PROtv password" }
    dialog.title = titles[m.authFlow.mode]
    dialog.keyboardDomain = keyboard
    dialog.message = [message]
    dialog.text = value
    dialog.buttons = buttons
    if keyboard = "password" and dialog.textEditBox <> invalid then dialog.textEditBox.secureMode = true
    dialog.observeField("buttonSelected", handler)
    dialog.observeField("wasClosed", "authDialogClosed")
    m.authDialog = dialog
    m.top.dialog = dialog
    dialog.setFocus(true)
end sub

sub closeAuthDialog()
    dialog = m.authDialog
    if dialog = invalid then return
    m.authDialog = invalid
    dialog.unobserveField("wasClosed")
    dialog.unobserveField("buttonSelected")
    dialog.close = true
end sub

' Back on a keyboard cancels the whole flow.
sub authDialogClosed()
    m.authDialog = invalid
    if m.authFlow <> invalid then endAuthFlow()
end sub

sub endAuthFlow()
    setBusy("auth", false)
    m.authDialogTimer.control = "stop"
    closeAuthDialog()
    m.authFlow = invalid
    m.status.text = ""
    showAccountState()
    focusAccount()
end sub

' Shared with any TV sign-in: the backend-issued custom token becomes the
' restricted Firebase session used for every account request.
sub exchangeCustomToken(customToken as String)
    ' Quoted keys: Roku lowercases unquoted literal keys in FormatJson, and
    ' Firebase silently ignores "returnsecuretoken" (then no refreshToken).
    customBody = FormatJson({ "token": customToken, "returnSecureToken": true })
    identityUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + FirebaseApiKey()
    startAccountTask("firebase-custom", "", "POST", customBody, "", "", identityUrl, "application/json")
end sub

sub startAccountTask(kind as String, path as String, method as String, body as String, authorization as String, deviceSecret as String, url as String, contentType as String)
    task = m.newTask()
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

' Bound to the request that fired: a late result from a replaced or cancelled
' request is ignored rather than reading the newer request's empty result.
sub accountTaskCompleted(event as Object)
    task = event.getRoSGNode()
    if task = invalid or m.accountTask = invalid then return
    if not task.isSameNode(m.accountTask) then return
    m.accountTask = invalid
    result = task.result
    kind = task.kind
    if not IsMap(result) then result = { error: "PROtv returned an invalid response. Please try again." }
    if result.error <> ""
        handleAccountTaskError(kind, result)
        if kind <> "progress-write" then drainPendingProgress()
        drainAccountQueue()
        syncAuthBusy()
        return
    end if
    if kind = "tv-sign-in" or kind = "tv-sign-up"
        m.authFlow = invalid
        customToken = Text(result.payload.customToken)
        if customToken = ""
            authFlowFailed("PROtv did not return a usable sign-in. Try again.")
        else
            m.authNotice = "Signed in."
            if kind = "tv-sign-up" then m.authNotice = "Account created. Check your email to verify it."
            exchangeCustomToken(customToken)
        end if
    else if kind = "tv-password-reset"
        m.authFlow = invalid
        m.status.text = ""
        showAccountState()
        m.top.findNode("accountMessage").text = "If a PROtv account uses that email, we sent a link to set a new password. Then choose Sign in."
        showNotice("Password reset email requested.")
        focusAccount()
    else if kind = "firebase-custom"
        problem = FirebaseSessionProblem(result.payload)
        if problem <> ""
            authSessionFailed("PROtv could not finish signing in this TV (" + Left(problem, 4) + "). Try again.")
        else
            previousViewerId = ""
            if m.account <> invalid then previousViewerId = Text(m.account.viewerId)
            m.progress = ProgressForViewer(previousViewerId, FirebaseSessionUid(result.payload), m.progress)
            m.account = { viewerId: FirebaseSessionUid(result.payload) }
            m.account.idToken = result.payload.idToken
            m.account.refreshToken = result.payload.refreshToken
            m.account.expiresAtSeconds = CurrentEpochSeconds() + Int(Val(Text(result.payload.expiresIn)))
            m.progressLoaded = false
            storeAccount()
            showAccountState()
            if m.authNotice <> "" then showNotice(m.authNotice)
            m.authNotice = ""
            focusAccount()
            beginAccountAction("progress-read")
        end if
    else if kind = "firebase-refresh"
        if m.account = invalid or not ValidFirebaseRefresh(result.payload, Text(m.account.viewerId))
            authSessionFailed("Firebase could not refresh the same account session. Sign in again.")
        else
            m.account.idToken = result.payload.access_token
            m.account.refreshToken = result.payload.refresh_token
            m.account.expiresAtSeconds = CurrentEpochSeconds() + Int(Val(Text(result.payload.expires_in)))
            storeAccount()
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
            refreshRows()
            queueAccountAction("favorites-read")
            showNotice("Continue Watching synchronized.")
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
            refreshRows()
            showNotice("Watch progress saved.")
        else
            if m.pendingProgressSave = invalid then m.pendingProgressSave = m.savingProgress
            m.savingProgress = invalid
            m.status.text = "PROtv returned an invalid progress confirmation."
        end if
    else if kind = "favorites-read"
        m.favorites = FavoriteIds(result.payload)
        m.favoritesLoaded = true
        m.authRetryAction = ""
        updateListButtons()
        refreshRows()
    else if kind = "favorite-write"
        m.savingFavorite = invalid
        m.authRetryAction = ""
    end if
    drainPendingProgress()
    drainAccountQueue()
    syncAuthBusy()
end sub

sub clearFavorites()
    m.favorites = []
    m.favoritesLoaded = false
    m.pendingFavorite = invalid
    m.savingFavorite = invalid
    m.accountQueue = []
    updateListButtons()
end sub

sub handleAccountTaskError(kind as String, result as Object)
    message = Text(result.error)
    statusCode = 0
    if IsNumber(result.statusCode) then statusCode = result.statusCode
    if kind = "tv-sign-in" or kind = "tv-sign-up" or kind = "tv-password-reset"
        m.authFlow = invalid
        authFlowFailed(TvAuthMessage(statusCode, Text(result.errorCode)))
    else if kind = "firebase-custom"
        detail = "HTTP " + statusCode.ToStr().Trim()
        if Text(result.errorCode) <> "" then detail = detail + " " + Text(result.errorCode)
        authFlowFailed("PROtv could not finish signing in this TV (" + detail + "). Try again.")
    else if kind = "firebase-refresh"
        if statusCode >= 400 and statusCode < 500
            authSessionFailed("Your PROtv session could not be refreshed. Sign in again. " + message)
        else
            ' Offline or a server fault: keep the saved sign-in for a later retry.
            m.afterRefreshAction = ""
            m.authRetryAction = ""
            m.top.findNode("accountMessage").text = "PROtv could not refresh your sign-in. Check the network, then select Refresh my titles."
            m.status.text = message + " Your sign-in is kept on this TV."
        end if
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
    else if kind = "favorites-read" or kind = "favorite-write"
        if kind = "favorite-write" and m.savingFavorite <> invalid and m.pendingFavorite = invalid then m.pendingFavorite = m.savingFavorite
        m.savingFavorite = invalid
        if statusCode = 401 and m.authRetryAction <> kind
            m.authRetryAction = kind
            requestFirebaseRefresh(kind)
        else if statusCode = 401
            authSessionFailed("PROtv rejected the refreshed account session. Sign in again.")
        else if kind = "favorite-write" and m.pendingFavorite <> invalid
            ' Undo the optimistic change so the screen matches the account.
            m.favorites = ToggleFavorite(m.favorites, m.pendingFavorite.videoId, not m.pendingFavorite.favorite)
            m.pendingFavorite = invalid
            updateListButtons()
            refreshRows()
            m.status.text = "My List could not be updated. Check the network and try again."
        else
            m.status.text = "My List could not be loaded. Select Refresh my titles in Account to retry."
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

' A failed sign-in, sign-up or reset leaves the viewer on the Account screen.
sub authFlowFailed(message as String)
    closeAuthDialog()
    m.authDialogTimer.control = "stop"
    m.authFlow = invalid
    m.authNotice = ""
    showAccountState()
    m.top.findNode("accountMessage").text = message
    m.status.text = message
    focusAccount()
end sub

sub authSessionFailed(message as String)
    cancelAccountTask()
    m.account = invalid
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    forgetAccount()
    clearFavorites()
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    showAccountState()
    m.top.findNode("accountMessage").text = message + " Guest browsing and playback remain available."
    refreshRows()
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
            "positionSeconds": m.savingProgress.positionSeconds,
            "durationSeconds": m.savingProgress.durationSeconds,
        })
        path = "/users/me/progress/" + m.savingProgress.videoId.EncodeUriComponent()
        startAccountTask("progress-write", path, "PUT", requestBody, m.account.idToken, "", "", "application/json")
    else if action = "favorites-read"
        startAccountTask("favorites-read", "/users/me/favorites", "GET", "", m.account.idToken, "", "", "")
    else if action = "favorite-write" and m.pendingFavorite <> invalid
        m.savingFavorite = m.pendingFavorite
        m.pendingFavorite = invalid
        path = "/users/me/favorites/" + m.savingFavorite.videoId.EncodeUriComponent()
        startAccountTask("favorite-write", path, "PUT", FormatJson({ "favorite": m.savingFavorite.favorite }), m.account.idToken, "", "", "application/json")
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
    if not m.video.visible or m.selected = invalid then return
    position = m.video.position
    duration = m.video.duration
    if not IsNumber(position) or not IsNumber(duration) or duration <= 0 then return
    positionSeconds = Int(position)
    videoId = Text(m.selected.id)
    if m.account = invalid
        if ProgressSaveDue(positionSeconds, m.lastSavedPosition, force) then saveGuestProgress(videoId, positionSeconds, duration, force)
        return
    end if
    if not HasViewerSession(m.account) then return
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

' Guests keep their 50 most recent titles on this TV only; nothing is sent.
' The registry is written on pause, Back and finish, otherwise once a minute.
sub saveGuestProgress(videoId as String, positionSeconds as Integer, duration as Dynamic, persist as Boolean)
    now = CurrentEpochSeconds()
    m.progress = RecordProgress(m.progress, videoId, LocalProgressEntry(positionSeconds, duration, now), 50)
    m.lastSavedPosition = positionSeconds
    if persist or now - m.guestWrittenAt >= 60
        m.guestWrittenAt = now
        m.storage.write("guestProgress", FormatJson(m.progress))
    end if
end sub

sub drainPendingProgress()
    if m.accountTask <> invalid or not HasViewerSession(m.account) or m.pendingProgressSave = invalid then return
    beginAccountAction("progress-write")
end sub

sub cancelAccountTask()
    setBusy("auth", false)
    if m.accountTask = invalid then return
    m.accountTask.unobserveField("result")
    m.accountTask.control = "stop"
    m.accountTask = invalid
end sub

sub focusNav()
    if m.video.visible then return
    setSidebarExpanded(true)
    setBrowseMode(false)
    m.nav.getChild(m.navIndex).setFocus(true)
end sub

sub focusDetails()
    if m.video.visible then return
    m.top.findNode("synopsisFocus").visible = false
    m.detailButtons.getChild(m.detailIndex).setFocus(true)
end sub
