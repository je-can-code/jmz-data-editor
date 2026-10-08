package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/store"
	"jmz-data-editor/server/internal/watch"
)

// The fixtures below are small, hand-made files in MZ's own layout. Byte-for-byte comparisons against
// them are the point of several tests, so they deliberately carry what a real map carries and a
// careless writer would change: a `<` and an `&` that Go escapes and MZ does not, quotes and a newline
// inside strings, a fractional scroll position, an optional `quick` flag, and an event image whose
// keys are in alphabetical order rather than the model's.

const mapInfosFixture = "[\n" +
	"null,\n" +
	`{"id":1,"expanded":false,"name":"<Town> & \"Square\"","order":2,"parentId":0,"scrollX":1200.4444444444443,"scrollY":964.8888888888889,"quick":false},` + "\n" +
	`{"id":2,"expanded":true,"name":"Cellar","order":1,"parentId":1,"scrollX":1101,"scrollY":754}` + "\n" +
	"]"

const commonEventsFixture = "[\n" +
	"null,\n" +
	`{"id":1,"list":[{"code":101,"indent":0,"parameters":["Actor1",0,0,2,""]},{"code":401,"indent":0,"parameters":["<Chef> & \"friends\""]},{"code":0,"indent":0,"parameters":[]}],"name":"Greet","switchId":1,"trigger":0},` + "\n" +
	`{"id":2,"list":[{"code":0,"indent":0,"parameters":[]}],"name":"","switchId":1,"trigger":0}` + "\n" +
	"]"

const tilesetsFixture = "[\n" +
	"null,\n" +
	`{"id":1,"flags":[16,1551,1536,1536],"mode":1,"name":"Outside","note":"<note>","tilesetNames":["Outside_A1","Outside_A2","","","","Outside_B","","",""]}` + "\n" +
	"]"

