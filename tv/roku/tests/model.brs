sub Main()
    m.passed = 0
    m.failed = 0
    Assert(NavigationIndex(0, -1, 3) = 0, "navigation left boundary")
    Assert(NavigationIndex(2, 1, 3) = 2, "navigation right boundary")
    Assert(NavigationIndex(0, 1, 3) = 1, "navigation right step")
    Assert(NavigationIndex(1, -1, 2) = 0, "detail left step")
    dot = "  " + Chr(183) + "  "
    Assert(TitleMetadata({ year: 1945, duration: 5400, category: "Drama", maturityRating: "NR" }) = "1945" + dot + "1h 30m" + dot + "Drama" + dot + "NR", "year runtime category rating metadata")
    Assert(TitleMetadata({ runtime: "88 min", category: "Comedy" }) = "88 min" + dot + "Comedy", "explicit runtime reused")
    Assert(Synopsis({ description: "A florist meets a plant. Rights: Public domain." }) = "A florist meets a plant.", "licensing note stripped from synopsis")
    Assert(RightsLine({ description: "A florist meets a plant. Rights: Public domain." }) = "Rights: Public domain.", "licensing note kept for attribution")
    Assert(RightsLine({ description: "Short film. Rights: Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blender Foundation." }) = "Rights: Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blender Foundation.", "CC BY credit preserved")
    Assert(Synopsis({ description: "na. Rights: Public domain." }) = "", "damaged mid-word fragments are hidden")
    Assert(Synopsis({ description: "Rights: PROtv exclusive" }) = "" and RightsLine({ description: "A story." }) = "", "no empty synopsis or invented rights")
    Assert(Synopsis({ description: "1950s noir thriller." }) = "1950s noir thriller." and Synopsis({}) = "", "numeric starts allowed, missing descriptions empty")
    Assert(FormatRuntime(4353) = "1h 12m", "feature runtime in hours and minutes")
    Assert(FormatRuntime(1065) = "17 min", "short runtime in minutes")
    Assert(FormatRuntime(3600) = "1h", "whole-hour runtime")
    Assert(FormatRuntime(30) = "" and FormatRuntime("90") = "", "invalid or tiny runtime omitted")
    Assert(CardSubtitle({ contentType: "EPISODE", seasonNumber: 2, episodeNumber: 39, seriesTitle: "One Step Beyond" }) = "S2 " + Chr(183) + " E39", "episode card subtitle")
    Assert(CardSubtitle({ contentType: "EPISODE", seriesTitle: "One Step Beyond" }) = "One Step Beyond", "episode without numbering uses series")
    Assert(CardSubtitle({ contentType: "MOVIE", category: "Comedy", duration: 4353 }) = "Comedy", "movie card subtitle is category")
    Assert(CardSubtitle({ contentType: "MOVIE", duration: 4353 }) = "1h 12m", "uncategorized movie shows runtime")
    Assert(TitleMetadata({}) = "", "missing metadata no fake values or separators")
    Assert(TitleMetadata({ duration: "invalid", category: "Drama" }) = "Drama", "invalid numeric metadata guarded")
    Assert(Text(7) = "", "nonstring guard")
    Assert(HeldArtwork("MZ6Q6DI2S62pP8laH9Ku"), "petrified held")
    Assert(HeldArtwork("XMj306OZSbomES2Zz0Fz"), "gates held")
    Assert(not HeldArtwork("mz6q6di2s62pp8lah9ku"), "artwork hold IDs are case-sensitive")
    Assert(not HeldArtwork("creator_1"), "creator not held")
    approved = { id: "a", title: "Movie A", contentType: "MOVIE", category: "Drama", posterUrl: "https://storage.googleapis.com/original.png", thumbnailUrl: "https://other/image.jpg" }
    Assert(ArtworkSource(approved) = approved.posterUrl, "exact approved poster takes priority")
    held = { id: "MZ6Q6DI2S62pP8laH9Ku", title: "Held", contentType: "MOVIE", posterUrl: "https://wrong/replacement.jpg" }
    Assert(ArtworkSource(held) = "", "held source never displayed")
    held.id = "XMj306OZSbomES2Zz0Fz"
    Assert(ArtworkSource(held) = "", "second held source never displayed")
    creator = { id: "creator_1", title: "Creator", contentType: "MOVIE", category: "AI Cinema", posterUrl: "data:image/jpeg;base64,YQ==" }
    Assert(ArtworkSource(creator) = creator.posterUrl, "creator JPEG bytes preserved")
    episode = { id: "ep_1", title: "Episode", contentType: "EPISODE", heroImageUrl: "https://creator/still.jpg", posterUrl: "https://creator/portrait.jpg" }
    Assert(ArtworkSource(episode) = episode.posterUrl, "episode cards prefer 2:3 portrait art")
    Assert(ArtworkSource({ id: "ep_w", title: "W", contentType: "EPISODE", heroImageUrl: "https://creator/still.jpg" }) = "https://creator/still.jpg", "wide art is only the episode fallback")
    Assert(ArtworkSource({ id: "m_w", title: "W", contentType: "MOVIE", heroImageUrl: "https://creator/still.jpg" }) = "", "movies never use wide art as a poster")
    episode.heroImageUrl = ""
    episode.posterUrl = "http://localhost:5000/bad.jpg"
    Assert(ArtworkSource(episode) = "", "insecure local art rejected")
    episode.thumbnailUrl = "/posters/exact.jpg"
    Assert(ArtworkSource(episode) = ApiBase() + "/posters/exact.jpg", "existing relative service path")
    Assert(NormalizeCatalog(invalid).error <> "", "invalid catalog rejected")
    Assert(NormalizeCatalog({ items: {} }).error <> "", "wrong catalog shape rejected")
    Assert(NormalizeCatalog({ items: [7] }).error <> "", "invalid catalog entry rejected")
    Assert(NormalizeCatalog({ items: [approved, approved] }).error <> "", "duplicate identifiers rejected")
    Assert(NormalizeCatalog({ items: [{ id: "", title: "x" }] }).error <> "", "empty identifier rejected")
    caseLower = { id: "mixedCase", title: "Lower", contentType: "MOVIE" }
    caseUpper = { id: "MIXEDCASE", title: "Upper", contentType: "MOVIE" }
    Assert(NormalizeCatalog({ items: [caseLower, caseUpper] }).items.Count() = 2, "catalog IDs differing only by case remain distinct")
    Assert(ResolveLaunch({ contentId: "MIXEDCASE", mediaType: "movie" }, [caseLower]).error <> "", "deep-link catalog IDs are exact")
    podcast = { id: "pod", title: "Podcast", contentType: "PODCAST_EPISODE" }
    result = NormalizeCatalog({ items: [approved, creator, episode, podcast] })
    Assert(result.error = "" and result.items.Count() = 3, "supported types only")
    Assert(result.items[0].artwork = approved.posterUrl, "normalized art unchanged")
    approved.genres = ["Black Cinema", "Classic"]
    Assert(HasGenre(approved, "black cinema"), "genre-array Black Cinema")
    Assert(MatchesSearch(approved, "movie classic"), "all search terms across fields")
    Assert(not MatchesSearch(approved, "movie missing"), "all terms required")
    Assert(MatchesSearch(approved, "  MOVIE   drama "), "case and spacing search")
    Assert(MatchesSearch(approved, ""), "empty search matches all")
    rows = HomeRows(result.items)
    Assert(rows[0].title = "From PROtv Creators" and rows[0].items[0].id = "creator_1", "creator submissions lead the homepage")
    Assert(rows[1].title = "Black Cinema", "Black Cinema prominent without editorial candidates")
    Assert(rows[2].title = "All Movies" and rows[2].items.Count() = 2, "all movies preserved")
    Assert(IsCreatorTitle({ id: "creator_episode_9" }) and not IsCreatorTitle({ id: "Creator_1" }) and not IsCreatorTitle({ id: "a" }), "creator IDs use the backend prefix exactly")
    Assert(CreatorsFirst([approved, creator])[0].id = "creator_1", "creators sort ahead of catalog titles")
    spot = SpotlightItems([approved, creator, { id: "sCWQqVE5WIoNNN5wAGQ2", title: "Sintel", contentType: "MOVIE" }])
    Assert(spot.Count() = 2 and spot[0].id = "creator_1" and spot[1].id = "sCWQqVE5WIoNNN5wAGQ2", "spotlight leads with creators, then editorial picks")
    Assert(SpotlightItems([approved])[0].id = "a", "spotlight falls back to catalog movies")
    creatorEpisode = { id: "creator_episode_2", title: "Pilot", contentType: "EPISODE", seriesTitle: "Camp" }
    creatorView = ViewRows([approved, creator, creatorEpisode], "creators")
    Assert(creatorView.Count() = 2 and creatorView[1].landscape and creatorView[1].items[0].id = "creator_episode_2", "creators view separates films and series")
    Assert(ViewRows([approved, creator], "movies")[0].items[0].id = "creator_1", "movies view puts creators first")
    seriesView = ViewRows([episode, creatorEpisode, { id: "ep_2", title: "Episode 2", contentType: "EPISODE", seriesTitle: "Camp" }], "series")
    Assert(seriesView.Count() = 1 and seriesView[0].kind = "series" and seriesView[0].items.Count() = 2, "series view is one row of series tiles")
    Assert(seriesView[0].items[1].title = "Camp" and seriesView[0].items[1].episodes.Count() = 2, "series tiles group episodes by series title")
    Assert(seriesView[0].items[0].title = "Episode" and seriesView[0].items[0].episodes.Count() = 1, "an episode without a series title stands alone")
    Assert(ViewRows([approved], "series").Count() = 0, "no series row without episodes")
    ' Seasons and episode order come only from real metadata.
    s2e3 = { id: "x3", title: "Three", contentType: "EPISODE", seriesTitle: "Show", seasonNumber: 2, episodeNumber: 3, episodeTitle: "The Storm", duration: 1500 }
    s2e1 = { id: "x1", title: "One", contentType: "EPISODE", seriesTitle: "Show", seasonNumber: 2, episodeNumber: 1 }
    s1e9 = { id: "x9", title: "Nine", contentType: "EPISODE", seriesTitle: "Show", seasonNumber: "1", episodeNumber: "9" }
    loose = { id: "x0", title: "Special", contentType: "EPISODE", seriesTitle: "Show" }
    seasons = SeriesSeasons([s2e3, loose, s2e1, s1e9])
    Assert(seasons.Count() = 3 and seasons[0].title = "Season 1" and seasons[1].title = "Season 2" and seasons[2].title = "More episodes", "seasons sorted by number; unnumbered last")
    Assert(seasons[1].episodes[0].id = "x1" and seasons[1].episodes[1].id = "x3", "episodes sorted by episode number")
    Assert(SeriesSeasons([loose]).Count() = 1 and SeriesSeasons([loose])[0].title = "Episodes", "no season invented when none is numbered")
    Assert(SeriesSeasons([{ id: "z", title: "Z", contentType: "EPISODE", seasonNumber: 0 }])[0].title = "Episodes", "season 0 is not a season")
    Assert(EpisodeLabel(s2e3) = "E3" + dot + "The Storm" + dot + "25 min", "episode label uses number, episode title and runtime")
    Assert(EpisodeLabel(loose) = "Special", "unnumbered episode label has no invented number")
    Assert(SeriesMeta(seasons, 4) = "2 seasons" + dot + "4 episodes" and SeriesMeta(SeriesSeasons([loose]), 1) = "1 episode", "series metadata counts only real seasons")
    Assert(SeriesList([s2e3, approved, s2e1])[0].episodes.Count() = 2, "series list ignores movies")
    Assert(ViewRows([approved, creator], "aicinema")[0].items[0].id = "creator_1", "AI Cinema view from category")
    Assert(ViewRows([approved], "blackcinema").Count() = 1, "Black Cinema view from genres")
    Assert(MoodItems([approved, creator], "heartfelt").Count() = 1 and MoodItems([approved, creator], "thoughtful")[0].id = "creator_1" and MoodItems([approved], "scary").Count() = 0, "moods map to catalog genres")
    Assert(AvailableMoods([approved]).Count() = 1 and AvailableMoods([approved])[0].id = "heartfelt", "moods without titles are hidden")
    Assert(rows[rows.Count() - 1].landscape, "episodes landscape row")
    search = HomeRows(result.items, "episode")
    Assert(search.Count() = 1 and search[0].landscape, "search separates episodic ratio")
    Assert(HomeRows(result.items, "no-result").Count() = 0, "empty search no invented titles")
    featured = { id: "sCWQqVE5WIoNNN5wAGQ2", title: "Sintel", contentType: "MOVIE", category: "Animation" }
    Assert(HomeRows([featured])[0].title = "Featured on PROtv", "editorial IDs resolved from live catalog")
    public = { id: "a", streamType: "on-demand", muxPlaybackId: "Ab123" }
    Assert(PlaybackUrl(public, approved).url = "https://stream.mux.com/Ab123.m3u8?roku_trick_play=true", "public Mux HLS requests Roku trick-play thumbnails")
    Assert(PlaybackUrl(invalid, approved).error <> "", "invalid playback rejected")
    Assert(PlaybackUrl({ id: "wrong" }, approved).error <> "", "wrong playback title rejected")
    Assert(PlaybackUrl({ id: "A", streamType: "on-demand", muxPlaybackId: "Ab123" }, approved).error <> "", "playback title IDs are case-sensitive")
    Assert(PlaybackUrl({ id: "a", streamType: "live" }, approved).error <> "", "unsupported stream rejected")
    public.muxPlaybackId = "../escape"
    Assert(PlaybackUrl(public, approved).error <> "", "unsafe playback ID rejected")
    public.muxPlaybackId = "Ab123"
    approved.muxPlaybackPolicy = "signed"
    Assert(PlaybackUrl(public, approved).error <> "", "signed never falls back to public")
    public.playbackToken = "abc.def-ghi_jkl"
    Assert(PlaybackUrl(public, approved).url = "https://stream.mux.com/Ab123.m3u8?token=abc.def-ghi_jkl", "signed Mux HLS")
    public.playbackToken = ""
    Assert(PlaybackUrl(public, approved).error <> "", "empty token rejected")
    public.playbackToken = "token&evil=1"
    Assert(PlaybackUrl(public, approved).error <> "", "unsafe token rejected")
    Assert(ResolveLaunch({ contentid: "a", mediatype: "movie" }, result.items).item.id = "a", "lowercase Roku launch args")
    Assert(ResolveLaunch({ contentId: "ep_1", mediaType: "episode" }, result.items).item.id = "ep_1", "episode launch")
    Assert(ResolveLaunch({ contentId: "missing", mediaType: "movie" }, result.items).error <> "", "unavailable deep link")
    Assert(ResolveLaunch({ contentId: "a", mediaType: "episode" }, result.items).error <> "", "wrong media type rejected")
    Assert(ResolveLaunch({ contentId: "a", mediaType: "series" }, result.items).error <> "", "unsupported series explicit")
    Assert(ResolveLaunch({}, result.items).error = "", "ordinary launch harmless")
    activation = {
        sessionId: String(43, "s"),
        deviceSecret: String(43, "d"),
        userCode: "ABCD-EFGH",
        verificationUrl: "https://watchprotv.com/activate",
        expiresAt: "2035-01-01T00:00:00.000Z",
        interval: 5,
    }
    activationResult = DeviceSessionDetails(activation, 1700000000)
    Assert(activationResult.valid, "device activation contract accepted")
    Assert(activationResult.session.userCode = "ABCD-EFGH", "activation code preserved")
    Assert(activationResult.session.intervalSeconds = 5, "backend poll interval honored")
    activation.expiresAt = "2020-01-01T00:00:00.000Z"
    Assert(not DeviceSessionDetails(activation, 1700000000).valid, "expired activation rejected")
    activation.expiresAt = "2035-01-01T00:00:00.000Z"
    activation.verificationUrl = "http://watchprotv.com/activate"
    Assert(not DeviceSessionDetails(activation, 1700000000).valid, "insecure activation URL rejected")
    activation.verificationUrl = "https://watchprotv.com/activate?code=ABCD-EFGH"
    Assert(not DeviceSessionDetails(activation, 1700000000).valid, "activation URL cannot contain query tokens")
    ' The real accounts:signInWithCustomToken response: no localId (device failure 2026-10-23).
    claims = "eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcHJvdHYtMmY0OGUiLCJhdWQiOiJwcm90di0yZjQ4ZSIsInVzZXJfaWQiOiJ2aWV3ZXItVWlkXzEiLCJzdWIiOiJ2aWV3ZXItVWlkXzEiLCJ4IjoiPz8-PiJ9"
    idToken = "eyJhbGciOiJSUzI1NiJ9." + claims + ".c2lnbmF0dXJl"
    firebaseSession = { kind: "identitytoolkit#VerifyCustomTokenResponse", idToken: idToken, refreshToken: "refresh-token", expiresIn: "3600", isNewUser: false }
    Assert(ValidFirebaseSession(firebaseSession), "Firebase custom token response without localId accepted")
    Assert(FirebaseSessionUid(firebaseSession) = "viewer-Uid_1", "viewer ID comes from the ID token user_id claim")
    Assert(Base64UrlDecode("eyJzdWIiOiJ2aWV3ZXItcyJ9") = "{" + Chr(34) + "sub" + Chr(34) + ":" + Chr(34) + "viewer-s" + Chr(34) + "}", "base64url decodes unpadded segments")
    Assert(IdTokenUid("h.eyJzdWIiOiJ2aWV3ZXItcyJ9.s") = "viewer-s", "sub is the UID when user_id is absent")
    Assert(IdTokenUid("h.eyJ1c2VyX2lkIjoidmlld2VyLWEiLCJzdWIiOiJ2aWV3ZXItYiJ9.s") = "", "disagreeing user_id and sub rejected")
    Assert(IdTokenUid("id-token") = "" and IdTokenUid("a.!!!.c") = "" and IdTokenUid("a.bm90IGpzb24.c") = "", "opaque or malformed ID tokens rejected")
    firebaseSession.localId = "viewer-Uid_1"
    Assert(ValidFirebaseSession(firebaseSession), "a matching localId is accepted")
    firebaseSession.localId = "someone-else"
    Assert(not ValidFirebaseSession(firebaseSession), "a localId that disagrees with the token is rejected")
    Assert(not ValidFirebaseSession({ idToken: "", refreshToken: "refresh-token", expiresIn: "3600" }), "empty Firebase ID token rejected")
    Assert(not ValidFirebaseSession({ idToken: idToken, refreshToken: "", expiresIn: "3600" }) and not ValidFirebaseSession({ idToken: idToken, refreshToken: "r", expiresIn: "0" }), "missing refresh token or expiry rejected")
    ' Each rejection has its own diagnostic code.
    good = { idToken: idToken, refreshToken: "r", expiresIn: "3600" }
    Assert(FirebaseSessionProblem(good) = "", "a valid session has no problem code")
    Assert(Left(FirebaseSessionProblem([]), 4) = "FB01" and Left(FirebaseSessionProblem({ refreshToken: "r", expiresIn: "3600" }), 4) = "FB02", "FB01 non-object, FB02 missing ID token")
    Assert(Left(FirebaseSessionProblem({ idToken: idToken, expiresIn: "3600" }), 4) = "FB03" and Left(FirebaseSessionProblem({ idToken: idToken, refreshToken: "r", expiresIn: 0 }), 4) = "FB04", "FB03 missing refresh token, FB04 bad expiry")
    Assert(FirebaseSessionProblem({ idToken: "opaque", refreshToken: "r", expiresIn: "3600" }) = "FB05 ID token has 1 segments, expected 3", "FB05 names the segment count")
    Assert(Left(FirebaseSessionProblem({ idToken: "a.!!.c", refreshToken: "r", expiresIn: "3600" }), 4) = "FB06" and Left(FirebaseSessionProblem({ idToken: "a.bm90IGpzb24.c", refreshToken: "r", expiresIn: "3600" }), 4) = "FB07", "FB06 not base64url, FB07 not JSON")
    Assert(Left(FirebaseSessionProblem({ idToken: "a.eyJhdWQiOiJwcm90di0yZjQ4ZSJ9.c", refreshToken: "r", expiresIn: "3600" }), 4) = "FB08", "FB08 no user_id or sub")
    Assert(Left(FirebaseSessionProblem({ idToken: idToken, refreshToken: "r", expiresIn: "3600", localId: "other" }), 4) = "FB09", "FB09 localId disagrees")
    Assert(FirebaseSessionProblem({ idToken: idToken, refreshToken: "r", expiresIn: 3600 }) = "", "a numeric expiresIn is accepted")
    Assert(AuthSelfTest() = "OK", "the on-device decoder self-test passes")
    Assert(DiagnosticShape(good) = "object{expiresIn,idToken,refreshToken}" or DiagnosticShape(good) = "object{expiresin,idtoken,refreshtoken}", "diagnostics report keys, not values")
    Assert(DiagnosticShape("secret-value") = "string(len 12)" and DiagnosticShape(invalid) = "absent" and DiagnosticShape([1, 2]) = "array(2)", "diagnostics report only type and length")
    firebaseRefresh = { user_id: "viewer-one", access_token: "next-id-token", refresh_token: "next-refresh", expires_in: "3600" }
    Assert(ValidFirebaseRefresh(firebaseRefresh, "viewer-one"), "Firebase refresh response accepted")
    Assert(not ValidFirebaseRefresh(firebaseRefresh, "viewer-two"), "Firebase refresh identity must not change")
    Assert(NeedsFirebaseRefresh({ expiresAtSeconds: 1060 }, 1000), "Firebase token refresh starts before expiry")
    Assert(not NeedsFirebaseRefresh({ expiresAtSeconds: 2000 }, 1000), "valid Firebase token reused")
    Assert(HasViewerSession({ viewerId: "viewer-one", idToken: "id", refreshToken: "refresh" }), "signed-in session enables account requests")
    Assert(not HasViewerSession(invalid), "guest mode has no account requests")
    watching = { id: "movie-a", title: "A", contentType: "MOVIE", artwork: "https://image/a.jpg" }
    completed = { id: "movie-b", title: "B", contentType: "MOVIE", artwork: "https://image/b.jpg" }
    newer = { id: "movie-new", title: "New", contentType: "MOVIE", artwork: "https://image/new.jpg" }
    missing = { id: "not-in-progress", title: "C", contentType: "MOVIE" }
    progress = {
        "movie-a": { positionSeconds: 120, durationSeconds: 1000, progressPercent: 12, updatedAt: 200 },
        "movie-b": { positionSeconds: 950, durationSeconds: 1000, progressPercent: 95, updatedAt: 300 },
        "movie-new": { positionSeconds: 60, durationSeconds: 900, progressPercent: 7, updatedAt: 400 },
        "bad-entry": "invalid",
        "removed-title": { positionSeconds: 5, durationSeconds: 10, progressPercent: 50, updatedAt: 100 },
    }
    progress.SetModeCaseSensitive()
    progress["Movie-A"] = { positionSeconds: 30, durationSeconds: 100, progressPercent: 30, updatedAt: 300 }
    continueItems = ContinueWatchingItems([watching, completed, newer, missing], progress)
    Assert(continueItems.Count() = 2 and continueItems[0].id = "movie-new", "Continue Watching maps exact IDs and sorts by newest progress")
    Assert(ResumePosition(progress, "Movie-A") = 30 and ResumePosition(progress, "movie-a") = 120, "mixed-case progress IDs remain isolated")
    Assert(ResumePosition(progress, "movie-a") = 120, "saved playback position restored")
    Assert(ResumePosition(progress, "movie-b") = 0, "completed progress is not resumed")
    Assert(ContinueWatchingItems([watching], progress).Count() = 1, "progress for titles outside the catalog is ignored")
    Assert(ProgressForViewer("viewer-one", "viewer-two", progress).Count() = 0, "switching identity clears previous viewer progress")
    Assert(ProgressForViewer("viewer-one", "viewer-one", progress).Count() = progress.Count(), "same viewer keeps its synchronized progress")
    Assert(ProgressForViewer("Viewer-One", "viewer-one", progress).Count() = 0, "viewer identity comparison is case-sensitive")
    Assert(ResumePosition(progress, "bad-entry") = 0, "malformed progress entry skipped")
    Assert(not ValidProgressEntry({ positionSeconds: -1, durationSeconds: 0, progressPercent: 120 }), "invalid progress values rejected")
    Assert(not ValidProgressEntry({ positionSeconds: 10, durationSeconds: 100, progressPercent: 10 }), "incomplete progress response rejected")
    Assert(ProgressSaveDue(20, 0, false), "progress checkpoint due after threshold")
    Assert(not ProgressSaveDue(19, 0, false), "progress writes are debounced")
    Assert(ProgressSaveDue(3, 100, true), "pause/exit forces progress flush after seek")
    Assert(not ProgressSaveDue(0, 0, true), "zero position never creates progress")
    Assert(ProgressSaveDue(980, 1000, false) and not ProgressSaveDue(990, 1000, false), "seeking back checkpoints after 20 seconds of movement")
    ' Guest progress on this TV.
    entry = LocalProgressEntry(600, 1200.5, 1700000000)
    Assert(ValidProgressEntry(entry) and entry.progressPercent > 49.9 and entry.progressPercent < 50, "local progress matches the account progress shape")
    Assert(LocalProgressEntry(1300, 1200, 1).progressPercent = 100, "local progress percent is capped")
    kept = {}
    for index = 1 to 5
        kept = RecordProgress(kept, "v" + index.ToStr(), LocalProgressEntry(60, 1200, 1000 + index), 3)
    end for
    Assert(kept.Count() = 3 and not kept.DoesExist("v1") and not kept.DoesExist("v2") and kept.DoesExist("v5"), "local progress keeps only the most recent titles")
    kept = RecordProgress(kept, "v3", LocalProgressEntry(90, 1200, 2000), 3)
    Assert(kept.Count() = 3 and kept.v3.positionSeconds = 90, "re-watching replaces rather than duplicates")
    stored = ParseStoredProgress(FormatJson(kept))
    Assert(stored.Count() = 3 and ContinueWatchingItems([{ id: "v3" }, { id: "v5" }], stored)[0].id = "v3", "stored progress round-trips into Continue Watching")
    Assert(ParseStoredProgress("not json").Count() = 0 and ParseStoredProgress("").Count() = 0, "corrupt stored progress is ignored")
    Assert(ParseStoredProgress(FormatJson({ good: entry, bad: { positionSeconds: "x" } })).Count() = 1, "invalid stored entries are dropped")
    ' Saved TV sign-in.
    expiry = CurrentEpochSeconds() + 3600
    session = { viewerId: "viewer", idToken: "id", refreshToken: "refresh", expiresAtSeconds: expiry }
    restored = ParseStoredAccount(StoredAccountJson(session))
    Assert(restored <> invalid and restored.viewerId = "viewer" and restored.refreshToken = "refresh" and restored.expiresAtSeconds = expiry, "saved sign-in round-trips")
    Assert(NeedsFirebaseRefresh(restored, expiry) and not NeedsFirebaseRefresh(restored, expiry - 120), "an expired saved sign-in refreshes before use")
    Assert(ParseStoredAccount("") = invalid and ParseStoredAccount("{") = invalid and ParseStoredAccount(FormatJson({ viewerId: "v", idToken: "i" })) = invalid, "incomplete saved sign-ins are discarded")
    Assert(Instr(1, StoredAccountJson(session), "deviceSecret") = 0, "only the viewer session is saved")
    Assert(CatalogStale(1000, 1900) and not CatalogStale(1000, 1899), "catalog refresh after 15 minutes")
    Assert(AllWideArtwork([{ backdrop: "https://a" }]) and not AllWideArtwork([{ backdrop: "https://a" }, { backdrop: "" }]) and not AllWideArtwork([]), "wide cards only when every title has wide art")
    Assert(DeviceActivationState("pending", 100, 200) = "pending", "activation polling stays pending")
    Assert(DeviceActivationState("approved", 100, 200) = "approved", "approved activation exchanges once")
    Assert(DeviceActivationState("consumed", 100, 200) = "consumed", "consumed activation is terminal")
    Assert(DeviceActivationState("pending", 200, 200) = "expired", "local activation expiry wins over pending state")
    Assert(DeviceActivationState("unknown", 100, 200) = "invalid", "unknown activation state rejected")
    Assert(ActivationPollFailure(503, 100, 200) = "retry", "network/server error retries activation polling")
    Assert(ActivationPollFailure(429, 100, 200) = "rate-limited", "rate-limited activation polling is distinguishable")
    Assert(ActivationPollFailure(410, 100, 200) = "expired", "server-expired activation is terminal")
    Assert(NextPollDelay(5, 5) = 10, "activation retry delay backs off")
    Assert(NextPollDelay(60, 5) = 60, "activation retry delay is capped")
    entry = { positionSeconds: 600, durationSeconds: 1320, progressPercent: 45, updatedAt: 1 }
    Assert(BackdropSource({ id: "a", heroImageUrl: "https://cdn/wide.jpg" }) = "https://cdn/wide.jpg", "wide hero art is used when supplied")
    Assert(BackdropSource({ id: "a", heroImageUrl: "/posters/wide.jpg" }) = ApiBase() + "/posters/wide.jpg", "service-relative hero art")
    Assert(BackdropSource({ id: "a", heroImageUrl: "http://insecure/wide.jpg" }) = "" and BackdropSource({ id: "a" }) = "", "no insecure or invented backdrops")
    Assert(BackdropSource({ id: "XMj306OZSbomES2Zz0Fz", heroImageUrl: "https://cdn/wide.jpg" }) = "", "artwork holds apply to backdrops")
    Assert(TimeLeft(entry) = "12m left", "time left in minutes")
    entry.durationSeconds = 4500
    Assert(TimeLeft(entry) = "1h 5m left", "time left in hours")
    entry.durationSeconds = 630
    Assert(TimeLeft(entry) = "Under 1m left", "time left under a minute")
    Assert(TimeLeft({ positionSeconds: 1 }) = "", "invalid progress has no time left")
    Assert(Greeting(8) = "Good morning" and Greeting(13) = "Good afternoon" and Greeting(21) = "Good evening" and Greeting(2) = "Good evening", "greeting by local hour")
    favorites = FavoriteIds(["a", "a", 5, "", "creator_1"])
    Assert(favorites.Count() = 2 and favorites[1] = "creator_1", "favorites keep unique string IDs")
    Assert(FavoriteIds({ items: [] }).Count() = 0, "malformed favorites ignored")
    Assert(IsFavorite(favorites, "a") and not IsFavorite(favorites, "A"), "favorite IDs are exact")
    Assert(FavoriteItems([approved, creator], favorites)[0].id = "creator_1", "My List shows most recent first")
    Assert(ToggleFavorite(favorites, "a", false).Count() = 1 and ToggleFavorite(favorites, "b", true)[2] = "b", "toggle adds and removes")
    print "PROTV_TESTS_PASSED="; m.passed.ToStr()
    print "PROTV_TESTS_FAILED="; m.failed.ToStr()
end sub

sub Assert(condition as Boolean, label as String)
    if condition
        m.passed++
    else
        m.failed++
        print "FAIL: "; label
    end if
end sub
