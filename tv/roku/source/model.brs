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
    ' Cards are 2:3, so portrait art comes first. Wide hero art is only an
    ' episode fallback here; all-wide rows use item.backdrop instead.
    fields = ["posterUrl", "thumbnailUrl"]
    if Text(item.contentType) = "EPISODE" then fields.Push("heroImageUrl")
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
        ' One tile per series; selecting it opens seasons and episodes.
        list = SeriesList(items)
        if list.Count() > 0 then rows.Push({ title: "All Series", items: list, landscape: false, kind: "series" })
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

function ValidFirebaseSession(payload as Dynamic) as Boolean
    return FirebaseSessionProblem(payload) = ""
end function

' Which check a signInWithCustomToken response fails; "" when valid. Each
' code is shown on screen and logged so a device failure names its cause.
function FirebaseSessionProblem(payload as Dynamic) as String
    if not IsMap(payload) then return "FB01 response is not a JSON object"
    if Text(payload.idToken) = "" then return "FB02 idToken missing or not text"
    if Text(payload.refreshToken) = "" then return "FB03 refreshToken missing or not text"
    if not PositiveInteger(payload.expiresIn) then return "FB04 expiresIn missing or not positive"
    problem = IdTokenProblem(Text(payload.idToken))
    if problem <> "" then return problem
    localId = Text(payload.localId)
    if localId <> "" and not ExactStringEquals(localId, IdTokenUid(Text(payload.idToken))) then return "FB09 localId differs from the ID token"
    return ""
end function