const mapFixture = "{\n" +
	`"autoplayBgm":false,"autoplayBgs":false,"battleback1Name":"","battleback2Name":"",` +
	`"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"bgs":{"name":"","pan":0,"pitch":100,"volume":90},` +
	`"disableDashing":false,"displayName":"<b>Cellar</b>","encounterList":[],"encounterStep":30,"height":1,` +
	`"note":"a \"quoted\" note\nover two lines","parallaxLoopX":false,"parallaxLoopY":false,"parallaxName":"",` +
	`"parallaxShow":true,"parallaxSx":0,"parallaxSy":0,"scrollType":0,"specifyBattleback":false,"tilesetId":1,"width":1,` + "\n" +
	`"data":[1536,0,0,0,0,0],` + "\n" +
	`"events":[` + "\n" +
	"null,\n" +
	`{"id":1,"name":"EV001","note":"","pages":[{"conditions":{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,` +
	`"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,"switch2Valid":false,` +
	`"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
	`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},` +
	`"list":[{"code":101,"indent":0,"parameters":["",0,0,2,""]},{"code":401,"indent":0,"parameters":["Hello & <welcome>"]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
	`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
	`"moveSpeed":3,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":0,"walkAnime":true}],"x":0,"y":0}` + "\n" +
	"]\n" +
	"}"

// secret is written where no route may reach, so any test that finds it in a response has found a way
// out of the folder a route is meant to stay in.
const secret = "SECRET-DO-NOT-SERVE"

// project is a throwaway RMMZ project with the real route table serving it.
type project struct {
	root    string
	hub     *watch.Hub
	handler http.Handler

	// host is the name requests are addressed to by default: the API's own address.
	host string
}

// newProject writes the fixtures into a temporary folder, points the server at it, and builds the
// route table exactly as main does when nothing configures it.
//
// Pointing JMZ_PROJECT_ROOT here is not optional: the variable is often already set in a developer's
// shell to the real game, and these tests write.
func newProject(t *testing.T) *project {
	t.Helper()

	current := writeProject(t)
	current.handler = routes(current.hub, accessPolicy())
	current.host = listenAddress
	return current
}

// newConfiguredProject is newProject for a server started with a configuration, such as a UI moved to
// another port.
func newConfiguredProject(t *testing.T, config serverConfig) *project {
	t.Helper()

	current := writeProject(t)
	current.handler = routes(current.hub, config.policy())
	current.host = config.address
	return current
}

// writeProject writes the fixtures into a temporary folder and points the server at it.
func writeProject(t *testing.T) *project {
	t.Helper()

	root := t.TempDir()
	files := map[string]string{
		"data/MapInfos.json":                    mapInfosFixture,
		"data/Tilesets.json":                    tilesetsFixture,
		"data/CommonEvents.json":                commonEventsFixture,
		"data/Map001.json":                      mapFixture,
		"data/System.json":                      secret,
		"secret.txt":                            secret,
		"img/characters/Actor1.png":             "\x89PNG-actor",
		"img/faces/!$Door (open).png":           "\x89PNG-door",
		"img/hud/Gauge.png":                     "\x89PNG-hud",
		"img/weather/Rain_01A.png":              "\x89PNG-rain",
		"audio/se/Cursor.ogg":                   "OggS-cursor-sound",
		"js/plugins/Hello.js":                   "console.log('hello');",
		"js/plugins/others/PluginCommonBase.js": "// common base",
	}
	for path, content := range files {
		full := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	t.Setenv("JMZ_PROJECT_ROOT", root)
	hub := watch.NewHub("data", store.EditorDataFolder)

	return &project{root: root, hub: hub}
}

// call sends one request through the route table, addressed to the API's own name the way curl or
// the UI would address it. Targets are raw request paths, so an encoded traversal such as %2F
// reaches the server exactly as a browser would send it. Headers come in name, value pairs; a "Host"
// pair readdresses the request.
func (current *project) call(t *testing.T, method string, target string, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Host = current.host
	for index := 0; index+1 < len(headers); index += 2 {
		if headers[index] == "Host" {
			request.Host = headers[index+1]
			continue
		}
		request.Header.Set(headers[index], headers[index+1])
	}

	recorder := httptest.NewRecorder()
	current.handler.ServeHTTP(recorder, request)
	return recorder
}

// read returns a project file's content.
func (current *project) read(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(current.root, filepath.FromSlash(path)))
	if err != nil {
		t.Fatal(err)
	}

	return string(content)
}

// removeFile deletes a project file.
func removeFile(t *testing.T, current *project, path string) {
	t.Helper()

	if err := os.Remove(filepath.Join(current.root, filepath.FromSlash(path))); err != nil {
		t.Fatal(err)
	}
}

// exists reports whether a project file exists.
func (current *project) exists(path string) bool {
	_, err := os.Stat(filepath.Join(current.root, filepath.FromSlash(path)))
	return err == nil
}

// envelope is the response shape every JSON route shares.
type envelope struct {
	Path  string          `json:"path"`
	Error string          `json:"error"`
	Data  json.RawMessage `json:"data"`
}

// readEnvelope decodes a JSON route's response.
func readEnvelope(t *testing.T, recorder *httptest.ResponseRecorder) envelope {
	t.Helper()

	var decoded envelope
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response was not the JSON envelope: %v\n%s", err, recorder.Body.String())
	}

	return decoded
}

// assertStatus checks a response's status code.
func assertStatus(t *testing.T, recorder *httptest.ResponseRecorder, expected int) {
	t.Helper()

	if recorder.Code != expected {
		t.Fatalf("status %d, expected %d: %s", recorder.Code, expected, strings.TrimSpace(recorder.Body.String()))
	}
}

// assertBodyContains checks a response body for a fragment, such as the name of a refused field.
func assertBodyContains(t *testing.T, recorder *httptest.ResponseRecorder, fragment string) {
	t.Helper()

	if strings.Contains(recorder.Body.String(), fragment) == false {
		t.Errorf("expected the response to mention %q, it said %q", fragment, strings.TrimSpace(recorder.Body.String()))
	}
}

// assertRefused checks a traversal attempt got the expected status and none of the secret.
func assertRefused(t *testing.T, recorder *httptest.ResponseRecorder, expected int) {
	t.Helper()

	assertStatus(t, recorder, expected)
	body, _ := io.ReadAll(recorder.Result().Body)
	if strings.Contains(string(body), secret) {
		t.Errorf("the response leaked a file outside the route's folder")
	}
}
