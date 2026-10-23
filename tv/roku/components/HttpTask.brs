sub init()
    m.top.functionName = "fetch"
end sub

' TEMPORARY: on the real ID token, compares the shipped decoder with Roku's
' native base64 (unavailable in the emulator). Lengths and shapes only.
sub DiagnoseIdToken(token as String)
    parts = token.Split(".")
    print "PROtv AUTH token: length "; Len(token); ", segments "; parts.Count()
    if parts.Count() < 2 then return
    segment = parts[1]
    standard = segment.Replace("-", "+").Replace("_", "/")
    while Len(standard) MOD 4 <> 0
        standard = standard + "="
    end while
    bytes = CreateObject("roByteArray")
    bytes.FromBase64String(standard)
    native = bytes.ToAsciiString()
    shipped = Base64UrlDecode(segment)
    print "PROtv AUTH token: claims segment "; Len(segment); " chars, native "; bytes.Count(); " bytes, shipped "; Len(shipped); " chars, identical "; native = shipped
    print "PROtv AUTH token: native claims "; DiagnosticShape(ParseJson(native)); ", shipped claims "; DiagnosticShape(ParseJson(shipped))
    print "PROtv AUTH token: check "; IdTokenProblem(token)
end sub

sub fetch()
    transfer = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    transfer.SetMessagePort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    requestUrl = m.top.url
    if requestUrl = "" then requestUrl = ApiBase() + m.top.path
    transfer.SetUrl(requestUrl)
    transfer.AddHeader("Accept", "application/json")
    if m.top.authorization <> "" then transfer.AddHeader("Authorization", "Bearer " + m.top.authorization)
    if m.top.deviceSecret <> "" then transfer.AddHeader("X-Device-Secret", m.top.deviceSecret)
    transfer.RetainBodyOnError(true)
    method = UCase(m.top.method)
    if method = "" then method = "GET"
    started = false
    if method = "GET"
        started = transfer.AsyncGetToString()
    else
        transfer.SetRequest(method)
        if m.top.contentType <> "" then transfer.AddHeader("Content-Type", m.top.contentType)
        started = transfer.AsyncPostFromString(m.top.body)
    end if
    if not started
        m.top.result = { error: "Could not start the request. Check your connection." }
        return
    end if
    event = wait(15000, port)
    if event = invalid
        transfer.AsyncCancel()
        m.top.result = { error: "PROtv request timed out. Please try again." }
        return
    end if
    code = event.GetResponseCode()
    body = event.GetString()
    ' TEMPORARY diagnostics for sign-in: status, body size and shape only.
    if m.top.kind <> "catalog" and m.top.kind <> "playback"
        print "PROtv AUTH http "; m.top.kind; ": HTTP "; code; ", "; Len(body); " bytes, failure: "; event.GetFailureReason()
    end if
    if code < 200 or code >= 300
        ' Firebase errors carry a code such as INVALID_CUSTOM_TOKEN; it holds no secret.
        errorCode = ""
        failure = ParseJson(body)
        if IsMap(failure) and IsMap(failure.error) then errorCode = Text(failure.error.message)
        if errorCode <> "" then print "PROtv AUTH http "; m.top.kind; ": error code "; errorCode
        m.top.result = { error: "PROtv request failed (HTTP " + code.ToStr() + "). Please try again.", statusCode: code, errorCode: errorCode }
        return
    end if
    payload = ParseJson(body)
    if not IsMap(payload) and not IsArray(payload)
        print "PROtv AUTH http "; m.top.kind; ": body is not JSON"
        m.top.result = { error: "PROtv returned an invalid response.", statusCode: code }
        return
    end if
    if m.top.kind = "firebase-custom" and IsMap(payload) then DiagnoseIdToken(Text(payload.idToken))
    if m.top.kind = "catalog"
        normalized = NormalizeCatalog(payload)
        if normalized.error <> ""
            m.top.result = normalized
            return
        end if
        for each item in normalized.items
            if item.artwork = ""
                if HeldArtwork(Text(item.id))
                    print "PROtv artwork: intentional hold id="; item.id
                else
                    print "PROtv artwork: no supported source id="; item.id; " (requires HTTPS, service-relative path or embedded JPEG)"
                end if
            else if Left(item.artwork, 23) = "data:image/jpeg;base64,"
                bytes = CreateObject("roByteArray")
                bytes.FromBase64String(Mid(item.artwork, 24))
                digest = CreateObject("roEVPDigest")
                digest.Setup("sha256")
                filename = "tmp:/art-" + digest.Process(bytes) + ".jpg"
                if bytes.Count() > 1048576 or not bytes.WriteFile(filename)
                    print "PROtv: embedded artwork could not be cached for "; item.id
                    item.artwork = ""
                else
                    item.artwork = filename
                end if
            end if
        end for
        m.top.result = normalized
        return
    end if
    m.top.result = { error: "", payload: payload, statusCode: code }
end sub
