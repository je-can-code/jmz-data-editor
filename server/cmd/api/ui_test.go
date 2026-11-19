package main

import (
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

// The bundled editor has no Vite server: the API serves the UI's built pages itself, from the folder
// JMZ_UI_DIR names, on the one origin the pages and the API share. That makes the API a web server for
// everything outside /api, and it owes the editor five things there. It serves the UI's files and
// nothing outside their folder, however the path is encoded. Pages are never kept by the browser and
// never answered from a copy it holds, because every installed build shares the one origin and the one
// profile: going back to the previous build must run that build's own pages, not the newer pages the
// browser kept, while the files Vite names after their content may be kept. No other site may frame
// the pages, since a framed editor's saves and deletions are its own. The same access policy guards
// the pages as guards the API. And every /api route answers exactly as it does with no UI at all.

// bundleOrigin is the bundled editor's one origin, for the pages and the API alike.
const bundleOrigin = "http://127.0.0.1:47380"

// immutable is the caching a file named after its content may have: kept for good.
const immutable = "public, max-age=31536000, immutable"

// uiFixture is a small built UI in Vite's layout: the pages, a script Vite named after a hash of its
// content straight inside assets/, and the files public/ copies in under their own names every build,
// one of them a folder down in assets/.
var uiFixture = map[string]string{
	"index.html":              "<!DOCTYPE html><title>the data editor</title>",
	"map.html":                "<!DOCTYPE html><title>the map editor</title>",
	"shell.html":              "<!DOCTYPE html><title>jmz shell</title>",
	"assets/main-DzIJpNIu.js": "console.log('the data editor');",
	"assets/images/vite.png":  "\x89PNG-vite",
	"favicon.ico":             "\x00\x00\x01\x00-icon",
}

// newBundledProject is newProject for the bundled editor's server: one address for the pages and the
// API, configured the way the shell configures it, with the UI's pages in a folder that has a secret
// beside it. It returns the UI's folder too.
func newBundledProject(t *testing.T) (*project, string) {
	t.Helper()

	bundle := t.TempDir()
	ui := filepath.Join(bundle, "ui")
	writeFiles(t, ui, uiFixture)
	writeFiles(t, bundle, map[string]string{"secret.txt": secret})

	config, err := configFrom(environment(map[string]string{
		"JMZ_API_ADDRESS": "127.0.0.1:47380",
		"JMZ_UI_ORIGINS":  bundleOrigin,
		"JMZ_UI_DIR":      ui,
	}))
	if err != nil {
		t.Fatal(err)
	}

	return newConfiguredProject(t, config), ui
}

// writeFiles writes files, by forward-slash path and content, into a folder.
func writeFiles(t *testing.T, folder string, files map[string]string) {
	t.Helper()

	for path, content := range files {
		full := filepath.Join(folder, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

// TestTheUisFilesAreServedFromItsFolder covers each kind of file the bundled editor loads: the data
// editor at the site's root and by name, the map editor and the shell's hidden page by name, and a
// built script, each with its content and a type the browser will run or render.
func TestTheUisFilesAreServedFromItsFolder(t *testing.T) {
	cases := []struct {
		target  string
		content string
		kind    string
	}{
		{target: "/", content: uiFixture["index.html"], kind: "text/html"},
		{target: "/index.html", content: uiFixture["index.html"], kind: "text/html"},
		{target: "/map.html?mapId=3", content: uiFixture["map.html"], kind: "text/html"},
		{target: "/shell.html", content: uiFixture["shell.html"], kind: "text/html"},
		{target: "/assets/main-DzIJpNIu.js", content: uiFixture["assets/main-DzIJpNIu.js"], kind: "javascript"},
	}

	for _, testCase := range cases {
		t.Run(testCase.target, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if response.Body.String() != testCase.content {
				t.Errorf("served %q", response.Body.String())
			}
			if contentType := response.Header().Get("Content-Type"); strings.Contains(contentType, testCase.kind) == false {
				t.Errorf("served as %q, expected a %s type", contentType, testCase.kind)
			}
		})
	}
}

// TestTheUiIsNotServedWithoutAFolder covers the dev stack's server, which Vite stands beside: with no
// JMZ_UI_DIR, nothing outside /api is served, while the API itself answers as ever. A path outside /api
// never reaches the UI's handler at all: it gets the router's own answer for a path no route knows, never
// the handler's not found, which a handler with no folder would also give for every page, and never the
// handler's refusal of a write.
func TestTheUiIsNotServedWithoutAFolder(t *testing.T) {
	cases := []struct {
		method   string
		target   string
		expected int
	}{
		{method: http.MethodGet, target: "/", expected: http.StatusNotFound},
		{method: http.MethodGet, target: "/index.html", expected: http.StatusNotFound},
		{method: http.MethodGet, target: "/map.html", expected: http.StatusNotFound},
		{method: http.MethodPost, target: "/index.html", expected: http.StatusNotFound},
		{method: http.MethodGet, target: "/api/mapinfos", expected: http.StatusOK},
	}

	for _, testCase := range cases {
		t.Run(testCase.method+" "+testCase.target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, testCase.method, testCase.target, "")

			// Assert- the router words its not found as no handler of this API does.
			assertStatus(t, response, testCase.expected)
			if testCase.expected == http.StatusNotFound && response.Body.String() != "404 page not found\n" {
				t.Errorf("answered %q, rather than the router's own not found", response.Body.String())
			}
		})
	}
}

// TestTheUisPagesAreNeverKeptAndItsBuiltFilesAre covers caching: no page is ever stored, so the page a
// build runs is always its own and never one another build left in the browser, and neither is any
// file public/ copies in under the same name each build. None of them carries a Last-Modified either,
// since a browser holding that time could ask by it and be answered 304. Only what Vite named after
// its content may be kept for good, with its time, since a change to it always arrives under a new name.
func TestTheUisPagesAreNeverKeptAndItsBuiltFilesAre(t *testing.T) {
	cases := []struct {
		target       string
		expected     string
		lastModified bool
	}{
		{target: "/", expected: "no-store", lastModified: false},
		{target: "/index.html", expected: "no-store", lastModified: false},
		{target: "/map.html", expected: "no-store", lastModified: false},
		{target: "/shell.html", expected: "no-store", lastModified: false},
		{target: "/favicon.ico", expected: "no-store", lastModified: false},
		{target: "/assets/images/vite.png", expected: "no-store", lastModified: false},
		{target: "/assets/main-DzIJpNIu.js", expected: immutable, lastModified: true},
	}

	for _, testCase := range cases {
		t.Run(testCase.target, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if cacheControl := response.Header().Get("Cache-Control"); cacheControl != testCase.expected {
				t.Errorf("sent Cache-Control %q, expected %q", cacheControl, testCase.expected)
			}
			if lastModified := response.Header().Get("Last-Modified"); (lastModified != "") != testCase.lastModified {
				t.Errorf("sent Last-Modified %q, expected one: %v", lastModified, testCase.lastModified)
			}
		})
	}
}

