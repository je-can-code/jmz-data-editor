package main

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

// The bundled editor runs the API as a child of its NW.js shell, and owes that arrangement two things
// only the real process can show, so these tests build the server and run it. The installer asks a
// build for its version before trusting it, on a machine that may have no project and no free port,
// so -version must answer before any configuration is read. And a shell can end without stopping its
// child, by a crash or a kill; under JMZ_EXIT_WITH_PARENT=1 the server ends when its stdin closes,
// which the system does once the parent holding the other end is gone, so it never outlives the shell
// holding the port against the next launch. Without the setting, stdin means nothing to it, as ever.

// stampedVersion is the version the tests' build is stamped with, the way the bundle build stamps one.
const stampedVersion = "20261118.2000-abc1234"

// buildAPI builds the server into a folder of the test's own, stamped with stampedVersion exactly as
// the bundle build stamps a release.
func buildAPI(t *testing.T) string {
	t.Helper()

	binary := filepath.Join(t.TempDir(), "jmz-api")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build := exec.Command("go", "build", "-ldflags", "-X main.version="+stampedVersion, "-o", binary, ".")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("the server did not build: %v\n%s", err, output)
	}

	return binary
}

// processOutput collects what a process prints, from both of its streams, and closes ready once the
// line a test waits for has appeared.
type processOutput struct {
	mutex   sync.Mutex
	text    bytes.Buffer
	awaited string
	ready   chan struct{}
}

// Write collects one chunk of output.
func (output *processOutput) Write(chunk []byte) (int, error) {
	output.mutex.Lock()
	defer output.mutex.Unlock()

	seenBefore := strings.Contains(output.text.String(), output.awaited)
	output.text.Write(chunk)
	if seenBefore == false && strings.Contains(output.text.String(), output.awaited) {
		close(output.ready)
	}

	return len(chunk), nil
}

// String is everything collected so far.
func (output *processOutput) String() string {
	output.mutex.Lock()
	defer output.mutex.Unlock()

	return output.text.String()
}

// runningAPI is a built server a test started the way the bundled editor's shell starts one.
type runningAPI struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	output  *processOutput
	exited  chan struct{}
}

// startAPI starts the built server on a port of the system's choosing, over an empty project, with its
// stdin a pipe the test holds as the shell would, and waits until it says it is running. Every setting
// the server reads is given, so nothing in the developer's own shell leaks in; settings are name=value
// pairs added last, where they win. The server is killed when the test ends, if it is still running.
func startAPI(t *testing.T, binary string, settings ...string) *runningAPI {
	t.Helper()

	command := exec.Command(binary)
	command.Env = append(os.Environ(),
		"JMZ_API_ADDRESS=127.0.0.1:0",
		"JMZ_UI_ORIGINS=",
		"JMZ_UI_DIR=",
		"JMZ_EXIT_WITH_PARENT=",
		"JMZ_PROJECT_ROOT="+t.TempDir())
	command.Env = append(command.Env, settings...)
	output := &processOutput{awaited: "Server running", ready: make(chan struct{})}
	command.Stdout = output
	command.Stderr = output
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}

	running := &runningAPI{command: command, stdin: stdin, output: output, exited: make(chan struct{})}
	go func() {
		command.Wait()
		close(running.exited)
	}()
	t.Cleanup(func() {
		command.Process.Kill()
		<-running.exited
	})

	select {
	case <-output.ready:
	case <-running.exited:
		t.Fatalf("the server ended before it was running:\n%s", output.String())
	case <-time.After(30 * time.Second):
		t.Fatalf("the server never said it was running:\n%s", output.String())
	}

	return running
}

// TestVersionAnswersBeforeAnyConfigurationIsRead covers the installer's smoke test: the stamped version
// alone, and a clean exit, from a server whose settings would stop it at once if they were read.
func TestVersionAnswersBeforeAnyConfigurationIsRead(t *testing.T) {
	// Arrange- an address off the loopback interface and a UI folder that is not there, each refused
	// the moment configuration is read, over an empty project of the test's own.
	command := exec.Command(buildAPI(t), "-version")
	command.Env = append(os.Environ(),
		"JMZ_API_ADDRESS=0.0.0.0:8080",
		"JMZ_UI_DIR="+filepath.Join(t.TempDir(), "missing"),
		"JMZ_PROJECT_ROOT="+t.TempDir())

	// Act.
	output, err := command.CombinedOutput()

	// Assert.
	if err != nil {
		t.Fatalf("-version failed: %v\n%s", err, output)
	}
	if string(output) != stampedVersion+"\n" {
		t.Errorf("-version printed %q, expected %q", output, stampedVersion+"\n")
	}
}

// TestTheServerEndsWithItsParent covers a shell that ends without stopping its server: once the
// shell's end of stdin closes, the server follows on its own, cleanly, and says why in its log.
func TestTheServerEndsWithItsParent(t *testing.T) {
	// Arrange- a running server asked to end with its parent.
	running := startAPI(t, buildAPI(t), "JMZ_EXIT_WITH_PARENT=1")

	// Act- the parent's end of the pipe closes, as the system closes it for a parent that is gone.
	running.stdin.Close()

	// Assert.
	select {
	case <-running.exited:
	case <-time.After(10 * time.Second):
		t.Fatalf("the server outlived its parent:\n%s", running.output.String())
	}
	if code := running.command.ProcessState.ExitCode(); code != 0 {
		t.Errorf("the server ended with code %d:\n%s", code, running.output.String())
	}
	if strings.Contains(running.output.String(), "Stopping: stdin closed") == false {
		t.Errorf("the server ended without saying why:\n%s", running.output.String())
	}
}

// TestTheServerOutlivesItsStdinWithoutBeingAsked covers every other way the server is started, by the
// dev stack and by hand among them: stdin closing means nothing, and the server keeps running well
// past the moment a server asked to end with its parent would have gone.
func TestTheServerOutlivesItsStdinWithoutBeingAsked(t *testing.T) {
	// Arrange- a running server that was not asked to end with its parent.
	running := startAPI(t, buildAPI(t))

	// Act.
	running.stdin.Close()

	// Assert.
	select {
	case <-running.exited:
		t.Fatalf("the server ended when its stdin closed:\n%s", running.output.String())
	case <-time.After(2 * time.Second):
	}
}
