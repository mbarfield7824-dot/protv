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
    m.deviceSession = invalid
    m.accountTask = invalid
    m.afterRefreshAction = ""
    m.authRetryAction = ""
    m.pollDelaySeconds = 5
    m.exchangeRetryCount = 0
    m.pendingProgressSave = invalid
    m.savingProgress = invalid
    m.lastSavedPosition = 0
    m.browsing = false
    m.sidebarExpanded = false
    ' Sidebar order; parallel to the children of the nav group.
    m.navViews = ["home", "search", "creators", "movies", "series", "blackcinema", "aicinema", "mylist", "continue", "account"]
    for each id in ["nav", "sidebar", "topBar", "home", "rails", "heroButtons", "heroDots", "detail", "detailButtons", "account", "accountButtons", "video", "status", "accountPollTimer", "progressTimer", "statusTimer", "rotateTimer", "backdropTimer", "backdropFade", "browseAnim", "sidebarAnim"]
        m[id] = m.top.findNode(id)
    end for
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
    m.top.findNode("accountSignOut").observeField("buttonSelected", "accountSignOutSelected")
    m.top.findNode("accountBack").observeField("buttonSelected", "accountBackSelected")
    m.video.observeField("state", "videoState")
    m.status.observeField("text", "statusChanged")
    m.statusTimer.observeField("fire", "statusTimerFired")
    m.rotateTimer.observeField("fire", "rotateTimerFired")
    m.backdropTimer.observeField("fire", "backdropTimerFired")
    for each id in ["backdropA", "backdropB"]
        m.top.findNode(id).observeField("loadStatus", "backdropLoaded")
    end for
    m.backdropFront = m.top.findNode("backdropA")
    m.top.findNode("heroArt").observeField("loadStatus", "heroArtStatus")
    m.top.findNode("detailArt").observeField("loadStatus", "detailArtStatus")
    m.accountPollTimer.observeField("fire", "activationPollTimerFired")
    m.progressTimer.observeField("fire", "progressTimerFired")
    showAccountState()
    layoutNav()
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
        showHeroMessage("PROtv is unavailable", result.error + " Select Home to retry.")
        m.status.text = result.error + " Select Home to retry."
        return
    end if
    m.items = result.items
    firstLoad = not m.loaded
    m.loaded = true
    layoutNav()
    showRows()
    if m.pendingLaunch <> invalid
        applyLaunch()
    else if firstLoad and m.mode = "home" and m.navIndex = 0 and m.nav.isInFocusChain() and m.heroItem <> invalid
        ' Land on the featured title, not on the menu.
        focusHero()
    end if
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

function PersonalRow(kind as String) as Dynamic
    if m.account = invalid then return invalid
    if kind = "continue" and m.progressLoaded
        items = ContinueWatchingItems(m.items, m.progress)
        if items.Count() > 0 then return { title: "Continue Watching", items: items, landscape: true, kind: "titles", progress: true }
    else if kind = "mylist" and m.favoritesLoaded
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
            else
                child.HDPosterUrl = item.artwork
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
        if m.spotlight.Count() > 0 then updateHero(m.spotlight[0], "spotlight")
        updateRailCount(0)
    end if
    restartRotation()
end sub

' Rebuilds rows after account data changes without losing the viewer's place.
sub refreshRows()
    if not m.loaded then return
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
    else if (m.view = "mylist" or m.view = "continue") and m.account = invalid
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
    badge = m.top.findNode("accountBadge")
    if m.account <> invalid
        badge.text = Greeting(CurrentLocalHour())
    else
        badge.text = "Guest"
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
    setSidebarExpanded(false)
    setBrowseMode(true)
    m.rails.setFocus(true)
end sub

sub focusHero()
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
    if ResumePosition(m.progress, Text(item.id)) > 0
        m.top.findNode("detailPlay").text = "Resume"
    else
        m.top.findNode("detailPlay").text = "Play"
    end if
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
    m.account.visible = mode = "account"
    m.sidebar.visible = mode <> "detail"
    m.topBar.visible = mode <> "detail"
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
        changeMode("account")
        showAccountState()
        focusAccount()
    else
        m.view = view
        m.mood = ""
        changeMode("home")
        if not m.loaded
            loadCatalog()
        else
            showRows()
            if m.heroItem <> invalid then focusHero()
        end if
    end if
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
    previous = m.mode
    origin = m.detailOrigin
    changeMode("home")
    if previous = "detail" and origin = "hero" and m.heroItem <> invalid
        focusHero()
    else if previous = "detail" and m.rows.Count() > 0
        focusRails()
    else
        focusNav()
    end if
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
    m.status.text = ""
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
        showNotice("Playback finished.")
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
        showDetail(result.item, "rails")
        startPlayback()
    end if
