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

' Catalog descriptions end with an internal licensing note ("Rights: ...").
' Viewers see the synopsis; the note is kept separately for attribution.
function RightsIndex(description as String) as Integer
    return Instr(1, LCase(description), "rights:")
end function

function Synopsis(item as Object) as String
    body = Text(item.description).Trim()
    index = RightsIndex(body)
    if index > 0 then body = Left(body, index - 1).Trim()
    if body = "" then return ""
    ' A synopsis that starts mid-word is a damaged record; never show a fragment.
    first = Asc(Left(body, 1))
    if first >= 97 and first <= 122 then return ""
    return body
end function

function RightsLine(item as Object) as String
    body = Text(item.description).Trim()
    index = RightsIndex(body)
    if index = 0 then return ""
    return Mid(body, index).Trim()
end function

function FormatRuntime(seconds as Dynamic) as String
    if not IsNumber(seconds) then return ""
    if seconds < 60 then return ""
    minutes = Int(seconds / 60)
    if minutes < 60 then return minutes.ToStr().Trim() + " min"
    hours = Int(minutes / 60)
    rest = minutes - hours * 60
    if rest = 0 then return hours.ToStr().Trim() + "h"
    return hours.ToStr().Trim() + "h " + rest.ToStr().Trim() + "m"
end function

function TitleMetadata(item as Object) as String
    parts = []
    year = Text(item.year)
    if GetInterface(item.year, "ifInt") <> invalid then year = item.year.ToStr().Trim()
    runtime = Text(item.runtime)
    if runtime = "" then runtime = FormatRuntime(item.duration)
    for each value in [year, runtime, Text(item.category), Text(item.maturityRating)]
        if value <> "" then parts.Push(value)
    end for
    return parts.Join("  " + Chr(183) + "  ")
end function

' Second caption line under rail artwork.
function CardSubtitle(item as Object) as String
    if Text(item.contentType) = "EPISODE"
        if PositiveInteger(item.seasonNumber) and PositiveInteger(item.episodeNumber)
            return "S" + item.seasonNumber.ToStr().Trim() + " " + Chr(183) + " E" + item.episodeNumber.ToStr().Trim()
        end if
        return Text(item.seriesTitle)
    end if
    category = Text(item.category)
    if category <> "" then return category
    return FormatRuntime(item.duration)
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

' Real wide hero art, when a title has it; otherwise the hero uses a wash.
function BackdropSource(item as Object) as String
    if HeldArtwork(Text(item.id)) then return ""
    url = Text(item.heroImageUrl)
    if Left(url, 8) = "https://" then return url
    if Left(url, 9) = "/posters/" then return ApiBase() + url
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
            item.backdrop = BackdropSource(item)
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

' Creator submissions are published by the backend with creator_ IDs
' (creator_<projectId> movies, creator_episode_<id> episodes).
function IsCreatorTitle(item as Object) as Boolean
    return Left(Text(item.id), 8) = "creator_"
end function

function CreatorRows(items as Object) as Object
    films = []
    episodes = []
    for each item in items
        if IsCreatorTitle(item)
            if item.contentType = "EPISODE"
                episodes.Push(item)
            else
                films.Push(item)
            end if
        end if
    end for
    rows = []
    if films.Count() > 0 then rows.Push({ title: "From PROtv Creators", items: films, landscape: false })
    if episodes.Count() > 0 then rows.Push({ title: "Creator Series", items: episodes, landscape: true })
    return rows
end function

function HasAnyGenre(item as Object, genres as Object) as Boolean
    for each genre in genres
        if HasGenre(item, genre) then return true
    end for
    return false
end function

' Creators lead every list they appear in; catalog order is kept otherwise.
function CreatorsFirst(items as Object) as Object
    creators = []
    others = []
    for each item in items
        if IsCreatorTitle(item)
            creators.Push(item)
        else
            others.Push(item)
        end if
    end for
    creators.Append(others)
    return creators
end function

' Titles the featured hero rotates through: creator films, then editorial picks.
function SpotlightItems(items as Object) as Object
    result = []
    for each item in items
        if IsCreatorTitle(item) and item.contentType = "MOVIE" and result.Count() < 3 then result.Push(item)
    end for
    for each id in FeaturedIds()
        for each item in items
            if ExactStringEquals(Text(item.id), id) and item.contentType = "MOVIE" then result.Push(item)
        end for
    end for
    if result.Count() = 0
        for each item in items
            if item.contentType = "MOVIE" and result.Count() < 5 then result.Push(item)
        end for
    end if
    return result
end function

' Editorial selections, not an invented API featured flag or release-date ranking.
function FeaturedIds() as Object
    return ["sCWQqVE5WIoNNN5wAGQ2", "biitnhJJnBvHGFx8TJZC", "LiMNMZWXBxJj3LoP73kU", "gbcxmtl6mAHQeBxx8Dgs"]
end function

