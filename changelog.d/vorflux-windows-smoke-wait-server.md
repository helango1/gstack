**The Windows smoke check waits for its local page before `/browse` opens it.** The `/browse` step started its page server in the background and ran `goto` at once, so a page server that bound late failed the step as a refused navigation and the misleading "chain output lacks the page text". The step now polls the page for up to 20 s first and names the failure when the server exits or never answers.

### For contributors
- **`.github/workflows/windows-smoke.yml`:** the `/browse` step polls `http://127.0.0.1:47124/` with `curl` before `browse chain`, bounded by a 20 s wall-clock deadline because a refused connect takes about 2 s on Windows. On Linux, a page server 0.5 to 8 s late failed the old step 14 of 14 times with `net::ERR_CONNECTION_REFUSED` and passed the new step 14 of 14 times. With no delay, the new step took about 0.2 s longer.
- `test/windows-native-workflows.test.ts`: the poll sits after the page server starts and before `browse chain`.
