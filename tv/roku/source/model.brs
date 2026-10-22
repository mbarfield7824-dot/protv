function Text(value as Dynamic) as String
    if GetInterface(value, "ifString") <> invalid then return value
    return ""
end function

function IsMap(value as Dynamic) as Boolean
    return GetInterface(value, "ifAssociativeArray") <> invalid
end function

function IsArray(value as Dynamic) as Boolean
    return GetInterface(value, "ifArray") <> invalid
end function

function ExactStringEquals(left as String, right as String) as Boolean
    if Len(left) <> Len(right) then return false
    for index = 1 to Len(left)
        if Asc(Mid(left, index, 1)) <> Asc(Mid(right, index, 1)) then return false
    end for
    return true
end function

function ApiBase() as String
    return "https://watchprotv.com/api"
end function

function HeldArtwork(id as String) as Boolean
    return ExactStringEquals(id, "MZ6Q6DI2S62pP8laH9Ku") or ExactStringEquals(id, "XMj306OZSbomES2Zz0Fz")
end function

function NavigationIndex(current as Integer, stepValue as Integer, count as Integer) as Integer
    nextIndex = current + stepValue
    if nextIndex < 0 then return 0
    if nextIndex >= count then return count - 1
    return nextIndex
end function

function TitleMetadata(item as Object) as String
    parts = []
    year = Text(item.year)
    if GetInterface(item.year, "ifInt") <> invalid then year = item.year.ToStr().Trim()
    runtime = Text(item.runtime)
    if runtime = ""
        if GetInterface(item.duration, "ifInt") <> invalid or GetInterface(item.duration, "ifFloat") <> invalid or GetInterface(item.duration, "ifDouble") <> invalid
            if item.duration >= 60 then runtime = Int(item.duration / 60).ToStr().Trim() + " min"
        end if
    end if
    for each value in [year, runtime, Text(item.category), Text(item.maturityRating)]
        if value <> "" then parts.Push(value)
    end for
    return parts.Join("  |  ")
end function

function ArtworkSource(item as Object) as String
    if HeldArtwork(Text(item.id)) then return ""
    if Text(item.contentType) = "EPISODE"
        fields = ["heroImageUrl", "thumbnailUrl", "posterUrl"]
    else
        fields = ["posterUrl", "thumbnailUrl"]
    end if
    for each field in fields
        url = Text(item[field])
        if Left(url, 8) = "https://" then return url
        if Left(url, 9) = "/posters/" then return ApiBase() + url
        if Left(url, 23) = "data:image/jpeg;base64," then return url
    end for
    return ""
end function

function NormalizeCatalog(payload as Dynamic) as Object
    result = { items: [], error: "" }
    if not IsMap(payload)
        result.error = "Invalid catalog response."
        return result
    end if
    if not IsArray(payload.items)
        result.error = "Catalog items are missing."
        return result
    end if
    seen = CreateObject("roAssociativeArray")
    seen.SetModeCaseSensitive()
    for each item in payload.items
        if not IsMap(item)
            result.error = "Invalid catalog title."
            return result
        end if
        id = Text(item.id)
        if id = "" or Text(item.title) = "" or seen.DoesExist(id)
            result.error = "Catalog has missing or duplicate title identifiers."
            return result
        end if
        seen[id] = true
        kind = Text(item.contentType)
        if kind = "MOVIE" or kind = "EPISODE"
            item.artwork = ArtworkSource(item)
            result.items.Push(item)
        end if
    end for
    return result
end function

function MatchesSearch(item as Object, query as String) as Boolean
    haystack = LCase(Text(item.title) + " " + Text(item.category) + " " + Text(item.subgenre))
    if IsArray(item.genres)
        for each genre in item.genres
            haystack = haystack + " " + LCase(Text(genre))
        end for
    end if
    for each term in LCase(query.Trim()).Split(" ")
        if Instr(1, haystack, term) = 0 then return false
    end for
    return true
end function

function HasGenre(item as Object, genre as String) as Boolean
    labels = [Text(item.category), Text(item.subgenre)]
    if IsArray(item.genres)
        for each label in item.genres
            labels.Push(Text(label))
        end for
    end if
    for each label in labels
        if LCase(label.Trim()) = LCase(genre) then return true
    end for
    return false
end function

