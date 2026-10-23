sub Main()
    m.passed = 0
    m.failed = 0
    m.top = {
        nodes: {},
        dialog: invalid,
        findNode: function(id as String) as Object
            return m.nodes[id]
        end function
    }
    for each id in ["heroPlay", "heroInfo", "heroList", "detailList", "accountBadge", "railCount", "synopsisFocus", "statusPanel", "detailDescription", "accountAction", "accountSignOut", "accountBack"]
        m.top.nodes[id] = FocusNode()
    end for
    for each id in ["logo", "sidebarBg", "sidebarFade", "sidebarWidth", "sidebarFadeMove", "heroTitle", "railsGroup", "heroLayer", "heroCopy", "bottomFade", "heroExtras", "railsMove", "heroLayerMove", "heroCopyMove", "fadeMove", "extrasFade", "heroEyebrow", "heroMeta", "heroDescription", "heroArtwork", "heroDots"]
        m.top.nodes[id] = FocusNode()
        m.top.nodes[id].opacity = 1.0
    end for
    m.top.nodes.sidebarBg.width = 88.0
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
    Check(m.top.nodes.accountBadge.text = "Guest", "guest badge before linking")
    m.mode = "account"
    m.account = { viewerId: "v" }
    updateNavState()
    Check(m.nav.children[9].active, "Account marked active on its page")
    Check(Left(m.top.nodes.accountBadge.text, 5) = "Good ", "signed-in viewers are greeted")

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
    print "PROTV_UI_PASSED="; m.passed
    print "PROTV_UI_FAILED="; m.failed
end sub

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
