sub init()
    m.art = m.top.findNode("art")
    m.ring = m.top.findNode("ring")
    m.caption = m.top.findNode("caption")
    m.art.observeField("loadStatus", "artStatus")
end sub

sub render()
    item = m.top.itemContent
    if item = invalid then return
    mood = item.kind = "mood"
    width = 120
    height = 180
    if item.landscape or mood
        width = 176
        height = 99
    end if
    for each id in ["panel", "fallback", "mask", "wash", "tile"]
        m.top.findNode(id).width = width
        m.top.findNode(id).height = height
    end for
    m.ring.width = width + 28
    m.ring.height = height + 28
    m.top.scaleRotateCenter = [width / 2, height / 2]

    cta = item.kind = "cta"
    m.top.findNode("cta").visible = cta
    if cta
        ' Invitation for creators to submit work on the website.
        m.art.visible = false
        m.art.uri = ""
        for each id in ["panel", "wash", "mask", "tile", "moodIcon", "moodLabel", "shade", "progressTrack", "progressFill", "timeLeft", "creatorBadge"]
            m.top.findNode(id).visible = false
        end for
        showFallback(false)
        m.caption.visible = true
        m.caption.width = width
        m.caption.translation = [0, height + 10]
        m.caption.text = "Join PROtv"
        subtitle = m.top.findNode("subtitle")
        subtitle.visible = true
        subtitle.width = width
        subtitle.translation = [0, height + 32]
        subtitle.text = "Submit your film"
        focusChanged()
        return
    end if

    tile = m.top.findNode("tile")
    tile.visible = mood
    m.top.findNode("moodIcon").visible = mood
    m.top.findNode("moodLabel").visible = mood
    if mood
        if item.active
            tile.uri = "pkg:/assets/mood-tile-active.9.png"
        else
            tile.uri = "pkg:/assets/mood-tile.9.png"
        end if
        m.top.findNode("moodIcon").uri = "pkg:/assets/icon-" + item.icon + "-light.png"
        m.top.findNode("moodLabel").text = item.title
        m.art.visible = false
        m.art.uri = ""
        for each id in ["panel", "wash", "mask", "shade", "progressTrack", "progressFill", "timeLeft", "creatorBadge", "caption", "subtitle"]
            m.top.findNode(id).visible = false
        end for
        showFallback(false)
        focusChanged()
        return
    end if

    for each id in ["panel", "mask", "caption", "subtitle"]
        m.top.findNode(id).visible = true
    end for
    m.art.width = width
    m.art.height = height
    m.art.loadWidth = width
    m.art.loadHeight = height
    m.art.visible = m.art.uri = item.HDPosterUrl and m.art.loadStatus = "ready"
    m.art.uri = item.HDPosterUrl
    wash = m.top.findNode("wash")
    wash.visible = item.landscape and item.HDPosterUrl <> ""
    if wash.visible then wash.uri = item.HDPosterUrl
    showFallback(not m.art.visible)
    m.top.findNode("brand").width = width
    m.top.findNode("brand").translation = [0, height * 0.19]
    m.top.findNode("fallbackTitle").width = width - 16
    m.top.findNode("fallbackTitle").translation = [8, height * 0.4]
    m.top.findNode("fallbackTitle").text = item.title
    m.top.findNode("creatorBadge").visible = item.creator
    m.caption.width = width
    m.caption.translation = [0, height + 10]
    m.caption.text = item.title
    subtitle = m.top.findNode("subtitle")
    subtitle.width = width
    subtitle.translation = [0, height + 32]
    subtitle.text = item.subtitle

    track = m.top.findNode("progressTrack")
    fill = m.top.findNode("progressFill")
    timeLeft = m.top.findNode("timeLeft")
    shade = m.top.findNode("shade")
    progress = item.continueWatching
    track.visible = progress
    fill.visible = progress
    shade.visible = progress
    timeLeft.visible = progress and item.timeLeft <> ""
    timeLeft.text = item.timeLeft
    shade.width = width
    shade.translation = [0, height - 36]
    trackWidth = width - 16
    if timeLeft.visible then trackWidth = width - 92
    track.width = trackWidth
    track.translation = [8, height - 12]
    fill.translation = [8, height - 12]
    timeLeft.translation = [width - 78, height - 20]
    fill.width = 0
    percent = item.progressPercent
    if progress and (GetInterface(percent, "ifInt") <> invalid or GetInterface(percent, "ifFloat") <> invalid or GetInterface(percent, "ifDouble") <> invalid)
        if percent < 0 then percent = 0
        if percent > 100 then percent = 100
        fill.width = Int(trackWidth * percent / 100)
    end if
    focusChanged()
end sub

sub artStatus()
    m.art.visible = m.art.loadStatus = "ready"
    item = m.top.itemContent
    if item <> invalid and (item.kind = "mood" or item.kind = "cta") then return
    showFallback(not m.art.visible)
    if m.art.loadStatus = "failed" and item <> invalid
        print "PROtv artwork: rail failed id="; item.id; " (branded fallback; URL omitted)"
    end if
end sub

sub showFallback(show as Boolean)
    for each id in ["fallback", "brand", "fallbackTitle"]
        m.top.findNode(id).visible = show
    end for
end sub

sub focusChanged()
    amount = m.top.focusPercent * m.top.rowFocusPercent
    if not m.top.rowListHasFocus then amount = 0
    m.ring.opacity = amount
    scale = 1 + 0.06 * amount
    m.top.scale = [scale, scale]
    if amount > 0.5
        m.caption.color = "0xFFFFFFFF"
    else
        m.caption.color = "0xC9D1E4FF"
    end if
end sub
