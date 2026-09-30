package middleware

import (
	"net/http"
	"strings"
)

// Policy names who may talk to the API.
//
// The API reads and writes the game's files, so it answers only the editor's own pages and local
// tools. Browsers name a page's site in the Origin header on every request that writes, and on every
// request whose answer the page could read, so an origin off the list is refused outright. A request
// with no Origin is served: it comes from outside a browser (a script, curl), or it is a plain image
// or media load whose answer another site's page cannot read. Separately, every request must be
// addressed to a name this server actually goes by: a page on some other domain that resolves to
// 127.0.0.1 (DNS rebinding) sends its own domain in Host, and is refused whatever its Origin says.
type Policy struct {
	// AllowedOrigins are the page origins allowed to call the API from a browser, such as
	// "http://127.0.0.1:3000", compared exactly.
	AllowedOrigins []string

	// AllowedHosts are the Host headers the API answers to, host and port, such as "127.0.0.1:8080",
	// compared without regard to case.
	AllowedHosts []string
}

// CORS wraps next so that only requests the policy allows reach it, and answers browsers' preflight
// checks for them. An allowed origin gets itself back in Access-Control-Allow-Origin, never a
// wildcard, so no other site can read what the API answers.
func CORS(next http.Handler, policy Policy) http.Handler {
	origins := map[string]bool{}
	for _, origin := range policy.AllowedOrigins {
		origins[origin] = true
	}
	hosts := map[string]bool{}
	for _, host := range policy.AllowedHosts {
		hosts[strings.ToLower(host)] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// a request addressed to a name this server does not go by is somebody else's request.
		if hosts[strings.ToLower(r.Host)] == false {
			http.Error(w, "host not allowed", http.StatusForbidden)
			return
		}

		// the answer depends on the origin, so no cache may hand one origin's answer to another.
		w.Header().Add("Vary", "Origin")

		// a page from any other site is refused, preflight and all.
		if values, sent := r.Header["Origin"]; sent {
			origin := values[0]
			if origins[origin] == false {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}

			// PUT and X-Jmz-Client are the map editor's saves; a browser asks before sending either.
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Jmz-Client")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