end sub

' Focus zones: sidebar | featured actions above the rails | account actions.
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false
    restartRotation()
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
    if m.mode = "search" then return false
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
            return true
        end if
        return false
    end if
    if m.mode = "home" and m.rails.isInFocusChain()
        pair = m.rails.rowItemFocused
        if key = "up" and (validPair(pair) or IsInvitePair(pair)) and pair[0] = 0
            if m.heroItem = invalid and m.spotlight.Count() > 0 then updateHero(m.spotlight[m.spotlightIndex], "spotlight")
            if m.heroItem = invalid then return false
            focusHero()
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
    return [m.top.findNode("accountAction"), m.top.findNode("accountSignOut"), m.top.findNode("accountBack")]
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
    code = m.top.findNode("accountCode")
    url = m.top.findNode("accountUrl")
    expiry = m.top.findNode("accountExpiry")
    action = m.top.findNode("accountAction")
    signOut = m.top.findNode("accountSignOut")
    code.text = ""
    url.text = ""
    expiry.text = ""
    if m.account <> invalid
        m.top.findNode("accountMessage").text = "Signed in. Continue Watching and My List are synchronized with your PROtv account."
        action.text = "Refresh my titles"
        signOut.visible = true
    else
        m.top.findNode("accountMessage").text = "Link your PROtv account on another device to synchronize Continue Watching and My List. Guest browsing and playback remain available."
        action.text = "Link PROtv account"
        signOut.visible = false
    end if
    if m.deviceSession <> invalid
        action.text = "Check approval now"
        code.text = m.deviceSession.userCode
        url.text = m.deviceSession.verificationUrl
        expiry.text = "This code expires in about " + Int((m.deviceSession.expiresAtSeconds - CurrentEpochSeconds() + 59) / 60).ToStr().Trim() + " minute(s). Approve it using your signed-in PROtv website."
    else if FirebaseApiKey() = "" and m.account = invalid
        m.top.findNode("accountMessage").text = "Account linking needs the existing Firebase public web API key in this Roku build. Guest browsing and playback remain available."
    end if
    m.top.findNode("accountCodePanel").visible = m.deviceSession <> invalid
    m.top.findNode("accountSteps").visible = m.deviceSession <> invalid
    layoutAccountButtons()
    updateNavState()
end sub

sub focusAccount()
    setSidebarExpanded(false)
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
    clearFavorites()
    m.afterRefreshAction = ""
    m.accountTask = invalid
    m.authRetryAction = ""
    showAccountState()
    refreshRows()
    m.top.findNode("accountMessage").text = "Signed out on this TV. You can continue watching as a guest or link another PROtv account."
    showNotice("Signed out. Guest browsing and playback remain available.")
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
        drainAccountQueue()
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
            positionSeconds: m.savingProgress.positionSeconds,
            durationSeconds: m.savingProgress.durationSeconds,
        })
        path = "/users/me/progress/" + m.savingProgress.videoId.EncodeUriComponent()
        startAccountTask("progress-write", path, "PUT", requestBody, m.account.idToken, "", "", "application/json")
    else if action = "favorites-read"
        startAccountTask("favorites-read", "/users/me/favorites", "GET", "", m.account.idToken, "", "", "")
    else if action = "favorite-write" and m.pendingFavorite <> invalid
        m.savingFavorite = m.pendingFavorite
        m.pendingFavorite = invalid
        path = "/users/me/favorites/" + m.savingFavorite.videoId.EncodeUriComponent()
        startAccountTask("favorite-write", path, "PUT", FormatJson({ favorite: m.savingFavorite.favorite }), m.account.idToken, "", "", "application/json")
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
    setSidebarExpanded(true)
    setBrowseMode(false)
    m.nav.getChild(m.navIndex).setFocus(true)
end sub

sub focusDetails()
    m.top.findNode("synopsisFocus").visible = false
    m.detailButtons.getChild(m.detailIndex).setFocus(true)
end sub
