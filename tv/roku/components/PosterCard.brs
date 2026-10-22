sub init()
    m.art = m.top.findNode("art")
    m.art.observeField("loadStatus", "artStatus")
end sub

sub render()
    item = m.top.itemContent
    if item = invalid then return
    width = 144
    height = 216
    if item.landscape
        width = 256
        height = 144
    end if
    m.top.findNode("border").width = width + 4
    m.top.findNode("border").height = height + 4
    m.top.findNode("panel").width = width
    m.top.findNode("panel").height = height
    m.art.width = width
    m.art.height = height
    m.art.visible = m.art.uri = item.HDPosterUrl and m.art.loadStatus = "ready"
    m.art.uri = item.HDPosterUrl
    m.top.findNode("brand").width = width
    m.top.findNode("brand").translation = [0, height * 0.25]
    m.top.findNode("fallbackTitle").width = width - 16
    m.top.findNode("fallbackTitle").translation = [8, height * 0.48]
    m.top.findNode("fallbackTitle").text = item.title
    m.top.findNode("caption").width = width
    m.top.findNode("caption").translation = [0, height + 6]
    m.top.findNode("caption").text = item.title
    track = m.top.findNode("progressTrack")
    fill = m.top.findNode("progressFill")
    track.width = width
    fill.width = 0
    track.translation = [0, height]
    fill.translation = [0, height]
    track.visible = item.continueWatching
    fill.visible = track.visible
    percent = item.progressPercent
    if track.visible and (GetInterface(percent, "ifInt") <> invalid or GetInterface(percent, "ifFloat") <> invalid or GetInterface(percent, "ifDouble") <> invalid)
        if percent < 0 then percent = 0
        if percent > 100 then percent = 100
        fill.width = Int(width * percent / 100)
    end if
end sub

sub artStatus()
    m.art.visible = m.art.loadStatus = "ready"
    if m.art.loadStatus = "failed" then print "PROtv: poster load failed; showing branded title panel"
end sub

sub focusChanged()
    color = "0x53657FFF"
    if m.top.focusPercent > 0.5 and m.top.rowFocusPercent > 0.5 then color = "0x4D9BFFFF"
    m.top.findNode("border").color = color
end sub