// TestTheUisPagesAreServedWholeToABrowserHoldingANewerCopy covers going back to the previous build.
// Each build's files carry the time the build was made, and every installed build serves the same
// origin into the same profile, so a browser that ran the newer build asks for the older build's
// pages with the newer, later time. Every page, and every file public/ copies in, must still arrive
// whole, or the newer build's copy would run against the older API. Only what Vite named after its
// content may be answered from the browser's copy, since its name already says what it holds.
func TestTheUisPagesAreServedWholeToABrowserHoldingANewerCopy(t *testing.T) {
	cases := []struct {
		target   string
		file     string
		expected int
	}{
		{target: "/", file: "index.html", expected: http.StatusOK},
		{target: "/map.html", file: "map.html", expected: http.StatusOK},
		{target: "/shell.html", file: "shell.html", expected: http.StatusOK},
		{target: "/favicon.ico", file: "favicon.ico", expected: http.StatusOK},
		{target: "/assets/images/vite.png", file: "assets/images/vite.png", expected: http.StatusOK},
		{target: "/assets/main-DzIJpNIu.js", file: "assets/main-DzIJpNIu.js", expected: http.StatusNotModified},
	}

	for _, testCase := range cases {
		t.Run(testCase.target, func(t *testing.T) {
			// Arrange- the older build's files, made before the newer build whose copies the browser kept.
			current, ui := newBundledProject(t)
			olderBuild := time.Date(2026, 11, 18, 21, 45, 0, 0, time.UTC)
			for file := range uiFixture {
				if err := os.Chtimes(filepath.Join(ui, filepath.FromSlash(file)), olderBuild, olderBuild); err != nil {
					t.Fatal(err)
				}
			}
			newerBuild := time.Date(2026, 11, 19, 1, 0, 0, 0, time.UTC).Format(http.TimeFormat)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "", "If-Modified-Since", newerBuild)

			// Assert.
			assertStatus(t, response, testCase.expected)
			if testCase.expected == http.StatusOK && response.Body.String() != uiFixture[testCase.file] {
				t.Errorf("served %q", response.Body.String())
			}
		})
	}
}

