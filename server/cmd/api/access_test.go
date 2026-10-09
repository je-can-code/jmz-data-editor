package main

import (
	"net/http"
	"strings"
	"testing"
)

// The API owes the game's files to the editor's own pages and to local scripts, and to nobody else.
// Any web page open in the same browser can send requests to 127.0.0.1, so the server must refuse a
// page from another site before it reads or writes anything, and must refuse a request addressed to a
// name it does not go by, which is what a DNS-rebinding page sends. Requests with no Origin, from curl
// or a script, keep working. These use the policy main itself uses.

// uiOrigins are the two names the UI's own pages come from.
var uiOrigins = []string{"http://127.0.0.1:3000", "http://localhost:3000"}

// TestTheUisPagesMayCallTheApi covers the editor's own pages, under either loopback name: served, and
// told so by name rather than by a wildcard any site could use.
func TestTheUisPagesMayCallTheApi(t *testing.T) {
	for _, origin := range uiOrigins {
		t.Run(origin, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/api/mapinfos", "", "Origin", origin)

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if allowed := response.Header().Get("Access-Control-Allow-Origin"); allowed != origin {
				t.Errorf("allowed origin %q, expected %q", allowed, origin)
			}
			if strings.Contains(response.Header().Get("Vary"), "Origin") == false {
				t.Error("an answer that depends on the origin must say so in Vary")
			}
		})
	}
}

// TestPreflightAllowsTheMapEditorsSaves covers the browser's check before a PUT carrying the client
// header, which would otherwise stop every save from the UI, whose pages sit on another port, and the
// If-None-Match that creates a new map without writing over one.
func TestPreflightAllowsTheMapEditorsSaves(t *testing.T) {
	for _, origin := range uiOrigins {
		t.Run(origin, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodOptions, "/api/maps/1", "",
				"Origin", origin,
				"Access-Control-Request-Method", "PUT",
				"Access-Control-Request-Headers", "content-type, x-jmz-client, if-none-match")

			// Assert.
			assertStatus(t, response, http.StatusNoContent)
			methods := response.Header().Get("Access-Control-Allow-Methods")
			headers := response.Header().Get("Access-Control-Allow-Headers")
			if strings.Contains(methods, "PUT") == false || strings.Contains(headers, "X-Jmz-Client") == false || strings.Contains(headers, "If-None-Match") == false {
				t.Errorf("the preflight allowed methods %q and headers %q", methods, headers)
			}
			if allowed := response.Header().Get("Access-Control-Allow-Origin"); allowed != origin {
				t.Errorf("allowed origin %q, expected %q", allowed, origin)
			}
		})
	}
}

// TestOtherSitesPagesAreRefused sends every kind of request from pages that are not the UI's,
// near misses included (the right host on the wrong port or scheme), and expects each refused before
// it can read or write anything. The POST to /api/system is the hole that predates the map editor:
// a form on any site could post text/plain there and rewrite a database file.
func TestOtherSitesPagesAreRefused(t *testing.T) {
	origins := []string{"http://evil.example", "null", "http://127.0.0.1:5173", "https://127.0.0.1:3000", "http://localhost:8080"}
	requests := []struct {
		name   string
		method string
		target string
		body   string
		header []string
	}{
		{name: "a read", method: http.MethodGet, target: "/api/mapinfos"},
		{name: "a plugin's source", method: http.MethodGet, target: "/api/plugin-source/Hello"},
		{name: "an image folder's listing", method: http.MethodGet, target: "/api/img/faces"},
		{name: "the change stream", method: http.MethodGet, target: "/api/file-changes"},
		{name: "an enemy's placements", method: http.MethodGet, target: "/api/enemies/1/placements"},
		{name: "every event's note", method: http.MethodGet, target: "/api/event-notes"},
		{name: "the command usage counts", method: http.MethodGet, target: "/api/command-usage"},
		{name: "the database names", method: http.MethodGet, target: "/api/database-names"},
		{name: "a map save", method: http.MethodPut, target: "/api/maps/1", body: mapFixture},
		{name: "a common events save", method: http.MethodPut, target: "/api/common-events", body: commonEventsFixture},
		{name: "a merge of blueprint placements", method: http.MethodPut, target: "/api/editor-data/blueprint-uses/maps", body: `{"schemaVersion":2,"maps":{"1":{"aa22":[{"x":0,"y":0}]}}}`},
		{name: "a form posting to a database route", method: http.MethodPost, target: "/api/system", body: `{}`, header: []string{"Content-Type", "text/plain"}},
		{name: "a preflight", method: http.MethodOptions, target: "/api/maps/1", header: []string{"Access-Control-Request-Method", "PUT"}},
	}

	for _, origin := range origins {
		for _, request := range requests {
			t.Run(origin+" "+request.name, func(t *testing.T) {
				// Arrange.
				current := newProject(t)
				headers := append([]string{"Origin", origin}, request.header...)

				// Act.
				response := current.call(t, request.method, request.target, request.body, headers...)

				// Assert- refused, nothing readable, nothing written.
				assertStatus(t, response, http.StatusForbidden)
				if response.Header().Get("Access-Control-Allow-Origin") != "" {
					t.Error("a refused origin was still told it may read the answer")
				}
				if strings.Contains(response.Body.String(), "Cellar") || strings.Contains(response.Body.String(), "hello") {
					t.Error("a refused request still received project data")
				}
				written := current.read(t, "data/Map001.json") != mapFixture ||
					current.read(t, "data/System.json") != secret ||
					current.read(t, "data/CommonEvents.json") != commonEventsFixture ||
					current.exists("jmz-editor")
				if written {
					t.Error("a refused request still wrote a file")
				}
			})
		}
	}
}

