sub Main(args as Dynamic)
    port = CreateObject("roMessagePort")
    screen = CreateObject("roSGScreen")
    screen.SetMessagePort(port)
    scene = screen.CreateScene("ProtvScene")
    input = CreateObject("roInput")
    input.SetMessagePort(port)
    screen.Show()
    if args <> invalid then scene.launchRequest = args
    while true
        event = wait(0, port)
        if type(event) = "roSGScreenEvent"
            if event.IsScreenClosed() then return
        else if type(event) = "roInputEvent"
            if event.IsInput() then scene.launchRequest = event.GetInfo()
        end if
    end while
end sub