// TestTheUisFilesCanOnlyBeFramedByItsOwnPages covers framing: a page on any other site that framed the
// editor could steer a click into a save or a map's deletion, which the framed page would send as the
// editor's own, so no site but the editor's own may frame any of its files. Its own pages still may,
// so they can embed each other.
func TestTheUisFilesCanOnlyBeFramedByItsOwnPages(t *testing.T) {
	for _, target := range []string{"/", "/map.html", "/shell.html", "/favicon.ico", "/assets/main-DzIJpNIu.js"} {
		t.Run(target, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, target, "")

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if policy := response.Header().Get("Content-Security-Policy"); policy != "frame-ancestors 'self'" {
				t.Errorf("sent Content-Security-Policy %q, expected frame-ancestors 'self'", policy)
			}
		})
	}
}

// TestTheUiRefusesPathsOutOfItsFolder sends every climb out of the UI's folder a request can carry,
// toward the secret beside it, encoded the ways the asset routes are tested against, and expects each
// refused without a byte of the secret. A plain `..` never reaches the UI at all, because the router
// redirects to the cleaned path first.
func TestTheUiRefusesPathsOutOfItsFolder(t *testing.T) {
	cases := []struct {
		name     string
		target   string
		expected int
	}{
		{name: "an encoded slash", target: "/..%2Fsecret.txt", expected: http.StatusNotFound},
		{name: "encoded dots", target: "/%2E%2E/secret.txt", expected: http.StatusNotFound},
		{name: "a climb from a subfolder", target: "/assets/..%2F..%2Fsecret.txt", expected: http.StatusNotFound},
		{name: "an encoded backslash", target: "/..%5Csecret.txt", expected: http.StatusNotFound},
		{name: "an absolute path", target: "/%2Fetc%2Fpasswd", expected: http.StatusNotFound},
		{name: "a null", target: "/index.html%00", expected: http.StatusNotFound},
		{name: "a climb the router cleans", target: "/../secret.txt", expected: http.StatusTemporaryRedirect},
		{name: "a climb from a subfolder the router cleans", target: "/assets/../../secret.txt", expected: http.StatusTemporaryRedirect},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertRefused(t, response, testCase.expected)
		})
	}
}

// TestTheUiRefusesALinkOutOfItsFolder covers the second lock: a name that passes every check but is a
// symbolic link pointing out of the UI's folder is still not followed.
func TestTheUiRefusesALinkOutOfItsFolder(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symbolic links need extra privileges on Windows")
	}

	// Arrange- a page that is really a link to the secret beside the folder.
	current, ui := newBundledProject(t)
	if err := os.Symlink(filepath.Join(filepath.Dir(ui), "secret.txt"), filepath.Join(ui, "escape.html")); err != nil {
		t.Fatal(err)
	}

	// Act.
	response := current.call(t, http.MethodGet, "/escape.html", "")

	// Assert.
	assertRefused(t, response, http.StatusInternalServerError)
}

// TestTheUiNeverListsAFolder covers a folder asked for by name, with and without its slash, and a page
// the build does not have: none of them is listed or answered with some other page.
func TestTheUiNeverListsAFolder(t *testing.T) {
	for _, target := range []string{"/assets", "/assets/", "/assets/images/", "/missing.html"} {
		t.Run(target, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, target, "")

			// Assert.
			assertStatus(t, response, http.StatusNotFound)
			if strings.Contains(response.Body.String(), "main-DzIJpNIu.js") || strings.Contains(response.Body.String(), "<title>") {
				t.Errorf("a missing file was answered with %q", response.Body.String())
			}
		})
	}
}

// TestTheUiIsOnlyRead covers every method on a page: reads are served, and anything else is refused
// with the methods that would have been, leaving the file as it was.
func TestTheUiIsOnlyRead(t *testing.T) {
	cases := []struct {
		method   string
		expected int
	}{
		{method: http.MethodGet, expected: http.StatusOK},
		{method: http.MethodHead, expected: http.StatusOK},
		{method: http.MethodPost, expected: http.StatusMethodNotAllowed},
		{method: http.MethodPut, expected: http.StatusMethodNotAllowed},
		{method: http.MethodDelete, expected: http.StatusMethodNotAllowed},
	}

	for _, testCase := range cases {
		t.Run(testCase.method, func(t *testing.T) {
			// Arrange.
			current, ui := newBundledProject(t)

			// Act.
			response := current.call(t, testCase.method, "/index.html", "<!DOCTYPE html><title>rewritten</title>", "Origin", bundleOrigin)

			// Assert.
			assertStatus(t, response, testCase.expected)
			if testCase.expected == http.StatusMethodNotAllowed && response.Header().Get("Allow") != "GET, HEAD" {
				t.Errorf("a refused %s was told it may use %q", testCase.method, response.Header().Get("Allow"))
			}
			if page, err := os.ReadFile(filepath.Join(ui, "index.html")); err != nil || string(page) != uiFixture["index.html"] {
				t.Errorf("the page became %q (%v)", page, err)
			}
		})
	}
}