function HomeRows(items as Object, query = "" as String) as Object
    rows = []
    if query <> ""
        for each kind in ["MOVIE", "EPISODE"]
            found = []
            for each item in items
                if item.contentType = kind and MatchesSearch(item, query) then found.Push(item)
            end for
            if found.Count() > 0 then rows.Push({ title: "Search - " + LCase(kind) + "s", items: found, landscape: kind = "EPISODE" })
        end for
        return rows
    end if
    featured = []
    ' Editorial selections, not an invented API featured flag or release-date ranking.
    for each id in ["sCWQqVE5WIoNNN5wAGQ2", "biitnhJJnBvHGFx8TJZC", "LiMNMZWXBxJj3LoP73kU", "gbcxmtl6mAHQeBxx8Dgs"]
        for each item in items
            if ExactStringEquals(Text(item.id), id) and item.contentType = "MOVIE" then featured.Push(item)
        end for
    end for
    if featured.Count() > 0 then rows.Push({ title: "Featured on PROtv", items: featured, landscape: false })
    black = []
    movies = []
    episodes = []
    categories = {}
    for each item in items
        if item.contentType = "EPISODE"
            episodes.Push(item)
        else
            movies.Push(item)
            if HasGenre(item, "Black Cinema") then black.Push(item)
            category = Text(item.category).Trim()
            if category <> "" and LCase(category) <> "black cinema"
                key = LCase(category)
                if not categories.DoesExist(key) then categories[key] = { title: category, items: [], landscape: false }
                categories[key].items.Push(item)
            end if
        end if
    end for
    if black.Count() > 0 then rows.Push({ title: "Black Cinema", items: black, landscape: false })
    if movies.Count() > 0 then rows.Push({ title: "All Movies", items: movies, landscape: false })
    for each key in categories
        rows.Push(categories[key])
    end for
    if episodes.Count() > 0 then rows.Push({ title: "Series & Episodes", items: episodes, landscape: true })
    return rows
end function

function DeviceSessionDetails(payload as Dynamic, nowSeconds as Integer) as Object
    result = { valid: false, error: "The device sign-in response was invalid." }
    if not IsMap(payload) then return result
    sessionId = Text(payload.sessionId)
    deviceSecret = Text(payload.deviceSecret)
    userCode = Text(payload.userCode)
    verificationUrl = Text(payload.verificationUrl)
    interval = payload.interval
    expiresAt = Text(payload.expiresAt)
    if not CreateObject("roRegex", "^[A-Za-z0-9_-]{43}$", "").IsMatch(sessionId) then return result
    if not CreateObject("roRegex", "^[A-Za-z0-9_-]{43}$", "").IsMatch(deviceSecret) then return result
    if not CreateObject("roRegex", "^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$", "").IsMatch(userCode) then return result
    if not CreateObject("roRegex", "^https://([A-Za-z0-9-]+\.)*[A-Za-z0-9-]+(:[0-9]+)?(/[A-Za-z0-9._~-]*)*/?$", "").IsMatch(verificationUrl) then return result
    if not CreateObject("roRegex", "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$", "").IsMatch(expiresAt) then return result
    if GetInterface(interval, "ifInt") = invalid or interval < 1 or interval > 60 then return result
    expiry = CreateObject("roDateTime")
    expiry.FromISO8601String(expiresAt)
    expiresAtSeconds = expiry.AsSeconds()
    if expiresAtSeconds <= nowSeconds then
        result.error = "This device sign-in code has expired. Start again."
        return result
    end if
    result.valid = true
    result.error = ""
    result.session = {
        sessionId: sessionId,
        deviceSecret: deviceSecret,
        userCode: userCode,
        verificationUrl: verificationUrl,
        expiresAtSeconds: expiresAtSeconds,
        intervalSeconds: interval,
    }
    return result
end function

function ValidFirebaseSession(payload as Dynamic) as Boolean
    if not IsMap(payload) then return false
    if Text(payload.localId) = "" or Text(payload.idToken) = "" or Text(payload.refreshToken) = "" then return false
    return PositiveInteger(payload.expiresIn)
end function

function ValidFirebaseRefresh(payload as Dynamic, viewerId as String) as Boolean
    if not IsMap(payload) or viewerId = "" then return false
    if not ExactStringEquals(Text(payload.user_id), viewerId) or Text(payload.access_token) = "" or Text(payload.refresh_token) = "" then return false
    return PositiveInteger(payload.expires_in)
end function

function PositiveInteger(value as Dynamic) as Boolean
    if IsNumber(value) then return value > 0
    if not CreateObject("roRegex", "^[0-9]{1,6}$", "").IsMatch(Text(value)) then return false
    return Val(Text(value)) > 0
end function

function IsNumber(value as Dynamic) as Boolean
    return GetInterface(value, "ifInt") <> invalid or GetInterface(value, "ifFloat") <> invalid or GetInterface(value, "ifDouble") <> invalid
end function

function ValidProgressEntry(entry as Dynamic) as Boolean
    if not IsMap(entry) then return false
    if not IsNumber(entry.positionSeconds) or not IsNumber(entry.durationSeconds) or not IsNumber(entry.progressPercent) then return false
    if entry.positionSeconds < 0 or entry.durationSeconds <= 0 or entry.progressPercent < 0 or entry.progressPercent > 100 then return false
    if not entry.DoesExist("updatedAt") or not IsNumber(entry.updatedAt) or entry.updatedAt < 0 then return false
    return true
end function

