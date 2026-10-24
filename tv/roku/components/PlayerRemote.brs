sub init()
    m.top.focusable = true
end sub

' Returning false hands the key on to the Video node, then the scene.
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not IsPlayerKey(key) then return false
    if press then m.top.pressed = key
    return true
end function