// TestTheUiIsBehindTheApisAccessPolicy covers the policy the pages share with the API: a request for a
// page addressed to a name the server does not go by, or sent from another site's page, is refused
// before any file is read, while the server's other loopback name and the bundle's own pages are not.
func TestTheUiIsBehindTheApisAccessPolicy(t *testing.T) {
	cases := []struct {
		name     string
		headers  []string
		expected int
	}{
		{name: "a rebinding page's own domain", headers: []string{"Host", "evil.example:47380"}, expected: http.StatusForbidden},
		{name: "the dev stack's address", headers: []string{"Host", "127.0.0.1:8080"}, expected: http.StatusForbidden},
		{name: "another site's page", headers: []string{"Origin", "http://evil.example"}, expected: http.StatusForbidden},
		{name: "the dev stack's pages", headers: []string{"Origin", "http://127.0.0.1:3000"}, expected: http.StatusForbidden},
		{name: "the server's other loopback name", headers: []string{"Host", "localhost:47380"}, expected: http.StatusOK},
		{name: "the bundle's own pages", headers: []string{"Origin", bundleOrigin}, expected: http.StatusOK},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current, _ := newBundledProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/", "", testCase.headers...)

			// Assert.
			assertStatus(t, response, testCase.expected)
			if testCase.expected == http.StatusForbidden && strings.Contains(response.Body.String(), "data editor") {
				t.Error("a refused request still received the page")
			}
		})
	}
}

// TestTheApiRoutesAnswerAsTheyDidBesideTheUi sends the same requests to one project through the
// bundled server and through a server with no UI, and expects every answer identical: status, headers
// and body. An /api path no route knows must stay the API's own 404 rather than become a page or a 405,
// and the router's cleaning, preflights and refusals must not change either.
func TestTheApiRoutesAnswerAsTheyDidBesideTheUi(t *testing.T) {
	requests := []struct {
		name    string
		method  string
		target  string
		headers []string
	}{
		{name: "the health check", method: http.MethodGet, target: "/api/health"},
		{name: "a read", method: http.MethodGet, target: "/api/mapinfos"},
		{name: "a map", method: http.MethodGet, target: "/api/maps/1"},
		{name: "an image", method: http.MethodGet, target: "/api/img/characters/Actor1"},
		{name: "a read from the bundle's pages", method: http.MethodGet, target: "/api/mapinfos", headers: []string{"Origin", bundleOrigin}},
		{name: "a preflight", method: http.MethodOptions, target: "/api/maps/1", headers: []string{"Origin", bundleOrigin, "Access-Control-Request-Method", "PUT"}},
		{name: "another site's page", method: http.MethodGet, target: "/api/mapinfos", headers: []string{"Origin", "http://evil.example"}},
		{name: "an unknown route", method: http.MethodGet, target: "/api/nothing-here"},
		{name: "an unknown route written to", method: http.MethodPost, target: "/api/nothing-here"},
		{name: "the bare prefix", method: http.MethodGet, target: "/api"},
		{name: "the prefix with its slash", method: http.MethodGet, target: "/api/"},
		{name: "a known route with another method", method: http.MethodPost, target: "/api/mapinfos"},
		{name: "a traversal the router cleans", method: http.MethodGet, target: "/api/img/faces/../../secret.txt"},
		{name: "an encoded traversal", method: http.MethodGet, target: "/api/plugin-source/..%2F..%2Fdata%2FSystem"},
	}

	for _, request := range requests {
		t.Run(request.name, func(t *testing.T) {
			// Arrange- one project, served by the bundled server and by a server with no UI.
			bundled, _ := newBundledProject(t)
			config, err := configFrom(environment(map[string]string{
				"JMZ_API_ADDRESS": "127.0.0.1:47380",
				"JMZ_UI_ORIGINS":  bundleOrigin,
			}))
			if err != nil {
				t.Fatal(err)
			}
			alone := &project{root: bundled.root, hub: bundled.hub, host: bundled.host}
			alone.handler = routes(alone.hub, config.policy(), config.uiDirectory)

			// Act.
			withUI := bundled.call(t, request.method, request.target, "", request.headers...)
			withoutUI := alone.call(t, request.method, request.target, "", request.headers...)

			// Assert.
			if withUI.Code != withoutUI.Code || withUI.Body.String() != withoutUI.Body.String() {
				t.Errorf("answered %d %q beside the UI, %d %q without it", withUI.Code, withUI.Body.String(), withoutUI.Code, withoutUI.Body.String())
			}
			if reflect.DeepEqual(withUI.Header(), withoutUI.Header()) == false {
				t.Errorf("sent headers %v beside the UI, %v without it", withUI.Header(), withoutUI.Header())
			}
		})
	}
}