' Sidebar destinations other than Home, Search and the account views.
function ViewRows(items as Object, view as String) as Object
    if view = "creators" then return CreatorRows(items)
    rows = []
    if view = "movies"
        movies = []
        categories = {}
        order = []
        for each item in items
            if item.contentType = "MOVIE"
                movies.Push(item)
                category = Text(item.category).Trim()
                if category <> ""
                    key = LCase(category)
                    if not categories.DoesExist(key)
                        categories[key] = { title: category, items: [], landscape: false }
                        order.Push(key)
                    end if
                    categories[key].items.Push(item)
                end if
            end if
        end for
        if movies.Count() > 0 then rows.Push({ title: "All Movies", items: CreatorsFirst(movies), landscape: false })
        for each key in order
            rows.Push({ title: categories[key].title, items: CreatorsFirst(categories[key].items), landscape: false })
        end for
    else if view = "series"
        groups = {}
        order = []
        for each item in items
            if item.contentType = "EPISODE"
                name = Text(item.seriesTitle).Trim()
                if name = "" then name = Text(item.title)
                key = LCase(name)
                if not groups.DoesExist(key)
                    groups[key] = { title: name, items: [], landscape: true }
                    order.Push(key)
                end if
                groups[key].items.Push(item)
            end if
        end for
        for each key in order
            rows.Push(groups[key])
        end for
    else if view = "blackcinema" or view = "aicinema"
        genre = "Black Cinema"
        if view = "aicinema" then genre = "AI Cinema"
        found = []
        for each item in items
            if item.contentType = "MOVIE" and HasGenre(item, genre) then found.Push(item)
        end for
        if found.Count() > 0 then rows.Push({ title: genre, items: CreatorsFirst(found), landscape: false })
    end if
    return rows
end function

function Moods() as Object
    return [
        { id: "exciting", title: "Exciting", icon: "flame", genres: ["Action", "Sci-Fi", "Horror/Thriller"] },
        { id: "funny", title: "Funny", icon: "smile", genres: ["Comedy", "Cartoons", "Classic Cartoons"] },
        { id: "scary", title: "Scary", icon: "ghost", genres: ["Horror", "Horror/Thriller", "Supernatural horror"] },
        { id: "thoughtful", title: "Thoughtful", icon: "bulb", genres: ["Documentary", "AI Cinema"] },
        { id: "heartfelt", title: "Heartfelt", icon: "heart", genres: ["Drama", "Black Cinema"] },
        { id: "escape", title: "Escape", icon: "planet", genres: ["Sci-Fi", "Cartoons", "Classic Cartoons", "AI Cinema"] },
    ]
end function

function MoodItems(items as Object, moodId as String) as Object
    found = []
    for each mood in Moods()
        if mood.id = moodId
            for each item in items
                if item.contentType = "MOVIE" and HasAnyGenre(item, mood.genres) then found.Push(item)
            end for
        end if
    end for
    return CreatorsFirst(found)
end function

' Only moods that currently match at least one title.
function AvailableMoods(items as Object) as Object
    result = []
    for each mood in Moods()
        if MoodItems(items, mood.id).Count() > 0 then result.Push(mood)
    end for
    return result
end function

function TimeLeft(entry as Dynamic) as String
    if not ValidProgressEntry(entry) then return ""
    remaining = entry.durationSeconds - entry.positionSeconds
    if remaining <= 0 then return ""
    if remaining < 60 then return "Under 1m left"
    minutes = Int((remaining + 59) / 60)
    if minutes < 60 then return minutes.ToStr().Trim() + "m left"
    hours = Int(minutes / 60)
    rest = minutes - hours * 60
    if rest = 0 then return hours.ToStr().Trim() + "h left"
    return hours.ToStr().Trim() + "h " + rest.ToStr().Trim() + "m left"
end function

function Greeting(hour as Integer) as String
    if hour >= 5 and hour < 12 then return "Good morning"
    if hour >= 12 and hour < 17 then return "Good afternoon"
    return "Good evening"
end function

' GET /users/me/favorites returns an array of exact catalog IDs.
function FavoriteIds(payload as Dynamic) as Object
    result = []
    if not IsArray(payload) then return result
    seen = CreateObject("roAssociativeArray")
    seen.SetModeCaseSensitive()
    for each id in payload
        value = Text(id)
        if value <> "" and not seen.DoesExist(value) and result.Count() < 500
            seen[value] = true
            result.Push(value)
        end if
    end for
    return result
end function

function IsFavorite(favorites as Object, id as String) as Boolean
    for each value in favorites
        if ExactStringEquals(value, id) then return true
    end for
    return false
end function

function ToggleFavorite(favorites as Object, id as String, favorite as Boolean) as Object
    result = []
    for each value in favorites
        if not ExactStringEquals(value, id) then result.Push(value)
    end for
    if favorite then result.Push(id)
    return result
end function

' Most recently added first; IDs missing from the catalog are skipped.
function FavoriteItems(items as Object, favorites as Object) as Object
    result = []
    for index = favorites.Count() - 1 to 0 step -1
        for each item in items
            if ExactStringEquals(Text(item.id), favorites[index]) then result.Push(item)
        end for
    end for
    return result
end function

function HomeRows(items as Object, query = "" as String) as Object
    rows = []
    if query <> ""
        for each kind in ["MOVIE", "EPISODE"]
            found = []
            for each item in items
                if item.contentType = kind and MatchesSearch(item, query) then found.Push(item)
            end for
            if found.Count() > 0 then rows.Push({ title: "Search - " + LCase(kind) + "s", items: CreatorsFirst(found), landscape: kind = "EPISODE" })
        end for
        return rows
    end if
    rows = CreatorRows(items)
    featured = []
    for each id in FeaturedIds()
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
    if black.Count() > 0 then rows.Push({ title: "Black Cinema", items: CreatorsFirst(black), landscape: false })
    if movies.Count() > 0 then rows.Push({ title: "All Movies", items: movies, landscape: false })
    for each key in categories
        categories[key].items = CreatorsFirst(categories[key].items)
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