function ContinueWatchingItems(items as Object, progress as Dynamic) as Object
    result = []
    if not IsMap(progress) then return result
    progress.SetModeCaseSensitive()
    for each item in items
        id = Text(item.id)
        if id <> "" and progress.DoesExist(id)
            entry = progress[id]
            if ValidProgressEntry(entry) and entry.positionSeconds > 0 and entry.progressPercent < 95 and entry.positionSeconds < entry.durationSeconds
                result.Push(item)
            end if
        end if
    end for
    if result.Count() > 1
        for first = 0 to result.Count() - 2
            for second = first + 1 to result.Count() - 1
                firstTime = ProgressUpdatedAt(progress, Text(result[first].id))
                secondTime = ProgressUpdatedAt(progress, Text(result[second].id))
                if secondTime > firstTime
                    item = result[first]
                    result[first] = result[second]
                    result[second] = item
                end if
            end for
        end for
    end if
    return result
end function

function ProgressUpdatedAt(progress as Object, videoId as String) as Dynamic
    if not progress.DoesExist(videoId) then return 0.0
    entry = progress[videoId]
    if not IsMap(entry) or not IsNumber(entry.updatedAt) then return 0.0
    return entry.updatedAt
end function

function ResumePosition(progress as Dynamic, videoId as String) as Integer
    if not IsMap(progress) or videoId = "" or not progress.DoesExist(videoId) then return 0
    entry = progress[videoId]
    if not ValidProgressEntry(entry) or entry.progressPercent >= 95 then return 0
    if entry.positionSeconds >= entry.durationSeconds then return 0
    return Int(entry.positionSeconds)
end function

function NeedsFirebaseRefresh(account as Dynamic, nowSeconds as Integer) as Boolean
    if not IsMap(account) then return false
    if not IsNumber(account.expiresAtSeconds) then return true
    return account.expiresAtSeconds <= nowSeconds + 60
end function

function ProgressForViewer(currentViewerId as String, nextViewerId as String, progress as Dynamic) as Object
    if currentViewerId <> "" and ExactStringEquals(currentViewerId, nextViewerId) and IsMap(progress) then return progress
    return {}
end function

function HasViewerSession(account as Dynamic) as Boolean
    if not IsMap(account) then return false
    return Text(account.viewerId) <> "" and Text(account.idToken) <> "" and Text(account.refreshToken) <> ""
end function

function DeviceActivationState(status as String, nowSeconds as Integer, expiresAtSeconds as Integer) as String
    if nowSeconds >= expiresAtSeconds then return "expired"
    if status = "pending" or status = "approved" or status = "expired" or status = "consumed" or status = "rejected"
        return status
    end if
    return "invalid"
end function

function ActivationPollFailure(statusCode as Integer, nowSeconds as Integer, expiresAtSeconds as Integer) as String
    if nowSeconds >= expiresAtSeconds or statusCode = 404 or statusCode = 410 then return "expired"
    if statusCode = 429 then return "rate-limited"
    return "retry"
end function

function NextPollDelay(currentDelay as Integer, baseInterval as Integer) as Integer
    delay = currentDelay
    if delay < baseInterval then delay = baseInterval
    delay = delay * 2
    if delay > 60 then delay = 60
    return delay
end function

function ProgressSaveDue(positionSeconds as Integer, lastSavedSeconds as Integer, force as Boolean) as Boolean
    if positionSeconds <= 0 then return false
    if positionSeconds = lastSavedSeconds then return false
    if force then return true
    return positionSeconds - lastSavedSeconds >= 20
end function

function CurrentEpochSeconds() as Integer
    clock = CreateObject("roDateTime")
    return clock.AsSeconds()
end function

function PlaybackUrl(payload as Dynamic, item as Object) as Object
    result = { url: "", error: "" }
    if not IsMap(payload)
        result.error = "Invalid playback response."
        return result
    end if
    if not ExactStringEquals(Text(payload.id), Text(item.id)) or Text(payload.streamType) <> "on-demand"
        result.error = "Playback authorization does not match this title."
        return result
    end if
    id = Text(payload.muxPlaybackId)
    if not CreateObject("roRegex", "^[A-Za-z0-9]+$", "").IsMatch(id)
        result.error = "Invalid Mux playback identifier."
        return result
    end if
    token = Text(payload.playbackToken)
    if Text(item.muxPlaybackPolicy) = "signed" and token = ""
        result.error = "Signed playback authorization is missing. Try again."
        return result
    end if
    if payload.DoesExist("playbackToken")
        if not CreateObject("roRegex", "^[A-Za-z0-9_.-]+$", "").IsMatch(token)
            result.error = "Invalid signed playback authorization."
            return result
        end if
    end if
    result.url = "https://stream.mux.com/" + id + ".m3u8"
    if token <> "" then result.url = result.url + "?token=" + token
    return result
end function

function ResolveLaunch(request as Dynamic, items as Object) as Object
    result = { item: invalid, error: "" }
    if not IsMap(request) then return result
    id = Text(request.contentId)
    kind = LCase(Text(request.mediaType))
    if id = "" and kind = "" then return result
    if id = "" or Len(id) > 255 or (kind <> "movie" and kind <> "episode")
        result.error = "This deep link is not supported. Browse PROtv instead."
        return result
    end if
    for each item in items
        if ExactStringEquals(Text(item.id), id) and LCase(item.contentType) = kind
            result.item = item
            return result
        end if
    end for
    result.error = "This title is unavailable. Browse PROtv instead."
    return result
end function