' accounts:signInWithCustomToken returns idToken, refreshToken and expiresIn
' but no localId, so the viewer is the ID token's user_id / sub claim (the
' Firebase UID). A localId, when present, must agree.
function FirebaseSessionUid(payload as Object) as String
    if FirebaseSessionProblem(payload) <> "" then return ""
    return IdTokenUid(Text(payload.idToken))
end function

' Reads, without verifying, the claims of a token this TV just received from
' Firebase over HTTPS; PROtv's API verifies the token on every request.
function IdTokenUid(idToken as String) as String
    if IdTokenProblem(idToken) <> "" then return ""
    claims = IdTokenClaims(idToken)
    userId = Text(claims.user_id)
    if userId = "" then userId = Text(claims.sub)
    return userId
end function

function IdTokenClaims(idToken as String) as Dynamic
    parts = idToken.Split(".")
    if parts.Count() <> 3 then return invalid
    return ParseJson(Base64UrlDecode(parts[1]))
end function

function IdTokenProblem(idToken as String) as String
    parts = idToken.Split(".")
    if parts.Count() <> 3 then return "FB05 ID token has " + parts.Count().ToStr().Trim() + " segments, expected 3"
    decoded = Base64UrlDecode(parts[1])
    if decoded = "" then return "FB06 ID token claims are not base64url"
    claims = ParseJson(decoded)
    if not IsMap(claims) then return "FB07 ID token claims are not JSON"
    userId = Text(claims.user_id)
    subject = Text(claims.sub)
    if userId = "" then userId = subject
    if userId = "" or Len(userId) > 128 then return "FB08 ID token has no usable user_id or sub"
    if subject <> "" and not ExactStringEquals(userId, subject) then return "FB08 ID token user_id and sub differ"
    return ""
end function

function Base64UrlDecode(value as String) as String
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    powers = [1, 2, 4, 8, 16, 32, 64, 128]
    decoded = ""
    buffer = 0
    bits = 0
    for index = 1 to Len(value)
        character = Mid(value, index, 1)
        if character = "+" then character = "-"
        if character = "/" then character = "_"
        if character = "=" then exit for
        digit = Instr(1, alphabet, character) - 1
        if digit < 0 then return ""
        buffer = buffer * 64 + digit
        bits = bits + 6
        if bits >= 8
            bits = bits - 8
            decoded = decoded + Chr(Int(buffer / powers[bits]))
            buffer = buffer MOD powers[bits]
        end if
    end for
    return decoded
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

' ifLongInt matters: ParseJson returns LongInteger for the backend's
' millisecond updatedAt (Date.now()), which exceeds 32 bits.
function IsNumber(value as Dynamic) as Boolean
    return GetInterface(value, "ifInt") <> invalid or GetInterface(value, "ifLongInt") <> invalid or GetInterface(value, "ifFloat") <> invalid or GetInterface(value, "ifDouble") <> invalid
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

function ProgressSaveDue(positionSeconds as Integer, lastSavedSeconds as Integer, force as Boolean) as Boolean
    if positionSeconds <= 0 then return false
    if positionSeconds = lastSavedSeconds then return false
    if force then return true
    ' Either direction: seeking back must checkpoint too.
    return Abs(positionSeconds - lastSavedSeconds) >= 20
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
    ' roku_trick_play adds Mux's Roku thumbnail playlist (certification 4.7).
    ' Signed URLs accept parameters only inside the token, so they stay as-is.
    result.url = "https://stream.mux.com/" + id + ".m3u8"
    if token <> ""
        result.url = result.url + "?token=" + token
    else
        result.url = result.url + "?roku_trick_play=true"
    end if
    return result
end function

' Remote keys PROtv's player handles during playback. A focused Video node
' swallows OK even with its UI off (TV: v0.5.4, RC3), so these are caught by
' playerKeys, a child of the Video node. Options (*) is never one of them: it
' passes up to the Video node, which opens Roku's caption overlay (4.4, 4.8).
function IsPlayerKey(key as String) as Boolean
    for each name in ["OK", "play", "left", "right", "rewind", "fastforward", "replay", "up", "down", "back"]
        if key = name then return true
    end for
    return false
end function

' Caption-check packages only (manifest protv_caption_test=1). Apple's public
' HLS test stream carries WebVTT subtitles; no PROtv title has a text track yet.
function CaptionTestTitle() as Object
    return {
        id: "protv-caption-test",
        title: "TEST ONLY - Caption check (Apple HLS sample)",
        description: "Not PROtv content. Apple's public HLS sample with English WebVTT subtitles, used to check Roku caption settings in PROtv's player.",
        contentType: "MOVIE",
        category: "Test",
        genres: [],
        artwork: "",
        backdrop: "",
        streamUrl: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8"
    }
end function

function IsCaptionTestTitle(item as Dynamic) as Boolean
    return IsMap(item) and Text(item.id) = "protv-caption-test"
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

' Player overlay: "1:05:09" or "4:07".
function FormatClock(seconds as Dynamic) as String
    total = 0
    if IsNumber(seconds) and seconds > 0 then total = Int(seconds)
    hours = Int(total / 3600)
    minutes = Int((total - hours * 3600) / 60)
    rest = total - hours * 3600 - minutes * 60
    if hours > 0 then return hours.ToStr().Trim() + ":" + TwoDigits(minutes) + ":" + TwoDigits(rest)
    return minutes.ToStr().Trim() + ":" + TwoDigits(rest)
end function

function TwoDigits(value as Integer) as String
    if value < 10 then return "0" + value.ToStr().Trim()
    return value.ToStr().Trim()
end function

function PlayerTimeText(position as Dynamic, duration as Dynamic) as String
    if not IsNumber(duration) or duration <= 0 then return FormatClock(position)
    return FormatClock(position) + " / " + FormatClock(duration)
end function

' Seek targets stay inside the title, short of the very end.
function ClampSeek(target as Integer, duration as Dynamic) as Integer
    limit = 0
    if IsNumber(duration) and duration > 5 then limit = Int(duration) - 5
    if target < 0 then return 0
    if target > limit then return limit
    return target
end function

' Preview thumbnails come from Mux's public thumbnail endpoint; signed
' streams would need a thumbnail token, so they show no preview.
function PreviewBase(payload as Dynamic) as String
    if not IsMap(payload) or Text(payload.playbackToken) <> "" then return ""
    id = Text(payload.muxPlaybackId)
    if not CreateObject("roRegex", "^[A-Za-z0-9]+$", "").IsMatch(id) then return ""
    return "https://image.mux.com/" + id + "/thumbnail.jpg"
end function

' Wide cards only when every title in the row has real wide art.
function AllWideArtwork(items as Object) as Boolean
    if items.Count() = 0 then return false
    for each item in items
        if Text(item.backdrop) = "" then return false
    end for
    return true
end function

function CatalogStale(loadedAtSeconds as Integer, nowSeconds as Integer) as Boolean
    return nowSeconds - loadedAtSeconds >= 900
end function

' Guest progress kept on this TV, in the same shape as /users/me/progress.
function LocalProgressEntry(positionSeconds as Integer, durationSeconds as Dynamic, nowSeconds as Integer) as Object
    percent = positionSeconds * 100.0 / durationSeconds
    if percent > 100 then percent = 100
    ' Serialized to the registry, so keys are quoted to keep their case.
    return { "positionSeconds": positionSeconds, "durationSeconds": durationSeconds, "progressPercent": percent, "updatedAt": nowSeconds }
end function

' Adds or replaces one entry and keeps only the most recently updated ones.
function RecordProgress(progress as Object, videoId as String, entry as Object, limit as Integer) as Object
    result = {}
    result.SetModeCaseSensitive()
    for each id in progress
        if not ExactStringEquals(id, videoId) then result[id] = progress[id]
    end for
    result[videoId] = entry
    while result.Count() > limit
        ' No number-to-invalid comparison: Roku OS can reject it at runtime.
        oldest = ""
        oldestTime = 0
        for each id in result
            if oldest = "" or ProgressUpdatedAt(result, id) < oldestTime
                oldest = id
                oldestTime = ProgressUpdatedAt(result, id)
            end if
        end for
        result.Delete(oldest)
    end while
    return result
end function

function ParseStoredProgress(json as String) as Object
    result = {}
    result.SetModeCaseSensitive()
    if json = "" then return result
    payload = ParseJson(json)
    if not IsMap(payload) then return result
    for each id in payload
        if id <> "" and Len(id) <= 255 and ValidProgressEntry(payload[id]) then result[id] = payload[id]
    end for
    return result
end function

' A saved TV sign-in; anything malformed is discarded, never repaired.
function ParseStoredAccount(json as String) as Dynamic
    if json = "" then return invalid
    payload = ParseJson(json)
    if not IsMap(payload) then return invalid
    account = { viewerId: Text(payload.viewerId), idToken: Text(payload.idToken), refreshToken: Text(payload.refreshToken), expiresAtSeconds: 0 }
    if not HasViewerSession(account) then return invalid
    if IsNumber(payload.expiresAtSeconds) then account.expiresAtSeconds = IntValue(payload.expiresAtSeconds)
    return account
end function

function StoredAccountJson(account as Object) as String
    ' Quoted keys keep their case on the device (see the Firebase request).
    return FormatJson({ "viewerId": account.viewerId, "idToken": account.idToken, "refreshToken": account.refreshToken, "expiresAtSeconds": IntValue(account.expiresAtSeconds) })
end function

function IntValue(value as Dynamic) as Integer
    if GetInterface(value, "ifInt") <> invalid then return value
    if IsNumber(value) then return Int(value)
    return Int(Val(Text(value)))
end function

' Episodes group by series title; one without a series title stands alone
' under its own title.
function SeriesName(item as Object) as String
    name = Text(item.seriesTitle).Trim()
    if name = "" then name = Text(item.title)
    return name
end function

function SeriesList(items as Object) as Object
    groups = {}
    order = []
    for each item in items
        if item.contentType = "EPISODE"
            name = SeriesName(item)
            key = LCase(name)
            if not groups.DoesExist(key)
                groups[key] = { id: "series:" + key, title: name, episodes: [], artwork: "", backdrop: "" }
                order.Push(key)
            end if
            series = groups[key]
            series.episodes.Push(item)
            if series.artwork = "" then series.artwork = Text(item.artwork)
            if series.backdrop = "" then series.backdrop = Text(item.backdrop)
        end if
    end for
    result = []
    for each key in order
        result.Push(groups[key])
    end for
    return result
end function

' Seasons come only from real season numbers. Episodes without one are
' listed as "Episodes", or "More episodes" beside numbered seasons.
function SeriesSeasons(episodes as Object) as Object
    numbered = {}
    numbers = []
    loose = []
    for each episode in episodes
        if PositiveInteger(episode.seasonNumber)
            key = IntValue(episode.seasonNumber).ToStr().Trim()
            if not numbered.DoesExist(key)
                numbered[key] = []
                numbers.Push(IntValue(episode.seasonNumber))
            end if
            numbered[key].Push(episode)
        else
            loose.Push(episode)
        end if
    end for
    numbers.Sort()
    seasons = []
    for each number in numbers
        key = number.ToStr().Trim()
        seasons.Push({ title: "Season " + key, episodes: SortEpisodes(numbered[key]) })
    end for
    if loose.Count() > 0
        label = "Episodes"
        if seasons.Count() > 0 then label = "More episodes"
        seasons.Push({ title: label, episodes: SortEpisodes(loose) })
    end if
    return seasons
end function

' Numbered episodes in order, then unnumbered ones in catalog order.
function SortEpisodes(episodes as Object) as Object
    numbered = []
    loose = []
    for each episode in episodes
        if PositiveInteger(episode.episodeNumber)
            numbered.Push(episode)
        else
            loose.Push(episode)
        end if
    end for
    if numbered.Count() > 1
        for first = 0 to numbered.Count() - 2
            for second = first + 1 to numbered.Count() - 1
                if IntValue(numbered[second].episodeNumber) < IntValue(numbered[first].episodeNumber)
                    swap = numbered[first]
                    numbered[first] = numbered[second]
                    numbered[second] = swap
                end if
            end for
        end for
    end if
    numbered.Append(loose)
    return numbered
end function

function EpisodeLabel(episode as Object) as String
    parts = []
    if PositiveInteger(episode.episodeNumber) then parts.Push("E" + IntValue(episode.episodeNumber).ToStr().Trim())
    name = Text(episode.episodeTitle).Trim()
    if name = "" then name = Text(episode.title)
    parts.Push(name)
    runtime = Text(episode.runtime)
    if runtime = "" then runtime = FormatRuntime(episode.duration)
    if runtime <> "" then parts.Push(runtime)
    return parts.Join("  " + Chr(183) + "  ")
end function

function SeriesMeta(seasons as Object, episodeCount as Integer) as String
    parts = []
    numbered = 0
    for each season in seasons
        if Left(season.title, 7) = "Season " then numbered++
    end for
    if numbered = 1 then parts.Push("1 season")
    if numbered > 1 then parts.Push(numbered.ToStr().Trim() + " seasons")
    if episodeCount = 1
        parts.Push("1 episode")
    else
        parts.Push(episodeCount.ToStr().Trim() + " episodes")
    end if
    return parts.Join("  " + Chr(183) + "  ")
end function

function ValidEmail(value as String) as Boolean
    email = value.Trim()
    if Len(email) < 6 or Len(email) > 254 then return false
    return CreateObject("roRegex", "^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$", "").IsMatch(email)
end function

' Viewer-facing text for /auth/tv errors (the backend's code field).
function TvAuthMessage(statusCode as Integer, code as String) as String
    if code = "invalid_credentials" then return "That email and password don't match a PROtv account. Try again, or choose Forgot password."
    if code = "email_exists" then return "An account already uses that email. Choose Sign in instead."
    if code = "weak_password" then return "Choose a password of at least 6 characters."
    if code = "account_disabled" then return "This PROtv account is disabled. Contact support@watchprotv.com."
    if code = "invalid_request" then return "Check the email address and password, then try again."
    if code = "rate_limited" or statusCode = 429 then return "Too many attempts. Wait a few minutes and try again."
    if statusCode = 0 then return "PROtv could not be reached. Check your connection and try again."
    return "PROtv sign-in is temporarily unavailable. Try again shortly."
end function