// TestRequestsWithoutAnOriginAreServed keeps scripts and curl working: no Origin, no browser page.
func TestRequestsWithoutAnOriginAreServed(t *testing.T) {
	// Arrange.
	current := newProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/maps/1", "")).Data)

	// Act.
	read := current.call(t, http.MethodGet, "/api/mapinfos", "")
	saved := current.call(t, http.MethodPut, "/api/maps/1", body)

	// Assert- both served, and no CORS grant, since nobody asked for one.
	assertStatus(t, read, http.StatusOK)
	assertStatus(t, saved, http.StatusNoContent)
	if read.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("a request with no Origin was sent a CORS grant")
	}
}

// environment builds a getenv over fixed values, so configuration tests never read the real shell.
func environment(values map[string]string) func(string) string {
	return func(name string) string {
		return values[name]
	}
}

// TestAConfiguredUiAndAddressAreAllowedAndTheDefaultsAreNot covers a UI moved off port 3000 and an API
// moved off 8080, which the NW.js shell's --ui-url and --api-base allow: the server must serve exactly
// the configured page and address, the configured address under either loopback name, and refuse the
// defaults it would otherwise have allowed.
func TestAConfiguredUiAndAddressAreAllowedAndTheDefaultsAreNot(t *testing.T) {
	// Arrange.
	config, err := configFrom(environment(map[string]string{
		"JMZ_API_ADDRESS": "127.0.0.1:18151",
		"JMZ_UI_ORIGINS":  "http://127.0.0.1:18150/",
	}))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name     string
		headers  []string
		expected int
	}{
		{name: "the configured page", headers: []string{"Origin", "http://127.0.0.1:18150"}, expected: http.StatusOK},
		{name: "the configured address by its other name", headers: []string{"Host", "localhost:18151"}, expected: http.StatusOK},
		{name: "the default page", headers: []string{"Origin", "http://127.0.0.1:3000"}, expected: http.StatusForbidden},
		{name: "the default page's other name", headers: []string{"Origin", "http://localhost:3000"}, expected: http.StatusForbidden},
		{name: "the default address", headers: []string{"Host", "127.0.0.1:8080"}, expected: http.StatusForbidden},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- a server started with the configuration above.
			current := newConfiguredProject(t, config)

			// Act.
			response := current.call(t, http.MethodGet, "/api/mapinfos", "", testCase.headers...)

			// Assert.
			assertStatus(t, response, testCase.expected)
		})
	}
}

// TestConfigurationDefaultsToTodaysPorts covers a server started with nothing configured, which must keep
// allowing exactly what it always has.
func TestConfigurationDefaultsToTodaysPorts(t *testing.T) {
	// Arrange- nothing set.

	// Act.
	config, err := configFrom(environment(map[string]string{}))

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	policy := config.policy()
	if config.address != "127.0.0.1:8080" || strings.Join(policy.AllowedOrigins, ",") != "http://127.0.0.1:3000,http://localhost:3000" ||
		strings.Join(policy.AllowedHosts, ",") != "127.0.0.1:8080,localhost:8080" {
		t.Errorf("defaults were address %q, origins %v, hosts %v", config.address, policy.AllowedOrigins, policy.AllowedHosts)
	}
}

// TestConfigurationRefusesWhatWouldExposeTheApi covers an address off the loopback interface, which would
// hand the game's files to the network, and settings too malformed to mean anything.
func TestConfigurationRefusesWhatWouldExposeTheApi(t *testing.T) {
	cases := map[string]map[string]string{
		"every interface":     {"JMZ_API_ADDRESS": "0.0.0.0:8080"},
		"a network address":   {"JMZ_API_ADDRESS": "192.168.1.20:8080"},
		"no port":             {"JMZ_API_ADDRESS": "127.0.0.1"},
		"an origin with path": {"JMZ_UI_ORIGINS": "http://127.0.0.1:3000/app"},
		"not an origin":       {"JMZ_UI_ORIGINS": "127.0.0.1:3000"},
	}

	for name, values := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange- the values above.

			// Act.
			_, err := configFrom(environment(values))

			// Assert.
			if err == nil {
				t.Errorf("%v was accepted", values)
			}
		})
	}
}

// TestRequestsForOtherHostsAreRefused covers DNS rebinding: a page on another domain that resolves to
// 127.0.0.1 sends its own domain as Host, and must not be served even without an Origin.
func TestRequestsForOtherHostsAreRefused(t *testing.T) {
	cases := []struct {
		host     string
		expected int
	}{
		{host: "evil.example:8080", expected: http.StatusForbidden},
		{host: "127.0.0.1:9999", expected: http.StatusForbidden},
		{host: "127.0.0.1", expected: http.StatusForbidden},
		{host: "127.0.0.1:8080", expected: http.StatusOK},
		{host: "localhost:8080", expected: http.StatusOK},
		{host: "LOCALHOST:8080", expected: http.StatusOK},
	}

	for _, testCase := range cases {
		t.Run(testCase.host, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/api/mapinfos", "", "Host", testCase.host)

			// Assert.
			assertStatus(t, response, testCase.expected)
		})
	}
}
