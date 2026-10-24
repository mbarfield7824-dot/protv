sub Main()
    m.passed = 0
    m.failed = 0
    m.top = { focusable: false, pressed: "" }
    init()
    Check(m.top.focusable, "playerKeys can hold focus")
    for each key in ["OK", "play", "left", "right", "rewind", "fastforward", "replay", "up", "down", "back"]
        m.top.pressed = ""
        Check(onKeyEvent(key, true) and m.top.pressed = key, "player key is caught and reported: " + key)
        m.top.pressed = ""
        Check(onKeyEvent(key, false) and m.top.pressed = "", "its release is caught and not reported: " + key)
    end for
    m.top.pressed = ""
    Check(not onKeyEvent("options", true) and not onKeyEvent("options", false) and m.top.pressed = "", "Options passes up to the Video node")
    Check(not onKeyEvent("info", true) and not onKeyEvent("home", true), "other keys pass up")
    print "PROTV_KEYS_PASSED="; m.passed
    print "PROTV_KEYS_FAILED="; m.failed
end sub

sub Check(condition as Boolean, label as String)
    if condition
        m.passed++
    else
        m.failed++
        print "FAIL: "; label
    end if
end sub
