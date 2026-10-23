' Focusable rounded button. Styles: "primary", "secondary", "nav"
' (sidebar; compact = icon only) and "ghost" (no background until focused).
' icon names a pkg:/assets/icon-<name>-<light|dim|dark>.png set.
sub init()
    m.background = m.top.findNode("background")
    m.iconArt = m.top.findNode("iconArt")
    m.label = m.top.findNode("label")
    m.top.focusable = true
    m.top.observeField("focusedChild", "refresh")
    layout()
end sub

sub layout()
    width = m.top.width
    height = m.top.height
    ' Compact sidebar items are a 48px icon-only square.
    if m.top.compact then width = 48
    m.background.width = width + 24
    m.background.height = height + 24
    m.label.text = m.top.text
    m.label.height = height
    hasIcon = m.top.icon <> ""
    m.iconArt.visible = hasIcon
    m.label.visible = not m.top.compact
    if m.top.style = "nav"
        m.label.horizAlign = "left"
        m.iconArt.translation = [12, (height - 24) / 2]
        m.label.translation = [48, 0]
        m.label.width = width - 56
    else if hasIcon
        ' Icon and text are centred together as one group.
        m.label.horizAlign = "center"
        m.iconArt.translation = [22, (height - 24) / 2]
        m.label.translation = [34, 0]
        m.label.width = width - 44
    else
        m.label.horizAlign = "center"
        m.label.translation = [0, 0]
        m.label.width = width
    end if
    refresh()
end sub

sub refresh()
    focused = m.top.hasFocus()
    style = m.top.style
    textColor = "0xFFFFFFFF"
    variant = "light"
    uri = ""
    if style = "nav"
        if focused
            uri = "pkg:/assets/nav-focus.9.png"
        else if m.top.active
            uri = "pkg:/assets/nav-active.9.png"
        else
            textColor = "0xAEB8D0FF"
            variant = "dim"
        end if
    else if focused
        uri = "pkg:/assets/btn-focus.9.png"
        textColor = "0x05070BFF"
        variant = "dark"
    else if style = "primary"
        uri = "pkg:/assets/btn-primary.9.png"
    else if style = "ghost"
        uri = ""
    else
        uri = "pkg:/assets/btn-idle.9.png"
    end if
    m.background.uri = uri
    m.background.visible = uri <> ""
    m.label.color = textColor
    if m.top.icon <> "" then m.iconArt.uri = "pkg:/assets/icon-" + m.top.icon + "-" + variant + ".png"
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if press and key = "OK"
        m.top.buttonSelected = true
        return true
    end if
    return false
end function
